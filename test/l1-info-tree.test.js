const fs = require('fs');
const path = require('path');
const { expect } = require('chai');
const { argv } = require('yargs');

const { pathTestVectors } = require('./helpers/test-utils');
const { MTBridge, l1InfoTreeUtils } = require('../index');

describe('l1 Info Tree', async function () {
    this.timeout(50000);

    const pathFullL1InfoTree = path.join(pathTestVectors, 'l1-info-tree/l1-info-tree.json');

    let update;
    let testVectors;

    before(async () => {
        testVectors = JSON.parse(fs.readFileSync(pathFullL1InfoTree));

        update = argv.update === true;
    });

    it('Should check test vectors', async () => {
        const height = 32;

        // build tree and check root
        for (let i = 0; i < testVectors.length; i++) {
            const { leafs, expectedRoot } = testVectors[i];

            const l1InfoTree = new MTBridge(height);

            for (let j = 0; j < leafs.length; j++) {
                const { leafData, expectedLeafValue } = leafs[j];

                const valueLeaf = l1InfoTreeUtils.getL1InfoTreeValue(
                    leafData.ger,
                    leafData.blockHash,
                    leafData.timestamp,
                );

                l1InfoTree.add(valueLeaf);

                if (update) {
                    testVectors[i].leafs[j].expectedLeafValue = valueLeaf;
                } else {
                    expect(valueLeaf).to.be.equal(expectedLeafValue);
                }
            }

            const root = l1InfoTree.getRoot();

            if (update) {
                testVectors[i].expectedRoot = root;
            } else {
                expect(root).to.be.equal(expectedRoot);
            }
        }

        if (update) {
            fs.writeFileSync(pathFullL1InfoTree, JSON.stringify(testVectors, null, 2));
        }
    });
});
