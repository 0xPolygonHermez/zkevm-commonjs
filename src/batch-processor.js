/* eslint-disable no-restricted-syntax */
/* eslint-disable no-continue */
const ethers = require('ethers');
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
const { verifyMerkleProof } = require('./mt-bridge-utils');

const { calculateSnarkInput } = require('./contract-utils');
const { getEvmTx } = require('./processor-utils');
const { deserializeTx, computeNewAccBatchHashData } = require('./batch-utils');
const { getTxSignedMessage } = require('./compression/compressor-utils');
const { ENUM_TX_TYPES } = require('./compression/compressor-constants');
const { valueToHexStr } = require('./utils');

module.exports = class BatchProcessor {
    /**
     * constructor Processor class
     * @param {Object} db - database
     * @param {Number} lastNumBatch - last batch number
     * @param {Object} poseidon - hash function
     * @param {Number} maxNTx - maximum number of transaction allowed
     * @param {Array[Field]} root - state root
     * @param {String} sequencerAddress . sequencer address
     * @param {Array[Field]} oldAccBatchHashData - accumulate batch hash data
     * @param {Array[Field]} historicGERRoot - root of historic global exit root tree
     * @param {Number} timestampLimit - Maximum timestamp that the batch can have
     * @param {Number} chainID - L2 chainID
     * @param {Number} forkID - L2 rom fork identifier
     * @param {Number} numBlob - blob number
     * @param {BigInt} zkGasLimit - zkGasLimit
     * @param {Object} vm - vm instance
     * @param {Object} options - batch options
     * @param {Bool} options.skipUpdateSystemStorage Skips updates on system smart contract at the end of processable transactions
     * @param {Number} options.newBatchGasLimit New batch gas limit
     * @param {Bool} options.skipVerifyGER Skips GEr verification against the historicGERRoot
     */
    constructor(
        db,
        lastNumBatch,
        poseidon,
        maxNTx,
        root,
        sequencerAddress,
        oldAccBatchHashData,
        historicGERRoot,
        timestampLimit,
        chainID,
        forkID,
        numBlob,
        zkGasLimit,
        vm,
        options,
    ) {
        this.db = db;
        this.zkGasLimit = zkGasLimit;
        this.numBlob = numBlob;
        this.oldNumBatch = lastNumBatch;
        this.newNumBatch = lastNumBatch + 1; // TODO: check spoecial batch to just increase numBatches
        this.poseidon = poseidon;
        this.maxNTx = maxNTx;
        this.F = poseidon.F;
        this.tmpSmtDB = new TmpSmtDB(db);
        this.smt = new SMT(this.tmpSmtDB, poseidon, poseidon.F);

        this.rawTxs = [];
        this.deserializedTxs = [];
        this.builded = false;
        this.starkInput = {};
        this.contractsBytecode = {};
        this.oldStateRoot = root;
        this.currentStateRoot = root;
        this.oldAccBatchHashData = oldAccBatchHashData;
        this.historicGERRoot = historicGERRoot;

        this.batchHashData = '0x';
        this.inputHash = '0x';

        this.sequencerAddress = sequencerAddress;
        this.timestampLimit = timestampLimit;
        this.chainID = chainID;
        this.forkID = forkID;

        this.vm = vm;
        this.evmSteps = [];
        this.updatedAccounts = {};
        this.isInvalid = false;
        this.options = options;
    }

    /**
     * Add a transaction to the processor
     * Includes signature to run in the EVM-js
     * @param {Object} tx - transaction object
     *      tx.serialized - serialized transaction in hex string
     *      tx.v - signature parameter v (27 or 28)
     *      tx.r - signature parameter r
     *      tx.s - signature parameter s
     */
    addTxToBatch(tx) {
        this._isNotBuilded();
        if (this.rawTxs.length >= this.maxNTx) {
            throw new Error('addTxToBatch: Batch is already full of transactions');
        }

        this.rawTxs.push(tx);
    }

    /**
     * Execute transactions
     */
    async executeTxs() {
        this._isNotBuilded();

        // Deserialize txs
        await this._deserializeTxs();

        // Process transactions and update the state
        await this._processTxs();

        // if batch has been invalid, revert current
        if (this.isInvalid) {
            await this._rollbackBatch();
        }

        // Read Local exit root
        await this._readLocalExitRoot();

        // // check zk-counters
        // await this._setSequencerAmountBlob();

        // Calculate stark and snark input
        await this._computeStarkInput();

        this.builded = true;
    }

    /**
     * Get transaction parameters from the serialized transaction
     * Assumption on transactions that are added into the batch:
     * - intrinsic check chainID has been validated
     * - signature has been verified
     * Signature is included to be able to process the transaction in the evm engine
     * Sanity check to verify signature matches with the from is added
     */
    async _deserializeTxs() {
        if (this.deserializedTxs.length !== 0) {
            throw new Error('BatchProcessor:_deserializeTxs: deserialized txs must be empty before processing');
        }

        for (let i = 0; i < this.rawTxs.length; i++) {
            const rawTx = this.rawTxs[i];

            // deserialize transaction parameters
            const txParams = deserializeTx(rawTx.serialized);

            // changeL2Block Transaction does not require further deserialization
            if (txParams.type === ENUM_TX_TYPES.CHANGE_L2_BLOCK) {
                this.deserializedTxs.push(txParams);
                continue;
            }

            // set chainId if tx is not preEIP155
            if (txParams.type !== ENUM_TX_TYPES.PRE_EIP_155) {
                txParams.chainId = this.chainID;
            }

            const txMessageToSign = getTxSignedMessage(txParams);

            // sanity check signature
            const digest = ethers.utils.keccak256(txMessageToSign);

            try {
                const from = ethers.utils.recoverAddress(digest, {
                    r: rawTx.r,
                    s: rawTx.s,
                    v: rawTx.v,
                });

                if (from.toLowerCase() !== txParams.from) {
                    throw new Error('BatchProcessor:_deserializeTxs:: sanity check signature failed --> from mismatch');
                }
            } catch (error) {
                throw new Error(`BatchProcessor:_deserializeTxs:: sanity check signature failed --> ${error}`);
            }

            const finalTx = {
                v: rawTx.v,
                r: rawTx.r,
                s: rawTx.s,
                ...txParams,
            };

            this.deserializedTxs.push(finalTx);
        }
    }

    async _processTxs() {
        for (let i = 0; i < this.deserializedTxs.length; i++) {
            const tx = this.deserializedTxs[i];

            // First transaction must be a ChangeL2BlockTx. Otherwise, invalid batch
            // This will be ensured by the blob
            if (i === 0 && tx.type !== ENUM_TX_TYPES.CHANGE_L2_BLOCK) {
                this.isInvalid = true;

                return;
            }

            if (tx.type === ENUM_TX_TYPES.CHANGE_L2_BLOCK) {
                // Final function call that saves internal DB storage keys
                const err = await this._processChangeL2BlockTx(tx);
                if (err) {
                    this.isInvalid = true;

                    return;
                }
            } else {
                await this._processEVMTx(tx);
            }
        }
    }

    async _processChangeL2BlockTx(tx) {
        const currentTimestamp = await this._getTimestamp();
        // Verify valid deltaTimestamp
        if (Scalar.eq(tx.deltaTimestamp, 0)) {
            return true;
        }

        // Verify deltaTimestamp + currentTimestamp =< limitTimestamp
        if (Scalar.gt(Scalar.add(currentTimestamp, tx.deltaTimestamp), this.timestampLimit)) {
            return true;
        }

        // Verify newGER | indexHistoricalGERTree belong to historicGERRoot
        if (!this.options.skipVerifyGER) {
            if (typeof tx.smtProof === 'undefined') {
                throw new Error('BatchProcessor:_processChangeL2BlockTx:: missing smtProof parameter in changeL2Block tx');
            }

            if (verifyMerkleProof(tx.newGER, tx.smtProof, tx.indexHistoricalGERTree, this.historicGERRoot)) {
                return true;
            }
        }

        // set new timestamp
        const newTimestamp = Scalar.add(currentTimestamp, tx.deltaTimestamp);
        this._setTimestamp(newTimestamp);

        // set new GER
        this._setGlobalExitRoot(tx.newGER, newTimestamp);

        // read block number, increase it by 1 and write it
        // write new blockchash
        this._updateSystemStorage();

        return false;
    }

    /**
     * Read the timestamp, which is a variable stored in the system smart contract
     */
    async _getTimestamp() {
        const res = await stateUtils.getContractStorage(
            Constants.ADDRESS_SYSTEM,
            this.smt,
            this.currentStateRoot,
            [Constants.TIMESTAMP_STORAGE_POS],
        );

        return res[Constants.TIMESTAMP_STORAGE_POS];
    }

    /**
     * Write timestamp in the system smart contract
     * @param {BigInt} - timestamp
     */
    async _setTimestamp(timestamp) {
        // Update smt with the new timestamp
        this.currentStateRoot = await stateUtils.setContractStorage(
            Constants.ADDRESS_SYSTEM,
            this.smt,
            this.currentStateRoot,
            { [Constants.TIMESTAMP_STORAGE_POS]: timestamp },
        );

        // Update the vm with the new timestamp
        const addressInstance = new Address(toBuffer(Constants.ADDRESS_SYSTEM));

        await this.vm.stateManager.putContractStorage(
            addressInstance,
            toBuffer(`0x${Constants.TIMESTAMP_STORAGE_POS.toString(16).padStart(64, '0')}`),
            toBuffer(valueToHexStr(timestamp, true)),
        );
    }

    /**
     * Set the global exit root in the globalExitRootManagerL2 for both vm and SMT
     * - Not store global exit root if it is zero
     * - Not overwrite storage position if timestamp is already set
     * This will be performed before process the transactions
     * @param {Scalar} globalExitRoot - new GER
     * @param {Scalar} timestamp - timestamp
     */
    async _setGlobalExitRoot(globalExitRoot, timestamp) {
        // return if globalExitRoot is 0
        if (Scalar.eq(globalExitRoot, Scalar.e(0))) {
            return;
        }

        // check if timestamp is already set
        const globalExitRootPos = ethers.utils.solidityKeccak256(['uint256', 'uint256'], [globalExitRoot, Constants.GLOBAL_EXIT_ROOT_STORAGE_POS]);
        const globalExitRootPosScalar = Scalar.e(globalExitRootPos).toString();

        const resTimestamp = await stateUtils.getContractStorage(
            Constants.ADDRESS_GLOBAL_EXIT_ROOT_MANAGER_L2,
            this.smt,
            this.currentStateRoot,
            [globalExitRootPos],
        );

        if (Scalar.neq(resTimestamp[globalExitRootPosScalar], Scalar.e(0))) {
            return;
        }

        // Set globalExitRoot - timestamp
        const newStorageEntry = {};
        newStorageEntry[globalExitRootPos] = timestamp;

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
            toBuffer(valueToHexStr(timestamp, true)),
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
     * Updates system storage with:
     * - increase block number
     * - new state root after finishing transaction
     */
    async _updateSystemStorage() {
        if (this.options.skipUpdateSystemStorage) return;

        // Get last block number and increse it by 1
        const lastBlockNumber = await stateUtils.getContractStorage(
            Constants.ADDRESS_SYSTEM,
            this.smt,
            this.currentStateRoot,
            [Constants.LAST_TX_STORAGE_POS], // Storage key of last tx count
        );

        const newBlockNumber = Number(Scalar.add(lastBlockNumber[Constants.LAST_TX_STORAGE_POS], 1n));

        // Update zkEVM smt with the new block number
        this.currentStateRoot = await stateUtils.setContractStorage(
            Constants.ADDRESS_SYSTEM,
            this.smt,
            this.currentStateRoot,
            { [Constants.LAST_TX_STORAGE_POS]: newBlockNumber },
        );

        // Update VM with the new block number
        const addressInstance = new Address(toBuffer(Constants.ADDRESS_SYSTEM));

        await this.vm.stateManager.putContractStorage(
            addressInstance,
            toBuffer(`0x${Constants.LAST_TX_STORAGE_POS.toString(16).padStart(64, '0')}`),
            toBuffer(Number(newBlockNumber)),
        );

        // Update smt with new state root
        const stateRootPos = ethers.utils.solidityKeccak256(['uint256', 'uint256'], [newBlockNumber, Constants.STATE_ROOT_STORAGE_POS]);
        const tmpStateRoot = smtUtils.h4toString(this.currentStateRoot);
        this.currentStateRoot = await stateUtils.setContractStorage(
            Constants.ADDRESS_SYSTEM,
            this.smt,
            this.currentStateRoot,
            { [stateRootPos]: smtUtils.h4toString(this.currentStateRoot) },
        );

        // Update vm with new state root
        await this.vm.stateManager.putContractStorage(
            addressInstance,
            toBuffer(stateRootPos),
            toBuffer(tmpStateRoot),
        );

        // store data in internal DB
        const keyDumpStorage = Scalar.add(Constants.DB_ADDRESS_STORAGE, Scalar.fromString(Constants.ADDRESS_SYSTEM, 16));

        // add address to updatedAccounts
        const account = await this.vm.stateManager.getAccount(addressInstance);
        this.updatedAccounts[Constants.ADDRESS_SYSTEM.toLowerCase()] = account;

        // update its storage
        const sto = await this.vm.stateManager.dumpStorage(addressInstance);
        const storage = {};
        const keys = Object.keys(sto).map((k) => `0x${k}`);
        const values = Object.values(sto).map((k) => `0x${k}`);
        for (let k = 0; k < keys.length; k++) {
            storage[keys[k]] = ethers.utils.RLP.decode(values[k]);
        }
        await this.db.setValue(keyDumpStorage, storage);
    }

    /**
     * Process the decoded transactions deserializedTxs
     * Also this function will perform several checks and can mark a transactions as invalid
     * This funcion will check to following intrinsic checks:
     * - VALID NONCE
     * - ENOUGH UPFRONT TX COST
     * Process transaction will perform the following operations
     * - from: increase nonce
     * - from: substract total tx cost
     * - from: refund unused gas
     * - to: increase balance
     * - update state
     * finally pay all the fees to the sequencer address
     */
    async _processEVMTx(currentTx) {
        // Get from state
        const oldStateFrom = await stateUtils.getState(currentTx.from, this.smt, this.currentStateRoot);

        // intrinsic check: nonce
        if (Number(oldStateFrom.nonce) !== Number(currentTx.nonce)) {
            currentTx.isInvalid = true;
            currentTx.reason = 'TX INVALID: Invalid nonce';

            return;
        }

        // intrinsic check: upfront cost
        const gasLimitCost = Scalar.mul(Scalar.e(currentTx.gasLimit), Scalar.e(currentTx.gasPrice));
        const upfronTxCost = Scalar.add(gasLimitCost, Scalar.e(currentTx.value));

        if (Scalar.gt(upfronTxCost, Scalar.e(oldStateFrom.balance))) {
            currentTx.isInvalid = true;
            currentTx.reason = 'TX INVALID: Not enough funds to pay total transaction cost';

            return;
        }

        const bytecodeLength = await stateUtils.getContractBytecodeLength(currentTx.from, this.smt, this.currentStateRoot);
        if (bytecodeLength > 0) {
            currentTx.isInvalid = true;
            currentTx.reason = 'TX INVALID: EIP3607 Do not allow transactions for which tx.sender has any code deployed';

            return;
        }

        // Run tx in the EVM
        const evmTx = getEvmTx(currentTx);

        // Build block information
        const blockData = {};
        blockData.header = {};
        blockData.header.timestamp = new BN(Scalar.e(this.timestampLimit));
        blockData.header.coinbase = new Address(toBuffer(this.sequencerAddress));
        blockData.header.gasLimit = this.options.newBatchGasLimit
            ? new BN(Scalar.e(this.options.newBatchGasLimit)) : new BN(Scalar.e(Constants.BATCH_GAS_LIMIT));
        blockData.header.difficulty = new BN(Scalar.e(Constants.BATCH_DIFFICULTY));

        const evmBlock = Block.fromBlockData(blockData, { common: evmTx.common });
        try {
            const txResult = await this.vm.runTx({ tx: evmTx, block: evmBlock });
            this.evmSteps.push(txResult.execResult.evmSteps);

            currentTx.receipt = txResult.receipt;
            currentTx.createdAddress = txResult.createdAddress;

            // Check transaction completed
            if (txResult.execResult.exceptionError) {
                currentTx.isInvalid = true;
                if (txResult.execResult.returnValue.toString()) {
                    const abiCoder = ethers.utils.defaultAbiCoder;
                    const revertReasonHex = `0x${txResult.execResult.returnValue.toString('hex').slice(8)}`;
                    try {
                        [currentTx.reason] = abiCoder.decode(['string'], revertReasonHex);
                    } catch (e) {
                        currentTx.reason = txResult.execResult.exceptionError;
                    }
                } else currentTx.reason = txResult.execResult.exceptionError;

                // UPDATE sender account adding the nonce and substracting the gas spended
                const senderAcc = await this.vm.stateManager.getAccount(Address.fromString(currentTx.from));
                this.updatedAccounts[currentTx.from] = senderAcc;
                // Update smt with touched accounts
                this.currentStateRoot = await stateUtils.setAccountState(
                    currentTx.from,
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

                return;
            }
        } catch (e) {
            // If base fee exceeds the gas limit, it is an instrisic error and the state will not be affected
            if (e.toString().includes('base fee exceeds gas limit')) {
                return;
            }
            throw Error(e);
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
                // Set bytecode at db when smart contract is called
                const hashedBytecode = await smtUtils.hashContractBytecode(smCode.toString('hex'));
                this.db.setValue(hashedBytecode, smCode.toString('hex'));
                this.contractsBytecode[hashedBytecode] = smCode.toString('hex');

                const keyDumpStorage = Scalar.add(Constants.DB_ADDRESS_STORAGE, Scalar.fromString(address, 16));
                const oldSto = await this.db.getValue(keyDumpStorage);
                const sto = await this.vm.stateManager.dumpStorage(addressInstance);

                const storage = {};
                const keys = Object.keys(sto).map((k) => `0x${k}`);
                const values = Object.values(sto).map((k) => `0x${k}`);
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
            } else {
                const sto = await this.vm.stateManager.dumpStorage(addressInstance);
                if (Object.keys(sto).length > 0) {
                    const keyDumpStorage = Scalar.add(Constants.DB_ADDRESS_STORAGE, Scalar.fromString(address, 16));
                    const storage = {};
                    const keys = Object.keys(sto).map((k) => `0x${k}`);
                    const values = Object.values(sto).map((k) => `0x${k}`);
                    for (let k = 0; k < keys.length; k++) {
                        storage[keys[k]] = ethers.utils.RLP.decode(values[k]);
                    }
                    this.currentStateRoot = await stateUtils.setContractStorage(
                        address,
                        this.smt,
                        this.currentStateRoot,
                        storage,
                    );
                    await this.db.setValue(keyDumpStorage, storage);
                }
            }
        }

        // Clear touched accounts
        this.vm.stateManager._customTouched.clear();
    }

    /**
     * Read the local exit root, which is a variable stored in some specific storage slot of the globalExitRootManagerL2 address
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

    async _rollbackBatch() {
        this.currentStateRoot = this.oldStateRoot;
        this.updatedAccounts = {};
    }

    /**
     * Compute stark input
     */
    async _computeStarkInput() {
        this.newAccBatchHashData = await computeNewAccBatchHashData(
            this.oldAccBatchHashData,
            this.getBatchData(),
        );

        this.starkInput = {
            // inputs
            oldStateRoot: smtUtils.h4toString(this.oldStateRoot),
            oldNumBatch: this.oldNumBatch, // TODO: May be removed from here
            chainID: this.chainID,
            forkID: this.forkID,
            oldAccBatchHashData: this.oldAccBatchHashData,
            batchData: this.getBatchData(),
            // outputs
            newAccBatchHashData: this.newAccBatchHashData,
            newStateRoot: smtUtils.h4toString(this.currentStateRoot),
            newNumBatch: this.newNumBatch, // TODO: May be removed from here
            newLocalExitRoot: smtUtils.h4toString(this.newLocalExitRoot),
            // TODO: subject to change. Probably loaded through the batchData as a header
            sequencerAddress: this.sequencerAddress,
            timestampLimit: this.timestampLimit.toString(),
            historicGERRoot: smtUtils.h4toString(this.historicGERRoot),
            contractsBytecode: this.contractsBytecode,
            db: await smtUtils.getCurrentDB(this.oldStateRoot, this.db, this.F),
        };
    }

    // TODO: needs to be re-implemented once the blob is finished
    /**
     * Compute snark input
     * @param {String} aggregatorAddress - aggregator ethereum address
     * @returns {String} Snark input
     */
    _computeSnarkInput(aggregatorAddress) {
        // compute circuit inputs
        const oldStateRoot = smtUtils.h4toString(this.oldStateRoot);
        const newStateRoot = smtUtils.h4toString(this.currentStateRoot);
        const oldAccInputHash = smtUtils.h4toString(this.oldAccInputHash);
        const newAccInputHash = smtUtils.h4toString(this.newAccInputHash);
        const newLocalExitRoot = smtUtils.h4toString(this.newLocalExitRoot);

        return calculateSnarkInput(
            oldStateRoot,
            newStateRoot,
            oldAccInputHash,
            newAccInputHash,
            newLocalExitRoot,
            this.oldNumBatch,
            this.newNumBatch,
            this.chainID,
            this.forkID,
            aggregatorAddress,
        );
    }

    /**
     * Return all the transactions serialized data concatenated
     */
    getBatchData() {
        // build header
        const historicGERRootStr = smtUtils.h4toString(this.historicGERRoot);
        const timestampLimitStr = valueToHexStr(this.timestampLimit).padStart('0', 8 * 2);
        const sequencerAddrStr = this.sequencerAddress.startsWith('0x') ? this.sequencerAddress.slice(2) : this.sequencerAddress;
        const zkGasLimitStr = valueToHexStr(this.zkGasLimit).padStart('0', 8 * 2);
        const numBlobStr = valueToHexStr(this.numBlob).padStart('0', 8 * 2);

        // concatenate serialize transactions
        const txsConcat = this.rawTxs.reduce((accumulator, currentValue) => accumulator + currentValue.serialized.slice(2), '');

        return `${historicGERRootStr}${timestampLimitStr}${sequencerAddrStr}${zkGasLimitStr}${numBlobStr}${txsConcat}`;
    }

    /**
     * Return stark input
     */
    getStarkInput() {
        this._isBuilded();

        return this.starkInput;
    }

    // TODO: needs to be re-implemented once the blob is finished
    /**
     * Return snark input
     * @param {String} aggregatorAddress - aggregator Ethereum address
     */
    getSnarkInput(aggregatorAddress) {
        this._isBuilded();

        return this._computeSnarkInput(aggregatorAddress);
    }

    /**
     * Throw error if batch is already builded
     */
    _isNotBuilded() {
        if (this.builded) {
            throw new Error('BatchProcessor:_isBuilded: already builded');
        }
    }

    /**
     * Throw error if batch is already builded
     */
    _isBuilded() {
        if (!this.builded) {
            throw new Error('BatchProcessor:_isBuilded: must first be builded');
        }
    }

    /**
     * Return the decoded transactions, whether the transactions is valid or not and the reason if any
     * @return {Array[Object]} Batch deserialized transactions
     */
    async getDeserializedTxs() {
        this._isBuilded();

        return this.deserializedTxs;
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
