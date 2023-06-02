/* eslint-disable no-await-in-loop */
/* eslint-disable no-continue */

const ethers = require('ethers');
const { expect } = require('chai');
const { argv } = require('yargs');
const fs = require('fs');
const path = require('path');
const { Scalar } = require('ffjavascript');
const { batchUtils, txUtils } = require('../index');
const { pathTestVectors } = require('./helpers/test-utils');
const { ENUM_TX_TYPES } = require('../index').compression.compressorConstants;

describe('Batch utils', () => {
    const pathBatchUtilsTests = path.join(pathTestVectors, './batch-inputs/serialize.json');
    let update;
    let testVectors;

    before(async () => {
        testVectors = JSON.parse(fs.readFileSync(pathBatchUtilsTests));

        update = argv.update === true;
    });

    after(async () => {
        if (update) {
            await fs.writeFileSync(pathBatchUtilsTests, JSON.stringify(testVectors, null, 2));
        }
    });

    it('Serialize - Deserialize', async () => {
        for (let i = 0; i < testVectors.length; i++) {
            const test = testVectors[i];

            const {
                tx,
                expectedSerialize,
            } = test;

            const computedSerialize = batchUtils.serializeTx(tx);

            // check serialization
            if (update) {
                test.expectedSerialize = `0x${computedSerialize}`;
            } else {
                expect(`0x${computedSerialize}`).to.be.equal(test.expectedSerialize);
            }

            // check deserialization
            const txDeserialized = batchUtils.deserializeTx(expectedSerialize);

            if (txDeserialized.type === ENUM_TX_TYPES.LEGACY) {
                expect(txDeserialized.type).to.be.equal(tx.type);
                expect(txDeserialized.nonce.toString()).to.be.equal(tx.nonce);
                expect(txDeserialized.gasPrice.toString()).to.be.equal(tx.gasPrice);
                expect(txDeserialized.gasLimit.toString()).to.be.equal(tx.gasLimit);
                expect(txDeserialized.to).to.be.equal(tx.to.toLowerCase());
                expect(txDeserialized.value.toString()).to.be.equal(tx.value);
                expect(txDeserialized.effectivePercentage).to.be.equal(tx.effectivePercentage);
                expect(txDeserialized.from).to.be.equal(tx.from.toLowerCase());
            }

            if (txDeserialized.type === ENUM_TX_TYPES.CHANGE_L2_BLOCK) {
                expect(txDeserialized.type).to.be.equal(tx.type);
                expect(txDeserialized.deltaTimestamp.toString()).to.be.equal(tx.deltaTimestamp);
                expect(txDeserialized.newGER.toString()).to.be.equal(tx.newGER);
                expect(txDeserialized.indexHistoricalGERTree).to.be.equal(tx.indexHistoricalGERTree);
            }
        }
    });
});
