const ethers = require('ethers');
const { Scalar } = require('ffjavascript');
const { sha256Snark, padZeros } = require('./utils');

/**
 * Compute accumulateInputHash = Keccak256(oldAccInputHash, batchHashData, globalExitRoot, timestamp, seqAddress)
 * @param {String} oldAccInputHash - old accumulateInputHash
 * @param {String} batchHashData - Batch hash data
 * @param {String} globalExitRoot - Global Exit Root
 * @param {Number} timestamp - Block timestamp
 * @param {String} sequencerAddress - Sequencer address
 * @returns {String} - accumulateInputHash in hex encoding
 */
function calculateAccInputHash(
    oldAccInputHash,
    batchHashData,
    globalExitRoot,
    timestamp,
    sequencerAddress,
) {
    const oldAccInputHashHex = `0x${Scalar.e(oldAccInputHash).toString(16).padStart(64, '0')}`;

    const hashKeccak = ethers.utils.solidityKeccak256(
        ['bytes32', 'bytes32', 'bytes32', 'uint64', 'address'],
        [
            oldAccInputHashHex,
            batchHashData,
            globalExitRoot,
            timestamp,
            sequencerAddress,
        ],
    );

    return hashKeccak;
}

/**
 * Compute input for SNARK circuit: sha256(aggrAddress, oldStateRoot, oldAccInputHash, oldNumBatch, chainID, newStateRoot, newAccInputHash, newLocalExitRoot, newNumBatch) % FrSNARK
 * @param {String} oldStateRoot - Current state Root
 * @param {String} newStateRoot - New State root once the batch is processed
 * @param {String} oldAccInputHash - initial accumulateInputHash
 * @param {String} newAccInputHash - final accumulateInputHash
 * @param {String} newLocalExitRoot - New local exit root once the all batches is processed
 * @param {Number} oldNumBatch - initial batch number
 * @param {Number} newNumBatch - final batch number
 * @param {Number} chainID - L2 chainID
 * @param {String} aggregatorAddress - Aggregator Ethereum address in hex string
 * @returns {String} - input snark in hex encoding
 */
async function calculateSnarkInput(
    oldStateRoot,
    newStateRoot,
    newLocalExitRoot,
    oldAccInputHash,
    newAccInputHash,
    oldNumBatch,
    newNumBatch,
    chainID,
    aggregatorAddress,
) {
    // 20 bytes agggregator address
    const strAggregatorAddress = padZeros((Scalar.fromString(aggregatorAddress, 16)).toString(16), 40);

    // 32 bytes each field element for oldStateRoot
    const strOldStateRoot = padZeros((Scalar.fromString(oldStateRoot, 16)).toString(16), 64);

    // 32 bytes each field element for oldStateRoot
    const strOldAccInputHash = padZeros((Scalar.fromString(oldAccInputHash, 16)).toString(16), 64);

    // 8 bytes for oldNumBatch
    const strOldNumBatch = padZeros(Scalar.e(oldNumBatch).toString(16), 16);

    // 8 bytes for chainID
    const strChainID = padZeros(Scalar.e(chainID).toString(16), 16);

    // 32 bytes each field element for oldStateRoot
    const strNewStateRoot = padZeros((Scalar.fromString(newStateRoot, 16)).toString(16), 64);

    // 32 bytes each field element for oldStateRoot
    const strNewAccInputHash = padZeros((Scalar.fromString(newAccInputHash, 16)).toString(16), 64);

    // 32 bytes each field element for oldStateRoot
    const strNewLocalExitRoot = padZeros((Scalar.fromString(newLocalExitRoot, 16)).toString(16), 64);

    // 8 bytes for newNumBatch
    const strNewNumBatch = padZeros(Scalar.e(newNumBatch).toString(16), 16);

    // build final bytes sha256
    const finalStr = strAggregatorAddress
        .concat(strOldStateRoot)
        .concat(strOldAccInputHash)
        .concat(strOldNumBatch)
        .concat(strChainID)
        .concat(strNewStateRoot)
        .concat(strNewAccInputHash)
        .concat(strNewLocalExitRoot)
        .concat(strNewNumBatch);

    return sha256Snark(finalStr);
}

/**
 * Batch hash data
 * @param {String} transactions - All raw transaction data concatenated
 * @returns {String} - Batch hash data
 */
function calculateBatchHashData(
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
 * @param {Object} proof - Contain the proof data related from snarkJs
 * @param {Array} publicSignals - Contain the public input array from snarkJs
 * @returns {Object} - Proof structure ready to be sent to smart contract
 */
function generateSolidityInputs(
    proof,
    publicSignals,
) {
    const proofA = [proof.pi_a[0],
        proof.pi_a[1],
    ];
    const proofB = [
        [
            proof.pi_b[0][1],
            proof.pi_b[0][0],
        ],
        [
            proof.pi_b[1][1],
            proof.pi_b[1][0],
        ],
    ];
    const proofC = [proof.pi_c[0],
        proof.pi_c[1],
    ];
    const input = publicSignals;

    return {
        proofA, proofB, proofC, input,
    };
}

module.exports = {
    calculateAccInputHash,
    calculateSnarkInput,
    calculateBatchHashData,
    generateSolidityInputs,
};
