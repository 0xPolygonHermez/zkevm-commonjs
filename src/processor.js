/* eslint-disable no-restricted-syntax */
/* eslint-disable no-continue */
const ethers = require('ethers');
const { Transaction } = require('@ethereumjs/tx');
const { Block } = require('@ethereumjs/block');
const {
    Address, BN, toBuffer,
} = require('ethereumjs-util');

const { Scalar } = require('ffjavascript');
const SMT = require('./smt');
const TmpSmtDB = require('./tmp-smt-db');
const Constants = require('./constants');
const stateUtils = require('./state-utils');
const smtUtils = require('./smt-utils');

const { getCurrentDB } = require('./smt-utils');
const { calculateStarkInput, calculateSnarkInput, calculateBatchHashData } = require('./contract-utils');
const { decodeCustomRawTxProverMethod } = require('./processor-utils');

module.exports = class Processor {
    /**
     * constructor Processor class
     * @param {Object} db - database
     * @param {Number} batchNumber - batch number
     * @param {Object} poseidon - hash function
     * @param {Number} maxNTx - maximum number of transaction allowed
     * @param {Array[Field]} root - state root
     * @param {String} sequencerAddress . sequencer address
     * @param {Array[Field]} localExitRoot - local exit root
     * @param {Array[Field]} globalExitRoot - global exit root
     * @param {Number} timestamp - Timestamp of the batch
     * @param {Object} vm - vm instance
     */
    constructor(
        db,
        batchNumber,
        poseidon,
        maxNTx,
        root,
        sequencerAddress,
        localExitRoot,
        globalExitRoot,
        timestamp,
        vm,
    ) {
        this.db = db;
        this.batchNumber = batchNumber;
        this.poseidon = poseidon;
        this.maxNTx = maxNTx;
        this.F = poseidon.F;
        this.tmpSmtDB = new TmpSmtDB(db);
        this.smt = new SMT(this.tmpSmtDB, poseidon, poseidon.F);

        this.rawTxs = [];
        this.decodedTxs = [];
        this.builded = false;
        this.starkInput = {};
        this.snarkInput = '0x';
        this.contractsBytecode = {};
        this.oldStateRoot = root;
        this.currentStateRoot = root;
        this.oldLocalExitRoot = localExitRoot;
        this.newLocalExitRoot = localExitRoot;
        this.globalExitRoot = globalExitRoot;

        this.sequencerAddress = sequencerAddress;
        this.timestamp = timestamp;

        this.vm = vm;
        this.evmSteps = [];
        this.updatedAccounts = {};
    }

    /**
     * Add a raw transaction to the processor
     * @param {String} rawTx - RLP encoded transaction with signature
     */
    addRawTx(rawTx) {
        this._isNotBuilded();
        if (this.rawTxs.length >= this.maxNTx) {
            throw new Error('Batch is already full of transactions');
        }
        this.rawTxs.push(rawTx);
    }

    /**
     * Execute transactions
     */
    async executeTxs() {
        this._isNotBuilded();

        // Check the validity of rawTxs
        await this._decodeAndCheckRawTx();

        // Set oldStateRoot to system contract
        await this._setBatchHash();

        // Set global exit root
        await this._setGlobalExitRoot();

        // Process transactions and update the state
        await this._processTx();

        // Read Local exit root
        await this._readLocalExitRoot();

        // Calculate stark and snark input
        await this._computeStarkInput();
        await this._computeSnarkInput();

        this.builded = true;
    }

    /**
     * Try to decode and check the validity of rawTxs
     * Save the decoded transaction, whether is valid or not, and the invalidated reason if any in a new array: decodedTxs
     * Note that, even if this funcion mark a transactions as valid, there are some checks that are performed
     * During the processing of the transactions, therefore can be invalidated after
     * This funcion will check:
     * A: Well formed RLP encoding
     * B: Valid ChainID
     * C: Valid signature
     */
    async _decodeAndCheckRawTx() {
        if (this.decodedTxs.length !== 0) {
            throw new Error('Transactions array should be empty');
        }

        // Checks transactions:
        for (let i = 0; i < this.rawTxs.length; i++) {
            const rawTx = this.rawTxs[i];

            // Decode raw transaction using prover method
            let txDecoded;
            let rlpSignData;
            try {
                const decodedObject = decodeCustomRawTxProverMethod(rawTx);
                txDecoded = decodedObject.txDecoded;
                rlpSignData = decodedObject.rlpSignData;
            } catch (error) {
                this.decodedTxs.push({ isInvalid: true, reason: 'TX INVALID: Failed to RLP decode signing data', tx: txDecoded });
                continue;
            }
            txDecoded.from = undefined;
            txDecoded.chainID = Number(txDecoded.chainID);

            // B: Valid chainID
            if (txDecoded.chainID !== Constants.ZKEVM_CHAINID) {
                this.decodedTxs.push({ isInvalid: true, reason: 'TX INVALID: Chain ID does not match', tx: txDecoded });
                continue;
            }

            // verify signature!
            const digest = ethers.utils.keccak256(rlpSignData);
            try {
                txDecoded.from = ethers.utils.recoverAddress(digest, {
                    r: txDecoded.r,
                    s: txDecoded.s,
                    v: txDecoded.v,
                });
            } catch (error) {
                this.decodedTxs.push({ isInvalid: true, reason: 'TX INVALID: Failed signature', tx: txDecoded });
                continue;
            }

            /*
             * The RLP encoding, encodes the 0 integer as "0x" ( empty byte array),
             * In order to be compatible with Scalar or Number we will update the 0x integer cases with 0x00
             */
            const txParams = Object.keys(txDecoded);

            txParams.forEach((key) => {
                if (txDecoded[key] === '0x' && key !== 'data' && key !== 'to') {
                    txDecoded[key] = '0x00';
                }
            });
            this.decodedTxs.push({ isInvalid: false, reason: '', tx: txDecoded });
        }
    }

    /**
     * Set the old state root exit root in a specific storage slot of the system smart contract for both vm and SMT
     * This will be performed before process the transactions
     */
    async _setBatchHash() {
        const newStorageEntry = {};
        const stateRootPos = ethers.utils.solidityKeccak256(['uint256', 'uint256'], [this.batchNumber - 1, Constants.STATE_ROOT_STORAGE_POS]);
        newStorageEntry[stateRootPos] = smtUtils.h4toString(this.oldStateRoot);

        this.currentStateRoot = await stateUtils.setContractStorage(
            Constants.ADDRESS_SYSTEM,
            this.smt,
            this.currentStateRoot,
            newStorageEntry,
        );

        const addressInstance = new Address(toBuffer(Constants.ADDRESS_SYSTEM));
        await this.vm.stateManager.putContractStorage(
            addressInstance,
            toBuffer(stateRootPos),
            toBuffer(smtUtils.h4toString(this.oldStateRoot)),
        );

        // store data in internal DB
        const keyDumpStorage = Scalar.add(Constants.DB_ADDRESS_STORAGE, Scalar.fromString(Constants.ADDRESS_SYSTEM, 16));

        // add address to updatedAccounts
        const account = await this.vm.stateManager.getAccount(addressInstance);
        this.updatedAccounts[Constants.ADDRESS_SYSTEM.toLowerCase()] = account;

        // update its storage
        const sto = await this.vm.stateManager.dumpStorage(addressInstance);
        const storage = {};
        const keys = Object.keys(sto).map((v) => `0x${v}`);
        const values = Object.values(sto).map((v) => `0x${v}`);
        for (let k = 0; k < keys.length; k++) {
            storage[keys[k]] = ethers.utils.RLP.decode(values[k]);
        }
        await this.db.setValue(keyDumpStorage, storage);
    }

    /**
     * Set the global exit root in a specific storage slot of the globalExitRootManagerL2 for both vm and SMT
     * This will be performed before process the transactions
     */
    async _setGlobalExitRoot() {
        const newStorageEntry = {};
        const globalExitRootPos = ethers.utils.solidityKeccak256(['uint256', 'uint256'], [smtUtils.h4toString(this.globalExitRoot), Constants.GLOBAL_EXIT_ROOT_STORAGE_POS]);
        newStorageEntry[globalExitRootPos] = this.batchNumber;
        this.currentStateRoot = await stateUtils.setContractStorage(
            Constants.ADDRESS_GLOBAL_EXIT_ROOT_MANAGER_L2,
            this.smt,
            this.currentStateRoot,
            newStorageEntry,
        );

        const addressInstance = new Address(toBuffer(Constants.ADDRESS_GLOBAL_EXIT_ROOT_MANAGER_L2));
        await this.vm.stateManager.putContractStorage(
            addressInstance,
            toBuffer(globalExitRootPos),
            toBuffer(this.batchNumber),
        );

        // store data in internal DB
        const keyDumpStorage = Scalar.add(
            Constants.DB_ADDRESS_STORAGE,
            Scalar.fromString(Constants.ADDRESS_GLOBAL_EXIT_ROOT_MANAGER_L2, 16),
        );

        const account = await this.vm.stateManager.getAccount(addressInstance);
        this.updatedAccounts[Constants.ADDRESS_GLOBAL_EXIT_ROOT_MANAGER_L2.toLowerCase()] = account;

        // update its storage
        const sto = await this.vm.stateManager.dumpStorage(addressInstance);
        const storage = {};
        const keys = Object.keys(sto).map((v) => `0x${v}`);
        const values = Object.values(sto).map((v) => `0x${v}`);
        for (let k = 0; k < keys.length; k++) {
            storage[keys[k]] = ethers.utils.RLP.decode(values[k]);
        }
        await this.db.setValue(keyDumpStorage, storage);
    }

    /**
     * Read the local exit root, which is a variable stored in some specific storage slot of the globalExitRootManagerL2
     * This will be performed after processing all the transactions
     */
    async _readLocalExitRoot() {
        const res = await stateUtils.getContractStorage(
            Constants.ADDRESS_GLOBAL_EXIT_ROOT_MANAGER_L2,
            this.smt,
            this.currentStateRoot,
            [Constants.LOCAL_EXIT_ROOT_STORAGE_POS],
        );

        const newLocalExitRoot = res[Constants.LOCAL_EXIT_ROOT_STORAGE_POS];
        if (Scalar.eq(newLocalExitRoot, Scalar.e(0))) {
            this.newLocalExitRoot = smtUtils.stringToH4(ethers.constants.HashZero);
        } else {
            this.newLocalExitRoot = smtUtils.scalar2h4(newLocalExitRoot);
        }
    }

    /**
     * Process the decoded transactions decodedTxs
     * Also this function will perform several checks and can mark a transactions as invalid
     * This funcion will check:
     * A: VALID NONCE
     * B: ENOUGH UPFRONT TX COST
     * Process transaction will perform the following operations
     * from: increase nonce
     * from: substract total tx cost
     * from: refund unused gas
     * to: increase balance
     * update state
     * finally pay all the fees to the sequencer address
     */
    async _processTx() {
        for (let i = 0; i < this.decodedTxs.length; i++) {
            const currentDecodedTx = this.decodedTxs[i];

            if (currentDecodedTx.isInvalid) {
                continue;
            } else {
                const currenTx = currentDecodedTx.tx;
                // Get from state
                const oldStateFrom = await stateUtils.getState(currenTx.from, this.smt, this.currentStateRoot);

                // A: VALID NONCE
                if (Number(oldStateFrom.nonce) !== Number(currenTx.nonce)) {
                    currentDecodedTx.isInvalid = true;
                    currentDecodedTx.reason = 'TX INVALID: Invalid nonce';
                    continue;
                }

                // B: ENOUGH UPFRONT TX COST
                const gasLimitCost = Scalar.mul(Scalar.e(currenTx.gasLimit), Scalar.e(currenTx.gasPrice));
                const upfronTxCost = Scalar.add(gasLimitCost, Scalar.e(currenTx.value));

                if (Scalar.gt(upfronTxCost, Scalar.e(oldStateFrom.balance))) {
                    currentDecodedTx.isInvalid = true;
                    currentDecodedTx.reason = 'TX INVALID: Not enough funds to pay total transaction cost';
                    continue;
                }

                // Run tx in the EVM
                const evmTx = Transaction.fromTxData({
                    nonce: currenTx.nonce,
                    gasPrice: currenTx.gasPrice,
                    gasLimit: currenTx.gasLimit,
                    to: currenTx.to,
                    value: currenTx.value,
                    data: currenTx.data,
                    v: Number(currenTx.v) - 27 + currenTx.chainID * 2 + 35,
                    r: currenTx.r,
                    s: currenTx.s,
                });

                // Build block information
                const blockData = {};
                blockData.header = {};
                blockData.header.timestamp = new BN(Scalar.e(this.timestamp));
                blockData.header.number = new BN(Scalar.e(this.batchNumber));
                blockData.header.coinbase = new Address(toBuffer(this.sequencerAddress));
                blockData.header.gasLimit = new BN(Scalar.e(Constants.BATCH_GAS_LIMIT));
                blockData.header.difficulty = new BN(Scalar.e(Constants.BATCH_DIFFICULTY));

                const evmBlock = Block.fromBlockData(blockData, { common: evmTx.common });
                const txResult = await this.vm.runTx({ tx: evmTx, block: evmBlock });

                this.evmSteps.push(txResult.execResult.evmSteps);

                // Check transaction completed
                if (txResult.execResult.exceptionError) {
                    currentDecodedTx.isInvalid = true;
                    if (txResult.execResult.returnValue.toString()) {
                        const abiCoder = ethers.utils.defaultAbiCoder;
                        const revertReasonHex = `0x${txResult.execResult.returnValue.toString('hex').slice(8)}`;
                        [currentDecodedTx.reason] = abiCoder.decode(['string'], revertReasonHex);
                    } else currentDecodedTx.reason = txResult.execResult.exceptionError;

                    // UPDATE sender account adding the nonce and substracting the gas spended
                    const senderAcc = await this.vm.stateManager.getAccount(txResult.execResult.runState.caller);
                    this.updatedAccounts[currenTx.from] = senderAcc;
                    // Update smt with touched accounts
                    this.currentStateRoot = await stateUtils.setAccountState(
                        currenTx.from,
                        this.smt,
                        this.currentStateRoot,
                        Scalar.e(senderAcc.balance),
                        Scalar.e(senderAcc.nonce),
                    );

                    /*
                     * UPDATE miner Acc
                     * Get touched evm account
                     */
                    const addressSeq = Address.fromString(this.sequencerAddress);
                    const accountSeq = await this.vm.stateManager.getAccount(addressSeq);

                    // Update batch touched stack
                    this.updatedAccounts[this.sequencerAddress] = accountSeq;

                    // Update smt with touched accounts
                    this.currentStateRoot = await stateUtils.setAccountState(
                        this.sequencerAddress,
                        this.smt,
                        this.currentStateRoot,
                        Scalar.e(accountSeq.balance),
                        Scalar.e(accountSeq.nonce),
                    );

                    // Clear touched accounts
                    this.vm.stateManager._customTouched.clear();

                    continue;
                }

                // PROCESS TX in the smt updating the touched accounts from the EVM
                const touchedStack = this.vm.stateManager._customTouched;
                for (const item of touchedStack) {
                    const address = `0x${item}`;

                    // Get touched evm account
                    const addressInstance = Address.fromString(address);
                    const account = await this.vm.stateManager.getAccount(addressInstance);

                    // Update batch touched stack
                    this.updatedAccounts[address] = account;

                    // Update smt with touched accounts
                    this.currentStateRoot = await stateUtils.setAccountState(
                        address,
                        this.smt,
                        this.currentStateRoot,
                        Scalar.e(account.balance),
                        Scalar.e(account.nonce),
                    );

                    // If account is a contract, update storage and bytecode
                    if (account.isContract()) {
                        const smCode = await this.vm.stateManager.getContractCode(addressInstance);

                        this.currentStateRoot = await stateUtils.setContractBytecode(
                            address,
                            this.smt,
                            this.currentStateRoot,
                            smCode.toString('hex'),
                            false,
                        );
                        const keyDumpStorage = Scalar.add(Constants.DB_ADDRESS_STORAGE, Scalar.fromString(address, 16));
                        const oldSto = await this.db.getValue(keyDumpStorage);
                        const sto = await this.vm.stateManager.dumpStorage(addressInstance);

                        const storage = {};
                        const keys = Object.keys(sto).map((v) => `0x${v}`);
                        const values = Object.values(sto).map((v) => `0x${v}`);
                        for (let k = 0; k < keys.length; k++) {
                            storage[keys[k]] = ethers.utils.RLP.decode(values[k]);
                        }
                        if (oldSto) {
                            for (const key of Object.keys(oldSto)) {
                                const value = storage[key];
                                if (!value) { storage[key] = '0x00'; }
                            }
                        }
                        this.currentStateRoot = await stateUtils.setContractStorage(
                            address,
                            this.smt,
                            this.currentStateRoot,
                            storage,
                        );
                        await this.db.setValue(keyDumpStorage, storage);

                        if (currenTx.to && currenTx.to !== ethers.constants.AddressZero) {
                            // Set bytecode at db when smart contract is called
                            const hashedBytecode = await smtUtils.hashContractBytecode(smCode.toString('hex'));
                            this.db.setValue(hashedBytecode, smCode.toString('hex'));
                            this.contractsBytecode[hashedBytecode] = smCode.toString('hex');
                        }
                    } else {
                        // handle self-destruct
                        const oldHashBytecode = await stateUtils.getContractHashBytecode(address, this.smt, this.currentStateRoot);

                        if (oldHashBytecode !== Constants.BYTECODE_EMPTY) {
                            // delete leaf bytecode
                            this.currentStateRoot = await stateUtils.setContractBytecode(
                                address,
                                this.smt,
                                this.currentStateRoot,
                                '0x',
                                true,
                            );
                        }
                    }
                }

                // Clear touched accounts
                this.vm.stateManager._customTouched.clear();
            }
        }
    }

    /**
     * Compute stark input
     */
    async _computeStarkInput() {
        // compute circuit inputs
        const oldStateRoot = smtUtils.h4toString(this.oldStateRoot);
        const newStateRoot = smtUtils.h4toString(this.currentStateRoot);
        const oldLocalExitRoot = smtUtils.h4toString(this.oldLocalExitRoot);
        const newLocalExitRoot = smtUtils.h4toString(this.newLocalExitRoot);
        const globalExitRoot = smtUtils.h4toString(this.globalExitRoot);

        const batchHashData = calculateBatchHashData(
            this.getBatchL2Data(),
            globalExitRoot,
            this.sequencerAddress,
        );

        const inputHash = calculateStarkInput(
            oldStateRoot,
            oldLocalExitRoot,
            newStateRoot,
            newLocalExitRoot, // should be the new exit root, but it's not modified in this version
            batchHashData,
            this.batchNumber,
            this.timestamp,
        );

        this.starkInput = {
            oldStateRoot,
            db: await getCurrentDB(this.oldStateRoot, this.db, this.F),
            sequencerAddr: this.sequencerAddress,
            batchL2Data: this.getBatchL2Data(),
            newStateRoot,
            oldLocalExitRoot,
            newLocalExitRoot,
            globalExitRoot,
            batchHashData,
            inputHash,
            numBatch: this.batchNumber,
            timestamp: this.timestamp,
            contractsBytecode: this.contractsBytecode,
        };
    }

    /**
     * Compute stark input
     */
    _computeSnarkInput() {
        // compute circuit inputs
        const oldStateRoot = smtUtils.h4toString(this.oldStateRoot);
        const newStateRoot = smtUtils.h4toString(this.currentStateRoot);
        const oldLocalExitRoot = smtUtils.h4toString(this.oldLocalExitRoot);
        const newLocalExitRoot = smtUtils.h4toString(this.newLocalExitRoot);
        const globalExitRoot = smtUtils.h4toString(this.globalExitRoot);

        const batchHashData = calculateBatchHashData(
            this.getBatchL2Data(),
            globalExitRoot,
            this.sequencerAddress,
        );

        this.snarkInput = calculateSnarkInput(
            oldStateRoot,
            oldLocalExitRoot,
            newStateRoot,
            newLocalExitRoot,
            batchHashData,
            this.batchNumber,
            this.timestamp,
        );
    }

    /**
     * Return all the transaction data concatenated
     */
    getBatchL2Data() {
        return this.rawTxs.reduce((previousValue, currentValue) => previousValue + currentValue.slice(2), '0x');
    }

    /**
     * Return stark input
     */
    getStarkInput() {
        this._isBuilded();

        return this.starkInput;
    }

    /**
     * Return snark input
     */
    getSnarkInput() {
        this._isBuilded();

        return this.snarkInput;
    }

    /**
     * Throw error if batch is already builded
     */
    _isNotBuilded() {
        if (this.builded) throw new Error('Batch already builded');
    }

    /**
     * Throw error if batch is already builded
     */
    _isBuilded() {
        if (!this.builded) throw new Error('Batch must first be builded');
    }

    /**
     * Return the decoded transactions, whether the transactions is valid or not and the reason if any
     * @return {String} L2 data encoded as hexadecimal
     */
    async getDecodedTxs() {
        this._isBuilded();

        return this.decodedTxs;
    }

    /**
     * Return updated accounts in this batch
     * @return {Object} Accounts updated in this batch
     */
    getUpdatedAccountsBatch() {
        this._isBuilded();

        return this.updatedAccounts;
    }
};
