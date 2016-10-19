#!/bin/bash

mlaunch stop
mongo --port 12347 admin --eval 'db.shutdownServer()'
rm -rf data
