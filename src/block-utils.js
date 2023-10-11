const { Scalar } = require('ffjavascript');

const constants = require('./constants');
const {
    keyBlockHeaderParams, keyTxLogs, keyTxStatus, keyTxHash, keyTxCumulativeGasUsed,
} = require('./block-keys-utils');

/**
 * Set a state of an ethereum address
 * @param {Object} smt merkle tree structure
 * @param {Array[Field]} root merkle tree root
 * @param {String} oldBlockHash old block hash
 * @param {String} coinbase block coinbase
 * @param {Scalar|Number} blockNumber block number
 * @param {Scalar|Number} gasLimit block gas limit
 * @param {Scalar|Number} timestamp block timestamp
 * @param {String} GER block's global exit root
 * @param {String} blockHashL1 block hash L1
 * @returns {Array[Field]} new state root
 */
async function initBlockHeader(smt, root, oldBlockHash, coinbase, blockNumber, gasLimit, timestamp, GER, blockHashL1) {
    const keyBlockHash = await keyBlockHeaderParams(constants.INDEX_BLOCK_HEADER_PARAM_BLOCK_HASH);
    const keyCoinbase = await keyBlockHeaderParams(constants.INDEX_BLOCK_HEADER_PARAM_COINBASE);
    const keyBlockNumber = await keyBlockHeaderParams(constants.INDEX_BLOCK_HEADER_PARAM_NUMBER);
    const keyGasLimit = await keyBlockHeaderParams(constants.INDEX_BLOCK_HEADER_PARAM_GAS_LIMIT);
    const keyTimestamp = await keyBlockHeaderParams(constants.INDEX_BLOCK_HEADER_PARAM_TIMESTAMP);
    const keyGER = await keyBlockHeaderParams(constants.INDEX_BLOCK_HEADER_PARAM_GER);
    const keyBlockHashL1 = await keyBlockHeaderParams(constants.INDEX_BLOCK_HEADER_PARAM_BLOCK_HASH_L1);

    let result = await smt.set(root, keyBlockHash, Scalar.e(oldBlockHash));
    result = await smt.set(result.newRoot, keyCoinbase, Scalar.e(coinbase));
    result = await smt.set(result.newRoot, keyBlockNumber, Scalar.e(blockNumber));
    result = await smt.set(result.newRoot, keyGasLimit, Scalar.e(gasLimit));
    result = await smt.set(result.newRoot, keyTimestamp, Scalar.e(timestamp));
    result = await smt.set(result.newRoot, keyGER, Scalar.e(GER));
    result = await smt.set(result.newRoot, keyBlockHashL1, Scalar.e(blockHashL1));

    return result.newRoot;
}

/**
 * Set a state of an ethereum address
 * @param {Object} smt merkle tree structure
 * @param {Array[Field]} root merkle tree root
 * @param {Scalar|Number} gasUsed block gasUsed
 * @returns {Array[Field]} new state root
 */
async function setBlockGasUsed(smt, root, gasUsed) {
    const keyGasUsed = await keyBlockHeaderParams(constants.INDEX_BLOCK_HEADER_PARAM_GAS_USED);
    const result = await smt.set(root, keyGasUsed, Scalar.e(gasUsed));

    return result.newRoot;
}

/**
 * Set tx hash to smt
 * @param {Object} smt merkle tree structure
 * @param {Array[Field]} root merkle tree root
 * @param {Number} txIndex transaction index
 * @param {String} hash transaction status
 * @returns {Array[Field]} new state root
 */
async function setTxHash(smt, root, txIndex, hash) {
    const keyHash = await keyTxHash(txIndex);
    const result = await smt.set(root, keyHash, Scalar.e(hash));

    return result.newRoot;
}

/**
 * Set tx status to smt
 * @param {Object} smt merkle tree structure
 * @param {Array[Field]} root merkle tree root
 * @param {Number} txIndex transaction index
 * @param {Number} status transaction status
 * @returns {Array[Field]} new state root
 */
async function setTxStatus(smt, root, txIndex, status) {
    const keyStatus = await keyTxStatus(txIndex);
    const result = await smt.set(root, keyStatus, Scalar.e(status));

    return result.newRoot;
}

/**
 * Set cumulative gas used to smt
 * @param {Object} smt merkle tree structure
 * @param {Array[Field]} root merkle tree root
 * @param {Number} txIndex transaction index
 * @param {Number} cumulativeGasUsed transaction cumulativeGasUsed
 * @returns {Array[Field]} new state root
 */
async function setCumulativeGasUsed(smt, root, txIndex, cumulativeGasUsed) {
    const keyStatus = await keyTxCumulativeGasUsed(txIndex);
    const result = await smt.set(root, keyStatus, Scalar.e(cumulativeGasUsed));

    return result.newRoot;
}

/**
 * Set logs to smt
 * @param {Number} logIndex current tx index
 * @param {Object} smt merkle tree structure
 * @param {String} logHash linear poseidon hash of log value H(topics + data)
 * @param {Array[Field]} root merkle tree root
 * @returns {Array[Field]} new state root
 */
async function setTxLog(smt, root, txIndex, logIndex, logValue) {
    // Get smt key from txIndex
    const key = await keyTxLogs(txIndex, logIndex);
    // Put log value in smt
    const res = await smt.set(root, key, logValue);

    return res.newRoot;
}

module.exports = {
    initBlockHeader,
    setBlockGasUsed,
    setTxHash,
    setTxStatus,
    setCumulativeGasUsed,
    setTxLog,
};
