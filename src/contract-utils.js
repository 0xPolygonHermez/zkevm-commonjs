const ethers = require('ethers');
const { Scalar } = require('ffjavascript');
const { sha256Snark, padZeros } = require('./utils');

/**
 * Compute input for SNARK circuit: sha256(
 * initStateRoot, initBlobStateRoot, initBlobAccInputHash, initNumBlob, chainId, forkID
 * finalStateRoot, finalBlobStateRoot, finalBlobAccInputHash, finalNumBlob, finalLocalExitRoot
 * aggregatorAddress
 * ) % FrSNARK
 * @param {String} initStateRoot - old state root in hex encoding
 * @param {String} initBlobStateRoot - old blob state root in hex encoding
 * @param {String} initBlobAccInputHash - old blob account input hash in hex encoding
 * @param {Number} initNumBlob - old number of blobs
 * @param {Number} chainId - chain id
 * @param {Number} forkID - fork id
 * @param {String} initStateRoot - new state root in hex encoding
 * @param {String} initBlobStateRoot - new blob state root in hex encoding
 * @param {String} initBlobAccInputHash - new blob account input hash in hex encoding
 * @param {Number} initNumBlob - new number of blobs
 * @param {String} initLocalExitRoot - new local exit root in hex encoding
 * @param {String} aggregatorAddress - aggregator address in hex encoding
 * @returns {String} - input snark in hex encoding
 */
async function calculateSnarkInput(
    initStateRoot,
    initBlobStateRoot,
    initBlobAccInputHash,
    initNumBlob,
    chainId,
    forkID,
    finalStateRoot,
    finalBlobStateRoot,
    finalBlobAccInputHash,
    finalNumBlob,
    finalLocalExitRoot,
    aggregatorAddress,
) {
    // 32 bytes each field element for initStateRoot
    const strInitStateRoot = padZeros((Scalar.fromString(initStateRoot, 16)).toString(16), 64);

    // 32 bytes each field element for initBlobStateRoot
    const strInitBlobStateRoot = padZeros((Scalar.fromString(initBlobStateRoot, 16)).toString(16), 64);

    // 32 bytes each field element for initBlobAccInputHash
    const strInitBlobAccInputHash = padZeros((Scalar.fromString(initBlobAccInputHash, 16)).toString(16), 64);

    // 8 bytes for initNumBlob
    const strInitNumBlob = padZeros(Scalar.e(initNumBlob).toString(16), 16);

    // 8 bytes for chainID
    const strChainID = padZeros(Scalar.e(chainId).toString(16), 16);

    // 8 bytes for forkID
    const strForkID = padZeros(Scalar.e(forkID).toString(16), 16);

    // 32 bytes each field element for finalStateRoot
    const strFinalStateRoot = padZeros((Scalar.fromString(finalStateRoot, 16)).toString(16), 64);

    // 32 bytes each field element for finalBlobStateRoot
    const strFinalBlobStateRoot = padZeros((Scalar.fromString(finalBlobStateRoot, 16)).toString(16), 64);

    // 32 bytes each field element for finalBlobAccInputHash
    const strFinalBlobAccInputHash = padZeros((Scalar.fromString(finalBlobAccInputHash, 16)).toString(16), 64);

    // 8 bytes for finalNumBlob
    const strFinalNumBlob = padZeros(Scalar.e(finalNumBlob).toString(16), 16);

    // 32 bytes each field element for finalLocalExitRoot
    const strFinalLocalExitRoot = padZeros((Scalar.fromString(finalLocalExitRoot, 16)).toString(16), 64);

    // 20 bytes aggregator address
    const strAggregatorAddress = padZeros((Scalar.fromString(aggregatorAddress, 16)).toString(16), 40);

    // build final bytes sha256
    const finalStr = strInitStateRoot
        .concat(strInitBlobStateRoot)
        .concat(strInitBlobAccInputHash)
        .concat(strInitNumBlob)
        .concat(strChainID)
        .concat(strForkID)
        .concat(strFinalStateRoot)
        .concat(strFinalBlobStateRoot)
        .concat(strFinalBlobAccInputHash)
        .concat(strFinalNumBlob)
        .concat(strFinalLocalExitRoot)
        .concat(strAggregatorAddress);

    return sha256Snark(finalStr);
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
    const proof = [
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
    ];

    return proof;
}

module.exports = {
    calculateSnarkInput,
    generateSolidityInputs,
};
