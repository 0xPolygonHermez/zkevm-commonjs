const ethers = require('ethers');

/**
 * Calculate L1InfoTree leaf value
 * @param {String} globalExitRoot - global exit root
 * @param {String} blockHash - block hash
 * @param {BigInt} timestamp - Timestamp
 * @returns {Sting} - Leaf value
 */
function getL1InfoTreeValue(globalExitRoot, blockHash, timestamp) {
    return ethers.utils.solidityKeccak256(
        ['bytes32', 'bytes32', 'uint64'],
        [
            globalExitRoot,
            blockHash,
            timestamp,
        ],
    );
}

module.exports = {
    getL1InfoTreeValue,
};
