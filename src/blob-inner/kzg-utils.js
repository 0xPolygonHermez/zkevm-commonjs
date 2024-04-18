const path = require('path');
const kzgC = require('c-kzg');
const { computePointY, computePointZ, computeVersionedHash } = require('./blob-utils');
const blobConstants = require('./blob-constants');
const { byteArray2HexString, hexString2byteArray } = require('../utils');

const kzg = {};
let isBuilt = false;

/**
 * Convert blob data to kzg commitment
 * @param {String} blobData - blob data
 * @returns {String} - kzg commitment
 */
function blobToKzgCommitment(blobData) {
    const blobDataArray = Uint8Array.from(hexString2byteArray(blobData));

    if (blobDataArray.length !== blobConstants.BLOB_BYTES) {
        throw new Error(`blobToKzgCommitment: Invalid blob data length ${blobDataArray.length}`);
    }

    const kzgCommitmentArray = kzgC.blobToKzgCommitment(blobDataArray);

    return `0x${byteArray2HexString(kzgCommitmentArray)}`;
}

/**
 * Compute kzg proof for blob data
 * @param {String} blobData - blob data
 * @param {String} commitment - kzg commitment
 * @returns {String} blobProof
 */
function computeBlobKzgProof(blobData, commitment) {
    // blob data
    const blobDataArray = Uint8Array.from(hexString2byteArray(blobData));
    if (blobDataArray.length !== blobConstants.BLOB_BYTES) {
        throw new Error(`computeBlobKzgProof: Invalid blob data length ${blobDataArray.length}`);
    }

    // commitment
    const commitmentArray = Uint8Array.from(hexString2byteArray(commitment));
    if (commitmentArray.length !== blobConstants.KZG_COMMITMENT_BYTES) {
        throw new Error(`computeBlobKzgProof: Invalid commitment data length ${commitmentArray.length}`);
    }

    const proofArray = kzgC.computeBlobKzgProof(blobDataArray, commitmentArray);

    return `0x${byteArray2HexString(proofArray)}`;
}

/**
 * Verify kzg proof for blob data
 * @param {String} blobData - blob data
 * @param {String} commitment - kzg commitment
 * @param {String} proof - kzg proof
 * @returns {Boolean} True if proof is valis, false otherwise
 */
function verifyBlobKzgProof(blobData, commitment, proof) {
    const blobDataArray = Uint8Array.from(hexString2byteArray(blobData));
    if (blobDataArray.length !== blobConstants.BLOB_BYTES) {
        throw new Error(`verifyBlobKzgProof: Invalid blob data length ${blobDataArray.length}`);
    }

    const commitmentArray = Uint8Array.from(hexString2byteArray(commitment));
    if (commitmentArray.length !== blobConstants.KZG_COMMITMENT_BYTES) {
        throw new Error(`verifyBlobKzgProof: Invalid commitment data length ${commitmentArray.length}`);
    }

    const proofArray = Uint8Array.from(hexString2byteArray(proof));
    if (proofArray.length !== blobConstants.KZG_PROOF_BYTES) {
        throw new Error(`verifyBlobKzgProof: Invalid proof data length ${proofArray.length}`);
    }

    return kzgC.verifyBlobKzgProof(blobDataArray, commitmentArray, proofArray);
}

/**
 * Compute kzg proof
 * @param {String} blobData - blob data
 * @param {String} pointZ - point Z
 * @returns {Object} - kzg proof
 * - proof
 * - pointY
 */
function computeKzgProof(blobData, pointZ) {
    const blobDataArray = Uint8Array.from(hexString2byteArray(blobData));
    if (blobDataArray.length !== blobConstants.BLOB_BYTES) {
        throw new Error(`computeKzgProof: Invalid blob data length ${blobDataArray.length}`);
    }

    const pointZArray = Uint8Array.from(hexString2byteArray(pointZ));
    if (pointZArray.length !== blobConstants.BYTES_PER_FIELD_ELEMENT) {
        throw new Error(`computeKzgProof: Invalid pointZ data length ${pointZArray.length}`);
    }

    const proofArray = kzgC.computeKzgProof(blobDataArray, pointZArray);

    return {
        proof: `0x${byteArray2HexString(proofArray[0])}`,
        pointY: `0x${byteArray2HexString(proofArray[1])}`,
    };
}

/**
 * Verify kzg proof
 * @param {String} commitment - kzg commitment
 * @param {String} pointZ - point Z
 * @param {String} pointY - point Y
 * @param {String} proof - kzg proof
 * @returns {Boolean} True if proof is valis, false otherwise
 */
function verifyKzgProof(commitment, pointZ, pointY, proof) {
    const commitmentArray = Uint8Array.from(hexString2byteArray(commitment));
    if (commitmentArray.length !== blobConstants.KZG_COMMITMENT_BYTES) {
        throw new Error(`verifyKzgProof: Invalid commitment data length ${commitmentArray.length}`);
    }

    const pointZArray = Uint8Array.from(hexString2byteArray(pointZ));
    if (pointZArray.length !== blobConstants.BYTES_PER_FIELD_ELEMENT) {
        throw new Error(`verifyKzgProof: Invalid pointZ data length ${pointZArray.length}`);
    }

    const pointYArray = Uint8Array.from(hexString2byteArray(pointY));
    if (pointYArray.length !== blobConstants.BYTES_PER_FIELD_ELEMENT) {
        throw new Error(`verifyKzgProof: Invalid pointY data length ${pointYArray.length}`);
    }

    const proofArray = Uint8Array.from(hexString2byteArray(proof));
    if (proofArray.length !== blobConstants.KZG_PROOF_BYTES) {
        throw new Error(`verifyKzgProof: Invalid proof data length ${proofArray.length}`);
    }

    return kzgC.verifyKzgProof(commitmentArray, pointZArray, pointYArray, proofArray);
}

/**
 * singleton to build kzg once
 * loads automatically Ethereum trusted setup
 * @returns {Object} - kzg object interface
 * full kzg interface:
 *  - blobToKzgCommitment
 *  - computeBlobKzgProof
 *  - computeKzgProof
 *  - computePointY
 *  - computePointZ
 *  - computeVersionedHash
 *  - verifyKzgProof
 *  - verifyBlobKzgProofBatch
 */
async function getKzg() {
    if (isBuilt === false) {
        await kzgC.loadTrustedSetup(path.join(__dirname, '../trusted-setup/trusted-setup.json'));

        // add functions
        kzg.blobToKzgCommitment = blobToKzgCommitment;
        kzg.computeBlobKzgProof = computeBlobKzgProof;
        kzg.computeKzgProof = computeKzgProof;

        kzg.computePointY = computePointY;
        kzg.computePointZ = computePointZ;
        kzg.computeVersionedHash = computeVersionedHash;

        kzg.verifyKzgProof = verifyKzgProof;
        kzg.verifyBlobKzgProof = verifyBlobKzgProof;

        isBuilt = true;
    }

    return kzg;
}

module.exports = getKzg;
