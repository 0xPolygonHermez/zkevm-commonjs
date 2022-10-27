/* eslint-disable no-console */

const ethers = require('ethers');

const MerkleTreeBridge = require('../../index').MTBridge;
const {
    verifyMerkleProof,
    getLeafValue,
} = require('../../index').mtBridgeUtils;

const { Constants } = require('../../index');

function calculateGlobalExitRoot(mainnetExitRoot, rollupExitRoot) {
    return ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [mainnetExitRoot, rollupExitRoot]);
}

const networkIDMainnet = 0;
const networkIDRollup = 1;

async function main() {
    const claimAddress = '0xc949254d682d8c9ad5682521675b8f43b102aec4';

    // Add a claim leaf to rollup exit tree
    const originNetwork = networkIDMainnet;
    const tokenAddress = ethers.constants.AddressZero; // ether
    const amount = ethers.utils.parseEther('10');
    const destinationNetwork = networkIDRollup;
    const destinationAddress = claimAddress;

    const metadata = '0x';// since is ether does not have metadata
    const metadataHash = ethers.utils.solidityKeccak256(['bytes'], [metadata]);

    // pre compute root merkle tree in Js
    const height = 32;
    const merkleTree = new MerkleTreeBridge(height);
    const leafValue = getLeafValue(
        Constants.BRIDGE_LEAF_TYPE_ASSET,
        originNetwork,
        tokenAddress,
        destinationNetwork,
        destinationAddress,
        amount,
        metadataHash,
    );
    merkleTree.add(leafValue);

    const rootJSMainnet = merkleTree.getRoot();
    const rollupExitRoot = ethers.constants.HashZero;

    const globalExitRoot = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
    const index = 0;
    const proof = merkleTree.getProofTreeByIndex(index);

    const output = {
        claimCallData: {
            proof,
            index,
            rootJSMainnet,
            rollupExitRoot,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
        },
        globalExitRoot,
    };
    console.log(verifyMerkleProof(leafValue, proof, index, rootJSMainnet));
    console.log(output);
}
/*
 * We recommend this pattern to be able to use async/await everywhere
 * and properly handle errors.
 */
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
