const { VALID_TX_TYPES } = require('./compressor-constants');
const { compareArrays } = require('../utils');

/**
 * Assert transaction has all necessary properties
 * @param {Object} tx - transaction
 */
function assertInterface(tx) {
    const expectedInterface = VALID_TX_TYPES[tx.type].interface;
    const txInterface = Object.keys(tx);

    if (!compareArrays(expectedInterface, txInterface)) {
        throw new Error('assertInterface: tx interface does not match');
    }
}

module.exports = {
    assertInterface,
};
