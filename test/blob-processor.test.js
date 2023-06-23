/* eslint-disable no-continue */
/* eslint-disable prefer-const */
/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */
/* eslint-disable no-unused-expressions */
/* eslint-disable no-console */
/* eslint-disable multiline-comment-style */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */
/* eslint-disable guard-for-in */

const { Scalar } = require('ffjavascript');
const fs = require('fs');
const { argv } = require('yargs');

const ethers = require('ethers');
const { expect } = require('chai');

const path = require('path');

const {
    MemDB, ZkEVMDB, getPoseidon, smtUtils,
    txUtils, compression,
} = require('../index');

const {
    compressorUtils, compressorConstants,
} = compression;

const { pathTestVectors } = require('./helpers/test-utils');

describe('Processor', async function () {
    this.timeout(100000);

    const pathProcessorTests = path.join(pathTestVectors, 'blob-processor/blob-transition.json');

    let update;
    let poseidon;
    let F;

    let testVectors;

    before(async () => {
        poseidon = await getPoseidon();
        F = poseidon.F;
        testVectors = JSON.parse(fs.readFileSync(pathProcessorTests));

        update = argv.update === true;
    });

    after(async () => {
        if (update) {
            await fs.writeFileSync(pathProcessorTests, JSON.stringify(testVectors, null, 2));
        }
    });

    it('Check test vectors', async () => {
        for (let i = 0; i < testVectors.length; i++) {
            let {
                inputBlob,
                wallets,
                genesisBlob,
                batches,
                expected,
            } = testVectors[i];

            // load wallets
            const keys = {};

            for (let j = 0; j < wallets.length; j++) {
                keys[wallets[j].address] = new ethers.utils.SigningKey(wallets[j].pvtKey);
            }

            // Build new zkEVMDB
            const db = new MemDB(F);
            const zkEVMDB = await ZkEVMDB.newZkEVM(
                db,
                poseidon,
                [F.zero, F.zero, F.zero, F.zero], // state root
                [F.zero, F.zero, F.zero, F.zero], // blob root
                smtUtils.stringToH4(inputBlob.oldAccBlobHash), // oldAccBlobHash
                [], // genesisState
                genesisBlob, // genesisBlob
                null,
                null,
                inputBlob.chainID,
                inputBlob.forkID,
            );

            // check oldBlobRoot
            if (!update) {
                expect(smtUtils.h4toString(zkEVMDB.blobRoot)).to.be.equal(expected.oldBlobRoot);
            } else {
                testVectors[i].expected.oldBlobRoot = smtUtils.h4toString(zkEVMDB.blobRoot);
            }

            const blob = await zkEVMDB.buildBlob(
                {
                    isEIP4844Active: inputBlob.isEIP4844Active,
                    isForced: inputBlob.isForced,
                    addL1BlockHash: inputBlob.addL1BlockHash,
                },
                smtUtils.stringToH4(inputBlob.historicGERRoot),
                Scalar.e(inputBlob.timestampLimit),
                inputBlob.sequencerAddress,
                inputBlob.L1BlockHash,
                Scalar.e(inputBlob.zkGasLimit),
            );

            // initialize compressor
            const iCompressor = new compression.Compressor(db);

            // loop adding batches to blob
            for (let j = 0; j < batches.length; j++) {
                const batchTxs = batches[j];

                await blob.newBatch();

                for (let k = 0; k < batchTxs.length; k++) {
                    const txData = batchTxs[k];
                    const tx = txUtils.parseTx(txData);

                    let blobCustomTx = {};
                    let txCompressed;
                    // check tx type
                    if (tx.type === compressorConstants.ENUM_TX_TYPES.CHANGE_L2_BLOCK) {
                        txCompressed = await iCompressor.compressTxData(tx);
                        blobCustomTx.compressed = txCompressed.compressed;
                    } else {
                        // compress transaction
                        txCompressed = await iCompressor.compressTxData(tx);

                        // sign transaction
                        const signingKey = keys[txData.from];
                        if (typeof signingKey === 'undefined') {
                            throw new Error('Test:BlobProcessor: not found signing key');
                        }

                        const digest = ethers.utils.keccak256(txCompressed.nonCompressed);
                        const signature = signingKey.signDigest(digest);

                        blobCustomTx = {
                            compressed: txCompressed.compressed,
                            r: signature.r,
                            s: signature.s,
                            v: signature.v,
                        };
                    }

                    // check tx data
                    if (!update) {
                        expect(txData.expected.compressed).to.be.equal(txCompressed.compressed);
                        expect(txData.expected.nonCompressed).to.be.equal(txCompressed.nonCompressed);
                    } else {
                        txData.expected.compressed = txCompressed.compressed;
                        txData.expected.nonCompressed = txCompressed.nonCompressed;
                    }

                    // add tx to blob
                    await blob.addTxToBlob(blobCustomTx);
                }
            }

            // execute transactions
            await blob.executeTxs();

            // check tx data
            if (!update) {
                expect(expected.oldBlobRoot).to.be.equal(smtUtils.h4toString(blob.oldBlobRoot));
                expect(expected.hashBlobData).to.be.equal(blob.blobHashData);
                expect(expected.blobData).to.be.equal(blob.blobData);
                expect(expected.newBlobNumber).to.be.equal(blob.newNumBlob);
                expect(expected.finalAccBatchHashData).to.be.equal(blob.finalAccBatchHashData);
                expect(expected.newAddressRoot).to.be.equal(smtUtils.h4toString(blob.newAddressTreeRoot));
                expect(expected.newDataRoot).to.be.equal(smtUtils.h4toString(blob.newDataTreeRoot));
                expect(expected.newBlobRoot).to.be.equal(smtUtils.h4toString(blob.newBlobRoot));
            } else {
                expected.oldBlobRoot = smtUtils.h4toString(blob.oldBlobRoot);
                expected.hashBlobData = blob.blobHashData;
                expected.blobData = blob.blobData;
                expected.newBlobNumber = blob.newNumBlob;
                expected.finalAccBatchHashData = blob.finalAccBatchHashData;
                expected.newAddressRoot = smtUtils.h4toString(blob.newAddressTreeRoot);
                expected.newDataRoot = smtUtils.h4toString(blob.newDataTreeRoot);
                expected.newBlobRoot = smtUtils.h4toString(blob.newBlobRoot);
            }

            // save blob input
            const starkInput = await blob.getStarkInput();
            fs.writeFileSync(path.join(pathTestVectors, 'blob-processor/blob-input.json'), JSON.stringify(starkInput, null, 2));
        }
    });
});
