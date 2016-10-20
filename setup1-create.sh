#!/bin/bash

mlaunch init --replicaset --nodes 2 --port 12345 --binarypath .
mkdir -p data/replset/rs3/db
./mongod --dbpath data/replset/rs3/db --port 12347 --replSet replset --logappend --logpath data/replset/rs3/mongod.log --fork

