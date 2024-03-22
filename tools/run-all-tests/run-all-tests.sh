#!/bin/bash

# block-info
# processor
# zkevmDb
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

# set path script
cd $SCRIPT_DIR
# set path repository
cd ../..

## run tests
cd test && npx hardhat compile
cd .. && npx mocha './test/**/**.test.js'
npm run test:e2e
npm run test:blockinfo
npm run test:selfdestruct
npm run test:etrog