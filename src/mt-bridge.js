const ethers = require('ethers');
const {
    generateZeroHashes,
} = require('./mt-bridge-utils');

class MTBridge {
    constructor(height) {
        if (height <= 1) {
            throw new Error('MT height is not greater than 1');
        }
        this.height = height;
        this.zeroHashes = generateZeroHashes(height);
        const tree = [];
        for (let i = 0; i <= height; i++) {
            tree.push([]);
        }
        this.tree = tree;
        this.dirty = false;

        // Frontier
        this.frontier = new Array(this.height).fill(ethers.constants.HashZero);
        this.depositCount = 0;

        // Historic frontiers. Index of the array is the depositCount
        this.historicFrontiers = [];
        this.saveFrontier();
    }

    add(leaf) {
        this.dirty = true;
        this.tree[0].push(leaf);
        this.depositCount += 1;
        this.computeFrontier(leaf);
        this.saveFrontier();
    }

    computeFrontier(leaf) {
        let node = leaf;

        for (let i = 0; i < this.height; i++) {
            if (((this.depositCount >> i) & 1) === 1) {
                this.frontier[i] = node;

                return;
            }
            node = ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [this.frontier[i], node]);
        }
    }

    saveFrontier() {
        this.historicFrontiers.push(this.frontier.slice());
    }

    calcBranches() {
        for (let i = 0; i < this.height; i++) {
            const parent = this.tree[i + 1];
            const child = this.tree[i];
            for (let j = 0; j < child.length; j += 2) {
                const leftNode = child[j];
                const rightNode = (j + 1 < child.length) ? child[j + 1] : this.zeroHashes[i];
                parent[j / 2] = ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [leftNode, rightNode]);
            }
        }
        this.dirty = false;
    }

    getProofTreeByIndex(index) {
        if (this.dirty) this.calcBranches();
        const proof = [];
        let currentIndex = index;
        for (let i = 0; i < this.height; i++) {
            currentIndex = currentIndex % 2 === 1 ? currentIndex - 1 : currentIndex + 1;
            if (currentIndex < this.tree[i].length) proof.push(this.tree[i][currentIndex]);
            else proof.push(this.zeroHashes[i]);
            currentIndex = Math.floor(currentIndex / 2);
        }

        return proof;
    }

    getProofTreeByValue(value) {
        const index = this.tree[0].indexOf(value);

        return this.getProofTreeByIndex(index);
    }

    getRoot() {
        if (this.tree[0][0] === undefined) {
            // No leafs in the tree, calculate root with all leafs to 0
            return ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [this.zeroHashes[this.height - 1], this.zeroHashes[this.height - 1]]);
        }
        if (this.dirty) this.calcBranches();

        return this.tree[this.height][0];
    }

    getRootFromFrontier() {
        let node = ethers.constants.HashZero;

        for (let i = 0; i < this.height; i++) {
            if (((this.depositCount >> i) & 1) === 1) {
                node = ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [this.frontier[i], node]);
            } else {
                node = ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [node, this.zeroHashes[i]]);
            }
        }

        return node;
    }

    rollbackTree(depositCount) {
        if (depositCount < 0 || depositCount > this.depositCount) {
            throw new Error('MTBridge::rollbackTree: Invalid deposit count');
        }

        // Reset frontier and deposit count
        this.depositCount = depositCount;
        this.frontier = this.historicFrontiers[depositCount];
        this.historicFrontiers = this.historicFrontiers.slice(0, depositCount);

        // Reset leaves and tree
        this.tree[0] = this.tree[0].slice(0, depositCount);
        for (let i = 1; i <= this.height; i++) {
            this.tree[i] = [];
        }

        // Recompute branches
        this.calcBranches();
    }
}

module.exports = MTBridge;
