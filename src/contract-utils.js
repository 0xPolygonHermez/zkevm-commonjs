/* eslint-disable max-len */
const ethers = require('ethers');
const { Scalar } = require('ffjavascript');
const { sha256Snark, padZeros } = require('./utils');

/**
 * Compute accumulateBlobHash = Keccak256(oldAccBlobHash, blobHashData, blobHashType, historicGERRoot, timestampLimit, sequencerAddress, L1BlockHash, zkGasLimit, gasPriceL1)
 * @param {String} oldAccBlobHash - old accumulate blob hash
 * @param {String} blobHashData - blob hash data
 * @param {String} blobType - blob type
 * @param {String} historicGERRoot - Block timestamp
 * @param {BigInt} timestampLimit - Sequencer address
 * @param {String} sequencerAddress - Sequencer address
 * @param {String} L1BlockHash - Sequencer address
 * @param {BigInt} zkGasLimit - Sequencer address
 * @returns {String} - accumulateInputHash in hex encoding
 */
function calculateAccBlobHash(
    oldAccBlobHash,
    blobHashData,
    blobType,
    historicGERRoot,
    timestampLimit,
    sequencerAddress,
    L1BlockHash,
    zkGasLimit,
) {
    const hashKeccak = ethers.utils.solidityKeccak256(
        ['bytes32', 'bytes32', 'uint8', 'bytes32', 'uint64', 'address', 'bytes32', 'uint64'],
        [
            oldAccBlobHash,
            blobHashData,
            blobType,
            historicGERRoot,
            timestampLimit,
            sequencerAddress,
            L1BlockHash,
            zkGasLimit,
        ],
    );

    return hashKeccak;
}

/**
 * Compute input for SNARK circuit: sha256(aggrAddress, chainID, forkID, initStateRoot, initNumBatch, finalStateRoot, finalNumBatch, finalLocalExitRoot, initBlobRoot, initAccBlobHash, initNumBlob, finalBlobRoot, finalAccBlobHash, finalNumBlob) % FrSNARK
 * @param {String} aggregatorAddress - Aggregator Ethereum address in hex string
 * @param {Number} chainID - L2 chainID
 * @param {Number} forkID - L2 rom fork identifier
 * @param {String} initStateRoot - initial state Root
 * @param {Number} initNumBatch - initial batch number
 * @param {String} finalStateRoot - final state Root
 * @param {Number} finalNumBatch - final batch number
 * @param {String} finalLocalExitRoot - New local exit root once the all batches is processed
 * @param {String} initBlobRoot - initial blob Root
 * @param {String} initAccBlobHash - initial accumulated blob hash
 * @param {Number} initNumBlob - initial blob number
 * @param {String} finalBlobRoot - final blob Root
 * @param {String} finalAccBlobHash - final accumulated blob hash
 * @param {Number} finalNumBlob - final blob number
 * @returns {String} - input snark in hex encoding
 */
async function calculateSnarkInput(
    aggregatorAddress,
    chainID,
    forkID,
    initStateRoot,
    initNumBatch,
    finalStateRoot,
    finalNumBatch,
    finalLocalExitRoot,
    initBlobRoot,
    initAccBlobHash,
    initNumBlob,
    finalBlobRoot,
    finalAccBlobHash,
    finalNumBlob,
) {
    // 20 bytes agggregator address
    const strAggregatorAddress = padZeros((Scalar.fromString(aggregatorAddress, 16)).toString(16), 40);

    // 8 bytes for chainID
    const strChainID = padZeros(Scalar.e(chainID).toString(16), 16);

    // 8 bytes for forkID
    const strForkID = padZeros(Scalar.e(forkID).toString(16), 16);

    // 32 bytes each field element for oldStateRoot
    const strInitStateRoot = padZeros((Scalar.fromString(initStateRoot, 16)).toString(16), 64);

    // 8 bytes for oldNumBatch
    const strInitNumBatch = padZeros(Scalar.e(initNumBatch).toString(16), 16);

    // 32 bytes each field element for oldStateRoot
    const strFinalStateRoot = padZeros((Scalar.fromString(finalStateRoot, 16)).toString(16), 64);

    // 8 bytes for oldNumBatch
    const strFinalNumBatch = padZeros(Scalar.e(finalNumBatch).toString(16), 16);

    // 32 bytes each field element for oldStateRoot
    const strFinalLocalExitRoot = padZeros((Scalar.fromString(finalLocalExitRoot, 16)).toString(16), 64);

    // 32 bytes each field element for oldStateRoot
    const strInitBlobRoot = padZeros((Scalar.fromString(initBlobRoot, 16)).toString(16), 64);

    // 32 bytes each field element for oldStateRoot
    const strInitAccBlobHash = padZeros((Scalar.fromString(initAccBlobHash, 16)).toString(16), 64);

    // 8 bytes for oldNumBatch
    const strInitNumBlob = padZeros(Scalar.e(initNumBlob).toString(16), 16);

    // 32 bytes each field element for oldStateRoot
    const strFinalBlobRoot = padZeros((Scalar.fromString(finalBlobRoot, 16)).toString(16), 64);

    // 32 bytes each field element for oldStateRoot
    const strFinalAccBlobHash = padZeros((Scalar.fromString(finalAccBlobHash, 16)).toString(16), 64);

    // 8 bytes for oldNumBatch
    const strFinalNumBlob = padZeros(Scalar.e(finalNumBlob).toString(16), 16);

    // build final bytes sha256
    const finalStr = strAggregatorAddress
        .concat(strChainID)
        .concat(strForkID)
        .concat(strInitStateRoot)
        .concat(strInitNumBatch)
        .concat(strFinalStateRoot)
        .concat(strFinalNumBatch)
        .concat(strFinalLocalExitRoot)
        .concat(strInitBlobRoot)
        .concat(strInitAccBlobHash)
        .concat(strInitNumBlob)
        .concat(strFinalBlobRoot)
        .concat(strFinalAccBlobHash)
        .concat(strFinalNumBlob);

    return sha256Snark(finalStr);
}

/**
 * Blob hash data
 * @param {String} blobData - blob data
 * @returns {String} - Blob hash data
 */
function calculateBlobHashData(
    transactions,
) {
    return ethers.utils.solidityKeccak256(
        ['bytes'],
        [
            transactions,
        ],
    );
}

/**
 * Prepare zkSnark inputs for smart contract
 * @param {Object} proofJson - Contain the proof data related from snarkJs
 * @returns {Object} - Proof structure ready to be sent to smart contract
 */
function generateSolidityInputs(
    proofJson,
) {
    const { evaluations, polynomials } = proofJson;
    const arrayStrings = Array(24).fill('bytes32');
    const proof = ethers.utils.defaultAbiCoder.encode(
        arrayStrings,
        [
            ethers.utils.hexZeroPad(ethers.BigNumber.from(polynomials.C1[0]).toHexString(), 32),
            ethers.utils.hexZeroPad(ethers.BigNumber.from(polynomials.C1[1]).toHexString(), 32),
            ethers.utils.hexZeroPad(ethers.BigNumber.from(polynomials.C2[0]).toHexString(), 32),
            ethers.utils.hexZeroPad(ethers.BigNumber.from(polynomials.C2[1]).toHexString(), 32),
            ethers.utils.hexZeroPad(ethers.BigNumber.from(polynomials.W1[0]).toHexString(), 32),
            ethers.utils.hexZeroPad(ethers.BigNumber.from(polynomials.W1[1]).toHexString(), 32),
            ethers.utils.hexZeroPad(ethers.BigNumber.from(polynomials.W2[0]).toHexString(), 32),
            ethers.utils.hexZeroPad(ethers.BigNumber.from(polynomials.W2[1]).toHexString(), 32),
            ethers.utils.hexZeroPad(ethers.BigNumber.from(evaluations.ql).toHexString(), 32),
            ethers.utils.hexZeroPad(ethers.BigNumber.from(evaluations.qr).toHexString(), 32),
            ethers.utils.hexZeroPad(ethers.BigNumber.from(evaluations.qm).toHexString(), 32),
            ethers.utils.hexZeroPad(ethers.BigNumber.from(evaluations.qo).toHexString(), 32),
            ethers.utils.hexZeroPad(ethers.BigNumber.from(evaluations.qc).toHexString(), 32),
            ethers.utils.hexZeroPad(ethers.BigNumber.from(evaluations.s1).toHexString(), 32),
            ethers.utils.hexZeroPad(ethers.BigNumber.from(evaluations.s2).toHexString(), 32),
            ethers.utils.hexZeroPad(ethers.BigNumber.from(evaluations.s3).toHexString(), 32),
            ethers.utils.hexZeroPad(ethers.BigNumber.from(evaluations.a).toHexString(), 32),
            ethers.utils.hexZeroPad(ethers.BigNumber.from(evaluations.b).toHexString(), 32),
            ethers.utils.hexZeroPad(ethers.BigNumber.from(evaluations.c).toHexString(), 32),
            ethers.utils.hexZeroPad(ethers.BigNumber.from(evaluations.z).toHexString(), 32),
            ethers.utils.hexZeroPad(ethers.BigNumber.from(evaluations.zw).toHexString(), 32),
            ethers.utils.hexZeroPad(ethers.BigNumber.from(evaluations.t1w).toHexString(), 32),
            ethers.utils.hexZeroPad(ethers.BigNumber.from(evaluations.t2w).toHexString(), 32),
            ethers.utils.hexZeroPad(ethers.BigNumber.from(evaluations.inv).toHexString(), 32),
        ],
    );

    return proof;
}

module.exports = {
    calculateAccBlobHash,
    calculateSnarkInput,
    calculateBlobHashData,
    generateSolidityInputs,
};
