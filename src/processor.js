/* eslint-disable multiline-comment-style */
/* eslint-disable max-len */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-continue */
const ethers = require('ethers');
const { Transaction } = require('@ethereumjs/tx');
const { Block } = require('@ethereumjs/block');
const {
    Address, BN, toBuffer, bufferToInt,
} = require('ethereumjs-util');

const { Scalar } = require('ffjavascript');
const SMT = require('./smt');
const TmpSmtDB = require('./tmp-smt-db');
const Constants = require('./constants');
const stateUtils = require('./state-utils');
const smtUtils = require('./smt-utils');

const { getCurrentDB } = require('./smt-utils');
const { calculateAccInputHash, calculateSnarkInput, calculateBatchHashData } = require('./contract-utils');
const {
    decodeCustomRawTxProverMethod, computeEffectiveGasPrice, computeL2TxHash,
    decodeChangeL2BlockTx,
} = require('./processor-utils');
const { valueToHexStr, getFuncName } = require('./utils');
const {
    initBlockHeader, setBlockGasUsed, setTxStatus, setTxHash, setCumulativeGasUsed, setTxLog, setEffectivePercentage,
} = require('./block-utils');
const { verifyMerkleProof } = require('./mt-bridge-utils');
const { getL1InfoTreeValue } = require('./l1-info-tree-utils');

module.exports = class Processor {
    /**
     * constructor Processor class
     * @param {Object} db - database
     * @param {Number} numBatch - batch number
     * @param {Object} poseidon - hash function
     * @param {Number} maxNTx - maximum number of transaction allowed
     * @param {Array[Field]} root - state root
     * @param {String} sequencerAddress . sequencer address
     * @param {Array[Field]} accInputHash - accumulate input hash
     * @param {Array[Field]} l1InfoRoot - l1 info root
     * @param {Number} timestampLimit - timestampLimit of the batch
     * @param {Number} chainID - L2 chainID
     * @param {Number} forkID - L2 rom fork identifier
     * @param {String} forcedBlockHashL1 - blockhash L1 in forced batches
     * @param {Object} vm - vm instance
     * @param {Object} options - batch options
     * @param {Bool} options.skipUpdateSystemStorage Skips updates on system smrt contract at the end of processable transactions
     * @param {Bool} options.skipVerifyL1InfoRoot Skips verification smt proof against the L1InfoRoot
     * @param {Number} options.newBlockGasLimit New batch gas limit
     * @param {Bool} options.skipFirstChangeL2Block Skips verification that first transaction must be a ChangeL2BlockTx
     * @param {Bool} options.skipWriteBlockInfoRoot Skips writing blockL2Info root on L2
     * @param {Object} extraData - additional data embedded in the batch
     * @param {Array[Object]} extraData.l1Info - L1Info - object with the following [key - value] ==> [indexL1InfoTree - L1InfoLeaf]
     * @param {String} extraData.l1Info[x].globalExitRoot - global exit root
     * @param {String} extraData.l1Info[x].blockHash - l1 block hash at blockNumber - 1
     * @param {BigInt} extraData.l1Info[x].timestamp - l1 block timestamp at blockNumber
     */
    constructor(
        db,
        numBatch,
        poseidon,
        maxNTx,
        root,
        sequencerAddress,
        accInputHash,
        l1InfoRoot,
        timestampLimit,
        chainID,
        forkID,
        forcedBlockHashL1,
        vm,
        options,
        extraData,
    ) {
        this.db = db;
        this.newNumBatch = numBatch;
        this.oldNumBatch = numBatch - 1;
        this.poseidon = poseidon;
        this.maxNTx = maxNTx;
        this.F = poseidon.F;
        this.tmpSmtDB = new TmpSmtDB(db);
        this.smt = new SMT(this.tmpSmtDB, poseidon, poseidon.F);

        this.rawTxs = [];
        this.decodedTxs = [];
        this.builded = false;
        this.starkInput = {};
        this.contractsBytecode = {};
        this.oldStateRoot = root;
        this.previousBlockHash = root;
        this.currentStateRoot = root;
        this.oldAccInputHash = accInputHash;
        this.l1InfoRoot = l1InfoRoot;

        this.batchHashData = '0x';
        this.inputHash = '0x';

        this.sequencerAddress = sequencerAddress;
        this.timestampLimit = timestampLimit;
        this.chainID = chainID;
        this.forkID = forkID;
        this.forcedBlockHashL1 = (typeof forcedBlockHashL1 === 'undefined') ? Constants.ZERO_BYTES32 : forcedBlockHashL1;
        this.isForced = Scalar.neq(0, this.forcedBlockHashL1);
        this.l1InfoTree = {};

        this.vm = vm;
        this.evmSteps = [];
        this.updatedAccounts = {};
        this.isLegacyTx = false;
        this.isInvalid = false;
        this.options = options;
        this.extraData = extraData;
        this.cumulativeGasUsed = 0;
        this.txIndex = 0;
        this.logIndex = 0;
        this.blockInfoRoot = [this.F.zero, this.F.zero, this.F.zero, this.F.zero];
    }

    /**
     * Add a raw transaction to the processor
     * @param {String} rawTx - RLP encoded transaction with signature
     */
    addRawTx(rawTx) {
        this._isNotBuilded();
        if (this.rawTxs.length >= this.maxNTx) {
            throw new Error(`${getFuncName()}: Batch is already full of transactions`);
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

        // Process transactions and update the state if RLP decoding has not been invalid
        if (!this.isInvalid) {
            await this._processTx();
        }

        // if batch has been invalid, revert current state root
        if (this.isInvalid) {
            this._rollbackBatch();
        }

        // Read Local exit root
        await this._readLocalExitRoot();

        // Calculate stark and snark input
        await this._computeStarkInput();

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
            throw new Error(`${getFuncName()}: Transactions array should be empty`);
        }

        // Checks transactions:
        for (let i = 0; i < this.rawTxs.length; i++) {
            const rawTx = this.rawTxs[i];

            // Decode raw transaction using prover method
            let txDecoded;
            let rlpSignData;

            // check is changeL2Block transaction
            if (rawTx.startsWith(`0x${Constants.TX_CHANGE_L2_BLOCK.toString(16).padStart(2, '0')}`)) {
                txDecoded = await decodeChangeL2BlockTx(rawTx);
                this.decodedTxs.push({ isInvalid: false, reason: '', tx: txDecoded });
                continue;
            }

            try {
                const decodedObject = decodeCustomRawTxProverMethod(rawTx);
                txDecoded = decodedObject.txDecoded;
                rlpSignData = decodedObject.rlpSignData;
            } catch (error) {
                this.decodedTxs.push({ isInvalid: true, reason: 'TX INVALID: Failed to RLP decode signing data', tx: txDecoded });
                this.isInvalid = true;
                continue;
            }
            txDecoded.from = undefined;

            // B: Valid chainID if EIP-155
            this.isLegacyTx = typeof txDecoded.chainID === 'undefined';
            txDecoded.chainID = this.isLegacyTx ? txDecoded.chainID : Number(txDecoded.chainID);
            if (!this.isLegacyTx && txDecoded.chainID !== this.chainID) {
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
     * Set the global exit root in a specific storage slot of the globalExitRootManagerL2 for both vm and SMT
     * This will be performed before process the transactions
     * @param {String} globalExitRoot - global exit root
     * @param {String} blockhash - block hash
     */
    async _setGlobalExitRoot(globalExitRoot, blockhash) {
        // compute globalExitRootPos storage position
        const globalExitRootPos = ethers.utils.solidityKeccak256(['uint256', 'uint256'], [globalExitRoot, Constants.GLOBAL_EXIT_ROOT_STORAGE_POS]);

        // Set globalExitRoot - blockchash
        const newStorageEntry = {};
        newStorageEntry[globalExitRootPos] = blockhash;

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
            toBuffer(blockhash),
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
     * Checks if GER is != 0 and if it does not exist in the global exit root manager
     * @param {String} globalExitRoot - global exit root
     * @returns {Bool} - flag indicating if l1Info needs to be writen
     */
    async _shouldWriteL1Info(globalExitRoot) {
        // return if globalExitRoot is 0
        if (Scalar.eq(globalExitRoot, Scalar.e(0))) {
            return false;
        }

        // check if blockchash is already set
        const globalExitRootPos = ethers.utils.solidityKeccak256(['uint256', 'uint256'], [globalExitRoot, Constants.GLOBAL_EXIT_ROOT_STORAGE_POS]);
        const globalExitRootPosScalar = Scalar.e(globalExitRootPos).toString();

        const resBlockhash = await stateUtils.getContractStorage(
            Constants.ADDRESS_GLOBAL_EXIT_ROOT_MANAGER_L2,
            this.smt,
            this.currentStateRoot,
            [globalExitRootPos],
        );

        if (Scalar.neq(resBlockhash[globalExitRootPosScalar], Scalar.e(0))) {
            return false;
        }

        return true;
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

            // skip verification first tx is a changeL2Block
            if (this.options.skipFirstChangeL2Block !== true) {
                // First transaction must be a ChangeL2BlockTx if the batch is not a forced one. Otherwise, invalid batch
                // This will be ensured by the blob
                if (i === 0 && currentDecodedTx.tx.type !== Constants.TX_CHANGE_L2_BLOCK && !this.isForced) {
                    this.isInvalid = true;

                    return;
                }
            }

            // If it is a forced batch, we create a changeL2Block at the beginning
            if (i === 0 && this.isForced) {
                const err = await this._processChangeL2BlockTx(currentDecodedTx.tx);
                if (err) {
                    this.isInvalid = true;

                    return;
                }
            }
            if (currentDecodedTx.isInvalid) {
                continue;
            } else {
                const currentTx = currentDecodedTx.tx;
                if (currentTx.type === Constants.TX_CHANGE_L2_BLOCK) {
                    // If it is forced batch, invalidate
                    if (this.isForced) {
                        this.isInvalid = true;

                        return;
                    }
                    // Final function call that saves internal DB storage keys
                    const err = await this._processChangeL2BlockTx(currentTx);
                    if (err) {
                        this.isInvalid = true;

                        return;
                    }
                    // If next tx is a changeL2 block tx, we must consolidate current block
                    if (this.decodedTxs[i + 1] && this.decodedTxs[i + 1].tx.type === Constants.TX_CHANGE_L2_BLOCK) {
                        await this.consolidateBlock();
                    }
                    continue;
                }
                // Get from state
                const oldStateFrom = await stateUtils.getState(currentTx.from, this.smt, this.currentStateRoot);

                // A: VALID NONCE
                if (Number(oldStateFrom.nonce) !== Number(currentTx.nonce)) {
                    currentDecodedTx.isInvalid = true;
                    currentDecodedTx.reason = 'TX INVALID: Invalid nonce';
                    continue;
                }

                // B: ENOUGH UPFRONT TX COST
                const effectiveGasPrice = computeEffectiveGasPrice(currentTx.gasPrice, currentTx.effectivePercentage);
                const gasLimitCost = Scalar.mul(Scalar.e(currentTx.gasLimit), effectiveGasPrice);
                const upfronTxCost = Scalar.add(gasLimitCost, Scalar.e(currentTx.value));

                if (Scalar.gt(upfronTxCost, Scalar.e(oldStateFrom.balance))) {
                    currentDecodedTx.isInvalid = true;
                    currentDecodedTx.reason = 'TX INVALID: Not enough funds to pay total transaction cost';
                    continue;
                }
                const v = this.isLegacyTx ? currentTx.v : Number(currentTx.v) - 27 + currentTx.chainID * 2 + 35;

                const bytecodeLength = await stateUtils.getContractBytecodeLength(currentTx.from, this.smt, this.currentStateRoot);
                if (bytecodeLength > 0) {
                    currentDecodedTx.isInvalid = true;
                    currentDecodedTx.reason = 'TX INVALID: EIP3607 Do not allow transactions for which tx.sender has any code deployed';
                    continue;
                }

                // Check TX_GAS_LIMIT
                const gasLimitTx = (typeof this.options.newBlockGasLimit === 'undefined')
                    ? Constants.TX_GAS_LIMIT
                    : this.options.newBlockGasLimit;

                if (Scalar.gt(currentTx.gasLimit, Scalar.e(gasLimitTx))) {
                    currentDecodedTx.isInvalid = true;
                    currentDecodedTx.reason = 'TX INVALID: Gas limit exceeds maximum allowed';
                    continue;
                }

                // Run tx in the EVM
                const evmTx = Transaction.fromTxData({
                    nonce: currentTx.nonce,
                    gasPrice: currentTx.gasPrice,
                    gasLimit: currentTx.gasLimit,
                    to: currentTx.to,
                    value: currentTx.value,
                    data: currentTx.data,
                    v,
                    r: currentTx.r,
                    s: currentTx.s,
                });

                // Build block information
                const blockData = {};
                blockData.header = {};
                blockData.header.timestamp = new BN(Scalar.e(await this._getTimestamp()));
                blockData.header.coinbase = new Address(toBuffer(this.sequencerAddress));
                blockData.header.gasLimit = this.options.newBlockGasLimit
                    ? new BN(Scalar.e(this.options.newBlockGasLimit)) : new BN(Scalar.e(Constants.BLOCK_GAS_LIMIT));
                blockData.header.difficulty = new BN(Scalar.e(Constants.BATCH_DIFFICULTY));

                const evmBlock = Block.fromBlockData(blockData, { common: evmTx.common });
                try {
                    const txResult = await this.vm.runTx({ tx: evmTx, block: evmBlock, effectivePercentage: currentTx.effectivePercentage });
                    this.evmSteps.push(txResult.execResult.evmSteps);

                    currentDecodedTx.receipt = txResult.receipt;
                    currentDecodedTx.createdAddress = txResult.createdAddress;
                    // Increment block gas used
                    this.cumulativeGasUsed += bufferToInt(txResult.receipt.gasUsed);
                    // Fill block info tree with tx receipt
                    const txHash = await computeL2TxHash(currentTx);
                    await this.fillReceiptTree(txResult.receipt, txHash, currentTx.effectivePercentage);
                    this.txIndex += 1;

                    // Check transaction completed
                    if (txResult.execResult.exceptionError) {
                        currentDecodedTx.isInvalid = true;
                        if (txResult.execResult.returnValue.toString()) {
                            const abiCoder = ethers.utils.defaultAbiCoder;
                            const revertReasonHex = `0x${txResult.execResult.returnValue.toString('hex').slice(8)}`;
                            try {
                                [currentDecodedTx.reason] = abiCoder.decode(['string'], revertReasonHex);
                            } catch (e) {
                                currentDecodedTx.reason = txResult.execResult.exceptionError;
                            }
                        } else currentDecodedTx.reason = txResult.execResult.exceptionError;

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

                        continue;
                    }
                } catch (e) {
                    // If base fee exceeds the gas limit, it is an instrisic error and the state will not be affected
                    if (e.toString().includes('base fee exceeds gas limit')) {
                        continue;
                    } else {
                        throw Error(e);
                    }
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
                // If next tx is a changeL2 block tx, we must consolidate current block
                if (this.decodedTxs[i + 1] && this.decodedTxs[i + 1].tx.type === Constants.TX_CHANGE_L2_BLOCK) {
                    await this.consolidateBlock();
                }
            }
        }

        await this.consolidateBlock();
    }

    // Write values at storage at the end of block processing
    async consolidateBlock() {
        // Set block gasUsed at block header on finished processing all txs
        this.blockInfoRoot = await setBlockGasUsed(this.smt, this.blockInfoRoot, this.cumulativeGasUsed);

        // set blockInfoRoot to write to 0 in order to avoid a SR change
        if (this.options.skipWriteBlockInfoRoot === true) {
            this.blockInfoRoot = [this.F.zero, this.F.zero, this.F.zero, this.F.zero];
        }

        // Set blockInfoRoot on storage
        // Current state root will be the block hash, stored in SC at the begginning of next block
        this.currentStateRoot = await stateUtils.setContractStorage(
            Constants.ADDRESS_SYSTEM,
            this.smt,
            this.currentStateRoot,
            { [Constants.BLOCK_INFO_ROOT_STORAGE_POS]: smtUtils.h4toString(this.blockInfoRoot) },
        );
        const addressInstance = new Address(toBuffer(Constants.ADDRESS_SYSTEM));
        // Update vm with new state root
        await this.vm.stateManager.putContractStorage(
            addressInstance,
            toBuffer(`0x${Constants.BLOCK_INFO_ROOT_STORAGE_POS.toString(16).padStart(64, '0')}`),
            toBuffer(smtUtils.h4toString(this.blockInfoRoot)),
        );

        // add system address to updatedAccounts
        const account = await this.vm.stateManager.getAccount(addressInstance);
        this.updatedAccounts[Constants.ADDRESS_SYSTEM.toLowerCase()] = account;

        // store data in internal DB
        const keyDumpStorage = Scalar.add(Constants.DB_ADDRESS_STORAGE, Scalar.fromString(Constants.ADDRESS_SYSTEM, 16));

        // update smart contract it storage
        const sto = await this.vm.stateManager.dumpStorage(addressInstance);
        const storage = await this.db.getValue(keyDumpStorage) || {};
        const keys = Object.keys(sto).map((k) => `0x${k}`);
        const values = Object.values(sto).map((k) => `0x${k}`);
        for (let k = 0; k < keys.length; k++) {
            storage[keys[k]] = ethers.utils.RLP.decode(values[k]);
        }
        await this.db.setValue(keyDumpStorage, storage);
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

    async _processChangeL2BlockTx(tx) {
        // write old blockhash (oldStateRoot) on storage
        // Get old blockNumber
        const oldBlockNumber = await stateUtils.getContractStorage(
            Constants.ADDRESS_SYSTEM,
            this.smt,
            this.currentStateRoot,
            [Constants.LAST_BLOCK_STORAGE_POS], // Storage key of last block num
        );

        // Set block hash (current state root) on storage
        const stateRootPos = ethers.utils.solidityKeccak256(['uint256', 'uint256'], [oldBlockNumber[Constants.LAST_BLOCK_STORAGE_POS], Constants.STATE_ROOT_STORAGE_POS]);
        this.previousBlockHash = smtUtils.h4toString(this.currentStateRoot);
        this.currentStateRoot = await stateUtils.setContractStorage(
            Constants.ADDRESS_SYSTEM,
            this.smt,
            this.currentStateRoot,
            { [stateRootPos]: this.previousBlockHash },
        );

        const addressInstance = new Address(toBuffer(Constants.ADDRESS_SYSTEM));

        // Update vm with new state root
        await this.vm.stateManager.putContractStorage(
            addressInstance,
            toBuffer(stateRootPos),
            toBuffer(this.previousBlockHash),
        );

        // Compute new block number
        const newBlockNumber = Number(Scalar.add(oldBlockNumber[Constants.LAST_BLOCK_STORAGE_POS], 1n));

        // Update zkEVM smt with the new block number
        this.currentStateRoot = await stateUtils.setContractStorage(
            Constants.ADDRESS_SYSTEM,
            this.smt,
            this.currentStateRoot,
            { [Constants.LAST_BLOCK_STORAGE_POS]: newBlockNumber },
        );

        // Update vm with the new block number
        await this.vm.stateManager.putContractStorage(
            addressInstance,
            toBuffer(`0x${Constants.LAST_BLOCK_STORAGE_POS.toString(16).padStart(64, '0')}`),
            toBuffer(Number(newBlockNumber)),
        );

        // get last timestamp
        const currentTimestamp = await this._getTimestamp();

        // final timestamp, GER and blockHashL1 of the block
        let finalTimestamp = 0;
        let finalGER = '0x0000000000000000000000000000000000000000000000000000000000000000';
        let finalBlockHash = '0x0000000000000000000000000000000000000000000000000000000000000000';

        if (this.isForced) {
            const timestampForced = this.timestampLimit;
            const lastGERForced = smtUtils.h4toString(this.l1InfoRoot);

            // Update timestamp only if limitTimestamp > currentTimestamp
            if (Scalar.gt(this.timestampLimit, currentTimestamp)) {
                // set new timestamp
                finalTimestamp = timestampForced;
                await this._setTimestamp(timestampForced);
            }

            // set forced global exit root and default blockHash
            finalGER = lastGERForced;
            finalBlockHash = this.forcedBlockHashL1;
            // forced batch has no enforced blockhash
            await this._setGlobalExitRoot(lastGERForced, finalBlockHash);
        } else {
            const newTimestamp = Scalar.add(currentTimestamp, Scalar.e(tx.deltaTimestamp));

            // Verify deltaTimestamp + currentTimestamp <= limitTimestamp
            if (Scalar.gt(newTimestamp, this.timestampLimit)) {
                return true;
            }

            // write timestamp
            finalTimestamp = newTimestamp;
            await this._setTimestamp(newTimestamp);

            // verify l1InfoRoot data if index != 0
            if (tx.indexL1InfoTree !== 0) {
                const l1Info = this.extraData.l1Info[tx.indexL1InfoTree];

                // Verify l1Info & indexL1InfoTree belong to l1InfoRoot
                const valueLeaf = getL1InfoTreeValue(
                    l1Info.globalExitRoot,
                    l1Info.blockHash,
                    l1Info.timestamp,
                );

                if (!this.options.skipVerifyL1InfoRoot) {
                    if (typeof this.extraData.l1Info[tx.indexL1InfoTree] === 'undefined') {
                        throw new Error(`${getFuncName()}: BatchProcessor:_processChangeL2BlockTx:: missing smtProof`);
                    }

                    // fulfill l1InfoTree information
                    this.l1InfoTree[tx.indexL1InfoTree] = l1Info;

                    if (!verifyMerkleProof(valueLeaf, l1Info.smtProof, tx.indexL1InfoTree, smtUtils.h4toString(this.l1InfoRoot))) {
                        return true;
                    }
                }

                // Verify newTimestamp >= l1InfoRoot.timestamp
                if (Scalar.lt(newTimestamp, l1Info.timestamp)) {
                    return true;
                }

                // write l1Info data depending if the global exit root already exist or is zero
                finalGER = l1Info.globalExitRoot;
                const writeL1Info = this._shouldWriteL1Info(l1Info.globalExitRoot);

                if (writeL1Info) {
                    finalBlockHash = l1Info.blockHash;
                    this._setGlobalExitRoot(l1Info.globalExitRoot, l1Info.blockHash);
                }
            }
        }

        // setup new block tree
        this.blockInfoRoot = [this.F.zero, this.F.zero, this.F.zero, this.F.zero];
        this.blockInfoRoot = await initBlockHeader(
            this.smt,
            this.blockInfoRoot,
            this.previousBlockHash,
            this.sequencerAddress,
            newBlockNumber,
            Constants.BLOCK_GAS_LIMIT,
            finalTimestamp,
            finalGER,
            finalBlockHash,
        );

        // Reset txIndex, cumulativeGasUsed, logIndex and blockInfoRoot
        this.txIndex = 0;
        this.cumulativeGasUsed = 0;
        this.logIndex = 0;

        // store data in internal DB
        const keyDumpStorage = Scalar.add(Constants.DB_ADDRESS_STORAGE, Scalar.fromString(Constants.ADDRESS_SYSTEM, 16));

        // update smart contract storage
        const sto = await this.vm.stateManager.dumpStorage(addressInstance);
        const storage = await this.db.getValue(keyDumpStorage) || {};
        const keys = Object.keys(sto).map((k) => `0x${k}`);
        const values = Object.values(sto).map((k) => `0x${k}`);
        for (let k = 0; k < keys.length; k++) {
            storage[keys[k]] = ethers.utils.RLP.decode(values[k]);
        }
        await this.db.setValue(keyDumpStorage, storage);

        return false;
    }

    async fillReceiptTree(txReceipt, txHash, effectivePercentage) {
        // Set tx hash at smt
        this.blockInfoRoot = await setTxHash(this.smt, this.blockInfoRoot, this.txIndex, txHash);
        // Set tx status at smt
        this.blockInfoRoot = await setTxStatus(this.smt, this.blockInfoRoot, this.txIndex, txReceipt.status);
        // Set tx gas used at smt
        this.blockInfoRoot = await setCumulativeGasUsed(this.smt, this.blockInfoRoot, this.txIndex, this.cumulativeGasUsed);
        for (const log of txReceipt.logs) {
            // Loop logs
            const bTopics = log[1];
            const topics = bTopics.reduce((previousValue, currentValue) => previousValue + currentValue.toString('hex'), '');
            // Encode log: linearPoseidon(logData + topics)
            const encoded = await smtUtils.linearPoseidon(`0x${log[2].toString('hex')}${topics}`);
            this.blockInfoRoot = await setTxLog(this.smt, this.blockInfoRoot, this.txIndex, this.logIndex, encoded);
            this.logIndex += 1;
        }
        // Set tx effective percentage at smt
        this.blockInfoRoot = await setEffectivePercentage(this.smt, this.blockInfoRoot, this.txIndex, effectivePercentage);
    }

    _rollbackBatch() {
        this.currentStateRoot = this.oldStateRoot;
        this.updatedAccounts = {};
    }

    /**
     * Compute stark input
     */
    async _computeStarkInput() {
        // compute circuit inputs
        const oldStateRoot = smtUtils.h4toString(this.oldStateRoot);
        const newStateRoot = smtUtils.h4toString(this.currentStateRoot);
        const oldAccInputHash = smtUtils.h4toString(this.oldAccInputHash);
        const newLocalExitRoot = smtUtils.h4toString(this.newLocalExitRoot);
        const l1InfoRoot = smtUtils.h4toString(this.l1InfoRoot);

        this.batchHashData = calculateBatchHashData(
            this.getBatchL2Data(),
        );

        const newAccInputHash = calculateAccInputHash(
            oldAccInputHash,
            this.batchHashData,
            l1InfoRoot,
            this.timestampLimit,
            this.sequencerAddress,
            this.forcedBlockHashL1,
        );

        this.newAccInputHash = smtUtils.stringToH4(newAccInputHash);

        // add flag to skip l1InfoTree verification
        if (this.options.skipVerifyL1InfoRoot === true) {
            this.l1InfoTree.skipVerifyL1InfoRoot = true;
        }

        this.starkInput = {
            oldStateRoot,
            newStateRoot, // output
            oldAccInputHash,
            newAccInputHash, // output
            newLocalExitRoot, // output
            oldNumBatch: this.oldNumBatch,
            newNumBatch: this.newNumBatch, // output
            chainID: this.chainID,
            forkID: this.forkID,
            forcedBlockHashL1: this.forcedBlockHashL1,
            batchL2Data: this.getBatchL2Data(),
            l1InfoRoot,
            timestampLimit: this.timestampLimit.toString(),
            sequencerAddr: this.sequencerAddress,
            batchHashData: this.batchHashData, // sanity check
            contractsBytecode: this.contractsBytecode,
            l1InfoTree: this.l1InfoTree,
            db: await getCurrentDB(this.oldStateRoot, this.db, this.F),
        };

        //  add flags
        // skipFirstChangeL2Block
        if (this.options.skipFirstChangeL2Block === true) {
            this.starkInput.skipFirstChangeL2Block = true;
        }

        // skipWriteBlockInfoRoot
        if (this.options.skipWriteBlockInfoRoot === true) {
            this.starkInput.skipWriteBlockInfoRoot = true;
        }
    }

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
            newLocalExitRoot,
            oldAccInputHash,
            newAccInputHash,
            this.oldNumBatch,
            this.newNumBatch,
            this.chainID,
            aggregatorAddress,
            this.forkID,
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
        if (this.builded) throw new Error(`${getFuncName()}: Batch already builded`);
    }

    /**
     * Throw error if batch is already builded
     */
    _isBuilded() {
        if (!this.builded) throw new Error(`${getFuncName()}: Batch must first be builded`);
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
