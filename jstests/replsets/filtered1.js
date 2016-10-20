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

    // Write some data.
    function writeData(rt, w) {
        var primary = rt.getPrimary();
        var wtimeout = 60 * 1000;
        var options = {writeConcern: {w, wtimeout}};
        assert.writeOK(primary.getDB("excluded").excluded.insert({x: 1}, options));
        assert.writeOK(primary.getDB("included").included.insert({x: 2}, options));
        assert.writeOK(primary.getDB("partial").excluded.insert({x: 3}, options));
        assert.writeOK(primary.getDB("partial").included.insert({x: 4}, options));
    }

    // Check that the data is where it should be.
    function checkData(rt) {
        rt.awaitReplication();

        // The regular node should have everything.
        assert.eq(1, rt.nodes[1].getDB("excluded").excluded.findOne().x);
        assert.eq(2, rt.nodes[1].getDB("included").included.findOne().x);
        assert.eq(3, rt.nodes[1].getDB("partial").excluded.findOne().x);
        assert.eq(4, rt.nodes[1].getDB("partial").included.findOne().x);

        // The filtered node should only have the included things, and none of the excluded things.
        assert.eq(null, rt.nodes[2].getDB("excluded").excluded.findOne());
        assert.eq(2, rt.nodes[2].getDB("included").included.findOne().x);
        assert.eq(null, rt.nodes[2].getDB("partial").excluded.findOne());
        assert.eq(4, rt.nodes[2].getDB("partial").included.findOne().x);
    }

    // Check that the oplogs are how they should be.
    function checkOplogs(rt, nodeNum) {
        rt.awaitReplication();
        var primary = rt.getPrimary();
        primary.getDB("local").oplog.rs.find( { op: { $ne: "n" } } ).sort( { $natural: 1 } ).forEach( function(op) {
            checkOpInOplog(rt.nodes[nodeNum], op, 1);
        });
    }

    (function() {
        jsTestLog("START: Test a set which begins life with a filtered node.");
        var rt = initReplsetWithFilteredNode();
        writeData(rt, 1);
        checkData(rt);
        checkOplogs(rt, 1);
        checkOplogs(rt, 2);
        rt.stopSet();
    })();

    (function() {
        jsTestLog("START: Test a set which begins life without a filtered node, but then gets added immediately.");
        var rt = initReplsetWithoutFilteredNode();
        addFilteredNode(rt);
        writeData(rt, 1);
        checkData(rt);
        checkOplogs(rt, 1);
        checkOplogs(rt, 2);
        rt.stopSet();
    })();

    (function() {
        jsTestLog("START: Test a set which begins life without a filtered node, but then gets added later, ie. initial sync.");
        var rt = initReplsetWithoutFilteredNode();
        writeData(rt, 1);
        addFilteredNode(rt);
        checkData(rt);
        checkOplogs(rt, 1);
        rt.stopSet();
    })();
}());
