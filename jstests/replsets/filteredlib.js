// helpers for testing filtered replication functionality

load("jstests/replsets/rslib.js");

function initReplsetWithFilteredNode(name) {
    var rt = new ReplSetTest({name: name, nodes: 3});
    rt.startSet();
    rt.initiate({
        _id: name,
        members: [
            {_id: 0, host: rt.nodes[0].host, priority: 3},
            {_id: 1, host: rt.nodes[1].host, priority: 0},
            {
              _id: 2,
              host: rt.nodes[2].host,
              priority: 0,
              filter: ["admin", "included", "partial.included"]
            },
        ],
    });
    rt.waitForState(rt.nodes[0], ReplSetTest.State.PRIMARY);
    rt.awaitNodesAgreeOnPrimary();
    rt.awaitReplication();
    rt.numCopiesWritten = 0;
    return rt;
}

function initReplsetWithoutFilteredNode(name) {
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
    rt.numCopiesWritten = 0;
    // jsTestLog(tojson(rt));
    return rt;
}

function addFilteredNode(rt) {
    rt.awaitReplication();
    var cfg = rt.getReplSetConfigFromNode();
    cfg.version++;
    cfg.members.push({
        _id: 2,
        host: rt.lastNode.host,
        priority: 0,
        filter: ["admin", "included", "partial.included"]
    });
    rt.nodeOptions.n2 = rt.lastNodeOptions;
    rt.ports.push(rt.lastPort);
    rt.nodes.push(rt.lastNode);
    assert.commandWorked(rt.getPrimary().adminCommand({replSetReconfig: cfg}));
    rt.awaitNodesAgreeOnPrimary();
    rt.awaitReplication();
}

// Force node "node" to sync from node "from".
function syncNodeFrom(rt, node, from) {
    assert.commandWorked(
        rt.nodes[node].getDB("admin").runCommand({"replSetSyncFrom": rt.nodes[from].host}));
    var res;
    assert.soon(
        function() {
            res = rt.nodes[node].getDB("admin").runCommand({"replSetGetStatus": 1});
            return res.syncingTo === rt.nodes[from].host;
        },
        function() {
            return "node " + node + " failed to start syncing from node " + from + ": " +
                tojson(res);
        });
}

// Force node 1 (regular node) to sync from node 2 (filtered node).
function normalNodeSyncFromFilteredNode(rt) {
    syncNodeFrom(rt, 1, 2);
}

var excludedNamespaces = ["excluded.excluded", "partial.excluded"];
var includedNamespaces = ["included.included", "partial.included"];
var bothNamespaces = [].concat(excludedNamespaces).concat(includedNamespaces);

// Write some data.
function writeData(rt, writeConcern, expectedResult) {
    var primary = rt.getPrimary();
    var options = {writeConcern};
    bothNamespaces.forEach((ns) =>
                               expectedResult(primary.getCollection(ns).insert({x: ns}, options)));
    rt.numCopiesWritten++;
}

// The regular node should have everything.
function checkUnfilteredData(rt) {
    rt.awaitReplication();
    bothNamespaces.forEach((ns) => assert.eq(rt.numCopiesWritten,
                                             rt.nodes[1].getCollection(ns).find({x: ns}).count()));
    bothNamespaces.forEach(
        (ns) => rt.nodes[1].getCollection(ns).find({x: ns}).forEach((doc) => assert.eq(ns, doc.x)));
}

// The filtered node should only have the included things, and none of the excluded things.
function checkFilteredData(rt) {
    rt.awaitReplication();
    excludedNamespaces.forEach(
        (ns) => assert.eq(0, rt.nodes[2].getCollection(ns).find({x: ns}).count()));
    excludedNamespaces.forEach((ns) => assert.eq(0, rt.nodes[2].getCollection(ns).find().count()));
    excludedNamespaces.forEach((ns) => assert.eq(0, rt.nodes[2].getCollection(ns).count()));
    includedNamespaces.forEach(
        (ns) =>
            assert.eq(rt.numCopiesWritten, rt.nodes[2].getCollection(ns).find({x: ns}).count()));
    includedNamespaces.forEach(
        (ns) => rt.nodes[2].getCollection(ns).find({x: ns}).forEach((doc) => assert.eq(ns, doc.x)));
}

// Check that all the data is where it should be.
function checkData(rt) {
    checkUnfilteredData(rt);
    checkFilteredData(rt);
}

// Check that the oplogs are how they should be.
function checkOplogs(rt, nodeNum) {
    rt.awaitReplication();
    rt.getPrimary()
        .getDB("local")
        .oplog.rs.find({op: {$ne: "n"}})
        .sort({$natural: 1})
        .forEach(function(op) {
            checkOpInOplog(rt.nodes[nodeNum], op, 1);
        });
}

function testReplSetWriteConcern(f) {
    [2, "majority"].forEach((w) => {
        [false, true].forEach((j) => {
            jsTestLog("Write concern: " + tojson({w, j}));
            f(w, j);
        });
    });
}

function testReplSetWriteConcernForFailure(rt) {
    testReplSetWriteConcern((w, j) => {
        writeData(rt,
                  {w, j, wtimeout: 5 * 1000},
                  (x) => assert.eq(true,
                                   assert.writeErrorWithCode(x, ErrorCodes.WriteConcernFailed)
                                       .getWriteConcernError()
                                       .errInfo.wtimeout));
        checkFilteredData(rt);
        checkOplogs(rt, 2);
    });
}

function testReplSetWriteConcernForSuccess(rt, checkFilteredOplogs) {
    if (typeof(checkFilteredOplogs) == "undefined") {
        checkFilteredOplogs = true;
    }
    testReplSetWriteConcern((w, j) => {
        writeData(rt, {w, j, wtimeout: 60 * 1000}, assert.writeOK);
        checkData(rt);
        checkOplogs(rt, 1);
        if (checkFilteredOplogs) {
            checkOplogs(rt, 2);
        }
    });
}
