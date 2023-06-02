const ethers = require('ethers');

const { ENUM_TX_TYPES } = require('./compression/compressor-constants');
const { getFuncName } = require('./utils');
const { toHexStringRlp } = require('./processor-utils');

function parsePreEIP155(txData) {
    return {
        type: txData.type,
        to: txData.to,
        nonce: txData.nonce,
        value: toHexStringRlp(ethers.utils.parseUnits(txData.value, 'wei')),
        gasLimit: txData.gasLimit,
        gasPrice: toHexStringRlp(ethers.utils.parseUnits(txData.gasPrice, 'wei')),
        chainId: txData.chainId || 0,
        data: txData.data || '0x',
    };
}

function parseLegacy(txData) {
    return {
        type: txData.type,
        to: txData.to,
        nonce: txData.nonce,
        value: toHexStringRlp(ethers.utils.parseUnits(txData.value, 'wei')),
        gasLimit: txData.gasLimit,
        gasPrice: toHexStringRlp(ethers.utils.parseUnits(txData.gasPrice, 'wei')),
        chainId: txData.chainId,
        data: txData.data || '0x',
    };
}

function parseChangeL2Block(txData) {
    return {
        type: txData.type,
        deltaTimestamp: txData.deltaTimestamp,
        newGER: txData.newGER,
        indexHistoricalGERTree: txData.indexHistoricalGERTree,
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
