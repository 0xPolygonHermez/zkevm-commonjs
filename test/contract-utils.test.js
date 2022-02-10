const { expect } = require('chai');

const fs = require('fs');
const path = require('path');

const { contractUtils } = require('../index');

const { pathTestVectors } = require('./helpers/test-utils');

describe('contractUtils', function () {
    this.timeout(10000);
    let testVector;

    const expectedBatchHashData = '0x3567576c83ca658d335055b092195e2fc9d15bf20495a04f879944c160844e28';
    const expectedGlobalHash = '0x1c0620e20e2670641adcd92a20ac534e4294638370af24f54fbd7abc2ff18c6e';

    before(async () => {
        testVector = JSON.parse(fs.readFileSync(path.join(pathTestVectors, 'inputs-executor/input_0.json')));
    });

    it('calculateBatchHashData', async () => {
        const { batchL2Data, globalExitRoot } = testVector;
        const computedBatchHashData = await contractUtils.calculateBatchHashData(batchL2Data, globalExitRoot);

        expect(expectedBatchHashData).to.be.equal(computedBatchHashData);
    });

    it('calculateCircuitInput', async () => {
        const {
            numBatch,
            sequencerAddr,
            chainId,
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
            sequencerAddr,
            expectedBatchHashData,
            chainId,
            numBatch,
        );

        expect(computedGlobalHash).to.be.equal(expectedGlobalHash);
    });
});
