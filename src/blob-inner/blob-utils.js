/* eslint-disable no-continue */
const ethers = require('ethers');
const { Scalar } = require('ffjavascript');
const { createHash } = require('node:crypto');

const blobConstants = require('./blob-constants');
const { linearPoseidon } = require('../smt-utils');
const { frBLS12381, rootsUnity, inv4096Fr } = require('./fr-bls-12-381');
const utils = require('../utils');

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
 * @param {String} versionedHash - versioned hash
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
    versionedHash,
    blobL2HashData,
    forcedHashData,
) {
    const hashKeccak = ethers.utils.solidityKeccak256(
        ['bytes32', 'uint32', 'bytes32', 'uint64', 'address', 'uint64', 'uint8', 'bytes32', 'bytes32', 'bytes32'],
        [
            oldBlobAccInputHash,
            lastL1InfoTreeIndex,
            lastL1InfoTreeRoot,
            timestampLimit,
            sequencerAddress,
            zkGasLimit,
            blobType,
            versionedHash,
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
    blobData = blobData.startsWith('0x') ? blobData : `0x${blobData}`;

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
 * Compute versioned hash
 * @param {String} kzgCommitment - kzg commitment
 * @returns {String} - versioned hash in hex encoding
 */
function computeVersionedHash(kzgCommitment) {
    const kzgCommitmentArray = new Uint8Array(utils.hexString2byteArray(kzgCommitment));
    const sha256Str = createHash('sha256').update(kzgCommitmentArray).digest('hex');

    return `0x${blobConstants.VERSIONED_HASH_VERSION_KZG}${sha256Str.slice(2, 64)}`;
}
/**
 * Compute pointZ data
 * @param {String} _kzgCommitment - kzg commitment
 * @param {String} _blobData - Blob data
 * @returns pointZData = kzgCommitment + blobData
 */
function buildPointZData(_kzgCommitment, _blobData) {
    // remove 0x from blobData
    const blobData = _blobData.startsWith('0x') ? _blobData.slice(2) : _blobData;
    const pointZData = `${_kzgCommitment}${blobData}`;

    return pointZData;
}

/**
 * Compute pointZ
 * @param {String} _kzgCommitment - kzg commitment
 * @param {String} _blobData - Blob data
 * @returns pointZ
 */
async function computePointZ(_kzgCommitment, _blobData) {
    const hash = await linearPoseidon(buildPointZData(_kzgCommitment, _blobData));

    const hashModFrBLS = Scalar.mod(Scalar.fromString(hash, 16), frBLS12381.p);

    return `0x${hashModFrBLS.toString(16).padStart(2 * blobConstants.BYTES_PER_FIELD_ELEMENT, '0')}`;
}

/**
 * Compute points
 * @param {String} _blobData - Blob data
 * @param {Scalar} _pointZ - pointZ
 * @returns {Object} - pointY
 */
function computePointY(_blobData, _pointZ) {
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

/**
 * Compute blodData from batchesData
 * @param {String} batches - Batches data
 * @param {Scalar} blobType - Blob type
 * @returns {Object} - blobData
 */
function computeBlobDataFromBatches(batches, blobType) {
    // build blobdata with no spaces
    // Compression type: 1 byte
    let resBlobdata = `0x${Scalar.e(blobConstants.BLOB_COMPRESSION_TYPE.NO_COMPRESSION).toString(16)
        .padStart(2 * blobConstants.BLOB_ENCODING.BYTES_COMPRESSION_TYPE, '0')}`;

    // Add batches
    let batchesData = '';
    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i].startsWith('0x') ? batches[i].slice(2) : batches[i];
        // add batch length
        batchesData += Scalar.e(batch.length / 2).toString(16)
            .padStart(2 * blobConstants.BLOB_ENCODING.BYTES_BATCH_LENGTH, '0');
        // add batch
        batchesData += batch;
    }
    // add body length
    resBlobdata += Scalar.e(batchesData.length / 2).toString(16)
        .padStart(2 * blobConstants.BLOB_ENCODING.BYTES_BODY_LENGTH, '0');
    // add batches data
    resBlobdata += batchesData;

    let blobData;
    if (blobType === blobConstants.BLOB_TYPE.CALLDATA || blobType === blobConstants.BLOB_TYPE.FORCED) {
        blobData = resBlobdata;
    } else if (blobType === blobConstants.BLOB_TYPE.EIP4844) {
    // build blob data with no spaces and then add 0x00 each 32 bytes
        blobData = '';
        const blobDataNoSpaces = resBlobdata.slice(2);
        // add 0x00 each 31 bytes
        for (let i = 0; i < blobDataNoSpaces.length; i += 62) {
            blobData += `00${blobDataNoSpaces.slice(i, i + 62)}`;
        }
        // pad until blob space is reached
        blobData = `0x${blobData.padEnd(blobConstants.BLOB_BYTES * 2, '0')}`;
    } else {
        throw new Error('BlobProcessor:executeBlob: invalid blob type');
    }

    return blobData;
}

/**
 * Parse blodData to batchesData
 * @param {String} blobData - blob data
 * @param {Scalar} blobType - Blob type
 * @returns {boolean} - isInvalid
 * @returns {Array[string]} - batches data
 */
function parseBlobData(blobData, blobType) {
    let tmpBlobdata = '';
    let isInvalid = false;
    const batches = [];

    // if blobData is calldata or forced, no need to check and remove MSB each 32 bytes
    if (blobType === blobConstants.BLOB_TYPE.CALLDATA || blobType === blobConstants.BLOB_TYPE.FORCED) {
        tmpBlobdata = blobData;
    } else if (blobType === blobConstants.BLOB_TYPE.EIP4844) {
        // assure the most significant byte is '00' each slot of 32 bytes
        for (let i = 0; i < blobData.length; i += 64) {
            const slot32 = blobData.slice(i, i + 64);
            if (slot32.slice(0, 2) !== '00') {
                isInvalid = true;

                return { isInvalid, batches };
            }
            tmpBlobdata += slot32.slice(2, 64);
        }
    }

    const tmpBlobDataLenString = tmpBlobdata.length;

    // parse blobdata
    let offsetBytes = 0;

    // read compression type
    // check 1 byte can be read
    if (tmpBlobDataLenString < blobConstants.BLOB_ENCODING.BYTES_COMPRESSION_TYPE * 2) {
        isInvalid = true;

        return { isInvalid, batches };
    }

    const compressionType = Scalar.e(parseInt(tmpBlobdata.slice(
        offsetBytes,
        offsetBytes + blobConstants.BLOB_ENCODING.BYTES_COMPRESSION_TYPE * 2,
    ), 16));
    if (compressionType !== Scalar.e(blobConstants.BLOB_COMPRESSION_TYPE.NO_COMPRESSION)) {
        isInvalid = true;

        return { isInvalid, batches };
    }
    offsetBytes += blobConstants.BLOB_ENCODING.BYTES_COMPRESSION_TYPE * 2;

    // read body length
    // check 4 bytes can be read
    if (tmpBlobDataLenString < offsetBytes + blobConstants.BLOB_ENCODING.BYTES_BODY_LENGTH * 2) {
        isInvalid = true;

        return { isInvalid, batches };
    }
    const bodyLen = Scalar.e(parseInt(tmpBlobdata.slice(offsetBytes, offsetBytes + blobConstants.BLOB_ENCODING.BYTES_BODY_LENGTH * 2), 16));
    offsetBytes += blobConstants.BLOB_ENCODING.BYTES_BODY_LENGTH * 2;

    // read batches
    let bytesBodyReaded = 0;
    while (offsetBytes < bodyLen) {
        // check 4 bytes can be read
        if (tmpBlobDataLenString < offsetBytes + blobConstants.BLOB_ENCODING.BYTES_BATCH_LENGTH * 2) {
            isInvalid = true;

            return { isInvalid, batches };
        }
        const batchLength = parseInt(tmpBlobdata.slice(offsetBytes, offsetBytes + blobConstants.BLOB_ENCODING.BYTES_BATCH_LENGTH * 2), 16);
        offsetBytes += blobConstants.BLOB_ENCODING.BYTES_BATCH_LENGTH * 2;
        bytesBodyReaded += blobConstants.BLOB_ENCODING.BYTES_BATCH_LENGTH;

        // check batchLength bytes can be read
        if (tmpBlobDataLenString < offsetBytes + batchLength * 2) {
            isInvalid = true;

            return { isInvalid, batches };
        }

        // do not add empty batch
        if (batchLength !== 0) {
            const batchData = tmpBlobdata.slice(offsetBytes, offsetBytes + 2 * batchLength);
            batches.push(batchData);
        }
        offsetBytes += batchLength * 2;
        bytesBodyReaded += batchLength;
    }

    // check length matches
    if (bodyLen !== Scalar.e(bytesBodyReaded)) {
        isInvalid = true;
    }

    return { isInvalid, batches };
}

function reduceBlobData(blobData) {
    const r = Scalar.e("0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001");
    let counter = 0;
    let blobDataFinal = "0x";
    if(blobData.startsWith("0x")) {
        counter += 2;
    }
    for(let i = 0; i < blobConstants.FIELD_ELEMENTS_PER_BLOB; i++) {
        const finalCounter = counter+blobConstants.BYTES_PER_FIELD_ELEMENT*2;
        const elem = Scalar.e("0x" + blobData.substring(counter, finalCounter));
        const final = Scalar.mod(elem,r).toString(16).padStart(64,'0');
        blobDataFinal = blobDataFinal+final;
        counter = finalCounter; 
    }
    return blobDataFinal
}

module.exports = {
    isHex,
    computeBlobAccInputHash,
    computeBlobL2HashData,
    buildPointZData,
    computePointZ,
    computePointY,
    computeBatchL2HashData,
    computeBatchAccInputHash,
    computeBlobDataFromBatches,
    parseBlobData,
    computeVersionedHash,
    reduceBlobData
};
