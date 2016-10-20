// basic tests of filtered replication functionality

load("jstests/replsets/rslib.js");

(function() {
    "use strict";

    function initReplsetWithFilteredNode() {
        var host = getHostName();
        var name = "filtered1";

        var rt = new ReplSetTest({name: name, nodes: 3});
        rt.startSet();
        rt.initiate({
            _id: name,
            members: [
                {_id: 0, host: rt.nodes[0].host, priority: 3},
                {_id: 1, host: rt.nodes[1].host, priority: 0},
                {_id: 2, host: rt.nodes[2].host, priority: 0, filter: [ "included", "partial.included" ] },
            ],
        });
        rt.waitForState(rt.nodes[0], ReplSetTest.State.PRIMARY);
        rt.awaitNodesAgreeOnPrimary();
        rt.awaitReplication();
        return rt;
    }

    function initReplsetWithoutFilteredNode() {
        var host = getHostName();
        var name = "filtered1";

        var rt = new ReplSetTest({name: name, nodes: 3});
        rt.startSet();
        rt.lastNodeOptions = rt.nodeOptions.n2;
        delete rt.nodeOptions.n2;
        rt.lastPort = rt.ports.pop();
        rt.lastNode = rt.nodes.pop();
        rt.initiate({
            _id: name,
            members: [
                {_id: 0, host: rt.nodes[0].host, priority: 3},
                {_id: 1, host: rt.nodes[1].host, priority: 0},
            ],
        });
        rt.waitForState(rt.nodes[0], ReplSetTest.State.PRIMARY);
        rt.awaitNodesAgreeOnPrimary();
        rt.awaitReplication();
        //jsTestLog(tojson(rt));
        return rt;
    }

    function addFilteredNode(rt) {
        rt.awaitReplication();
        var cfg = rt.getReplSetConfigFromNode();
        cfg.version++;
        cfg.members.push({_id: 2, host: rt.lastNode.host, priority: 0, filter: [ "included", "partial.included" ] });
        rt.nodeOptions.n2 = rt.lastNodeOptions;
        rt.ports.push(rt.lastPort);
        rt.nodes.push(rt.lastNode);
        assert.commandWorked(rt.getPrimary().adminCommand({replSetReconfig: cfg}));
        rt.awaitNodesAgreeOnPrimary();
        rt.awaitReplication();
    }

    var excludedNamespaces = [ "excluded.excluded", "partial.excluded" ];
    var includedNamespaces = [ "included.included", "partial.included" ];
    var bothNamespaces = [].concat(excludedNamespaces).concat(includedNamespaces);

    // Write some data.
    function writeData(rt, writeConcern) {
        var primary = rt.getPrimary();
        var options = {writeConcern};
        bothNamespaces.forEach( (ns) => assert.writeOK(primary.getCollection(ns).insert({x: ns}, options)) );
    }

    // Check that the data is where it should be.
    function checkData(rt, numCopies) {
        rt.awaitReplication();

        // The regular node should have everything.
        bothNamespaces.forEach( (ns) => assert.eq(numCopies, rt.nodes[1].getCollection(ns).find({x:ns}).count()) );
        bothNamespaces.forEach( (ns) => rt.nodes[1].getCollection(ns).find({x:ns}).forEach( (doc) => assert.eq(ns, doc.x) ) );

        // The filtered node should only have the included things, and none of the excluded things.
        excludedNamespaces.forEach( (ns) => assert.eq(0, rt.nodes[2].getCollection(ns).find({x:ns}).count()) );
        excludedNamespaces.forEach( (ns) => assert.eq(0, rt.nodes[2].getCollection(ns).find().count()) );
        excludedNamespaces.forEach( (ns) => assert.eq(0, rt.nodes[2].getCollection(ns).count()) );
        includedNamespaces.forEach( (ns) => assert.eq(numCopies, rt.nodes[2].getCollection(ns).find({x:ns}).count()) );
        includedNamespaces.forEach( (ns) => rt.nodes[2].getCollection(ns).find({x:ns}).forEach( (doc) => assert.eq(ns, doc.x) ) );
    }

    // Check that the oplogs are how they should be.
    function checkOplogs(rt, nodeNum) {
        rt.awaitReplication();
        rt.getPrimary().getDB("local").oplog.rs.find( { op: { $ne: "n" } } ).sort( { $natural: 1 } ).forEach( function(op) {
            checkOpInOplog(rt.nodes[nodeNum], op, 1);
        });
    }

    (function() {
        jsTestLog("START: Test a set which begins life with a filtered node.");
        var rt = initReplsetWithFilteredNode();
        writeData(rt, { w: 1, wtimeout: 60 * 1000 });
        checkData(rt, 1);
        checkOplogs(rt, 1);
        checkOplogs(rt, 2);
        rt.stopSet();
    })();

    (function() {
        jsTestLog("START: Test a set which begins life without a filtered node, but then gets added immediately.");
        var rt = initReplsetWithoutFilteredNode();
        addFilteredNode(rt);
        writeData(rt, { w: 1, wtimeout: 60 * 1000 });
        checkData(rt, 1);
        checkOplogs(rt, 1);
        checkOplogs(rt, 2);
        rt.stopSet();
    })();

    (function() {
        jsTestLog("START: Test a set which begins life without a filtered node, but then gets added later, ie. initial sync.");
        var rt = initReplsetWithoutFilteredNode();
        writeData(rt, { w: 1, wtimeout: 60 * 1000 });
        addFilteredNode(rt);
        checkData(rt, 1);
        checkOplogs(rt, 1);
        rt.stopSet();
    })();

}());
