c = rs.conf();
shellPrint(c);
c.members.push({_id:2, host:"devkev-1:12347", priority: 0, filter: [ "foo", "bar.baz" ] });
shellPrint(c);
shellPrint(rs.reconfig(c));
