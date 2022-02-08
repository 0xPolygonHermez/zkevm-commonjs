const ethers = require('ethers');
const { Scalar } = require('ffjavascript');
const { Fr } = require('./constants');

/**
 * Compute globalHash
 * @param {String|Scalar} currentStateRoot - Old state Root
 * @param {String|Scalar} currentLocalExitRoot - Old local exit root
 * @param {String|Scalar} newStateRoot - New State root once the batch is processed
 * @param {String|Scalar} newLocalExitRoot - New local exit root once the batch is processed
 * @param {String} sequencerAddress - Sequencer address in hex encoding
 * @param {String} batchHashData - Batch hash data in hex encoding
 * @param {Number} batchChainID - Batch chain ID
 * @param {Number} numBatch - Batch number
 * @returns {String} - global hash in hex encoding
 */
function calculateCircuitInput(
    currentStateRoot,
    currentLocalExitRoot,
    newStateRoot,
    newLocalExitRoot,
    sequencerAddress,
    batchHashData,
    batchChainID,
    numBatch,
) {
    const currentStateRootHex = `0x${Scalar.e(currentStateRoot).toString(16).padStart(64, '0')}`;
    const currentLocalExitRootHex = `0x${Scalar.e(currentLocalExitRoot).toString(16).padStart(64, '0')}`;
    const newStateRootHex = `0x${Scalar.e(newStateRoot).toString(16).padStart(64, '0')}`;
    const newLocalExitRootHex = `0x${Scalar.e(newLocalExitRoot).toString(16).padStart(64, '0')}`;

    const hashKeccak = ethers.utils.solidityKeccak256(
        ['bytes32', 'bytes32', 'bytes32', 'bytes32', 'address', 'bytes32', 'uint32', 'uint32'],
        [
            currentStateRootHex,
            currentLocalExitRootHex,
            newStateRootHex,
            newLocalExitRootHex,
            sequencerAddress,
            batchHashData,
            batchChainID,
            numBatch,
        ],
    );
    return `0x${Scalar.mod(Scalar.fromString(hashKeccak, 16), Fr).toString(16).padStart(64, '0')}`;
}

/**
 * Batch hash data
 * @param {String} batchL2Data - All raw transaction data concatenated as RLP encoding
 * @param {String|Scalar} globalExitRoot - Global Exit Root
 * @returns {String} - Batch hash data in hex encoding
 */
function calculateBatchHashData(
    batchL2Data,
    globalExitRoot,
) {
    const globalExitRootHex = `0x${Scalar.e(globalExitRoot).toString(16).padStart(64, '0')}`;
    return ethers.utils.solidityKeccak256(['bytes', 'bytes32'], [batchL2Data, globalExitRootHex]);
}

module.exports = {
    calculateCircuitInput,
    calculateBatchHashData,
};
