const path = require('path');
const { stateUtils } = require('../../index');

const pathTestVectors = path.join(__dirname, '../../node_modules/@polygon-hermez/test-vectors');

async function setGenesisBlock(addressArray, amountArray, nonceArray, smt) {
    let currentRoot = smt.F.zero;
    for (let i = 0; i < addressArray.length; i++) {
        currentRoot = await stateUtils.setAccountState(addressArray[i], smt, currentRoot, amountArray[i], nonceArray[i]);
    }

    return currentRoot;
}

module.exports = {
    setGenesisBlock,
    pathTestVectors,
};
