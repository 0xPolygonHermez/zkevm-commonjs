const { expect } = require('chai');

const fs = require('fs');
const path = require('path');

const { contractUtils } = require('../index');

const { pathTestVectors } = require('./helpers/test-utils');

describe('contractUtils', function () {
    this.timeout(10000);
    let testVector;

    const expectedBatchHashData = '0x3d53e7e5be04b00f66af647512af6d17e4e767a5e41fa1293010b885c9fe06db';
    const expectedGlobalHash = '0x2a3ae871f2767d7dcc8f076646aaac562f565913f1aaa01835c99da11587432a';

    before(async () => {
        testVector = JSON.parse(fs.readFileSync(path.join(pathTestVectors, 'inputs-executor/inputs/input_0.json')));
    });

    it('calculateBatchHashData', async () => {
        const {
            batchL2Data, globalExitRoot, timestamp, sequencerAddr, chainId, numBatch,

        } = testVector;
        const computedBatchHashData = await contractUtils.calculateBatchHashData(
            batchL2Data,
            globalExitRoot,
            timestamp,
            sequencerAddr,
            chainId,
            numBatch,
        );

        expect(computedBatchHashData).to.be.equal(expectedBatchHashData);
    });

    it('calculateCircuitInput', async () => {
        const {
            oldLocalExitRoot,
            newLocalExitRoot,
            oldStateRoot,
            newStateRoot,
        } = testVector;

        const computedGlobalHash = await contractUtils.calculateCircuitInput(
            oldStateRoot,
            oldLocalExitRoot,
            newStateRoot,
            newLocalExitRoot,
            expectedBatchHashData,
        );

        expect(computedGlobalHash).to.be.equal(expectedGlobalHash);
    });
});
