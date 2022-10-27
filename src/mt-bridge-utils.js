const ethers = require('ethers');

/**
 * Calculate an array zero hashes of
 * @param {Number} height - Merkle tree height
 * @returns {Array} - Zero hashes array with length: height - 1
 */
function generateZeroHashes(height) {
    const zeroHashes = [];
    zeroHashes.push(ethers.constants.HashZero);
    for (let i = 1; i < height; i++) {
        zeroHashes.push(ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [zeroHashes[i - 1], zeroHashes[i - 1]]));
    }

    return zeroHashes;
}

/**
 * Verify merkle proof
 * @param {BigNumber} leaf - Leaf value
 * @param {Array} smtProof - Array of sibilings
 * @param {Number} index - Index of the leaf
 * @param {BigNumber} root - Merkle root
 * @returns {Boolean} - Whether the merkle proof is correct or not
 */
function verifyMerkleProof(leaf, smtProof, index, root) {
    let value = leaf;
    for (let i = 0; i < smtProof.length; i++) {
        if (Math.floor(index / 2 ** i) % 2 !== 0) {
            value = ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [smtProof[i], value]);
        } else {
            value = ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [value, smtProof[i]]);
        }
    }

    return value === root;
}

/**
 * Calculate leaf value
 * @param {Number} leafType - Leaf Type
 * @param {Number} originNetwork - Original network
 * @param {String} originAddress - Token address
 * @param {Number} destinationNetwork - Destination network
 * @param {String} destinationAddress - Destination address
 * @param {BigNumber} amount - Amount of tokens
 * @param {BigNumber} metadataHash - Hash of the metadata
 * @returns {Boolean} - Leaf value
 */
function getLeafValue(leafType, originNetwork, originAddress, destinationNetwork, destinationAddress, amount, metadataHash) {
    return ethers.utils.solidityKeccak256(['uint8', 'uint32', 'address', 'uint32', 'address', 'uint256', 'bytes32'], [leafType, originNetwork, originAddress, destinationNetwork, destinationAddress, amount, metadataHash]);
}

module.exports = {
    generateZeroHashes,
    verifyMerkleProof,
    getLeafValue,
};
