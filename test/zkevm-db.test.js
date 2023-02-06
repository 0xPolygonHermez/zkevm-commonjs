/* eslint-disable no-await-in-loop */
const { Scalar } = require('ffjavascript');

const ethers = require('ethers');
const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const { argv } = require('yargs');

const {
    MemDB, SMT, stateUtils, Constants, ZkEVMDB, getPoseidon, processorUtils,
    smtUtils,
} = require('../index');
const { pathTestVectors } = require('./helpers/test-utils');

describe('ZkEVMDB', function () {
    this.timeout(5000);
    const pathZkevmDbTest = path.join(pathTestVectors, 'zkevm-db/state-transition.json');
    const pathZkevmDbTestRecursive = path.join(pathTestVectors, 'zkevm-db/recursive.json');

    let update;
    let poseidon;
    let F;

    let testVectors;
    let testVectorsRecursive;

    before(async () => {
        poseidon = await getPoseidon();
        F = poseidon.F;
        testVectors = JSON.parse(fs.readFileSync(pathZkevmDbTest));
        testVectorsRecursive = JSON.parse(fs.readFileSync(pathZkevmDbTestRecursive));

        update = argv.update === true;
    });

    it('Check zkEVMDB basic functions', async () => {
        const sequencerAddress = '0x0000000000000000000000000000000000000000';
        const genesisRoot = [F.zero, F.zero, F.zero, F.zero];
        const accHashInput = [F.zero, F.zero, F.zero, F.zero];
        const globalExitRoot = [F.zero, F.zero, F.zero, F.zero];
        const timestamp = 1;
        const genesis = [];
        const db = new MemDB(F);
        const chainID = 1000;
        const forkID = 1;

        // create a zkEVMDB and build a batch
        const zkEVMDB = await ZkEVMDB.newZkEVM(
            db,
            poseidon,
            genesisRoot,
            accHashInput,
            genesis,
            null,
            null,
            chainID,
            forkID,
        );

        // build an empty batch
        const batch = await zkEVMDB.buildBatch(timestamp, sequencerAddress, globalExitRoot);
        await batch.executeTxs();

        // checks DB state previous consolidate zkEVMDB
        const lastBatch = await db.getValue(Constants.DB_LAST_BATCH);
        expect(lastBatch).to.be.equal(null);

        const numBatch = 0;
        expect(zkEVMDB.getCurrentNumBatch()).to.be.equal(numBatch);

        // consoldate state
        await zkEVMDB.consolidate(batch);

        // checks after consolidate zkEVMDB
        expect(zkEVMDB.getCurrentNumBatch()).to.be.equal(Number(Scalar.add(numBatch, 1)));

        // check against DB
        const lastBatchDB = await db.getValue(Constants.DB_LAST_BATCH, db, F);
        const stateRootDB = await db.getValue(Scalar.add(Constants.DB_STATE_ROOT, lastBatchDB));

        expect(lastBatchDB).to.be.equal(Scalar.toNumber(Scalar.add(numBatch, 1)));
        expect(smtUtils.stringToH4(stateRootDB)).to.be.deep.equal(zkEVMDB.getCurrentStateRoot());

        // Try to import the DB
        const zkEVMDBImported = await ZkEVMDB.newZkEVM(
            db,
            poseidon,
            null,
            null,
            null,
            null,
            null,
            chainID,
            forkID,
        );

        expect(zkEVMDB.getCurrentNumBatch()).to.be.equal(zkEVMDBImported.getCurrentNumBatch());
        expect(zkEVMDB.getCurrentStateRoot()).to.be.deep.equal(zkEVMDBImported.stateRoot);
        expect(zkEVMDB.chainID).to.be.equal(zkEVMDBImported.chainID);
    });

    it('Check zkEVMDB when consolidate a batch', async () => {
        const {
            genesis,
            expectedOldRoot,
            txs,
            expectedNewRoot,
            sequencerAddress,
            globalExitRoot,
            timestamp,
            newLocalExitRoot,
            oldAccInputHash,
            expectedNewAccInputHash,
            chainID,
            forkID,
        } = testVectors[0];

        const db = new MemDB(F);
        const smt = new SMT(db, poseidon, poseidon.F);

        const walletMap = {};
        const addressArray = [];
        const amountArray = [];
        const nonceArray = [];

        // create genesis block
        for (let j = 0; j < genesis.length; j++) {
            const {
                address, pvtKey, balance, nonce,
            } = genesis[j];

            const newWallet = new ethers.Wallet(pvtKey);
            expect(address).to.be.equal(newWallet.address);

            walletMap[address] = newWallet;
            addressArray.push(address);
            amountArray.push(Scalar.e(balance));
            nonceArray.push(Scalar.e(nonce));
        }

        // set genesis block
        const genesisRoot = await stateUtils.setGenesisBlock(addressArray, amountArray, nonceArray, smt);
        for (let j = 0; j < addressArray.length; j++) {
            const currentState = await stateUtils.getState(addressArray[j], smt, genesisRoot);

            expect(currentState.balance).to.be.equal(amountArray[j]);
            expect(currentState.nonce).to.be.equal(nonceArray[j]);
        }

        if (update) {
            testVectors[0].expectedOldRoot = smtUtils.h4toString(genesisRoot);
        } else {
            expect(smtUtils.h4toString(genesisRoot)).to.be.equal(expectedOldRoot);
        }

        /*
         * build, sign transaction and generate rawTxs
         * rawTxs would be the calldata inserted in the contract
         */
        const txProcessed = [];
        const rawTxs = [];
        for (let j = 0; j < txs.length; j++) {
            const txData = txs[j];
            const tx = {
                to: txData.to,
                nonce: txData.nonce,
                value: ethers.utils.parseUnits(txData.value, 'wei'),
                gasLimit: txData.gasLimit,
                gasPrice: ethers.utils.parseUnits(txData.gasPrice, 'wei'),
                chainId: txData.chainId,
                data: txData.data || '0x',
            };
            if (!ethers.utils.isAddress(tx.to) || !ethers.utils.isAddress(txData.from)) {
                expect(txData.customRawTx).to.equal(undefined);
                // eslint-disable-next-line no-continue
                continue;
            }

            try {
                let customRawTx;

                if (tx.chainId === 0) {
                    const signData = ethers.utils.RLP.encode([
                        processorUtils.toHexStringRlp(Scalar.e(tx.nonce)),
                        processorUtils.toHexStringRlp(tx.gasPrice),
                        processorUtils.toHexStringRlp(tx.gasLimit),
                        processorUtils.addressToHexStringRlp(tx.to),
                        processorUtils.toHexStringRlp(tx.value),
                        processorUtils.toHexStringRlp(tx.data),
                        processorUtils.toHexStringRlp(tx.chainId),
                        '0x',
                        '0x',
                    ]);
                    const digest = ethers.utils.keccak256(signData);
                    const signingKey = new ethers.utils.SigningKey(walletMap[txData.from].privateKey);
                    const signature = signingKey.signDigest(digest);
                    const r = signature.r.slice(2).padStart(64, '0'); // 32 bytes
                    const s = signature.s.slice(2).padStart(64, '0'); // 32 bytes
                    const v = (signature.v).toString(16).padStart(2, '0'); // 1 bytes
                    customRawTx = signData.concat(r).concat(s).concat(v);
                } else {
                    const rawTxEthers = await walletMap[txData.from].signTransaction(tx);
                    customRawTx = processorUtils.rawTxToCustomRawTx(rawTxEthers);
                }
                expect(customRawTx).to.equal(txData.customRawTx);

                if (txData.encodeInvalidData) {
                    customRawTx = customRawTx.slice(0, -6);
                }
                rawTxs.push(customRawTx);
                txProcessed.push(txData);
            } catch (error) {
                expect(txData.customRawTx).to.equal(undefined);
            }
        }

        // create a zkEVMDB and build a batch
        const zkEVMDB = await ZkEVMDB.newZkEVM(
            db,
            poseidon,
            genesisRoot,
            smtUtils.stringToH4(oldAccInputHash),
            genesis,
            null,
            null,
            chainID,
            forkID,
        );

        const batch = await zkEVMDB.buildBatch(timestamp, sequencerAddress, smtUtils.stringToH4(globalExitRoot));
        for (let j = 0; j < rawTxs.length; j++) {
            batch.addRawTx(rawTxs[j]);
        }

        // execute the transactions added to the batch
        await batch.executeTxs();

        const newRoot = batch.currentStateRoot;
        const { newAccInputHash } = batch;

        if (update) {
            testVectors[0].expectedNewRoot = smtUtils.h4toString(newRoot);
            testVectors[0].expectedNewAccInputHash = smtUtils.h4toString(newAccInputHash);
        } else {
            expect(smtUtils.h4toString(newRoot)).to.be.equal(expectedNewRoot);
            expect(smtUtils.h4toString(newAccInputHash)).to.be.equal(expectedNewAccInputHash);
        }

        // checks previous consolidate zkEVMDB
        const lastBatch = await db.getValue(Constants.DB_LAST_BATCH);
        expect(lastBatch).to.be.equal(null);

        const numBatch = 0;
        expect(zkEVMDB.getCurrentNumBatch()).to.be.equal(numBatch);

        if (!update) {
            expect(smtUtils.h4toString(zkEVMDB.getCurrentStateRoot())).to.be.equal(expectedOldRoot);
        }

        // consoldate state
        await zkEVMDB.consolidate(batch);

        // checks after consolidate zkEVMDB
        expect(zkEVMDB.getCurrentNumBatch()).to.be.equal(numBatch + 1);
        if (!update) {
            expect(smtUtils.h4toString(zkEVMDB.getCurrentStateRoot())).to.be.equal(expectedNewRoot);
            expect(smtUtils.h4toString(zkEVMDB.getCurrentLocalExitRoot())).to.be.equal(newLocalExitRoot);
            expect(smtUtils.h4toString(zkEVMDB.getCurrentAccInpuHash())).to.be.equal(expectedNewAccInputHash);
        }

        const lastBatchDB = await db.getValue(Constants.DB_LAST_BATCH);
        expect(lastBatchDB).to.be.equal(numBatch + 1);

        const stateRootDB = await db.getValue(Scalar.add(Constants.DB_STATE_ROOT, lastBatchDB));
        expect(stateRootDB).to.be.deep.equal(smtUtils.h4toString(zkEVMDB.getCurrentStateRoot()));

        const localExitRootDB = await db.getValue(Scalar.add(Constants.DB_LOCAL_EXIT_ROOT, lastBatchDB));
        expect(localExitRootDB).to.be.deep.equal(smtUtils.h4toString(zkEVMDB.getCurrentLocalExitRoot()));

        const accHashInputDB = await db.getValue(Scalar.add(Constants.DB_ACC_INPUT_HASH, lastBatchDB));
        expect(accHashInputDB).to.be.deep.equal(smtUtils.h4toString(zkEVMDB.getCurrentAccInpuHash()));

        if (update) {
            await fs.writeFileSync(pathZkevmDbTest, JSON.stringify(testVectors, null, 2));
        }
    });

    it('Check zkEVMDB recursive functions', async () => {
        const {
            genesis,
            expectedOldRoot,
            batches,
            sequencerAddress,
            globalExitRoot,
            timestamp,
            oldAccInputHash,
            chainID,
            forkID,
            finalStateRoot,
            finalLocalExitRoot,
            finalAccInputHash,
            finalNumBatch,
            aggregatorAddress,
            inputSnark,
        } = testVectorsRecursive[0];

        const db = new MemDB(F);
        const smt = new SMT(db, poseidon, poseidon.F);

        const walletMap = {};
        const addressArray = [];
        const amountArray = [];
        const nonceArray = [];

        // create genesis block
        for (let j = 0; j < genesis.length; j++) {
            const {
                address, pvtKey, balance, nonce,
            } = genesis[j];

            const newWallet = new ethers.Wallet(pvtKey);
            expect(address).to.be.equal(newWallet.address);

            walletMap[address] = newWallet;
            addressArray.push(address);
            amountArray.push(Scalar.e(balance));
            nonceArray.push(Scalar.e(nonce));
        }

        // set genesis block
        const genesisRoot = await stateUtils.setGenesisBlock(addressArray, amountArray, nonceArray, smt);
        for (let j = 0; j < addressArray.length; j++) {
            const currentState = await stateUtils.getState(addressArray[j], smt, genesisRoot);

            expect(currentState.balance).to.be.equal(amountArray[j]);
            expect(currentState.nonce).to.be.equal(nonceArray[j]);
        }

        if (update) {
            testVectorsRecursive[0].expectedOldRoot = smtUtils.h4toString(genesisRoot);
        } else {
            expect(smtUtils.h4toString(genesisRoot)).to.be.equal(expectedOldRoot);
        }

        /*
         * build, sign transaction and generate rawTxs
         * rawTxs would be the calldata inserted in the contract
         */
        const rawBatches = [];

        for (let m = 0; m < batches.length; m++) {
            const { txs } = batches[m];
            const rawTxs = [];

            for (let j = 0; j < txs.length; j++) {
                const txData = txs[j];

                const tx = {
                    to: txData.to,
                    nonce: txData.nonce,
                    value: ethers.utils.parseUnits(txData.value, 'wei'),
                    gasLimit: txData.gasLimit,
                    gasPrice: ethers.utils.parseUnits(txData.gasPrice, 'wei'),
                    chainId: txData.chainId,
                    data: txData.data || '0x',
                };
                if (!ethers.utils.isAddress(tx.to) || !ethers.utils.isAddress(txData.from)) {
                    expect(txData.customRawTx).to.equal(undefined);
                    // eslint-disable-next-line no-continue
                    continue;
                }

                try {
                    let customRawTx;

                    if (tx.chainId === 0) {
                        const signData = ethers.utils.RLP.encode([
                            processorUtils.toHexStringRlp(Scalar.e(tx.nonce)),
                            processorUtils.toHexStringRlp(tx.gasPrice),
                            processorUtils.toHexStringRlp(tx.gasLimit),
                            processorUtils.toHexStringRlp(tx.to),
                            processorUtils.toHexStringRlp(tx.value),
                            processorUtils.toHexStringRlp(tx.data),
                            processorUtils.toHexStringRlp(tx.chainId),
                            '0x',
                            '0x',
                        ]);
                        const digest = ethers.utils.keccak256(signData);
                        const signingKey = new ethers.utils.SigningKey(walletMap[txData.from].privateKey);
                        const signature = signingKey.signDigest(digest);
                        const r = signature.r.slice(2).padStart(64, '0'); // 32 bytes
                        const s = signature.s.slice(2).padStart(64, '0'); // 32 bytes
                        const v = (signature.v).toString(16).padStart(2, '0'); // 1 bytes
                        customRawTx = signData.concat(r).concat(s).concat(v);
                    } else {
                        const rawTxEthers = await walletMap[txData.from].signTransaction(tx);
                        customRawTx = processorUtils.rawTxToCustomRawTx(rawTxEthers);
                    }

                    if (update) {
                        testVectorsRecursive[0].batches[m].txs[j].customRawTx = customRawTx;
                    } else {
                        expect(customRawTx).to.equal(txData.customRawTx);
                    }

                    if (txData.encodeInvalidData) {
                        customRawTx = customRawTx.slice(0, -6);
                    }
                    rawTxs.push(customRawTx);
                } catch (error) {
                    expect(txData.customRawTx).to.equal(undefined);
                }
            }
            rawBatches.push(rawTxs);
        }

        // create a zkEVMDB and build a batch
        const zkEVMDB = await ZkEVMDB.newZkEVM(
            db,
            poseidon,
            genesisRoot,
            smtUtils.stringToH4(oldAccInputHash),
            genesis,
            null,
            null,
            chainID,
            forkID,
        );

        // create batches
        for (let m = 0; m < rawBatches.length; m++) {
            const rawTxs = rawBatches[m];
            const batch = await zkEVMDB.buildBatch(timestamp, sequencerAddress, smtUtils.stringToH4(globalExitRoot));
            for (let j = 0; j < rawTxs.length; j++) {
                batch.addRawTx(rawTxs[j]);
            }
            await batch.executeTxs();
            await zkEVMDB.consolidate(batch);

            const newRoot = batch.currentStateRoot;
            const { newAccInputHash, newNumBatch, newLocalExitRoot } = batch;
            const batchL2Data = await batch.getBatchL2Data();

            if (update) {
                testVectorsRecursive[0].batches[m].expectedNewRoot = smtUtils.h4toString(newRoot);
                testVectorsRecursive[0].batches[m].expectedNewAccInputHash = smtUtils.h4toString(newAccInputHash);
                testVectorsRecursive[0].batches[m].expectedNewNumBatch = batch.newNumBatch;
                testVectorsRecursive[0].batches[m].expectedNewLocalExitRoot = smtUtils.h4toString(newLocalExitRoot);
                testVectorsRecursive[0].batches[m].expectedBatchL2Data = batchL2Data;
            } else {
                expect(smtUtils.h4toString(newRoot)).to.be.equal(batches[m].expectedNewRoot);
                expect(smtUtils.h4toString(newAccInputHash)).to.be.equal(batches[m].expectedNewAccInputHash);
                expect(newNumBatch).to.be.equal(batches[m].expectedNewNumBatch);
                expect(smtUtils.h4toString(newLocalExitRoot)).to.be.equal(batches[m].expectedNewLocalExitRoot);
                expect(batchL2Data).to.be.equal(batches[m].expectedBatchL2Data);
            }
        }

        // checks after consolidate zkEVMDB
        if (!update) {
            expect(smtUtils.h4toString(zkEVMDB.getCurrentStateRoot())).to.be.equal(finalStateRoot);
            expect(smtUtils.h4toString(zkEVMDB.getCurrentLocalExitRoot())).to.be.equal(finalLocalExitRoot);
            expect(smtUtils.h4toString(zkEVMDB.getCurrentAccInpuHash())).to.be.equal(finalAccInputHash);
            expect(zkEVMDB.getCurrentNumBatch()).to.be.equal(finalNumBatch);
        } else {
            testVectorsRecursive[0].finalStateRoot = smtUtils.h4toString(zkEVMDB.getCurrentStateRoot());
            testVectorsRecursive[0].finalLocalExitRoot = smtUtils.h4toString(zkEVMDB.getCurrentLocalExitRoot());
            testVectorsRecursive[0].finalAccInputHash = smtUtils.h4toString(zkEVMDB.getCurrentAccInpuHash());
            testVectorsRecursive[0].finalNumBatch = zkEVMDB.getCurrentNumBatch();
        }

        // checks sequence multiple batches
        const initBatch = 1;
        const finalBatch = 2;
        const seqBatches = await zkEVMDB.sequenceMultipleBatches(initBatch, finalBatch);

        for (let i = 0; i < (finalBatch - initBatch); i++) {
            expect(seqBatches[i].timestamp).to.equal(timestamp);
            expect(seqBatches[i].globalExitRoot).to.equal(globalExitRoot);
            expect(seqBatches[i].transactions).to.equal(batches[i].expectedBatchL2Data);
        }

        // checks snark input for multiple batches
        const verifyBatches = await zkEVMDB.verifyMultipleBatches(initBatch, finalBatch, aggregatorAddress);

        if (update) {
            testVectorsRecursive[0].inputSnark = verifyBatches.inputSnark;
        } else {
            expect(inputSnark).to.be.equal(verifyBatches.inputSnark);
        }

        if (update) {
            await fs.writeFileSync(pathZkevmDbTestRecursive, JSON.stringify(testVectorsRecursive, null, 2));
        }
    });
});
