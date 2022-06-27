const { expect } = require('chai');

const fs = require('fs');
const path = require('path');

const { contractUtils } = require('../index');

const { pathTestVectors } = require('./helpers/test-utils');

describe('contractUtils', function () {
    this.timeout(10000);
    let testVector;

    const expectedBatchHashData = '0xa4e1166ff3f7ecf8c8ff3049fc2e28b03091d3bf0db4bce702d954840196f79d';
    const expectedSnarkInputHash = '0x12bcbec575263760c8b89071ddb92de1cab523639aad606b2142c052dfcc42cd';
    const expectedStarkHashExecutor = '0x73855bab378977b439591bdee0bbde9c1b1cf3f48e20418da906ab7abfcc42cf';

    before(async () => {
        testVector = JSON.parse(fs.readFileSync(path.join(pathTestVectors, 'inputs-executor/input_0.json')));
    });

    it('calculateBatchHashData', async () => {
        const {
            batchL2Data, globalExitRoot, sequencerAddr,

        } = testVector;
        const computedBatchHashData = await contractUtils.calculateBatchHashData(
            batchL2Data,
            globalExitRoot,
            sequencerAddr,
        );

        expect(computedBatchHashData).to.be.equal(expectedBatchHashData);
    });

    it('calculateSnarkInput', async () => {
        const {
            oldLocalExitRoot,
            newLocalExitRoot,
            oldStateRoot,
            newStateRoot,
            numBatch,
            timestamp,
        } = testVector;

        const computedGlobalHash = await contractUtils.calculateSnarkInput(
            oldStateRoot,
            oldLocalExitRoot,
            newStateRoot,
            newLocalExitRoot,
            expectedBatchHashData,
            numBatch,
            timestamp
        );

        expect(computedGlobalHash).to.be.equal(expectedSnarkInputHash);
    });

    it('calculateStarkInput', async () => {
        const {
            oldLocalExitRoot,
            newLocalExitRoot,
            oldStateRoot,
            newStateRoot,
            numBatch,
            timestamp,
        } = testVector;

        const computedGlobalHash = await contractUtils.calculateStarkInput(
            oldStateRoot,
            oldLocalExitRoot,
            newStateRoot,
            newLocalExitRoot,
            expectedBatchHashData,
            numBatch,
            timestamp,
        );

        expect(computedGlobalHash).to.be.equal(expectedStarkHashExecutor);
    });
});
