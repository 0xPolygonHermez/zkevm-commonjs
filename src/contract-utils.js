const ethers = require('ethers');
const { Scalar } = require('ffjavascript');
const { sha256Snark, padZeros } = require('./utils');
const { string2fea } = require('./smt-utils');
const getPoseidon = require('./poseidon');

/**
 * Compute globalHash for STARK circuit
 * @param {String} currentStateRoot - Current state Root
 * @param {String} currentLocalExitRoot - Current local exit root
 * @param {String} newStateRoot - New State root once the batch is processed
 * @param {String} newLocalExitRoot - New local exit root once the batch is processed
 * @param {String} batchHashData - Batch hash data
 * @param {Number} numBatch - Batch number
 * @param {Number} timestamp - Block timestamp
 * @returns {String} - global hash in hex encoding
 */
function calculateStarkInput(
    currentStateRoot,
    currentLocalExitRoot,
    newStateRoot,
    newLocalExitRoot,
    batchHashData,
    numBatch,
    timestamp,
) {
    const currentStateRootHex = `0x${Scalar.e(currentStateRoot).toString(16).padStart(64, '0')}`;
    const currentLocalExitRootHex = `0x${Scalar.e(currentLocalExitRoot).toString(16).padStart(64, '0')}`;
    const newStateRootHex = `0x${Scalar.e(newStateRoot).toString(16).padStart(64, '0')}`;
    const newLocalExitRootHex = `0x${Scalar.e(newLocalExitRoot).toString(16).padStart(64, '0')}`;

    const hashKeccak = ethers.utils.solidityKeccak256(
        ['bytes32', 'bytes32', 'bytes32', 'bytes32', 'bytes32', 'uint64', 'uint64'],
        [
            currentStateRootHex,
            currentLocalExitRootHex,
            newStateRootHex,
            newLocalExitRootHex,
            batchHashData,
            numBatch,
            timestamp,
        ],
    );

    return hashKeccak;
}

/**
 * Compute input for SNARK circuit
 * @param {String} currentStateRoot - Current state Root
 * @param {String} currentLocalExitRoot - Current local exit root
 * @param {String} newStateRoot - New State root once the batch is processed
 * @param {String} newLocalExitRoot - New local exit root once the batch is processed
 * @param {String} batchHashData - Batch hash data
 * @param {Number} numBatch - Batch number
 * @param {Number} timestamp - Block timestamp
 * @param {String} aggregatorAddress - Aggregator Ethereum address in hex string
 * @returns {String} - sha256(globalHash, aggregatorAddress) % FrSNARK in hex encoding
 */
async function calculateSnarkInput(
    currentStateRoot,
    currentLocalExitRoot,
    newStateRoot,
    newLocalExitRoot,
    batchHashData,
    numBatch,
    timestamp,
    aggregatorAddress,
) {
    const poseidon = await getPoseidon();
    const { F } = poseidon;

    const hashKeccak = calculateStarkInput(
        currentStateRoot,
        currentLocalExitRoot,
        newStateRoot,
        newLocalExitRoot,
        batchHashData,
        numBatch,
        timestamp,
    );

    // 20 bytes agggregator adsress
    const strAggregatorAddress = padZeros((Scalar.fromString(aggregatorAddress, 16)).toString(16), 40);

    // 8 bytes each field element
    const feaHashKeccak = string2fea(F, hashKeccak);
    const strFea = feaHashKeccak.reduce(
        (previousValue, currentValue) => previousValue + padZeros(currentValue.toString(16), 16),
        '',
    );

    // build final bytes sha256
    const finalStr = strAggregatorAddress.concat(strFea);

    return sha256Snark(finalStr);
}

/**
 * Batch hash data
 * @param {String} transactions - All raw transaction data concatenated
 * @param {String} globalExitRoot - Global Exit Root
 * @param {String} sequencerAddress - Sequencer address
 * @returns {String} - Batch hash data
 */
function calculateBatchHashData(
    transactions,
    globalExitRoot,
    sequencerAddress,
) {
    const globalExitRootHex = `0x${Scalar.e(globalExitRoot).toString(16).padStart(64, '0')}`;

    return ethers.utils.solidityKeccak256(
        ['bytes', 'bytes32', 'address'],
        [
            transactions,
            globalExitRootHex,
            sequencerAddress,
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
    calculateStarkInput,
    calculateSnarkInput,
    calculateBatchHashData,
    generateSolidityInputs,
};
