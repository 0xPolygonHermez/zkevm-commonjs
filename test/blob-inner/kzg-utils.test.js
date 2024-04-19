/* eslint-disable prefer-arrow-callback */
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { argv } = require('yargs');
const { expect } = require('chai');
const { getKzg } = require('../../index').blobInner;
const { pathTestVectors } = require('../helpers/test-utils');

const pathBlobTests = path.join(pathTestVectors, 'kzg/blob-data.json');

describe('kzg', async function () {
    this.timeout(300000000);

    let testVectors;
    let update;

    before(async () => {
        // test has been taken from:
        // https://etherscan.io/blob/0x01938fe13e2b95a45b63e8c1413b067b08fb6487760e4d8b6e3482b3fde294ce?bid=211229
        testVectors = JSON.parse(fs.readFileSync(pathBlobTests));
        update = (argv.update === true);
    });

    it('should get kzg functions', async () => {
        const kzg = await getKzg();
        console.log(kzg);

        for (let i = 0; i < testVectors.length; i++) {
            const {
                blobData,
                pointZ,
                expectedCommitment,
                expectedVersionedHash,
                expectedBlobProof,
                expectedPointZ,
                expectedPointY,
                expectedProof,
            } = testVectors[i];

            // commitment
            const commitment = kzg.blobToKzgCommitment(blobData);

            if (update) {
                testVectors[i].expectedCommitment = commitment;
            } else {
                expect(commitment).to.be.equal(expectedCommitment);
            }

            // versioned hash
            const versionedHash = kzg.computeVersionedHash(commitment);

            if (update) {
                testVectors[i].expectedVersionedHash = versionedHash;
            } else {
                expect(versionedHash).to.be.equal(expectedVersionedHash);
            }

            // compute proof
            const blobProof = kzg.computeBlobKzgProof(blobData, commitment);

            if (update) {
                testVectors[i].expectedBlobProof = blobProof;
            } else {
                expect(blobProof).to.be.equal(expectedBlobProof);
            }

            // verify blob proof
            const verifyBlobProof = kzg.verifyBlobKzgProof(blobData, commitment, blobProof);

            if (!update) {
                expect(verifyBlobProof).to.be.equal(true);
            }

            // compute pointZ if not specified
            let computedPointZ;
            if (typeof pointZ !== 'undefined') {
                computedPointZ = pointZ;
            } else {
                computedPointZ = await kzg.computePointZ(commitment, blobData);
            }

            if (update) {
                testVectors[i].expectedPointZ = computedPointZ;
            } else {
                expect(computedPointZ).to.be.equal(expectedPointZ);
            }

            // compute proof & pointY
            const { proof, pointY } = kzg.computeKzgProof(blobData, computedPointZ);

            if (update) {
                testVectors[i].expectedProof = proof;
                testVectors[i].expectedPointY = pointY;
            } else {
                expect(proof).to.be.equal(expectedProof);
                expect(pointY).to.be.equal(expectedPointY);
            }

            // verify proof
            const verifyProof = kzg.verifyKzgProof(
                commitment,
                computedPointZ,
                pointY,
                proof,
            );

            if (!update) {
                expect(verifyProof).to.be.equal(true);
            }
        }

        if (update) {
            fs.writeFileSync(pathBlobTests, JSON.stringify(testVectors, null, 2));
        }
    });
});
