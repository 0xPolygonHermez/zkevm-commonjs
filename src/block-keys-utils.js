/* eslint-disable max-len */
const { Scalar } = require('ffjavascript');

const constants = require('./constants');
const getPoseidon = require('./poseidon');
const { scalar2fea, stringToH4 } = require('./smt-utils');

/**
 * Leaf type 7:
 *   hk0: H([0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0])
 *   key: H([blockHeaderParams[0:4], blockHeaderParams[4:8], blockHeaderParams[8:12], blockHeaderParams[12:16], blockHeaderParams[16:20], 0, SMT_KEY_BLOCK_HEADER_PARAM, 0], [hk0[0], hk0[1], hk0[2], hk0[3]])
 * @param {Number} txIndex - current tx index
 * @returns {Scalar} - key computed
 */
async function keyBlockHeaderParams(paramKey) {
    const poseidon = await getPoseidon();
    const { F } = poseidon;

    const constant = F.e(constants.SMT_KEY_BLOCK_HEADER_PARAM);
    const blockHeaderParams = scalar2fea(F, Scalar.e(paramKey));

    const key1 = [blockHeaderParams[0], blockHeaderParams[1], blockHeaderParams[2], blockHeaderParams[3], blockHeaderParams[4], blockHeaderParams[5], constant, F.zero];
    const key1Capacity = stringToH4(constants.HASH_POSEIDON_ALL_ZEROES);

    return poseidon(key1, key1Capacity);
}

/**
 * Leaf type 8:
 *   hk0: H([0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0])
 *   key: H([txIndex[0:4], txIndex[4:8], txIndex[8:12], txIndex[12:16], txIndex[16:20], 0, SMT_KEY_BLOCK_HEADER_TRANSACTION_HASH, 0], [hk0[0], hk0[1], hk0[2], hk0[3]])
 * @param {Number} txIndex - current tx index
 * @returns {Scalar} - key computed
 */
async function keyTxHash(_txIndex) {
    const poseidon = await getPoseidon();
    const { F } = poseidon;

    const constant = F.e(constants.SMT_KEY_BLOCK_HEADER_TRANSACTION_HASH);
    const txIndex = scalar2fea(F, Scalar.e(_txIndex));

    const key1 = [txIndex[0], txIndex[1], txIndex[2], txIndex[3], txIndex[4], txIndex[5], constant, F.zero];
    const key1Capacity = stringToH4(constants.HASH_POSEIDON_ALL_ZEROES);

    return poseidon(key1, key1Capacity);
}

/**
 * Leaf type 9:
 *   hk0: H([0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0])
 *   key: H([txIndex[0:4], txIndex[4:8], txIndex[8:12], txIndex[12:16], txIndex[16:20], 0, SMT_KEY_BLOCK_HEADER_STATUS, 0], [hk0[0], hk0[1], hk0[2], hk0[3]])
 * @param {Number} txIndex - current tx index
 * @returns {Scalar} - key computed
 */
async function keyTxStatus(_txIndex) {
    const poseidon = await getPoseidon();
    const { F } = poseidon;

    const constant = F.e(constants.SMT_KEY_BLOCK_HEADER_STATUS);
    const txIndex = scalar2fea(F, Scalar.e(_txIndex));

    const key1 = [txIndex[0], txIndex[1], txIndex[2], txIndex[3], txIndex[4], txIndex[5], constant, F.zero];
    const key1Capacity = stringToH4(constants.HASH_POSEIDON_ALL_ZEROES);

    return poseidon(key1, key1Capacity);
}

/**
 * Leaf type 10:
 *   hk0: H([0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0])
 *   key: H([txIndex[0:4], txIndex[4:8], txIndex[8:12], txIndex[12:16], txIndex[16:20], 0, SMT_KEY_BLOCK_HEADER_CUMULATIVE_GAS_USED, 0], [hk0[0], hk0[1], hk0[2], hk0[3]])
 * @param {Number} txIndex - current tx index
 * @returns {Scalar} - key computed
 */
async function keyTxCumulativeGasUsed(_txIndex) {
    const poseidon = await getPoseidon();
    const { F } = poseidon;

    const constant = F.e(constants.SMT_KEY_BLOCK_HEADER_CUMULATIVE_GAS_USED);
    const txIndex = scalar2fea(F, Scalar.e(_txIndex));

    const key1 = [txIndex[0], txIndex[1], txIndex[2], txIndex[3], txIndex[4], txIndex[5], constant, F.zero];
    const key1Capacity = stringToH4(constants.HASH_POSEIDON_ALL_ZEROES);

    return poseidon(key1, key1Capacity);
}

/**
 * Leaf type 11:
 *    hk0: H([logIndex[0:4], logIndex[4:8], logIndex[8:12], logIndex[12:16], logIndex[16:20], logIndex[20:24], logIndex[24:28], logIndex[28:32], [0, 0, 0, 0])
 *   key: H([logIndexKey[0:4], logIndexKey[4:8], logIndexKey[8:12], logIndexKey[12:16], logIndexKey[16:20], 0, SMT_KEY_BLOCK_HEADER_LOGS, 0], [hk0[0], hk0[1], hk0[2], hk0[3]])
 * @param {Number} logIndex - current log index
 * @returns {Scalar} - key computed
 */
async function keyTxLogs(_txIndex, _logIndex) {
    const poseidon = await getPoseidon();
    const { F } = poseidon;

    const constant = F.e(constants.SMT_KEY_BLOCK_HEADER_LOGS);
    const txIndexKey = scalar2fea(F, Scalar.e(_txIndex));

    const key1 = [txIndexKey[0], txIndexKey[1], txIndexKey[2], txIndexKey[3], txIndexKey[4], txIndexKey[5], constant, F.zero];
    const logIndex = Scalar.e(_logIndex);
    const logIndexArray = scalar2fea(F, logIndex);
    const hk0 = poseidon(logIndexArray, [F.zero, F.zero, F.zero, F.zero]);

    return poseidon(key1, hk0);
}

/**
 * Leaf type 12:
 *   hk0: H([0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0])
 *   key: H([txIndex[0:4], txIndex[4:8], txIndex[8:12], txIndex[12:16], txIndex[16:20], 0, SMT_KEY_BLOCK_HEADER_EFFECTIVE_PERCENTAGE, 0], [hk0[0], hk0[1], hk0[2], hk0[3]])
 * @param {Number} txIndex - current tx index
 * @returns {Scalar} - key computed
 */
async function keyTxEffectivePercentage(_txIndex) {
    const poseidon = await getPoseidon();
    const { F } = poseidon;

    const constant = F.e(constants.SMT_KEY_BLOCK_HEADER_EFFECTIVE_PERCENTAGE);
    const txIndex = scalar2fea(F, Scalar.e(_txIndex));

    const key1 = [txIndex[0], txIndex[1], txIndex[2], txIndex[3], txIndex[4], txIndex[5], constant, F.zero];
    const key1Capacity = stringToH4(constants.HASH_POSEIDON_ALL_ZEROES);

    return poseidon(key1, key1Capacity);
}

module.exports = {
    keyBlockHeaderParams,
    keyTxLogs,
    keyTxStatus,
    keyTxHash,
    keyTxCumulativeGasUsed,
    keyTxEffectivePercentage,
};
