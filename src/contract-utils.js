const ethers = require('ethers');
const { Scalar } = require('ffjavascript');
const { sha256Snark, padZeros } = require('./utils');
const { string2fea } = require('./smt-utils');
const getPoseidon = require('./poseidon');

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
 * Compute input for SNARK circuit: sha256(oldStateRoot, newStateRoot, oldAccInputHash, newAccInputHash, newLocalExitRoot, oldNumBatch, newNumBatch, chainID, aggrAddress) % FrSNARK
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
    const poseidon = await getPoseidon();
    const { F } = poseidon;

    // 8 bytes each field element for oldStateRoot
    const feaOldStateRoot = string2fea(F, oldStateRoot);
    const strFeaOldStateRoot = feaOldStateRoot.reduce(
        (previousValue, currentValue) => previousValue + padZeros(currentValue.toString(16), 16),
        '',
    );

    // 8 bytes each field element for newStateRoot
    const feaNewStateRoot = string2fea(F, newStateRoot);
    const strFeaNewStateRoot = feaNewStateRoot.reduce(
        (previousValue, currentValue) => previousValue + padZeros(currentValue.toString(16), 16),
        '',
    );

    // 8 bytes each field element for oldAccInputHash
    const feaOldAccInputHash = string2fea(F, oldAccInputHash);
    const strFeaOldAccInputHash = feaOldAccInputHash.reduce(
        (previousValue, currentValue) => previousValue + padZeros(currentValue.toString(16), 16),
        '',
    );

    // 8 bytes each field element for newAccInputHash
    const feaNewAccInputHash = string2fea(F, newAccInputHash);
    const strFeaNewAccInputHash = feaNewAccInputHash.reduce(
        (previousValue, currentValue) => previousValue + padZeros(currentValue.toString(16), 16),
        '',
    );

    // 8 bytes each field element for newLocalExitRoot
    const feaNewLocalExitRoot = string2fea(F, newLocalExitRoot);
    const strFeaNewLocalExitRoot = feaNewLocalExitRoot.reduce(
        (previousValue, currentValue) => previousValue + padZeros(currentValue.toString(16), 16),
        '',
    );

    // 8 bytes for oldNumBatch
    const strOldNumBatch = padZeros(Scalar.e(oldNumBatch).toString(16), 16);

    // 8 bytes for oldNumBatch
    const strNewNumBatch = padZeros(Scalar.e(newNumBatch).toString(16), 16);

    // 8 bytes for oldNumBatch
    const strChainID = padZeros(Scalar.e(chainID).toString(16), 16);

    // 20 bytes agggregator adsress
    const strAggregatorAddress = padZeros((Scalar.fromString(aggregatorAddress, 16)).toString(16), 40);

    // build final bytes sha256
    const finalStr = strFeaOldStateRoot
        .concat(strFeaNewStateRoot)
        .concat(strFeaOldAccInputHash)
        .concat(strFeaNewAccInputHash)
        .concat(strFeaNewLocalExitRoot)
        .concat(strOldNumBatch)
        .concat(strNewNumBatch)
        .concat(strChainID)
        .concat(strAggregatorAddress);

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
