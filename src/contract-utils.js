const ethers = require('ethers');
const { Scalar } = require('ffjavascript');

/**
 * Compute globalHash
 * @param {String|Scalar} oldStateRoot - Old state Root
 * @param {String|Scalar} oldLocalExitRoot - Old local exit root
 * @param {String|Scalar} newStateRoot - New State root once the batch is processed
 * @param {String|Scalar} newLocalExitRoot - New local exit root once the batch is processed
 * @param {String} sequencerAddress - Sequencer address in hex encoding
 * @param {String} batchHashData - Batch hash data in hex encoding
 * @param {Number} batchChainID - Batch chain ID
 * @param {Number} batchNum - Batch number
 * @returns {String} - global hash in hex encoding
 */
function calculateCircuitInput(
    oldStateRoot,
    oldLocalExitRoot,
    newStateRoot,
    newLocalExitRoot,
    sequencerAddress,
    batchHashData,
    batchChainID,
    batchNum,
) {
    const oldStateRootHex = `0x${Scalar.e(oldStateRoot).toString(16).padStart(64, '0')}`;
    const oldLocalExitRootHex = `0x${Scalar.e(oldLocalExitRoot).toString(16).padStart(64, '0')}`;
    const newStateRootHex = `0x${Scalar.e(newStateRoot).toString(16).padStart(64, '0')}`;
    const newLocalExitRootHex = `0x${Scalar.e(newLocalExitRoot).toString(16).padStart(64, '0')}`;

    return ethers.utils.solidityKeccak256(
        ['bytes32', 'bytes32', 'bytes32', 'bytes32', 'address', 'bytes32', 'uint32', 'uint32'],
        [
            oldStateRootHex,
            oldLocalExitRootHex,
            newStateRootHex,
            newLocalExitRootHex,
            sequencerAddress,
            batchHashData,
            batchChainID,
            batchNum,
        ],
    );
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
