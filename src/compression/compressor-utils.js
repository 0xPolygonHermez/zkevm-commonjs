const { Scalar } = require('ffjavascript');

const { ethers } = require('ethers');
const { VALID_TX_TYPES, ENUM_TX_TYPES } = require('./compressor-constants');
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

/**
 * Serialize changeL2Block transaction
 * [ deltaTimestamp |  newGER  | indexHistoricGERTree]
 * [    4 bytes     | 32 bytes |       8 bytes       ]
 * @param {Object} _tx - transaction object
 * @returns {String} serialization hexadecimal string
 */
function serializeChangeL2Block(_tx) {
    const strDeltaTimestamp = Scalar.e(_tx.deltaTimestamp).toString(16).padStart('0', 8);
    const strNewGER = Scalar.e(_tx.newGER).toString(16).padStart('0', 64);
    const strIndexGER = Scalar.e(_tx.indexHistoricalGERTree).toString(16).padStart('0', 16);

    return `0x${strDeltaTimestamp}${strNewGER}${strIndexGER}`;
}

/**
 * Computes the message that is hashed
 * @param {Object} _tx - transaction
 * @returns {String} RLP string (message to hash)
 */
function getTxSignedMessage(_tx) {
    // serialize changeL2Block transaction type
    if (_tx.type === ENUM_TX_TYPES.CHANGE_L2_BLOCK) {
        return serializeChangeL2Block(_tx);
    }

    const ethersTx = { ..._tx };

    // modify type to fit ethers library to compute message
    // set chainId = 0 if type is 0 (preEIP155)
    if (ethersTx.type === ENUM_TX_TYPES.PRE_EIP_155) {
        ethersTx.chainId = 0;
    } else {
        ethersTx.type -= 1;
    }

    return ethers.utils.serializeTransaction(ethersTx);
}

module.exports = {
    assertInterface,
    getTxSignedMessage,
};
