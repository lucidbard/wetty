#!/bin/bash

export RUNDIR="/src"

cd $RUNDIR

#/install/node_modules/forever/bin/forever $RUNDIR/forever/development.json
#nodemon app.js -p 3000
supervisor -- app.js -p 3000 -i "public"
