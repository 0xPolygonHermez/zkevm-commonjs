const fs = require('fs');
const path = require('path');
const { argv } = require('yargs');
const { expect } = require('chai');

const {
    utils,
} = require('../../index').blobInner;
const { pathTestVectors } = require('../helpers/test-utils');

// eslint-disable-next-line prefer-arrow-callback
describe('blob utils', async function () {
    let testVectors;
    let update;

    const pathReduceBlobTests = path.join(pathTestVectors, 'blob-inner/blob-reduce-data.json');

    before(async () => {
        testVectors = JSON.parse(fs.readFileSync(pathReduceBlobTests));

        update = (argv.update === true);
    });

    it('computeVersionedHash', async () => {
        const expectedValue = '0x017c04f3aff3266e4df00b2643a329439ee56323ba9fbe1aedac75b5b0bc759d';

        const kzgCommitment = '0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d493471dcc4de8dec75d7aab85b567b6ccd41a';
        const versionedHash = utils.computeVersionedHash(kzgCommitment);

        expect(versionedHash).to.be.equal(expectedValue);
    });

    it('reduce blob', async () => {
        for (let i = 0; i < testVectors.length; i++) {
            const {
                blobData,
                expectedBlobDataReduced,
            } = testVectors[i];

            const reducedBlob = utils.reduceBlobData(blobData);

            if (!update) {
                expect(reducedBlob).to.be.equal(expectedBlobDataReduced);
            } else {
                testVectors[i].expectedBlobDataReduced = reducedBlob;

                fs.writeFileSync(pathReduceBlobTests, JSON.stringify(testVectors, null, 2));
            }
        }
    });
});
