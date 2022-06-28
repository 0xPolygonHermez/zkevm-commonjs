/* eslint-disable multiline-comment-style */
/* eslint-disable no-restricted-syntax */
const { Scalar } = require('ffjavascript');
const VM = require('@polygon-hermez/vm').default;
const Common = require('@ethereumjs/common').default;
const {
    Address, Account, BN, toBuffer,
} = require('ethereumjs-util');
const { Hardfork } = require('@ethereumjs/common');

const ethers = require('ethers');
const clone = require('lodash/clone');
const Constants = require('./constants');
const Processor = require('./processor');
const SMT = require('./smt');
const {
    getState, setAccountState, setContractBytecode, setContractStorage, getContractHashBytecode,
    getContractBytecodeLength,
} = require('./state-utils');
const { h4toString, stringToH4 } = require('./smt-utils');

const common = Common.custom({ chainId: Constants.ZKEVM_CHAINID }, { hardfork: Hardfork.Berlin });

class ZkEVMDB {
    constructor(db, lastBatch, stateRoot, localExitRoot, poseidon, vm, smt) {
        this.db = db;
        this.lastBatch = lastBatch || 0;
        this.poseidon = poseidon;
        this.F = poseidon.F;

        this.stateRoot = stateRoot || [this.F.zero, this.F.zero, this.F.zero, this.F.zero];
        this.localExitRoot = localExitRoot || [this.F.zero, this.F.zero, this.F.zero, this.F.zero];

        this.smt = smt;
        this.vm = vm;
    }

    /**
     * Return a new Processor with the current RollupDb state
     * @param {Number} timestamp - Timestamp of the batch
     * @param {String} sequencerAddress - ethereum address represented as hex
     * @param {Array[Field]} globalExitRoot - global exit root
     * @param {Scalar} maxNTx - Maximum number of transactions (optional)
     */
    async buildBatch(timestamp, sequencerAddress, globalExitRoot, maxNTx = Constants.DEFAULT_MAX_TX) {
        return new Processor(
            this.db,
            this.lastBatch + 1,
            this.poseidon,
            maxNTx,
            this.stateRoot,
            sequencerAddress,
            this.localExitRoot,
            globalExitRoot,
            timestamp,
            clone(this.vm),
        );
    }

    /**
     * Consolidate a batch by writing it in the DB
     * @param {Object} processor - Processor object
     */
    async consolidate(processor) {
        if (processor.batchNumber !== this.lastBatch + 1) {
            throw new Error('Updating the wrong batch');
        }

        if (!processor.builded) {
            await processor.executeTxs();
        }

        // Populate actual DB with the keys and values inserted in the batch
        await processor.tmpSmtDB.populateSrcDb();

        // set state root
        await this.db.setValue(
            Scalar.add(Constants.DB_STATE_ROOT, processor.batchNumber),
            h4toString(processor.currentStateRoot),
        );

        // Set local exit root
        await this.db.setValue(
            Scalar.add(Constants.DB_LOCAL_EXIT_ROOT, processor.batchNumber),
            h4toString(processor.newLocalExitRoot),
        );

        // Set last batch number
        await this.db.setValue(
            Constants.DB_LAST_BATCH,
            Scalar.toNumber(processor.batchNumber),
        );

        // Set all concatenated touched address
        await this.db.setValue(
            Scalar.add(Constants.DB_TOUCHED_ACCOUNTS, processor.batchNumber),
            processor.getUpdatedAccountsBatch(),
        );

        // Update ZKEVMDB variables
        this.lastBatch = processor.batchNumber;
        this.stateRoot = processor.currentStateRoot;
        this.localExitRoot = processor.newLocalExitRoot;
        this.vm = processor.vm;
    }

    /**
     * Get current address state
     * @param {String} ethAddr ethereum address
     * @returns {Object} ethereum address state
     */
    async getCurrentAccountState(ethAddr) {
        return getState(ethAddr, this.smt, this.stateRoot);
    }

    /**
     * Get the current Batch number
     * @returns {Number} batch Number
     */
    getCurrentNumBatch() {
        return this.lastBatch;
    }

    /**
     * Get the current state root
     * @returns {Array[Field]} state root
     */
    getCurrentStateRoot() {
        return this.stateRoot;
    }

    /**
     * Get the current local exit root
     * @returns {String} local exit root
     */
    getCurrentLocalExitRoot() {
        return this.localExitRoot;
    }

    /**
     * Get smart contract storage
     * @param {String} address - smart contract address in hex string
     * @returns {Object} smart contract storage
    */
    async dumpStorage(address) {
        const keyDumpStorage = Scalar.add(Constants.DB_ADDRESS_STORAGE, Scalar.fromString(address, 16));

        return this.db.getValue(keyDumpStorage);
    }

    /**
     * Get smart contract bytecode
     * @param {String} address - smart contract address in hex string
     * @returns {String} smart contract bytecode
     */
    async getBytecode(address) {
        const hashByteCode = await this.getHashBytecode(address);

        return this.db.getValue(hashByteCode);
    }

    /**
     * Get smart contract hash bytecode
     * @param {String} address - smart contract address in hex string
     * @returns {String} smart hash contract bytecode
     */
    async getHashBytecode(address) {
        return getContractHashBytecode(address, this.smt, this.stateRoot);
    }

    /**
     * Get smart contract bytecode length
     * @param {String} address - smart contract address in hex string
     * @returns {Number} smart contract length in bytes
     */
    async getLength(address) {
        return getContractBytecodeLength(address, this.smt, this.stateRoot);
    }

    /**
     * Get touched accounts of a given batch
     * @param {Number} bathcNumber - Batch number
     * @returns {String} local exit root
     */
    async getUpdatedAccountsByBatch(bathcNumber) {
        return this.db.getValue(Scalar.add(Constants.DB_TOUCHED_ACCOUNTS, bathcNumber));
    }

    /**
     * Create a new instance of the ZkEVMDB
     * @param {Object} db - Mem db object
     * @param {Object} poseidon - Poseidon object
     * @param {Array[Fields]} stateRoot - state merkle root
     * @param {Array[Fields]} localExitRoot - exit merkle root
     * @param {Object} genesis - genesis block accounts (address, nonce, balance, bytecode, storage)
     * @param {Object} vm - evm if already instantiated
     * @param {Object} smt - smt if already instantiated
     * @returns {Object} ZkEVMDB object
     */
    static async newZkEVM(db, poseidon, stateRoot, localExitRoot, genesis, vm, smt) {
        const lastBatch = await db.getValue(Constants.DB_LAST_BATCH);
        // If it is null, instantiate a new evm-db
        if (lastBatch === null) {
            const newVm = new VM({ common });
            const newSmt = new SMT(db, poseidon, poseidon.F);
            let newStateRoot = stateRoot;

            // Add genesis to the vm
            // Add contracts to genesis
            for (let j = 0; j < genesis.length; j++) {
                const {
                    address, nonce, balance, bytecode, storage,
                } = genesis[j];

                // Add contract account to EVM
                const addressInstance = new Address(toBuffer(address));
                const evmAccData = {
                    nonce: new BN(nonce),
                    balance: new BN(balance),
                };
                const evmAcc = Account.fromAccountData(evmAccData);
                await newVm.stateManager.putAccount(addressInstance, evmAcc);
                newStateRoot = await setAccountState(address, newSmt, newStateRoot, evmAcc.balance, evmAcc.nonce);

                // Add bytecode and storage to EVM and SMT
                if (bytecode) {
                    await newVm.stateManager.putContractCode(addressInstance, toBuffer(bytecode));
                    const evmBytecode = await newVm.stateManager.getContractCode(addressInstance);
                    newStateRoot = await setContractBytecode(address, newSmt, newStateRoot, `0x${evmBytecode.toString('hex')}`);
                }

                if (storage) {
                    const skeys = Object.keys(storage).map((v) => toBuffer(v));
                    const svalues = Object.values(storage).map((v) => toBuffer(v));

                    for (let k = 0; k < skeys.length; k++) {
                        await newVm.stateManager.putContractStorage(addressInstance, skeys[k], svalues[k]);
                    }

                    const sto = await newVm.stateManager.dumpStorage(addressInstance);
                    const smtSto = {};

                    const keys = Object.keys(sto).map((v) => `0x${v}`);
                    const values = Object.values(sto).map((v) => `0x${v}`);
                    for (let k = 0; k < keys.length; k++) {
                        smtSto[keys[k]] = ethers.utils.RLP.decode(values[k]);
                    }
                    newStateRoot = await setContractStorage(address, newSmt, newStateRoot, smtSto);

                    const keyDumpStorage = Scalar.add(Constants.DB_ADDRESS_STORAGE, Scalar.fromString(address, 16));
                    await db.setValue(keyDumpStorage, smtSto);
                }
            }

            // Consolidate genesis in the evm
            await newVm.stateManager.checkpoint();
            await newVm.stateManager.commit();

            return new ZkEVMDB(
                db,
                0,
                newStateRoot,
                localExitRoot,
                poseidon,
                newVm,
                newSmt,
            );
        }

        // Update current zkevm instance
        const DBStateRoot = await db.getValue(Scalar.add(Constants.DB_STATE_ROOT, lastBatch));
        const DBLocalExitRoot = await db.getValue(Scalar.add(Constants.DB_LOCAL_EXIT_ROOT, lastBatch));

        return new ZkEVMDB(
            db,
            lastBatch,
            stringToH4(DBStateRoot),
            stringToH4(DBLocalExitRoot),
            poseidon,
            vm,
            smt,
        );
    }
}

module.exports = ZkEVMDB;
