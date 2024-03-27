/* eslint-disable no-continue */
const ethers = require('ethers');
const { Scalar } = require('ffjavascript');

const blobConstants = require('./blob-constants');
const { linearPoseidon } = require('../smt-utils');
const { frBLS12381, rootsUnity, inv4096Fr } = require('./fr-bls-12-381');

/**
 * Check if a string is a valid hexadecimal string
 * @param {String} str - string to check
 * @returns {Boolean} - true if the string is a valid hexadecimal string, false otherwise
 */
function isHex(str) {
    const regexp = /^[0-9a-fA-F]+$/;

    if (regexp.test(str) && str.length % 2 === 0) {
        return true;
    }

    return false;
}

/**
 * Compute accBlobAccInputHash
 * Keccak256(oldBlobAccInputHash, lastL1InfoTreeIndex, lastL1InfoTreeRoot, timestampLimit, seqAddress, zkGasLimit,
 * type, pointZ, pointY, blobL2HashData, forcedHashData)
 * @param {String} oldBlobAccInputHash - old blob accBlobInputHash
 * @param {Number} lastL1InfoTreeIndex - last index of the l1InfoTree
 * @param {String} lastL1InfoTreeRoot - last root of the l1InfoTree
 * @param {Number} timestampLimit - Block timestampLimit
 * @param {String} sequencerAddress - Sequencer address
 * @param {BigInt} zkGasLimit - zkGasLimit
 * @param {Number} blobType - blob type
 * @param {String} pointZ - pointZ
 * @param {String} pointY - pointY
 * @param {String} blobL2HashData - blob hash data
 * @param {String} forcedHashData - forced hash data
 * @returns {String} - accumulateInputHash in hex encoding
 */
function computeBlobAccInputHash(
    oldBlobAccInputHash,
    lastL1InfoTreeIndex,
    lastL1InfoTreeRoot,
    timestampLimit,
    sequencerAddress,
    zkGasLimit,
    blobType,
    pointZ,
    pointY,
    blobL2HashData,
    forcedHashData,
) {
    const hashKeccak = ethers.utils.solidityKeccak256(
        ['bytes32', 'uint32', 'bytes32', 'uint64', 'address', 'uint64', 'uint8', 'bytes32', 'bytes32', 'bytes32', 'bytes32'],
        [
            oldBlobAccInputHash,
            lastL1InfoTreeIndex,
            lastL1InfoTreeRoot,
            timestampLimit,
            sequencerAddress,
            zkGasLimit,
            blobType,
            pointZ,
            pointY,
            blobL2HashData,
            forcedHashData,
        ],
    );

    return hashKeccak;
}

/**
 * Compute batchAccInputHash
 * @param {String} oldBlobAccInputHash - old blob accBlobInputHash (32 bytes)
 * @param {String} batchL2HashData - blob hash data (32 bytes)
 * @param {String} sequencerAddress - Sequencer address (20 bytes)
 * @param {String} forcedHashData - forced hash data (32 bytes)
 * @returns {String} - accumulateInputHash in hex encoding
 */
async function computeBatchAccInputHash(
    _oldBlobAccInputHash,
    _batchL2HashData,
    _sequencerAddress,
    _forcedHashData,
) {
    // oldBlobAccInputHash
    let oldBlobAccInputHash = _oldBlobAccInputHash.startsWith('0x') ? _oldBlobAccInputHash.slice(2) : _oldBlobAccInputHash;
    oldBlobAccInputHash = oldBlobAccInputHash.padStart(64, '0');

    // batchL2HashData
    let batchL2HashData = _batchL2HashData.startsWith('0x') ? _batchL2HashData.slice(2) : _batchL2HashData;
    batchL2HashData = batchL2HashData.padStart(64, '0');

    // sequencerAddress
    let sequencerAddress = _sequencerAddress.startsWith('0x') ? _sequencerAddress.slice(2) : _sequencerAddress;
    sequencerAddress = sequencerAddress.padStart(40, '0');

    // forcedHashData
    let forcedHashData = _forcedHashData.startsWith('0x') ? _forcedHashData.slice(2) : _forcedHashData;
    forcedHashData = forcedHashData.padStart(64, '0');

    // compute linearPoseidon
    return linearPoseidon(`0x${oldBlobAccInputHash}${batchL2HashData}${sequencerAddress}${forcedHashData}`);
}

/**
 * Blob hash data
 * @param {String} blobData - Blob data
 * @returns {String} - Blob hash data
 */
function computeBlobL2HashData(blobData) {
    return ethers.utils.solidityKeccak256(
        ['bytes'],
        [blobData],
    );
}

/**
 * Batch hash data
 * @param {String} batchL2Data - Batch L2 data input in hex string
 * @returns {String} - Batch hash data
 */
async function computeBatchL2HashData(
    batchL2Data,
) {
    return linearPoseidon(batchL2Data);
}

/**
 * Compute pointZ
 * @param {String} blobData - Blob data
 * @returns pointZ
 */
async function computePointZ(blobData) {
    return linearPoseidon(blobData);
}

/**
 * Compute points
 * @param {String} _blobData - Blob data
 * @param {Scalar} _pointZ - pointZ
 * @returns {Object} - pointY
 */
async function computePointY(_blobData, _pointZ) {
    // remove 0x from blobData
    const blobData = _blobData.startsWith('0x') ? _blobData.slice(2) : _blobData;
    const pointZ = Scalar.e(_pointZ);

    // f(z) = fᵢ, z = ωⁱ
    // if pointZ is any of the rootUnity, return the blobData on index i
    for (let i = 0; i < blobConstants.FIELD_ELEMENTS_PER_BLOB; i++) {
        const rooti = Scalar.e(rootsUnity[i]);
        if (frBLS12381.eq(pointZ, rooti)) {
            return `0x${blobData.slice(64 * i, 64 + (64 * i))}`;
        }
    }

    // f(z) = (z⁴⁰⁹⁶-1)/4096·∑ᵢ fᵢ·ωⁱ/(z-ωⁱ), z != ωⁱ
    let a = frBLS12381.exp(pointZ, blobConstants.FIELD_ELEMENTS_PER_BLOB);
    a = frBLS12381.sub(a, 1n);
    a = frBLS12381.mul(a, inv4096Fr);

    let accum = frBLS12381.zero;
    for (let i = 0; i < blobConstants.FIELD_ELEMENTS_PER_BLOB; i++) {
        const rooti = Scalar.e(rootsUnity[i]);
        const termi = frBLS12381.mul(rooti, frBLS12381.inv(frBLS12381.sub(pointZ, rooti)));
        const elemi = Scalar.e(`0x${blobData.slice(64 * i, 64 + (64 * i))}`);
        accum = frBLS12381.add(accum, frBLS12381.mul(elemi, termi));
    }

    return `0x${frBLS12381.mul(a, accum).toString(16).padStart(64, '0')}`;
}

module.exports = {
    isHex,
    computeBlobAccInputHash,
    computeBlobL2HashData,
    computePointZ,
    computePointY,
    computeBatchL2HashData,
    computeBatchAccInputHash,
};