const { Scalar } = require('ffjavascript');

const { ethers } = require('ethers');
const { VALID_TX_TYPES, ENUM_TX_TYPES } = require('./compressor-constants');
const { compareArrays, getFuncName, hasAllProperties } = require('../utils');

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
 * Extract preEIP155 transaction object comapitble with etherjs
 * @param {Object} tx - transaction object
 * @returns {Object} - to be ready to ethersjs library
 */
function preEIP155ToEthers(tx) {
    if (!hasAllProperties(tx, VALID_TX_TYPES[tx.type].interface)) {
        throw new Error(`${getFuncName()}: tx interface does not match`);
    }

    return {
        type: 0,
        nonce: tx.nonce,
        gasPrice: tx.gasPrice,
        gasLimit: tx.gasLimit,
        to: tx.to,
        value: tx.value,
        data: tx.data,
    };
}

/**
 * Extract legacy transaction object comapitble with etherjs
 * @param {Object} tx - transaction object
 * @returns {Object} - to be ready to ethersjs library
 */
function legacyToEthers(tx) {
    if (!hasAllProperties(tx, VALID_TX_TYPES[tx.type].interface)) {
        throw new Error(`${getFuncName()}: tx interface does not match`);
    }

    return {
        type: 0,
        nonce: tx.nonce,
        gasPrice: tx.gasPrice,
        gasLimit: tx.gasLimit,
        to: tx.to,
        value: tx.value,
        data: tx.data,
        chainId: tx.chainId,
    };
}

/**
 * Computes the message that is hashed
 * @param {Object} _tx - transaction
 * @returns {String} RLP string (message to hash)
 */
function getTxSignedMessage(_tx) {
    let ethersTx;

    switch (_tx.type) {
    case ENUM_TX_TYPES.PRE_EIP_155:
        ethersTx = preEIP155ToEthers(_tx);
        break;
    case ENUM_TX_TYPES.LEGACY:
        ethersTx = legacyToEthers(_tx);
        break;
    case ENUM_TX_TYPES.CHANGE_L2_BLOCK:
        return serializeChangeL2Block(_tx);
    default:
        throw new Error(`${getFuncName()}: tx.type ${_tx.type} not supported`);
    }

    return ethers.utils.serializeTransaction(ethersTx);
}

module.exports = {
    assertInterface,
    getTxSignedMessage,
};
