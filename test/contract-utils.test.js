const { expect } = require('chai');

const fs = require('fs');
const path = require('path');

const { contractUtils } = require('../index');

const { pathTestVectors } = require('./helpers/test-utils');

describe('contractUtils', function () {
    this.timeout(10000);
    let testVector;

    const expectedBatchHashData = '0x767ef4be9367c5f826078e1584bbb93cf0c1a024364a132da284d488d8069950';
    const expectedGlobalHash = '0x060d1716370f95a8a57ec6549eb73d8538201871a5b7c8b46cea5d758ec2022f';

    before(async () => {
        testVector = JSON.parse(fs.readFileSync(path.join(pathTestVectors, 'inputs-executor/inputs/input_0.json')));
    });

    it('calculateBatchHashData', async () => {
        const {
            batchL2Data, globalExitRoot, timestamp, sequencerAddr, chainId,
        } = testVector;
        const computedBatchHashData = await contractUtils.calculateBatchHashData(
            batchL2Data,
            globalExitRoot,
            timestamp,
            sequencerAddr,
            chainId,
        );

        /*
         * const batchHashData = calculateBatchHashData(
         *     this.getBatchL2Data(),
         *     globalExitRoot,
         *     this.timestamp,
         *     this.sequencerAddress,
         *     this.seqChainID,
         * );
         */
        expect(expectedBatchHashData).to.be.equal(computedBatchHashData);
    });

    it('calculateCircuitInput', async () => {
        const {
            numBatch,
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
            numBatch,
        );

        expect(computedGlobalHash).to.be.equal(expectedGlobalHash);
    });
});
