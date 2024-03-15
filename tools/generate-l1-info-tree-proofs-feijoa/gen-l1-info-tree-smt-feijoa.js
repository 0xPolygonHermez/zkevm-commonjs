/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-console */
const { expect } = require('chai');
const fs = require('fs');
const { argv } = require('yargs');
const path = require('path');
const MerkleTreeBridge = require('../../index').MTBridge;
const { verifyMerkleProof } = require('../../index').mtBridgeUtils;
const { getL1InfoTreeValue, getL1InfoTreeRoot } = require('../../index').l1InfoTreeUtils;
const { Constants } = require('../../index');

async function main() {
    // read gen file
    const genFile = JSON.parse(fs.readFileSync(path.join(__dirname, 'generator.json')));

    // Compute leafs value and add it to the tree
    const height = 32;
    const merkleTree = new MerkleTreeBridge(height);
    const leafs = [];
    // Insert first leaf, all zeros (no changes in tree, just to skip leaf with index 0)
    let historicL1InfoRoot = Constants.ZERO_BYTES32;
    leafs.push({ l1DataHash: historicL1InfoRoot, l1InfoTreeRoot: historicL1InfoRoot, historicL1InfoRoot });
    merkleTree.add(historicL1InfoRoot);
    // Get root of empty tree (should be 0x27ae5ba08d7291c96c8cbddcc148bf48a6d68c7974b94356f53754ef6171d757)
    historicL1InfoRoot = merkleTree.getRoot();
    // Create recursive tree for each new l1Data
    for (let i = 1; i < genFile.length; i++) {
        // 1- Get leaf value (l1Data) keccak(globalExitRoot, blockHash, timestamp)
        const leafValue = getL1InfoTreeValue(
            genFile[i].globalExitRoot,
            genFile[i].blockHash,
            genFile[i].timestamp,
        );
        // 2- Get l1InfoTreeRoot keccak(historicL1InfoRoot, l1Data)
        const l1InfoTreeRoot = getL1InfoTreeRoot(historicL1InfoRoot, leafValue);
        // 3- Insert new leaf to tree
        leafs.push({ l1DataHash: leafValue, l1InfoTreeRoot, historicL1InfoRoot });
        merkleTree.add(l1InfoTreeRoot);
        // 4- Update historicL1InfoRoot with new HistoricL1InfoTreeRoot
        historicL1InfoRoot = merkleTree.getRoot();
    }
    // compute root and proofs
    const root = merkleTree.getRoot();

    // generate proofs for all indexes
    const proofs = [];
    for (let i = 0; i < genFile.length; i++) {
        proofs.push(merkleTree.getProofTreeByIndex(i));
    }

    // verify proofs
    for (let i = 0; i < genFile.length; i++) {
        const proof = proofs[i];
        const index = i;
        const valueLeaf = leafs[index].l1InfoTreeRoot;
        expect(verifyMerkleProof(valueLeaf, proof, index, root)).to.be.equal(true);
    }

    // create output json file with gen info plus value leafs and proofs
    const output = [];
    const fullOutput = [];
    for (let i = 1; i < genFile.length; i++) {
        const smtProofPreviousIndex = proofs[i - 1];
        const l1Info = {
            globalExitRoot: genFile[i].globalExitRoot,
            blockHash: genFile[i].blockHash,
            timestamp: genFile[i].timestamp,
            smtProofPreviousIndex,
        };
        output.push(l1Info);
        const fullL1Info = {
            ...l1Info,
            index: i,
            previousIndex: i - 1,
            previousL1InfoTreeRoot: leafs[i - 1].l1InfoTreeRoot,
            ...leafs[i],
        };
        fullOutput.push(fullL1Info);
    }

    // save output file depending on flag by argv --output and the timestamp
    const timestamp = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

    if (argv.output !== undefined) {
        fs.writeFileSync(path.join(__dirname, 'smt-output.json'), JSON.stringify(output, null, 2));
        fs.writeFileSync(path.join(__dirname, 'smt-full-output.json'), JSON.stringify(fullOutput, null, 2));
    }

    // print output in console
    console.log(JSON.stringify(output, null, 2));
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
