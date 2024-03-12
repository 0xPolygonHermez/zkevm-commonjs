/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */
const fs = require('fs');
const path = require('path');
const lodash = require('lodash');
const { Scalar } = require('ffjavascript');

const ethers = require('ethers');
const { expect } = require('chai');
const { argv } = require('yargs');

const {
    MemDB, SMT, stateUtils, Constants, ZkEVMDB, getPoseidon, processorUtils,
    smtUtils,
} = require('../index');
const { pathTestVectors } = require('./helpers/test-utils');
const { serializeChangeL2Block } = require('../index').processorUtils;

describe('ZkEVMDB', function () {
    this.timeout(100000);
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
        const oldBatchAccInputHash = [F.zero, F.zero, F.zero, F.zero];
        const genesis = [];
        const db = new MemDB(F);
        const chainID = 1000;
        const forkID = 9;
        const type = 0;
        const forcedHashData = Constants.ZERO_BYTES32;
        const previousL1InfoTreeRoot = Constants.ZERO_BYTES32;
        const previousL1InfoTreeIndex = 0;
        // create a zkEVMDB and build a batch
        const zkEVMDB = await ZkEVMDB.newZkEVM(
            db,
            poseidon,
            genesisRoot,
            oldBatchAccInputHash,
            genesis,
            null,
            null,
            chainID,
            forkID,
        );

        // build an empty batch
        const batch = await zkEVMDB.buildBatch(
            sequencerAddress,
            type,
            forcedHashData,
            previousL1InfoTreeRoot,
            previousL1InfoTreeIndex,
            null,
        );
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
            oldStateRoot,
            txs,
            newStateRoot,
            batchL2Data,
            sequencerAddress,
            newLocalExitRoot,
            oldBatchAccInputHash,
            newBatchAccInputHash,
            previousL1InfoTreeRoot,
            previousL1InfoTreeIndex,
            type,
            chainID,
            forkID,
            forcedHashData,
        } = testVectors[0];

        const db = new MemDB(F);
        const smt = new SMT(db, poseidon, poseidon.F);

        const walletMap = {};
        const addressArray = [];
        const amountArray = [];
        const nonceArray = [];

        const extraData = { l1Info: {} };

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
            testVectors[0].oldStateRoot = smtUtils.h4toString(genesisRoot);
        } else {
            expect(smtUtils.h4toString(genesisRoot)).to.be.equal(oldStateRoot);
        }

        /*
         * build, sign transaction and generate rawTxs
         * rawTxs would be the calldata inserted in the contract
         */
        const txProcessed = [];
        const rawTxs = [];
        for (let j = 0; j < txs.length; j++) {
            const txData = txs[j];

            if (txData.type === Constants.TX_CHANGE_L2_BLOCK) {
                const rawChangeL2BlockTx = serializeChangeL2Block(txData);

                // Append l1Info to l1Info object
                extraData.l1Info[txData.indexL1InfoTree] = txData.l1Info;

                const customRawTx = `0x${rawChangeL2BlockTx}`;
                rawTxs.push(customRawTx);
                txProcessed.push(txData);

                if (!update) {
                    expect(customRawTx).to.equal(txData.customRawTx);
                } else {
                    txData.customRawTx = customRawTx;
                }

                // eslint-disable-next-line no-continue
                continue;
            }

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
                    if (typeof tx.effectivePercentage === 'undefined') {
                        tx.effectivePercentage = 'ff';
                    }
                    customRawTx = signData.concat(r).concat(s).concat(v).concat(tx.effectivePercentage);
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
            smtUtils.stringToH4(oldBatchAccInputHash),
            genesis,
            null,
            null,
            chainID,
            forkID,
        );

        const batch = await zkEVMDB.buildBatch(
            sequencerAddress,
            type,
            forcedHashData,
            previousL1InfoTreeRoot,
            previousL1InfoTreeIndex,
            Constants.DEFAULT_MAX_TX,
        );

        for (let j = 0; j < rawTxs.length; j++) {
            batch.addRawTx(rawTxs[j]);
        }

        // execute the transactions added to the batch
        await batch.executeTxs();

        const computedBatchL2Data = await batch.getBatchL2Data();

        if (update) {
            testVectors[0].newStateRoot = smtUtils.h4toString(batch.currentStateRoot);
            testVectors[0].newBatchAccInputHash = smtUtils.h4toString(batch.newBatchAccInputHash);
            testVectors[0].batchL2Data = computedBatchL2Data;
        } else {
            expect(smtUtils.h4toString(batch.currentStateRoot)).to.be.equal(newStateRoot);
            expect(smtUtils.h4toString(batch.newBatchAccInputHash)).to.be.equal(newBatchAccInputHash);
            expect(computedBatchL2Data).to.be.equal(batchL2Data);
        }

        // checks previous consolidate zkEVMDB
        const lastBatch = await db.getValue(Constants.DB_LAST_BATCH);
        expect(lastBatch).to.be.equal(null);

        const numBatch = 0;
        expect(zkEVMDB.getCurrentNumBatch()).to.be.equal(numBatch);

        if (!update) {
            expect(smtUtils.h4toString(zkEVMDB.getCurrentStateRoot())).to.be.equal(oldStateRoot);
        }

        // consoldate state
        await zkEVMDB.consolidate(batch);

        // checks after consolidate zkEVMDB
        expect(zkEVMDB.getCurrentNumBatch()).to.be.equal(numBatch + 1);
        if (!update) {
            expect(smtUtils.h4toString(zkEVMDB.getCurrentStateRoot())).to.be.equal(newStateRoot);
            expect(smtUtils.h4toString(zkEVMDB.getCurrentLocalExitRoot())).to.be.equal(newLocalExitRoot);
            expect(smtUtils.h4toString(zkEVMDB.getCurrentBatchAccInputHash())).to.be.equal(newBatchAccInputHash);
        }

        const lastBatchDB = await db.getValue(Constants.DB_LAST_BATCH);
        expect(lastBatchDB).to.be.equal(numBatch + 1);

        const stateRootDB = await db.getValue(Scalar.add(Constants.DB_STATE_ROOT, lastBatchDB));
        expect(stateRootDB).to.be.deep.equal(smtUtils.h4toString(zkEVMDB.getCurrentStateRoot()));

        const localExitRootDB = await db.getValue(Scalar.add(Constants.DB_LOCAL_EXIT_ROOT, lastBatchDB));
        expect(localExitRootDB).to.be.deep.equal(smtUtils.h4toString(zkEVMDB.getCurrentLocalExitRoot()));

        const accHashInputDB = await db.getValue(Scalar.add(Constants.DB_ACC_INPUT_HASH, lastBatchDB));
        expect(accHashInputDB).to.be.deep.equal(smtUtils.h4toString(zkEVMDB.getCurrentBatchAccInputHash()));

        if (update) {
            await fs.writeFileSync(pathZkevmDbTest, JSON.stringify(testVectors, null, 2));
        }
    });

    it('Check zkEVMDB recursive functions', async () => {
        const {
            genesis,
            oldStateRoot,
            batches,
            sequencerAddress,
            type,
            previousL1InfoTreeRoot,
            previousL1InfoTreeIndex,
            oldBatchAccInputHash,
            chainID,
            forkID,
            newStateRoot,
            newLocalExitRoot,
            newBatchAccInputHash,
            newNumBatch,
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
            expect(smtUtils.h4toString(genesisRoot)).to.be.equal(oldStateRoot);
        }

        /*
         * build, sign transaction and generate rawTxs
         * rawTxs would be the calldata inserted in the contract
         */
        const extraData = { l1Info: {} };
        const rawBatches = [];

        for (let m = 0; m < batches.length; m++) {
            const { txs } = batches[m];
            const rawTxs = [];

            for (let j = 0; j < txs.length; j++) {
                const txData = txs[j];

                if (txData.type === Constants.TX_CHANGE_L2_BLOCK) {
                    const rawChangeL2BlockTx = serializeChangeL2Block(txData);

                    // Append l1Info to l1Info object
                    extraData.l1Info[txData.indexL1InfoTree] = txData.l1Info;

                    const customRawTx = `0x${rawChangeL2BlockTx}`;
                    rawTxs.push(customRawTx);

                    if (!update) {
                        expect(customRawTx).to.equal(txData.customRawTx);
                    } else {
                        txData.customRawTx = customRawTx;
                    }
                    // eslint-disable-next-line no-continue
                    continue;
                }

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
            smtUtils.stringToH4(oldBatchAccInputHash),
            genesis,
            null,
            null,
            chainID,
            forkID,
        );

        // create batches
        for (let m = 0; m < rawBatches.length; m++) {
            const rawTxs = rawBatches[m];
            const batch = await zkEVMDB.buildBatch(
                sequencerAddress,
                type,
                Constants.ZERO_BYTES32, // forcedHashData
                previousL1InfoTreeRoot,
                previousL1InfoTreeIndex,
                Constants.DEFAULT_MAX_TX,
                {
                    skipVerifyL1InfoRoot: false,
                },
                extraData,
            );

            for (let j = 0; j < rawTxs.length; j++) {
                batch.addRawTx(rawTxs[j]);
            }

            await batch.executeTxs();
            await zkEVMDB.consolidate(batch);

            const batchL2Data = await batch.getBatchL2Data();

            if (update) {
                testVectorsRecursive[0].batches[m].newStateRoot = smtUtils.h4toString(batch.currentStateRoot);
                testVectorsRecursive[0].batches[m].newBatchAccInputHash = smtUtils.h4toString(batch.newBatchAccInputHash);
                testVectorsRecursive[0].batches[m].newNumBatch = batch.newNumBatch;
                testVectorsRecursive[0].batches[m].newLocalExitRoot = smtUtils.h4toString(batch.newLocalExitRoot);
                testVectorsRecursive[0].batches[m].batchL2Data = batchL2Data;
                testVectorsRecursive[0].batches[m].newL1InfoTreeRoot = batch.currentL1InfoTreeRoot;
                testVectorsRecursive[0].batches[m].newL1InfoTreeIndex = batch.currentL1InfoTreeIndex;
            } else {
                expect(smtUtils.h4toString(batch.currentStateRoot)).to.be.equal(batches[m].newStateRoot);
                expect(smtUtils.h4toString(batch.newBatchAccInputHash)).to.be.equal(batches[m].newBatchAccInputHash);
                expect(batch.newNumBatch).to.be.equal(batches[m].newNumBatch);
                expect(smtUtils.h4toString(batch.newLocalExitRoot)).to.be.equal(batches[m].newLocalExitRoot);
                expect(batchL2Data).to.be.equal(batches[m].batchL2Data);
                expect(batches[m].newL1InfoTreeRoot).to.be.equal(batch.currentL1InfoTreeRoot);
                expect(batches[m].newL1InfoTreeIndex).to.be.equal(batch.currentL1InfoTreeIndex);
            }

            // Check balances and nonces
            const updatedAccounts = batch.getUpdatedAccountsBatch();

            const newLeafs = {};
            // eslint-disable-next-line no-restricted-syntax, guard-for-in
            for (const item in updatedAccounts) {
                const address = item;
                const account = updatedAccounts[address];
                newLeafs[address] = {};

                const newLeaf = await zkEVMDB.getCurrentAccountState(address);
                expect(newLeaf.balance.toString()).to.equal(account.balance.toString());
                expect(newLeaf.nonce.toString()).to.equal(account.nonce.toString());

                const smtNewLeaf = await zkEVMDB.getCurrentAccountState(address);
                expect(smtNewLeaf.balance.toString()).to.equal(account.balance.toString());
                expect(smtNewLeaf.nonce.toString()).to.equal(account.nonce.toString());

                newLeafs[address].balance = account.balance.toString();
                newLeafs[address].nonce = account.nonce.toString();

                const storage = await zkEVMDB.dumpStorage(address);
                const hashBytecode = await zkEVMDB.getHashBytecode(address);
                const bytecodeLength = await zkEVMDB.getLength(address);
                newLeafs[address].storage = storage;
                newLeafs[address].hashBytecode = hashBytecode;
                newLeafs[address].bytecodeLength = bytecodeLength;
            }

            for (const leaf of genesis) {
                if (!newLeafs[leaf.address.toLowerCase()]) {
                    newLeafs[leaf.address] = { ...leaf };
                    delete newLeafs[leaf.address].address;
                    delete newLeafs[leaf.address].bytecode;
                    delete newLeafs[leaf.address].contractName;
                }
            }

            if (!update) {
                for (const [address, leaf] of Object.entries(batches[m].expectedNewLeafs)) {
                    expect(lodash.isEqual(leaf, newLeafs[address])).to.be.equal(true);
                }
            } else {
                testVectorsRecursive[0].batches[m].expectedNewLeafs = newLeafs;
            }
        }

        // checks after consolidate zkEVMDB
        if (!update) {
            expect(smtUtils.h4toString(zkEVMDB.getCurrentStateRoot())).to.be.equal(newStateRoot);
            expect(smtUtils.h4toString(zkEVMDB.getCurrentLocalExitRoot())).to.be.equal(newLocalExitRoot);
            expect(smtUtils.h4toString(zkEVMDB.getCurrentBatchAccInputHash())).to.be.equal(newBatchAccInputHash);
            expect(zkEVMDB.getCurrentNumBatch()).to.be.equal(newNumBatch);
        } else {
            testVectorsRecursive[0].newStateRoot = smtUtils.h4toString(zkEVMDB.getCurrentStateRoot());
            testVectorsRecursive[0].newLocalExitRoot = smtUtils.h4toString(zkEVMDB.getCurrentLocalExitRoot());
            testVectorsRecursive[0].newBatchAccInputHash = smtUtils.h4toString(zkEVMDB.getCurrentBatchAccInputHash());
            testVectorsRecursive[0].newNumBatch = zkEVMDB.getCurrentNumBatch();
        }

        // checks sequence multiple batches
        const initBatch = 1;
        const finalBatch = 2;
        const seqBatches = await zkEVMDB.sequenceMultipleBatches(initBatch, finalBatch);

        for (let i = 0; i < (finalBatch - initBatch); i++) {
            expect(seqBatches[i].transactions).to.equal(batches[i].batchL2Data);
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
