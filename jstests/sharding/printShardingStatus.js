// Check that the output from printShardingStatus() (aka sh.status())
// contains important information that it should, like the major section
// headings and the names of sharded collections and their shard keys.


(function () {


// SERVER-19368 to move this into utils.js
// jstests/auth/show_log_auth.js does something similar and could also benefit from this
print.captureAllOutput = function (fn, args) {
    var res = {};
    res.output = [];
    var __orig_print = print;
    print = function () {
        Array.prototype.push.apply(res.output, Array.prototype.slice.call(arguments).join(" ").split("\n"));
    };
    res.result = fn.apply(undefined, args);
    print = __orig_print;
    return res;
}

var st = new ShardingTest({ shards: 1, mongos: 1, config: 1, other: { smallfiles: true } });

var mongos = st.s0;
var admin = mongos.getDB( "admin" );

var dbName = "thisIsTheDatabase";
var collName = "thisIsTheCollection";
var shardKeyName = "thisIsTheShardKey";
var nsName = dbName + "." + collName;

assert.commandWorked( admin.runCommand({ enableSharding: dbName }) );
var key = {};
key[shardKeyName] = 1;
assert.commandWorked( admin.runCommand({ shardCollection: nsName, key: key }) );

// move this stuff to printShardingStatus2.js
// this is a stupid way to do it, because it's untestable without binding to the current (stupid) output format.
// instead have a helper function, which takes the collection name, what the unique/nobalance values should be,
// and string(s) to check for in the output.
// the function will shard the collection, set it up accordingly, get the output, check it, and then drop the collection.
// the check will automatically include checking that the *previous* namespaces are *NOT* in the output (to prevent tainting)
// from previous runs.  so it will need to remember each ns given, and check that it hasn't seen it before.
assert.commandWorked( admin.runCommand({ enableSharding: "test" }) );
assert.commandWorked( admin.runCommand({ shardCollection: "test.test1", key: { _id: 1} }) );
assert.commandWorked( admin.runCommand({ shardCollection: "test.test2", key: { _id: 1} }) );
assert.commandWorked( admin.runCommand({ shardCollection: "test.test3", key: { _id: 1}, unique: true }) );
assert.commandWorked( admin.runCommand({ shardCollection: "test.test4", key: { _id: 1}, unique: true }) );
assert.commandWorked( admin.runCommand({ shardCollection: "test.test6", key: { _id: 1} }) );
assert.commandWorked( admin.runCommand({ shardCollection: "test.test7", key: { _id: 1}, unique: true }) );
assert.commandWorked( admin.runCommand({ shardCollection: "test.test8", key: { _id: 1}, unique: true }) );

assert.writeOK( mongos.getDB("config").collections.update({ _id : "test.test2" }, { $set : { "noBalance" : true } }) );
assert.writeOK( mongos.getDB("config").collections.update({ _id : "test.test4" }, { $set : { "noBalance" : true } }) );

assert.writeOK( mongos.getDB("config").collections.update({ _id : "test.test6" }, { $set : { "noBalance" : "truthy noBalance value 1" } }) );
assert.writeOK( mongos.getDB("config").collections.update({ _id : "test.test7" }, { $set : { "unique" : "truthy unique value 1" } }) );
assert.writeOK( mongos.getDB("config").collections.update({ _id : "test.test8" }, { $set : { "noBalance" : "truthy noBalance value 2" } }) );
assert.writeOK( mongos.getDB("config").collections.update({ _id : "test.test8" }, { $set : { "unique" : "truthy unique value 2" } }) );

var res = print.captureAllOutput( function () { return st.printShardingStatus(); } );
var output = res.output.join("\n");
jsTestLog(output);


function assertPresentInOutput(content, what) {
    assert(output.includes(content), what + " \"" + content + "\" not present in output of printShardingStatus()");
}

assertPresentInOutput("shards:", "section header");
assertPresentInOutput("databases:", "section header");
assertPresentInOutput("balancer:", "section header");

assertPresentInOutput(dbName, "database");
assertPresentInOutput(collName, "collection");
assertPresentInOutput(shardKeyName, "shard key");

st.stop();

})();
