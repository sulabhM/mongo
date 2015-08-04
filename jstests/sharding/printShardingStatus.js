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


function assertPresentInOutput(output, content, what) {
    assert(output.includes(content), what + " \"" + content + "\" NOT present in output of printShardingStatus() (but it should be)");
}

function assertNotPresentInOutput(output, content, what) {
    assert( ! output.includes(content), what + " \"" + content + "\" IS present in output of printShardingStatus() (but it should not be)");
}



////////////////////////
// Basic tests
////////////////////////

var res = print.captureAllOutput( function () { return st.printShardingStatus(); } );
var output = res.output.join("\n");
jsTestLog(output);

assertPresentInOutput(output, "shards:", "section header");
assertPresentInOutput(output, "databases:", "section header");
assertPresentInOutput(output, "balancer:", "section header");

assertPresentInOutput(output, dbName, "database");
assertPresentInOutput(output, collName, "collection");
assertPresentInOutput(output, shardKeyName, "shard key");


////////////////////////
// Extended tests
////////////////////////

var prevCollNames = {};
function testCollDetails(args) {
    // Mandatory args
    for (var i in { collName: 1, unique: 1, noBalance: 1 }) {
        assert(args.hasOwnProperty(i), i + " is a mandatory arg to testExtendedCollDetails()");
    }

    assert( ! prevCollNames[args.collName], "test erronenously reused a collection name");

    var cmdObj = { shardCollection: args.collName, key: { _id: 1 } };
    if (args.unique) {
        cmdObj.unique = true;
    }
    assert.commandWorked( admin.runCommand(cmdObj) );

    if (args.unique != true && args.unique != false && args.unique != undefined) {
        assert.writeOK( mongos.getDB("config").collections.update({ _id : args.collName }, { $set : { "unique" : args.unique } }) );
    }
    if (args.noBalance) {
        assert.writeOK( mongos.getDB("config").collections.update({ _id : args.collName }, { $set : { "noBalance" : args.noBalance } }) );
    }

    var res = print.captureAllOutput( function () { return st.printShardingStatus(); } );
    var output = res.output.join("\n");
    jsTestLog(output);

    assertPresentInOutput(output, args.collName, "collection");
    // If any of the previous collection names are present, then their optional indicators
    // might also be present.  This might taint the results when we go searching through
    // the output.
    // This also means that later collNames can't have any of the earlier collNames as a prefix.
    for (var prevCollName in prevCollNames) {
        assertNotPresentInOutput(output, prevCollName, "previous collection");
    }

    if (args.unique) {
        assertPresentInOutput(output, "unique: true", "unique shard key indicator");
    }
    if (args.unique != true && args.unique != false && args.unique != undefined) {
        assertPresentInOutput(output, tojson(args.unique), "unique shard key indicator (non bool)");
    }

    if (args.noBalance) {
        assertPresentInOutput(output, "balancing: false", "noBalance indicator");
    }
    if (args.noBalance != true && args.noBalance != false && args.noBalance != undefined) {
        assertPresentInOutput(output, tojson(args.noBalance), "noBalance indicator (non bool)");
    }

    // SERVER-XXXX: drop fails if unique or noBalance is anything other than true/false/missing
    if (args.unique != true && args.unique != false && args.unique != undefined) {
        assert.writeOK( mongos.getDB("config").collections.update({ _id : args.collName }, { $set : { "unique" : true } }) );
    }
    if (args.noBalance !== true && args.noBalance !== false && args.noBalance !== undefined) {
        assert.writeOK( mongos.getDB("config").collections.update({ _id : args.collName }, { $set : { "noBalance" : true } }) );
    }
    assert( mongos.getCollection(args.collName).drop() );

    prevCollNames[args.collName] = true;
}

assert.commandWorked( admin.runCommand({ enableSharding: "test" }) );

testCollDetails({ collName: "test.test1", unique: false, noBalance: false });
testCollDetails({ collName: "test.test2", unique: false, noBalance: true  });
testCollDetails({ collName: "test.test3", unique: true,  noBalance: false });
testCollDetails({ collName: "test.test4", unique: true,  noBalance: true  });

testCollDetails({ collName: "test.test6", unique: false,                   noBalance: "truthy noBalance value 1" });
testCollDetails({ collName: "test.test9", unique: false,                   noBalance: 1 });
testCollDetails({ collName: "test.test7", unique: "truthy unique value 1", noBalance: false                      });
testCollDetails({ collName: "test.test8", unique: "truthy unique value 2", noBalance: "truthy noBalance value 2" });

// also check non-bool falsy values

st.stop();

})();
