#!/bin/bash

# block-info
# processor
# zkevmDb
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

# set path script
cd $SCRIPT_DIR
# set path repository
cd ../..

# run uddate tests
npx mocha ./test/smt-utils.test.js --update
npx mocha ./test/smt-full-genesis.test.js --update
npx mocha ./test/smt-genesis.test.js --update

npx mocha ./test/block-info.test.js --update
npx mocha ./test/processor.test.js --update
npx mocha ./test/processor.test.js --update --e2e
npx mocha ./test/processor.test.js --update --blockinfo
npx mocha ./test/processor.test.js --update --selfdestruct
npx mocha ./test/zkevm-db.test.js --update