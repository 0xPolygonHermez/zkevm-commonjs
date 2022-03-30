const ethers = require('ethers');

const path = require('path');

const MerkleTreeBridge = require('@polygon-hermez/zkevm-commonjs').MTBridge;
const {
    verifyMerkleProof,
    calculateLeafValue,
} = require('@polygon-hermez/zkevm-commonjs').mtBridgeUtils;

function calculateGlobalExitRoot(mainnetExitRoot, rollupExitRoot) {
    return ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [mainnetExitRoot, rollupExitRoot]);
}

const networkIDMainnet = 0;
const networkIDRollup = 1;
const batchNum = 1;

async function main() {
    const claimAddress = "0xc949254d682d8c9ad5682521675b8f43b102aec4";

    // Add a claim leaf to rollup exit tree
    const originalNetwork = networkIDMainnet;
    const tokenAddress = ethers.constants.AddressZero; // ether
    const amount = ethers.utils.parseEther('10');
    const destinationNetwork = networkIDRollup;
    const destinationAddress = claimAddress;

    // pre compute root merkle tree in Js
    const height = 32;
    const merkleTree = new MerkleTreeBridge(height);
    const leafValue = calculateLeafValue(originalNetwork, tokenAddress, amount, destinationNetwork, destinationAddress);
    merkleTree.add(leafValue);

    const rootJSMainnet = merkleTree.getRoot();
    const rollupExitRoot = ethers.constants.HashZero;

    const globalExitRoot = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
    const globalExitRootNum = batchNum;
    const index = 0;
    const proof = merkleTree.getProofTreeByIndex(index);

    const output = {
        claimCallData: {
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            globalExitRootNum,
            rootJSMainnet,
            rollupExitRoot,
        },
        globalExitRoot
    }
    console.log(verifyMerkleProof(leafValue, proof, index, rootJSMainnet));
    console.log(output)
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });