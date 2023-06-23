const ethers = require('ethers');
const { Scalar } = require('ffjavascript');

const { ENUM_TX_TYPES } = require('./compression/compressor-constants');
const { getFuncName } = require('./utils');
const { toHexStringRlp } = require('./processor-utils');

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
        newGER: txData.newGER,
        indexHistoricalGERTree: Number(txData.indexHistoricalGERTree),
    };
}

function parseTx(txData) {
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

module.exports = {
    parseTx,
};
