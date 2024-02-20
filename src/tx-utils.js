/* eslint-disable no-prototype-builtins */
const ethers = require('ethers');
const { Scalar } = require('ffjavascript');

const { ENUM_TX_TYPES, VALID_TX_TYPES } = require('./compression/compressor-constants');
const { getFuncName, hasAllProperties } = require('./utils');

function parsePreEIP155(txData) {
    return {
        type: txData.type,
        to: txData.to,
        nonce: Scalar.e(txData.nonce),
        value: Scalar.e(txData.value),
        gasLimit: Scalar.e(txData.gasLimit),
        gasPrice: Scalar.e(txData.gasPrice),
        chainId: txData.chainId || 0,
        data: txData.data || '0x',
        effectivePercentage: txData.effectivePercentage || 255,
    };
}

function parseLegacy(txData) {
    return {
        type: txData.type,
        to: txData.to,
        nonce: Scalar.e(txData.nonce),
        value: Scalar.e(txData.value),
        gasLimit: Scalar.e(txData.gasLimit),
        gasPrice: Scalar.e(txData.gasPrice),
        chainId: txData.chainId,
        data: txData.data || '0x',
        effectivePercentage: txData.effectivePercentage || 255,
    };
}

function parseChangeL2Block(txData) {
    return {
        type: txData.type,
        deltaTimestamp: Scalar.e(txData.deltaTimestamp),
        indexL1InfoTree: Number(txData.indexL1InfoTree),
    };
}

function guessTxType(txData) {
    // if tx has indexL1InfoTree & deltaTimestamp --> changeL2Block type
    if (txData.hasOwnProperty('indexL1InfoTree') && txData.hasOwnProperty('deltaTimestamp')) {
        return ENUM_TX_TYPES.CHANGE_L2_BLOCK;
    }

    // if tx has not chainId property --> preEIP155
    if (!txData.hasOwnProperty('chainId')) {
        return ENUM_TX_TYPES.PRE_EIP_155;
    }

    // otherwise --> legacy
    return ENUM_TX_TYPES.LEGACY;
}

function parseTx(txData) {
    // infer tx type if not set
    if (!Object(txData).hasOwnProperty('type')) {
        txData.type = guessTxType(txData);
    }

    if (typeof txData.type === 'undefined') {
        throw new Error(`${getFuncName()}: txData.type is not set`);
    }

    switch (txData.type) {
    case ENUM_TX_TYPES.PRE_EIP_155:
        return parsePreEIP155(txData);
    case ENUM_TX_TYPES.LEGACY:
        return parseLegacy(txData);
    case ENUM_TX_TYPES.CHANGE_L2_BLOCK:
        return parseChangeL2Block(txData);
    default:
        throw new Error(`${getFuncName()}: txData.type ${txData.type} not supported`);
    }
}

/**
 * Extract preEIP155 transaction object compatible with etherjs
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
    default:
        throw new Error(`${getFuncName()}: tx.type ${_tx.type} not has tx signed message`);
    }

    return ethers.utils.serializeTransaction(ethersTx);
}

module.exports = {
    parseTx,
    getTxSignedMessage,
};
