const { stateUtils } = require('../../index');

async function setGenesisBlock(addressArray, amountArray, nonceArray, smt) {
    let currentRoot = smt.F.zero;
    for (let i = 0; i < addressArray.length; i++) {
        currentRoot = await stateUtils.setAccountState(addressArray[i], smt, currentRoot, amountArray[i], nonceArray[i]);
    }

    return currentRoot;
}

module.exports = {
    setGenesisBlock,
};
