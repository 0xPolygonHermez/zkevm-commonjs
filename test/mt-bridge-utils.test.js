const fs = require('fs');
const path = require('path');
const { Scalar } = require('ffjavascript');
const { expect } = require('chai');
const { argv } = require('yargs');
const {
    computeGlobalIndex,
} = require('../index').mtBridgeUtils;
const { pathTestVectors } = require('./helpers/test-utils');

describe('Merkle Bridge Utils', () => {
    const pathTests = path.join(pathTestVectors, 'merkle-tree-bridge/global-index.json');

    let update;
    let testVectors;

    before(async () => {
        testVectors = JSON.parse(fs.readFileSync(pathTests));
        update = argv.update === true;
    });

    it('computeGlobalIndex', async () => {
        for (let i = 0; i < testVectors.length; i++) {
            const {
                indexLocal, indexRollup, isMainnet, expectedGlobalIndex,
            } = testVectors[i];

            const computedGlobalIndex = computeGlobalIndex(
                Scalar.e(indexLocal),
                Scalar.e(indexRollup),
                isMainnet,
            );

            if (update) {
                testVectors[i].expectedGlobalIndex = computedGlobalIndex.toString();
            } else {
                expect(computedGlobalIndex.toString()).to.be.equal(expectedGlobalIndex);
            }
        }

        if (update) {
            fs.writeFileSync(pathTests, JSON.stringify(testVectors, null, 2));
        }
    });
});
