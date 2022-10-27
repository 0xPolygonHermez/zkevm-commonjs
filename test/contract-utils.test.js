const { expect } = require('chai');

const fs = require('fs');
const path = require('path');

const { contractUtils } = require('../index');

const { pathTestVectors } = require('./helpers/test-utils');

describe('contractUtils', function () {
    this.timeout(10000);
    let testVector;

    const expectedBatchHashData = '0x80cc22bc1a205c21f2b8c87e6185e1215fb60e3d83c609fd3bf3cdc586a6244b';
    // TODO: input taken from pil-stark
    const expectedStarkHashExecutor = '0x704d5cfd3e44b82028f7f8cae31168267a7422c5a447b90a65134116da5a8432';
    const expectedSnarkInputHash = '15588448576060468525242870965361192827910782996030023758348255084502752104347';

    before(async () => {
        testVector = JSON.parse(fs.readFileSync(path.join(pathTestVectors, 'inputs-executor/input_executor.json')));
    });

    it('calculateBatchHashData', async () => {
        const {
            batchL2Data,
        } = testVector;
        const computedBatchHashData = await contractUtils.calculateBatchHashData(
            batchL2Data,
        );

        expect(computedBatchHashData).to.be.equal(expectedBatchHashData);
    });

    it('calculateStarkInput', async () => {
        const {
            oldAccInputHash,
            globalExitRoot,
            timestamp,
            sequencerAddr,
        } = testVector;

        const computedGlobalHash = await contractUtils.calculateAccInputHash(
            oldAccInputHash,
            expectedBatchHashData,
            globalExitRoot,
            timestamp,
            sequencerAddr,
        );

        expect(computedGlobalHash).to.be.equal(expectedStarkHashExecutor);
    });

    it('calculateSnarkInput', async () => {
        const aggregatorAddress = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';

        const {
            oldStateRoot,
            newStateRoot,
            newLocalExitRoot,
            oldAccInputHash,
            newAccInputHash,
            oldNumBatch,
            newNumBatch,
            chainID
        } = testVector;

        const computedSnark = await contractUtils.calculateSnarkInput(
            oldStateRoot,
            newStateRoot,
            newLocalExitRoot,
            oldAccInputHash,
            newAccInputHash,
            oldNumBatch,
            newNumBatch,
            chainID,
            aggregatorAddress,
        );

        expect(computedSnark.toString()).to.be.equal(expectedSnarkInputHash.toString());
    });
});
