/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-console */
const { expect } = require('chai');
const fs = require('fs');
const { argv } = require('yargs');
const { Constants } = require('../../index');

const MerkleTreeBridge = require('../../index').MTBridge;
const { verifyMerkleProof } = require('../../index').mtBridgeUtils;
const { getL1InfoTreeValue } = require('../../index').l1InfoTreeUtils;

async function main() {
    // read gen file
    const genFile = JSON.parse(fs.readFileSync('generator.json'));

    // Compute leafs value and add it to the tree
    const height = 32;
    const merkleTree = new MerkleTreeBridge(height);
    const leafs = [];

    for (let i = 0; i < genFile.leafs.length; i++) {
        const leafValue = getL1InfoTreeValue(
            genFile.leafs[i].globalExitRoot,
            genFile.leafs[i].blockHash,
            genFile.leafs[i].timestamp,
        );
        leafs.push(leafValue);
        merkleTree.add(leafValue);
    }

    // compute root and proofs
    const root = merkleTree.getRoot();

    // generate proofs for all indexes
    const proofs = [];
    for (let i = 0; i < genFile.leafs.length; i++) {
        proofs.push(merkleTree.getProofTreeByIndex(i));
    }

    // verify proofs
    for (let i = 0; i < genFile.length; i++) {
        const proof = proofs[i];
        const index = i;
        const valueLeaf = leafs[index];
        expect(verifyMerkleProof(valueLeaf, proof, index, root)).to.be.equal(true);
    }

    // create output json file with gen info plus value leafs and proofs
    const output = [];
    for (let i = 0; i < genFile.leafs.length; i++) {
        const smtProof = proofs[i];
        const index = i;
        const valueLeaf = leafs[index];
        output.push({
            ...genFile.leafs[i],
            l1InfoRoot: root,
            valueLeaf,
            index,
            smtProof,
        });
    }

    // generate proofs for extra indexes
    for (let i = 0; i < genFile.extraMTProofs.length; i++) {
        const indexToGetProof = genFile.extraMTProofs[i];
        const proof = merkleTree.getProofTreeByIndex(indexToGetProof);

        if (indexToGetProof > genFile.leafs.length - 1) {
            output.push({
                globalExitRoot: Constants.ZERO_BYTES32,
                blockHash: Constants.ZERO_BYTES32,
                timestamp: 0,
                l1InfoRoot: root,
                valueLeaf: Constants.ZERO_BYTES32,
                index: indexToGetProof,
                smtProof: proof,
            });

            expect(verifyMerkleProof(Constants.ZERO_BYTES32, proof, indexToGetProof, root)).to.be.equal(true);
        }
    }

    // save outout file depending on flag by argv --output and the timestamp
    const timestamp = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

    if (argv.output !== undefined) {
        fs.writeFileSync(`smt-output-${timestamp}.json`, JSON.stringify(output, null, 2));
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
