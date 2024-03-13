const ethers = require('ethers');
const { Scalar } = require('ffjavascript');
const { sha256Snark, padZeros } = require('./utils');

/**
 * Compute input for SNARK circuit: sha256(aggrAddress, oldStateRoot, oldAccInputHash, oldNumBatch, chainID, forkID, newStateRoot, newAccInputHash, newLocalExitRoot, newNumBatch) % FrSNARK
 * @param {String} oldStateRoot - Current state Root
 * @param {String} newStateRoot - New State root once the batch is processed
 * @param {String} oldBatchAccInputHash - initial accumulateInputHash
 * @param {String} newBatchAccInputHash - final accumulateInputHash
 * @param {String} newLocalExitRoot - New local exit root once the all batches is processed
 * @param {Number} oldNumBatch - initial batch number
 * @param {Number} newNumBatch - final batch number
 * @param {Number} chainID - L2 chainID
 * @param {String} aggregatorAddress - Aggregator Ethereum address in hex string
 * @param {Number} forkID - L2 rom fork identifier
 * @returns {String} - input snark in hex encoding
 */
async function calculateSnarkInput(
    oldStateRoot,
    newStateRoot,
    newLocalExitRoot,
    oldBatchAccInputHash,
    newBatchAccInputHash,
    oldNumBatch,
    newNumBatch,
    chainID,
    aggregatorAddress,
    forkID,
) {
    // 20 bytes aggregator address
    const strAggregatorAddress = padZeros((Scalar.fromString(aggregatorAddress, 16)).toString(16), 40);

    // 32 bytes each field element for oldStateRoot
    const strOldStateRoot = padZeros((Scalar.fromString(oldStateRoot, 16)).toString(16), 64);

    // 32 bytes each field element for oldStateRoot
    const strOldBatchAccInputHash = padZeros((Scalar.fromString(oldBatchAccInputHash, 16)).toString(16), 64);

    // 8 bytes for oldNumBatch
    const strOldNumBatch = padZeros(Scalar.e(oldNumBatch).toString(16), 16);

    // 8 bytes for chainID
    const strChainID = padZeros(Scalar.e(chainID).toString(16), 16);

    // 8 bytes for forkID
    const strForkID = padZeros(Scalar.e(forkID).toString(16), 16);

    // 32 bytes each field element for oldStateRoot
    const strNewStateRoot = padZeros((Scalar.fromString(newStateRoot, 16)).toString(16), 64);

    // 32 bytes each field element for oldStateRoot
    const strNewBatchAccInputHash = padZeros((Scalar.fromString(newBatchAccInputHash, 16)).toString(16), 64);

    // 32 bytes each field element for oldStateRoot
    const strNewLocalExitRoot = padZeros((Scalar.fromString(newLocalExitRoot, 16)).toString(16), 64);

    // 8 bytes for newNumBatch
    const strNewNumBatch = padZeros(Scalar.e(newNumBatch).toString(16), 16);

    // build final bytes sha256
    const finalStr = strAggregatorAddress
        .concat(strOldStateRoot)
        .concat(strOldBatchAccInputHash)
        .concat(strOldNumBatch)
        .concat(strChainID)
        .concat(strForkID)
        .concat(strNewStateRoot)
        .concat(strNewBatchAccInputHash)
        .concat(strNewLocalExitRoot)
        .concat(strNewNumBatch);

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
