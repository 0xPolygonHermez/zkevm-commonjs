/* eslint-disable max-len */
/* eslint-disable default-param-last */
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
const Processor = require('./processor');
const BlobProcessor = require('./blob-inner/blob-processor');
const BlobOuter = require('./blob-inner/blob-outer-processor');
const SMT = require('./smt');
const {
    getState, setAccountState, setContractBytecode, setContractStorage, getContractHashBytecode,
    getContractBytecodeLength,
} = require('./state-utils');
const {
    h4toString, stringToH4,
    hashContractBytecode, h4toScalar,
} = require('./smt-utils');
const { calculateSnarkInput } = require('./contract-utils');

class ZkEVMDB {
    constructor(db, lastBatch, stateRoot, localExitRoot, poseidon, vm, smt, chainID, forkID) {
        this.db = db;
        this.lastBatch = lastBatch || 0;
        this.poseidon = poseidon;
        this.F = poseidon.F;

        this.stateRoot = stateRoot || [this.F.zero, this.F.zero, this.F.zero, this.F.zero];
        this.localExitRoot = localExitRoot || [this.F.zero, this.F.zero, this.F.zero, this.F.zero];
        this.chainID = chainID;
        this.forkID = forkID;
        this.smt = smt;
        this.vm = vm;

        // blob
        this.blobRoot = [this.F.zero, this.F.zero, this.F.zero, this.F.zero];
        this.accBlobInputHash = [this.F.zero, this.F.zero, this.F.zero, this.F.zero];
        this.lastBlob = 0;
    }

    /**
     * Build Batch
     * @param {String} sequencerAddress
     * @param {String} forcedHashData
     * @param {String} oldBatchAccInputHash
     * @param {String} previousL1InfoTreeRoot
     * @param {Number} previousL1InfoTreeIndex
     * @param {Scalar} maxNTx - Maximum number of transactions (optional)
     * @param {Object} options - additional batch options
     * @param {Bool} options.skipUpdateSystemStorage - Skips updates on system smrt contract at the end of processable transactions
     * @param {Number} options.newBlockGasLimit New batch gas limit
     * @param {Object} extraData - additional data to embedded in the batch
     * @param {String} extraData.l1Info[x].globalExitRoot - global exit root
     * @param {String} extraData.l1Info[x].blockHash - l1 block hash at blockNumber - 1
     * @param {BigInt} extraData.l1Info[x].timestamp - l1 block timestamp
     * @returns {Object} batch processor
     */
    async buildBatch(
        sequencerAddress,
        forcedHashData,
        oldBatchAccInputHash,
        previousL1InfoTreeRoot,
        previousL1InfoTreeIndex,
        maxNTx = Constants.DEFAULT_MAX_TX,
        options = {},
        extraData,
    ) {
        return new Processor(
            this.db,
            this.lastBatch + 1,
            this.poseidon,
            maxNTx,
            this.stateRoot,
            sequencerAddress,
            stringToH4(oldBatchAccInputHash),
            this.chainID,
            this.forkID,
            forcedHashData,
            previousL1InfoTreeRoot,
            previousL1InfoTreeIndex,
            clone(this.vm),
            options,
            extraData,
            this.smt.maxLevel,
        );
    }

    /**
     * Consolidate a batch by writing it in the DB
     * @param {Object} processor - Processor object
     */
    async consolidate(processor) {
        if (processor.newNumBatch !== this.lastBatch + 1) {
            throw new Error('Updating the wrong batch');
        }

        if (!processor.builded) {
            await processor.executeTxs();
        }

        // Populate actual DB with the keys and values inserted in the batch
        await processor.tmpSmtDB.populateSrcDb();

        // set state root
        await this.db.setValue(
            Scalar.add(Constants.DB_STATE_ROOT, processor.newNumBatch),
            h4toString(processor.currentStateRoot),
        );

        // Set accumulate hash input
        await this.db.setValue(
            Scalar.add(Constants.DB_ACC_INPUT_HASH, processor.newNumBatch),
            h4toString(processor.newBatchAccInputHash),
        );

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
        this.batchAccInputHash = processor.newBatchAccInputHash;
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
    getCurrentBatchAccInputHash() {
        return this.batchAccInputHash;
    }

    /**
     * Get inputs from batch aggregation
     * @param {Number} initNumBatch - initial num batch
     * @param {Number} finalNumBatch - final num batch
     */
    async aggregateBatches(initNumBatch, finalNumBatch) {
        if (!(finalNumBatch >= initNumBatch)) {
            throw new Error('Final batch must be greater than or equal initial batch');
        }

        const fullAggData = {
            aggBatchData: {},
            singleBatchData: [],
        };

        // get data batches that will be aggregated
        for (let i = initNumBatch; i <= finalNumBatch; i++) {
            const keyInitInput = Scalar.add(Constants.DB_STARK_INPUT, i);
            const value = await this.db.getValue(keyInitInput);
            if (value === null) {
                throw new Error(`Batch ${i} does not exist`);
            }
            fullAggData.singleBatchData.push(value);
        }

        // verify batch aggregation
        // first batch has initial values set to 0
        if (fullAggData.singleBatchData[0].previousL1InfoTreeRoot !== Constants.ZERO_BYTES32) {
            throw new Error('First batch must have previousL1InfoTreeRoot set to 0x00...00');
        }

        if (fullAggData.singleBatchData[0].previousL1InfoTreeIndex !== 0) {
            throw new Error('First batch must have previousL1InfoTreeRoot set to 0x00...00');
        }

        if (fullAggData.singleBatchData[0].oldBatchAccInputHash !== Constants.ZERO_BYTES32) {
            throw new Error('First batch must have previousL1InfoTreeRoot set to 0x00...00');
        }

        // intermediate fullAggData.singleBatchData signals are correct
        for (let i = 0; i < fullAggData.singleBatchData.length - 1; i++) {
            const current = fullAggData.singleBatchData[i];
            const next = fullAggData.singleBatchData[i + 1];

            if (current.newStateRoot !== next.oldStateRoot) {
                throw new Error(`Batch ${i} newStateRoot must be equal to next batch oldStateRoot`);
            }

            if (current.newBatchAccInputHash !== next.oldBatchAccInputHash) {
                throw new Error(`Batch ${i} newBatchAccInputHash must be equal to next batch oldBatchAccInputHash`);
            }

            if (current.currentL1InfoTreeRoot !== next.previousL1InfoTreeRoot) {
                throw new Error(`Batch ${i} currentL1InfoTreeRoot must be equal to next batch previousL1InfoTreeRoot`);
            }

            if (current.currentL1InfoTreeIndex !== next.previousL1InfoTreeIndex) {
                throw new Error(`Batch ${i} currentL1InfoTreeIndex must be equal to next batch previousL1InfoTreeIndex`);
            }

            if (current.sequencerAddress !== next.sequencerAddress) {
                throw new Error(`Batch ${i} sequencerAddress must be equal to next batch sequencerAddress`);
            }
        }

        // add common data
        fullAggData.aggBatchData.oldBatchAccInputHash = Constants.ZERO_BYTES32;
        fullAggData.aggBatchData.previousL1InfoTreeRoot = Constants.ZERO_BYTES32;
        fullAggData.aggBatchData.previousL1InfoTreeIndex = 0;
        fullAggData.aggBatchData.chainID = this.chainID;
        fullAggData.aggBatchData.forkID = this.forkID;
        fullAggData.aggBatchData.sequencerAddress = fullAggData.singleBatchData[0].sequencerAddr;

        // get data from the first batch
        fullAggData.aggBatchData.oldStateRoot = fullAggData.singleBatchData[0].oldStateRoot;

        // get data from the last batch
        fullAggData.aggBatchData.newStateRoot = fullAggData.singleBatchData[fullAggData.singleBatchData.length - 1].newStateRoot;
        fullAggData.aggBatchData.newBatchAccInputHash = fullAggData.singleBatchData[fullAggData.singleBatchData.length - 1].newBatchAccInputHash;
        fullAggData.aggBatchData.currentL1InfoTreeRoot = fullAggData.singleBatchData[fullAggData.singleBatchData.length - 1].currentL1InfoTreeRoot;
        fullAggData.aggBatchData.currentL1InfoTreeIndex = fullAggData.singleBatchData[fullAggData.singleBatchData.length - 1].currentL1InfoTreeIndex;
        fullAggData.aggBatchData.newLocalExitRoot = fullAggData.singleBatchData[fullAggData.singleBatchData.length - 1].newLocalExitRoot;
        fullAggData.aggBatchData.newLastTimestamp = fullAggData.singleBatchData[fullAggData.singleBatchData.length - 1].newLastTimestamp;

        // hash initial and final batch to uniquely identify a batch aggregation
        // eslint-disable-next-line max-len
        const aggId = this.poseidon(
            [initNumBatch, finalNumBatch, this.F.zero, this.F.zero, this.F.zero, this.F.zero, this.F.zero, this.F.zero],
            [this.F.zero, this.F.zero, this.F.zero, this.F.zero],
        );

        // Set stark input
        await this.db.setValue(
            Scalar.add(Constants.DB_AGG_BATCHES, h4toScalar(aggId)),
            fullAggData,
        );

        return fullAggData;
    }

    /**
     * Return a new BlobProcessor with the current RollupDb state
     * @param {Number} _initNumBatch - first batch of the blobInner
     * @param {Number} _finalNumBatch - first batch of the blobInner
     * @param {String} _lastL1InfoTreeRoot - Last L1 info tree root
     * @param {Number} _lastL1InfoTreeIndex - Last L1 info tree index
     * @param {Scalar} _timestampLimit - Timestamp limit
     * @param {Scalar} _zkGasLimit - zk gas limit
     * @param {Number} _blobType - type of blob
     * @param {String} _forcedHashData - forced hash data
     * @returns
     */
    async buildBlobInner(
        _initNumBatch,
        _finalNumBatch,
        _lastL1InfoTreeRoot,
        _lastL1InfoTreeIndex,
        _timestampLimit,
        _zkGasLimit,
        _blobType,
        _forcedHashData,
    ) {
        const aggId = this.poseidon(
            [_initNumBatch, _finalNumBatch, this.F.zero, this.F.zero, this.F.zero, this.F.zero, this.F.zero, this.F.zero],
            [this.F.zero, this.F.zero, this.F.zero, this.F.zero],
        );

        // get aggregate batches inout stark
        const keyInitInput = Scalar.add(Constants.DB_AGG_BATCHES, h4toScalar(aggId));
        const fullAggData = await this.db.getValue(keyInitInput);
        if (fullAggData === null) {
            throw new Error(`Aggregation batches ${_initNumBatch}__${_finalNumBatch} does not exist`);
        }

        // build globalInputs
        const globalInputs = {
            oldBlobStateRoot: this.blobRoot,
            oldBlobAccInputHash: h4toString(this.accBlobInputHash),
            oldNumBlob: this.lastBlob,
            oldStateRoot: stringToH4(fullAggData.aggBatchData.oldStateRoot),
            forkID: this.forkID,
        };

        // build privateInputs
        const privateInputs = {
            lastL1InfoTreeIndex: _lastL1InfoTreeIndex,
            lastL1InfoTreeRoot: _lastL1InfoTreeRoot,
            timestampLimit: _timestampLimit,
            zkGasLimit: _zkGasLimit,
            blobType: _blobType,
            forcedHashData: _forcedHashData,
            sequencerAddress: fullAggData.aggBatchData.sequencerAddress,
            expectedNewStateRoot: fullAggData.aggBatchData.newStateRoot,
        };

        const blobInner = new BlobProcessor(
            this.db,
            this.poseidon,
            globalInputs,
            privateInputs,
        );

        // add batch data
        for (fullAggData.singleBatchData of fullAggData.singleBatchData) {
            await blobInner.addBatchL2Data(fullAggData.singleBatchData.batchL2Data);
        }
        await blobInner.execute();

        // save input blobInner
        await this.db.setValue(
            Scalar.add(Constants.DB_STARK_BLOB_INNER, blobInner.newNumBlob),
            blobInner.starkInput,
        );

        const blobOuter = new BlobOuter(blobInner.starkInput, fullAggData.aggBatchData);
        await blobOuter.execute();

        const blobOuterInput = blobOuter.getStarkInput();

        // consolidate blobOuter
        // save state root
        await this.db.setValue(
            Scalar.add(Constants.DB_OUTER_STATE_ROOT, blobOuterInput.newNumBlob),
            blobOuterInput.newStateRoot,
        );

        // save blob state root
        this.blobRoot = stringToH4(blobOuterInput.newBlobStateRoot);
        await this.db.setValue(
            Scalar.add(Constants.DB_BLOB_STATE_ROOT, blobOuterInput.newNumBlob),
            blobOuterInput.newBlobStateRoot,
        );

        // save blob acc input hash
        this.accBlobInputHash = stringToH4(blobOuterInput.newBlobAccInputHash);
        await this.db.setValue(
            Scalar.add(Constants.DB_BLOB_ACC_INPUT_HASH, blobOuterInput.newNumBlob),
            blobOuterInput.newBlobAccInputHash,
        );

        // save last num blob
        this.lastBlob = blobOuterInput.newNumBlob;
        await this.db.setValue(
            Constants.DB_LAST_NUM_BLOB,
            Scalar.toNumber(blobOuterInput.newNumBlob),
        );

        // save outer local exit root
        await this.db.setValue(
            Scalar.add(Constants.DB_OUTER_LOCAL_EXIT_ROOT, blobOuterInput.newNumBlob),
            blobOuterInput.newLocalExitRoot,
        );

        // save stark blob outer
        await this.db.setValue(
            Scalar.add(Constants.DB_STARK_BLOB_OUTER, blobOuterInput.newNumBlob),
            blobOuterInput,
        );

        return {
            inputBlobInner: blobInner.starkInput,
            inputBlobOuter: blobOuter.starkInput,
        };
    }

    /**
     * Aggregate multiple blob outers
     * @param {Number} initNumBlob - initial num batch
     * @param {Number} finalNumBlob - final num batch
     * @param {String} aggregatorAddress - aggregator Ethereum address
     */
    async aggregateBlobOuters(initNumBlob, finalNumBlob, aggregatorAddress) {
        const aggBlobOuter = {
            singleData: [],
            aggData: {},
        };

        for (let i = initNumBlob; i <= finalNumBlob; i++) {
            const keyInitInput = Scalar.add(Constants.DB_STARK_BLOB_OUTER, i);
            const value = await this.db.getValue(keyInitInput);
            if (value === null) {
                throw new Error(`Blob outer ${i} does not exist`);
            }

            if (i === initNumBlob) {
                aggBlobOuter.aggData.oldStateRoot = value.oldStateRoot;
                aggBlobOuter.aggData.oldBlobStateRoot = value.oldBlobStateRoot;
                aggBlobOuter.aggData.oldBlobAccInputHash = value.oldBlobAccInputHash;
                aggBlobOuter.aggData.oldNumBlob = value.oldNumBlob;
            }

            if (i === finalNumBlob) {
                aggBlobOuter.aggData.newStateRoot = value.newStateRoot;
                aggBlobOuter.aggData.newBlobStateRoot = value.newBlobStateRoot;
                aggBlobOuter.aggData.newBlobAccInputHash = value.newBlobAccInputHash;
                aggBlobOuter.aggData.newNumBlob = value.newNumBlob;
                aggBlobOuter.aggData.newLocalExitRoot = value.newLocalExitRoot;
            }

            aggBlobOuter.singleData.push(value);
        }

        aggBlobOuter.aggData.chainID = this.chainID;
        aggBlobOuter.aggData.forkID = this.forkID;
        aggBlobOuter.aggData.aggregatorAddress = aggregatorAddress;

        aggBlobOuter.aggData.inputSnark = `0x${Scalar.toString(await calculateSnarkInput(
            aggBlobOuter.aggData.oldStateRoot,
            aggBlobOuter.aggData.oldBlobStateRoot,
            aggBlobOuter.aggData.oldBlobAccInputHash,
            aggBlobOuter.aggData.oldNumBlob,
            aggBlobOuter.aggData.chainID,
            aggBlobOuter.aggData.forkID,
            aggBlobOuter.aggData.newStateRoot,
            aggBlobOuter.aggData.newBlobStateRoot,
            aggBlobOuter.aggData.newBlobAccInputHash,
            aggBlobOuter.aggData.newNumBlob,
            aggBlobOuter.aggData.newLocalExitRoot,
            aggBlobOuter.aggData.aggregatorAddress,
        ), 16).padStart(64, '0')}`;

        return aggBlobOuter;
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
     * @param {Object} genesis - genesis block accounts (address, nonce, balance, bytecode, storage)
     * @param {Object} vm - evm if already instantiated
     * @param {Object} smt - smt if already instantiated
     * @param {Number} chainID - L2 chainID
     * @param {Number} forkID - L2 rom fork identifier
     * @returns {Object} ZkEVMDB object
     */
    static async newZkEVM(db, poseidon, stateRoot, genesis, vm, smt, chainID, forkID) {
        const common = Common.custom({ chainId: chainID }, { hardfork: Hardfork.Berlin });
        common.setEIPs([3607, 3541, 3855]);
        const lastBatch = await db.getValue(Constants.DB_LAST_BATCH);
        // If it is null, instantiate a new evm-db
        if (lastBatch === null) {
            const newVm = new VM({ common });
            const newSmt = new SMT(db, poseidon, poseidon.F);
            let genesisStateRoot = stateRoot;

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
                genesisStateRoot = await setAccountState(address, newSmt, genesisStateRoot, evmAcc.balance, evmAcc.nonce);

                // Add bytecode and storage to EVM and SMT
                if (bytecode) {
                    await newVm.stateManager.putContractCode(addressInstance, toBuffer(bytecode));
                    const evmBytecode = await newVm.stateManager.getContractCode(addressInstance);
                    genesisStateRoot = await setContractBytecode(address, newSmt, genesisStateRoot, evmBytecode.toString('hex'));
                    const hashByteCode = await hashContractBytecode(bytecode);
                    db.setValue(hashByteCode, evmBytecode.toString('hex'));
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
                    genesisStateRoot = await setContractStorage(address, newSmt, genesisStateRoot, smtSto);

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
                genesisStateRoot,
                null, // localExitRoot
                poseidon,
                newVm,
                newSmt,
                chainID,
                forkID,
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
            chainID,
            forkID,
        );
    }
}

module.exports = ZkEVMDB;
