const { expect } = require('chai');

const fs = require('fs');
const path = require('path');

const { contractUtils } = require('../index');

const { pathTestVectors } = require('./helpers/test-utils');

describe('contractUtils', function () {
    this.timeout(10000);
    let testVector;

    const expectedBatchHashData = '0x9370689d3c20a5a4739f902a31e2ea20c7d7be121a0fc19468a2e1b5d87f4111';
    // input taken from pil-stark
    const expectedSnarkInputHash = '14918438705377636817563619860509474434188349281706594260803853913155748736842';
    const expectedStarkHashExecutor = '0xd072c5e95f2a1aa8dee6f1e0667f72f9e66ed47f7ff5f5e3ad6f504379c73c26';

    before(async () => {
        testVector = JSON.parse(fs.readFileSync(path.join(pathTestVectors, 'inputs-executor/input_executor.json')));
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
        const aggregatorAddress = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';

        const {
            oldLocalExitRoot,
            newLocalExitRoot,
            oldStateRoot,
            newStateRoot,
            numBatch,
            timestamp,
        } = testVector;

        const computedSnark = await contractUtils.calculateSnarkInput(
            oldStateRoot,
            oldLocalExitRoot,
            newStateRoot,
            newLocalExitRoot,
            expectedBatchHashData,
            numBatch,
            timestamp,
            aggregatorAddress,
        );

        expect(computedSnark.toString()).to.be.equal(expectedSnarkInputHash.toString());
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
