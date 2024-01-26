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
npx mocha ./test/processor.test.js --update --e2e --geninput
npx mocha ./test/processor.test.js --update --blockinfo --geninput
npx mocha ./test/processor.test.js --update --selfdestruct --geninput
npx mocha ./test/processor.test.js --update --etrog --geninput
npx mocha ./test/zkevm-db.test.js --update