c = rs.conf();
shellPrint(c);
c.members.push({_id:2, host:"ubuntu:12347", priority: 0, filter: [ "admin", "foo", "bar.baz" ] });
shellPrint(c);
shellPrint(rs.reconfig(c));
