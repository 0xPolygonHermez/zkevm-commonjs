/* eslint-disable multiline-comment-style */
/* eslint-disable no-restricted-syntax */
const { Scalar } = require('ffjavascript');
const VM = require('@polygon-hermez/vm').default;
const Common = require('@polygon-hermez/common').default;
const {
    Address, Account, BN, toBuffer,
} = require('ethereumjs-util');
const { Hardfork } = require('@polygon-hermez/common');

const ethers = require('ethers');
const clone = require('lodash/clone');
const Constants = require('./constants');
const BatchProcessor = require('./batch-processor');
const BlobProcessor = require('./blob/blob-processor');
const SMT = require('./smt');
const {
    getState, setAccountState, setContractBytecode, setContractStorage, getContractHashBytecode,
    getContractBytecodeLength,
} = require('./state-utils');
const { h4toString, stringToH4, hashContractBytecode, h4toScalar } = require('./smt-utils');
const { calculateSnarkInput } = require('./contract-utils');
const { setAddressIndex } = require('./blob/address-tree-utils');
const { setDataIndex } = require('./blob/data-tree-utils');
const { setVar } = require('./blob/blob-tree-utils');

class ZkEVMDB {
    constructor(db, lastBatch, stateRoot, lastBlob, blobRoot, accBlobHash, localExitRoot, poseidon, vm, smt, chainID, forkID) {
        this.db = db;
        this.lastBatch = lastBatch || 0;
        this.lastBlob = lastBlob || 0;
        this.poseidon = poseidon;
        this.F = poseidon.F;

        this.stateRoot = stateRoot || [this.F.zero, this.F.zero, this.F.zero, this.F.zero];
        this.blobRoot = blobRoot || [this.F.zero, this.F.zero, this.F.zero, this.F.zero];
        this.accBlobHash = accBlobHash || [this.F.zero, this.F.zero, this.F.zero, this.F.zero];
        this.localExitRoot = localExitRoot || [this.F.zero, this.F.zero, this.F.zero, this.F.zero];
        this.chainID = chainID;
        this.forkID = forkID;

        this.smt = smt;
        this.vm = vm;
    }

    // COMMENTS:
    // create the blob processor
    // from the ZkEVMDB --> only blob processor could be builded (theoretically)
    // add txs to the blob processor
    // build blob processor
    // consolidate blob processor
        // once the blob is consolidated
        // batch inputs are available
        // for each batch created --> processBatch & consolidate
        // this last step could be done automatically in the code

    /**
     * Return a new Processor with the current RollupDb state
     * @param {Number} timestampLimit - Timestamp limit of the batch
     * @param {String} sequencerAddress - ethereum address represented as hex
     * @param {Array[Field]} historicGERRoot - global exit root
     * @param {Array[Field]} oldAccBatchHashData - old accumulate batch hash data
     * @param {Number} numBlob - blob number
     * @param {BigInt} zkGasLimit - zkGasLimit
     * @param {Scalar} maxNTx - Maximum number of transactions (optional)
     * @param {Object} options - additional batch options
     * @param {Bool} options.skipUpdateSystemStorage - Skips updates on system smart contract at the end of processable transactions
     * @param {Number} options.newBatchGasLimit New batch gas limit
     */
    async buildBatch(
        timestampLimit,
        sequencerAddress,
        historicGERRoot,
        oldAccBatchHashData,
        numBlob,
        zkGasLimit,
        maxNTx = Constants.DEFAULT_MAX_TX,
        options = {},
    ) {
        return new BatchProcessor(
            this.db,
            this.lastBatch,
            this.poseidon,
            maxNTx,
            this.stateRoot,
            sequencerAddress,
            oldAccBatchHashData,
            historicGERRoot,
            timestampLimit,
            this.chainID,
            this.forkID,
            numBlob,
            zkGasLimit,
            clone(this.vm),
            options,
        );
    }

    /**
     * Return a new Processor with the current RollupDb state
     * @param {Object} _blobType
     * @param {Bool} _blobType.isEIP4844Active
     * @param {Bool} _blobType.isForced
     * @param {Bool} _blobType.addL1BlockHash
     * @param {Array[Field]} _historicGERRoot - global exit root
     * @param {BigInt} _timestampLimit - Timestamp limit of the batch
     * @param {String} _sequencerAddress - ethereum address represented as hex
     * @param {BigInt} _L1BlockHash - L1BlockHash
     * @param {BigInt} _zkGasLimit - zkGasLimit
     */
    async buildBlob(
        _blobType,
        _historicGERRoot,
        _timestampLimit,
        _sequencerAddress,
        _L1BlockHash,
        _zkGasLimit,
    ) {
        // build globalInputs
        const globalInputs = {
            oldBlobRoot: this.blobRoot,
            chainId: this.chainID,
            forkId: this.forkID,
            oldAccBlobHash: this.accBlobHash,
            oldNumBlob: this.lastBlob,
        };

        // build privateInputs
        const privateInputs = {
            historicGERRoot: _historicGERRoot,
            timestampLimit: _timestampLimit,
            sequencerAddress: _sequencerAddress,
            blobType: {
                isEIP4844Active: _blobType.isEIP4844Active,
                isForced: _blobType.isForced,
                addL1BlockHash: _blobType.addL1BlockHash,
            },
            L1BlockHash: _L1BlockHash,
            zkGasLimit: _zkGasLimit,
        };

        return new BlobProcessor(
            this.db,
            this.poseidon,
            globalInputs,
            privateInputs,
        );
    }

    /**
     * Consolidate a batch by writing it in the DB
     * @param {Object} processor - Processor object
     */
    async consolidate(processor) {
        if (processor.newNumBatch !== this.lastBatch + 1) {
            // This may not be true with blobs
            throw new Error('Updating the wrong batch');
        }

        if (processor.builded === false) {
            throw new Error('Consolidating a batcb that has not been build');
        }

        // Populate actual DB with the keys and values inserted in the batch
        await processor.tmpDB.populateSrcDb();

        // set state root
        await this.db.setValue(
            Scalar.add(Constants.DB_STATE_ROOT, processor.newNumBatch),
            h4toString(processor.currentStateRoot),
        );

        // Set accumulate blob hash
        // TODO: will be replaced by the accBlobHash
        // await this.db.setValue(
        //     Scalar.add(Constants.DB_ACC_BLOB_HASH, processor.newNumBatch),
        //     h4toString(processor.newAccInputHash),
        // );

        // Set local exit root
        await this.db.setValue(
            Scalar.add(Constants.DB_LOCAL_EXIT_ROOT, processor.newNumBatch),
            h4toString(processor.newLocalExitRoot),
        );

        // Set last batch number
        await this.db.setValue(
            Constants.DB_LAST_BATCH,
            Scalar.toNumber(processor.newNumBatch),
        );

        // Set all concatenated touched address
        await this.db.setValue(
            Scalar.add(Constants.DB_TOUCHED_ACCOUNTS, processor.newNumBatch),
            processor.getUpdatedAccountsBatch(),
        );

        // Set stark input
        await this.db.setValue(
            Scalar.add(Constants.DB_STARK_INPUT, processor.newNumBatch),
            processor.starkInput,
        );

        // Update ZKEVMDB variables
        this.lastBatch = processor.newNumBatch;
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
     * Get the current local exit root
     * @returns {String} local exit root
     */
    getCurrentAccInpuHash() {
        return this.accInputHash;
    }

    /**
     * Get batchL2Data for multiples batches
     * @param {Number} initNumBatch - initial num batch
     * @param {Number} finalNumBatch - final num batch
     */
    async sequenceMultipleBatches(initNumBatch, finalNumBatch) {
        const dataBatches = [];

        for (let i = initNumBatch; i <= finalNumBatch; i++) {
            const keyInitInput = Scalar.add(Constants.DB_STARK_INPUT, i);
            const value = await this.db.getValue(keyInitInput);
            if (value === null) {
                throw new Error(`Batch ${i} does not exist`);
            }

            const dataBatch = {
                transactions: value.batchL2Data,
                globalExitRoot: value.globalExitRoot,
                timestamp: value.timestamp,
                forceBatchesTimestamp: [],
            };

            dataBatches.push(dataBatch);
        }

        return dataBatches;
    }

    /**
     * Get batchL2Data for multiples batches
     * @param {Number} initNumBatch - initial num batch
     * @param {Number} finalNumBatch - final num batch
     * @param {String} aggregatorAddress - aggregator Ethereum address
     */
    async verifyMultipleBatches(initNumBatch, finalNumBatch, aggregatorAddress) {
        const dataVerify = {};
        dataVerify.singleBatchData = [];

        for (let i = initNumBatch; i <= finalNumBatch; i++) {
            const keyInitInput = Scalar.add(Constants.DB_STARK_INPUT, i);
            const value = await this.db.getValue(keyInitInput);
            if (value === null) {
                throw new Error(`Batch ${i} does not exist`);
            }

            if (i === initNumBatch) {
                dataVerify.oldStateRoot = value.oldStateRoot;
                dataVerify.oldAccInputHash = value.oldAccInputHash;
                dataVerify.oldNumBatch = value.oldNumBatch;
            }

            if (i === finalNumBatch) {
                dataVerify.newStateRoot = value.newStateRoot;
                dataVerify.newAccInputHash = value.newAccInputHash;
                dataVerify.newLocalExitRoot = value.newLocalExitRoot;
                dataVerify.newNumBatch = value.newNumBatch;
            }

            dataVerify.singleBatchData.push(value);
        }

        dataVerify.chainID = this.chainID;
        dataVerify.forkID = this.forkID;
        dataVerify.aggregatorAddress = aggregatorAddress;

        dataVerify.inputSnark = `0x${Scalar.toString(await calculateSnarkInput(
            dataVerify.oldStateRoot,
            dataVerify.newStateRoot,
            dataVerify.newLocalExitRoot,
            dataVerify.oldAccInputHash,
            dataVerify.newAccInputHash,
            dataVerify.oldNumBatch,
            dataVerify.newNumBatch,
            dataVerify.chainID,
            dataVerify.aggregatorAddress,
            dataVerify.forkID,
        ), 16).padStart(64, '0')}`;

        return dataVerify;
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
     * @param {Array[Fields]} blobRoot - blob merkle root
     * @param {Array[Fields]} accBlobHash - accumulate blob hash
     * @param {Object} genesisState - genesis block accounts (address, nonce, balance, bytecode, storage)
     * @param {Object} genesisBlob - genesis blob (address tree, data tree, indexes)
     * @param {Object} vm - evm if already instantiated
     * @param {Object} smt - smt if already instantiated
     * @param {Number} chainID - L2 chainID
     * @param {Number} forkID - L2 rom fork identifier
     * @returns {Object} ZkEVMDB object
     */
    static async newZkEVM(db, poseidon, stateRoot, blobRoot, accBlobHash, genesisState, genesisBlob, vm, smt, chainID, forkID) {
        const common = Common.custom({ chainId: chainID }, { hardfork: Hardfork.Berlin });
        common.setEIPs([3607, 3541]);
        const lastBatch = await db.getValue(Constants.DB_LAST_BATCH);

        // If it is null, instantiate a new evm-db
        if (lastBatch === null) {
            const newVm = new VM({ common });
            const newSmt = new SMT(db, poseidon, poseidon.F);

            // Add genesis state tree
            let newStateRoot = stateRoot;

            for (let j = 0; j < genesisState.length; j++) {
                const {
                    address, nonce, balance, bytecode, storage,
                } = genesisState[j];

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
                    newStateRoot = await setContractBytecode(address, newSmt, newStateRoot, evmBytecode.toString('hex'));
                    const hashByteCode = await hashContractBytecode(bytecode);
                    await db.setValue(hashByteCode, evmBytecode.toString('hex'));
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

            // add genesis blob root
            // address tree
            let addressRoot = [poseidon.F.zero, poseidon.F.zero, poseidon.F.zero, poseidon.F.zero];
            let lastAddressIndex = 0;

            for (let j = 0; j < genesisBlob.addressTree.length; j++) {
                const { address, index } = genesisBlob.addressTree[j];

                addressRoot = await setAddressIndex(address, index, newSmt, addressRoot);
                lastAddressIndex = index;

                // shortcut in DB for compression
                const keyCompressedAddress = Scalar.add(
                    Constants.DB_COMPRESSOR_ADDRESS,
                    Scalar.fromString(address, 16),
                );
                await db.setValue(keyCompressedAddress, index);

                // shortcut in DB for decompression
                const keyCompressedIndexAddress = Scalar.add(
                    Constants.DB_COMPRESSOR_INDEX_ADDRESS,
                    Scalar.e(index),
                );
                await db.setValue(keyCompressedIndexAddress, address);
            }

            // data tree
            let dataRoot = [poseidon.F.zero, poseidon.F.zero, poseidon.F.zero, poseidon.F.zero];
            let lastDataIndex = 0;

            for (let j = 0; j < genesisBlob.dataTree.length; j++) {
                const { bytes32, index } = genesisBlob.dataTree[j];

                dataRoot = await setDataIndex(bytes32, index, newSmt, dataRoot);
                lastDataIndex = index;

                // shortcut in DB for compression
                const keyCompressedData32 = Scalar.add(
                    Constants.DB_COMPRESSOR_32_BYTES,
                    Scalar.fromString(bytes32, 16),
                );
                await db.setValue(keyCompressedData32, index);

                // shortcut in DB for decompression
                const keyCompressedIndexData32 = Scalar.add(
                    Constants.DB_COMPRESSOR_INDEX_32_BYTES,
                    Scalar.e(index),
                );
                await db.setValue(keyCompressedIndexData32, bytes32);
            }

            // build blob root
            let newBlobRoot = blobRoot;

            newBlobRoot = await setVar(Constants.SMT_KEY_BLOB_LAST_ADDRESS_INDEX, lastAddressIndex, newSmt, newBlobRoot);
            newBlobRoot = await setVar(Constants.SMT_KEY_BLOB_LAST_DATA_INDEX, lastDataIndex, newSmt, newBlobRoot);
            newBlobRoot = await setVar(Constants.SMT_KEY_BLOB_ADDRESS_ROOT, h4toScalar(addressRoot), newSmt, newBlobRoot);
            newBlobRoot = await setVar(Constants.SMT_KEY_BLOB_DATA_ROOT, h4toScalar(dataRoot), newSmt, newBlobRoot);

            return new ZkEVMDB(
                db,
                0,
                newStateRoot,
                0,
                newBlobRoot,
                accBlobHash,
                null,
                poseidon,
                newVm,
                newSmt,
                chainID,
                forkID,
            );
        }

        // Update current zkevm instance
        // blob related
        const lastBlob = await db.getValue(Constants.DB_LAST_BLOB);
        const DBBlobRoot = await db.getValue(Scalar.add(Constants.DB_BLOB_ROOT, lastBlob));
        const DBAccBlobHash = await db.getValue(Scalar.add(Constants.DB_ACC_BLOB_HASH, lastBatch));

        // batch related
        const DBStateRoot = await db.getValue(Scalar.add(Constants.DB_STATE_ROOT, lastBatch));
        const DBLocalExitRoot = await db.getValue(Scalar.add(Constants.DB_LOCAL_EXIT_ROOT, lastBatch));

        return new ZkEVMDB(
            db,
            lastBatch,
            stringToH4(DBStateRoot),
            lastBlob,
            stringToH4(DBBlobRoot),
            stringToH4(DBAccBlobHash),
            stringToH4(DBLocalExitRoot),
            poseidon,
            vm,
            smt,
            chainID,
            forkID,
        );
    }
}

module.exports = ZkEVMDB;
