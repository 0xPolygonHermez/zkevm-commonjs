const { expect } = require('chai');
const ethers = require('ethers');
const { MTBridge } = require('../index');
const {
    verifyMerkleProof,
} = require('../index').mtBridgeUtils;

describe('Merkle Bridge', () => {
    it('Check merkle tree', async () => {
        const height = 32;
        const merkleTree = new MTBridge(height);
        const leafValue = ethers.utils.formatBytes32String('1');
        merkleTree.add(leafValue);
        const root = merkleTree.getRoot();

        // check frontier
        const rootFromFrontier = merkleTree.getRootFromFrontier();
        expect(rootFromFrontier).to.be.equal(root);

        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;
        const verification = verifyMerkleProof(leafValue, proof, index, root);
        expect(verification).to.be.equal(true);
    });

    it('Check add 1 leaf to the merkle tree', async () => {
        const height = 32;
        const merkleTree = new MTBridge(height);

        const leafValue = ethers.utils.formatBytes32String('123');
        merkleTree.add(leafValue);

        const root = merkleTree.getRoot();

        // check frontier
        const rootFromFrontier = merkleTree.getRootFromFrontier();
        expect(rootFromFrontier).to.be.equal(root);

        // verify root
        const zerHashesArray = merkleTree.zeroHashes;
        let currentNode = leafValue;
        for (let i = 0; i < height; i++) {
            currentNode = ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [currentNode, zerHashesArray[i]]);
        }
        expect(currentNode).to.be.equal(root);

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;
        const verification = verifyMerkleProof(leafValue, proof, index, root);
        expect(verification).to.be.equal(true);

        // check depositCount
        expect(merkleTree.depositCount).to.be.equal(1);
    });

    it('Check add multipple leafs to the merkle tree', async () => {
        const height = 32;
        const merkleTree = new MTBridge(height);

        const leafValue = ethers.utils.formatBytes32String('123');
        const leafValue2 = ethers.utils.formatBytes32String('456');

        merkleTree.add(leafValue);
        merkleTree.add(leafValue2);

        const root = merkleTree.getRoot();

        // check frontier
        const rootFromFrontier = merkleTree.getRootFromFrontier();
        expect(rootFromFrontier).to.be.equal(root);

        // verify root;
        const zerHashesArray = merkleTree.zeroHashes;
        let currentNode = ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [leafValue, leafValue2]);
        for (let i = 1; i < height; i++) {
            currentNode = ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [currentNode, zerHashesArray[i]]);
        }
        expect(currentNode).to.be.equal(root);

        // check merkle proof
        const index = 0;
        const proof = merkleTree.getProofTreeByIndex(index);
        const verification = verifyMerkleProof(leafValue, proof, index, root);
        expect(verification).to.be.equal(true);

        // check merkle proof
        const index2 = 1;
        const proof2 = merkleTree.getProofTreeByIndex(index2);
        const verification2 = verifyMerkleProof(leafValue2, proof2, index2, root);
        expect(verification2).to.be.equal(true);

        // following merkle proofs are invalid
        expect(verifyMerkleProof(leafValue, proof2, index2, root)).to.be.equal(false);
        expect(verifyMerkleProof(leafValue, proof2, index2, proof)).to.be.equal(false);
        expect(verifyMerkleProof(leafValue, proof2, index2, proof)).to.be.equal(false);
        expect(verifyMerkleProof(leafValue, proof2, index2 + 1, proof)).to.be.equal(false);

        // check depositCount
        expect(merkleTree.depositCount).to.be.equal(2);
    });

    it('Check rollback', async () => {
        const height = 32;
        const merkleTree = new MTBridge(height);

        const leafValue = ethers.utils.formatBytes32String('123');
        const leafValue2 = ethers.utils.formatBytes32String('456');

        merkleTree.add(leafValue); // depositCount = 1
        const firstRoot = merkleTree.getRoot();
        merkleTree.add(leafValue2); // depositCount = 2
        const secondRoot = merkleTree.getRoot();

        // rollback
        merkleTree.rollbackTree(1);
        expect(merkleTree.getRoot()).to.be.equal(firstRoot);
        expect(merkleTree.getRootFromFrontier()).to.be.equal(firstRoot);
        expect(merkleTree.depositCount).to.be.equal(1);

        merkleTree.add(leafValue2);
        expect(merkleTree.getRoot()).to.be.equal(secondRoot);
        expect(merkleTree.getRootFromFrontier()).to.be.equal(secondRoot);
        expect(merkleTree.depositCount).to.be.equal(2);
    });

    it('Check rollback 100 leaves', async () => {
        const height = 32;
        const merkleTree = new MTBridge(height);

        // add leaves (snaphot at middle)
        const numInsertions = 100;
        const snapshot = Math.floor(numInsertions / 2);
        let snapshotRoot;
        let snapshotDepositCount;

        const leaves = [];
        for (let i = 0; i < numInsertions; i++) {
            const leafValue = ethers.utils.formatBytes32String(i.toString());
            leaves.push(leafValue);
            merkleTree.add(leafValue);

            if (i === snapshot) {
                snapshotDepositCount = merkleTree.depositCount;
                snapshotRoot = merkleTree.getRoot();
                const rootFromFrontier = merkleTree.getRootFromFrontier();
                expect(rootFromFrontier).to.be.equal(snapshotRoot);
            }
        }

        // check root
        const root = merkleTree.getRoot();
        const rootFromFrontier = merkleTree.getRootFromFrontier();
        expect(rootFromFrontier).to.be.equal(root);

        // check depositCount
        expect(merkleTree.depositCount).to.be.equal(numInsertions);
        expect(merkleTree.historicFrontiers.length - 1).to.be.equal(numInsertions);

        // rollback to snapshot
        merkleTree.rollbackTree(snapshotDepositCount);

        // check again root
        const rootAfterRollback = merkleTree.getRoot();
        const rootAfterRollbackFromFrontier = merkleTree.getRootFromFrontier();
        expect(rootAfterRollback).to.be.equal(snapshotRoot);
        expect(rootAfterRollbackFromFrontier).to.be.equal(snapshotRoot);
    });
});
