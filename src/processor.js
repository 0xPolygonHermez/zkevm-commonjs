/* eslint-disable no-continue */
const ethers = require('ethers');
const { Transaction } = require('@ethereumjs/tx');
const {
    Address, Account, BN, toBuffer,
} = require('ethereumjs-util');

const { Scalar } = require('ffjavascript');
const SMT = require('./smt');
const TmpSmtDB = require('./tmp-smt-db');
const Constants = require('./constants');
const stateUtils = require('./state-utils');

const { getCurrentDB } = require('./smt-utils');
const { calculateCircuitInput, calculateBatchHashData } = require('./contract-utils');
const { decodeCustomRawTxProverMethod } = require('./processor-utils');

module.exports = class Processor {
    /**
     * constructor Processor class
     * @param {Object} db - database
     * @param {Number} batchNumber - batch number
     * @param {Number} arity - arity
     * @param {Object} poseidon - hash function
     * @param {Number} maxNTx - maximum number of transaction allowed
     * @param {Number} seqChainID - sequencer own chain ID
     * @param {Field} root - state root
     * @param {String} sequencerAddress . sequencer address
     * @param {Field} oldLocalExitRoot - local exit root
     * @param {Field} globalExitRoot - global exit root
     * @param {Field} vm - vm instance
     */
    constructor(db, batchNumber, arity, poseidon, maxNTx, seqChainID, root, sequencerAddress, localExitRoot, globalExitRoot, timestamp, vm) {
        this.db = db;
        this.batchNumber = batchNumber;
        this.arity = arity;
        this.poseidon = poseidon;
        this.maxNTx = maxNTx;
        this.seqChainID = seqChainID;
        this.F = poseidon.F;
        this.tmpSmtDB = new TmpSmtDB(db);
        this.smt = new SMT(this.tmpSmtDB, arity, poseidon, poseidon.F);

        this.rawTxs = [];
        this.decodedTxs = [];
        this.builded = false;
        this.circuitInput = {};

        this.oldStateRoot = root;
        this.currentStateRoot = root;
        this.sequencerAddress = sequencerAddress;
        this.oldLocalExitRoot = localExitRoot;
        this.currentLocalExitRoot = localExitRoot;
        this.globalExitRoot = globalExitRoot;
        this.timestamp = timestamp;
        this.vm = vm;
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

        // Process transactions and update the state
        await this._processTx();

        // Calculate Circuit input
        await this._computeCircuitInput();

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
            if (txDecoded.chainID !== this.seqChainID && txDecoded.chainID !== Constants.DEFAULT_SEQ_CHAINID) {
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
                if (txDecoded[key] === '0x' && key !== 'data') {
                    txDecoded[key] = '0x00';
                }
            });
            this.decodedTxs.push({ isInvalid: false, reason: '', tx: txDecoded });
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
                // Get from state
                const currenTx = currentDecodedTx.tx;
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

                // PROCESS TX
                const newStateFrom = { ...oldStateFrom };
                let newStateTo;

                if (Scalar.e(currenTx.from) === Scalar.e(currenTx.to)) {
                    // In case from and to are the same, both should modify the same object
                    newStateTo = newStateFrom;
                } else {
                    // Get To state
                    const oldStateTo = await stateUtils.getState(currenTx.to, this.smt, this.currentStateRoot);
                    newStateTo = { ...oldStateTo };
                }

                // from: increase nonce
                newStateFrom.nonce = Scalar.add(newStateFrom.nonce, 1);

                // from: substract total tx cost
                newStateFrom.balance = Scalar.sub(newStateFrom.balance, upfronTxCost);

                /*
                 * from: refund unused gas
                 * hardcoded gas used for an ethereum tx: 21000
                 */
                const gasUsed = Scalar.e(21000);
                const feeGasCost = Scalar.mul(gasUsed, currenTx.gasPrice);
                const refund = Scalar.sub(gasLimitCost, feeGasCost);
                newStateFrom.balance = Scalar.add(newStateFrom.balance, refund);

                // to: increase balance
                newStateTo.balance = Scalar.add(newStateTo.balance, currenTx.value);

                // update root
                this.currentStateRoot = await stateUtils.setAccountState(
                    currenTx.from,
                    this.smt,
                    this.currentStateRoot,
                    newStateFrom.balance,
                    newStateFrom.nonce,
                );
                this.currentStateRoot = await stateUtils.setAccountState(
                    currenTx.to,
                    this.smt,
                    this.currentStateRoot,
                    newStateTo.balance,
                    newStateTo.nonce,
                );

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
                await this.vm.runTx({ tx: evmTx });
                // Pay sequencer fees

                // Get sequencer state
                const oldStateSequencer = await stateUtils.getState(this.sequencerAddress, this.smt, this.currentStateRoot);
                const newStateSequencer = { ...oldStateSequencer };

                // Increase sequencer balance
                newStateSequencer.balance = Scalar.add(newStateSequencer.balance, feeGasCost);

                // update root
                this.currentStateRoot = await stateUtils.setAccountState(
                    this.sequencerAddress,
                    this.smt,
                    this.currentStateRoot,
                    newStateSequencer.balance,
                    newStateSequencer.nonce,
                );

                // Pay sequencer fees in EVM
                const seqAddr = new Address(toBuffer(this.sequencerAddress));
                const seqAcc = await this.vm.stateManager.getAccount(seqAddr);
                const seqAccData = {
                    nonce: seqAcc.nonce,
                    balance: new BN(Scalar.add(feeGasCost, seqAcc.balance)),
                };
                await this.vm.stateManager.putAccount(seqAddr, Account.fromAccountData(seqAccData));
            }
        }
    }

    /**
     * Compute circuit input
     */
    async _computeCircuitInput() {
        /*
         * // compute keys used
         * const keys = {};
         * const mapAddress = {};
         * for (let i = 0; i < this.decodedTxs.length; i++) {
         *     const currentTx = this.decodedTxs[i].tx;
         *     if (!currentTx) {
         *         continue;
         *     }
         *     const { from, to } = currentTx;
         */

        /*
         *     if (from && mapAddress[from] === undefined) {
         *         const keyBalance = this.F.toString(await smtKeyUtils.keyEthAddrBalance(from, this.arity), 16).padStart(64, '0');
         *         const keyNonce = this.F.toString(await smtKeyUtils.keyEthAddrNonce(from, this.arity), 16).padStart(64, '0');
         *         const previousState = await stateUtils.getState(from, this.smt, this.oldStateRoot);
         *         keys[keyBalance] = Scalar.e(previousState.balance).toString(16).padStart(64, '0');
         *         keys[keyNonce] = Scalar.e(previousState.nonce).toString(16).padStart(64, '0');
         *         mapAddress[from] = true;
         *     }
         *     if (mapAddress[to] === undefined) {
         *         const keyBalance = this.F.toString(await smtKeyUtils.keyEthAddrBalance(to, this.arity), 16).padStart(64, '0');
         *         const keyNonce = this.F.toString(await smtKeyUtils.keyEthAddrNonce(to, this.arity), 16).padStart(64, '0');
         *         const previousState = await stateUtils.getState(to, this.smt, this.oldStateRoot);
         *         keys[keyBalance] = Scalar.e(previousState.balance).toString(16).padStart(64, '0');
         *         keys[keyNonce] = Scalar.e(previousState.nonce).toString(16).padStart(64, '0');
         *         mapAddress[to] = true;
         *     }
         * }
         */

        // compute circuit inputs
        const oldStateRoot = `0x${this.F.toString(this.oldStateRoot, 16).padStart(64, '0')}`;
        const newStateRoot = `0x${this.F.toString(this.currentStateRoot, 16).padStart(64, '0')}`;
        const oldLocalExitRoot = `0x${this.F.toString(this.oldLocalExitRoot, 16).padStart(64, '0')}`;
        const newLocalExitRoot = `0x${this.F.toString(this.currentLocalExitRoot, 16).padStart(64, '0')}`;
        const globalExitRoot = `0x${this.F.toString(this.globalExitRoot, 16).padStart(64, '0')}`;

        const batchHashData = calculateBatchHashData(
            this.getBatchL2Data(),
            globalExitRoot,
            this.timestamp,
            this.sequencerAddress,
            this.seqChainID,
            this.batchNumber,
        );
        const inputHash = calculateCircuitInput(
            oldStateRoot,
            oldLocalExitRoot,
            newStateRoot,
            newLocalExitRoot, // should be the new exit root, but it's nod modified in this version
            batchHashData,
        );
        this.circuitInput = {
            oldStateRoot,
            chainId: this.seqChainID,
            db: await getCurrentDB(this.oldStateRoot, this.db, this.F),
            sequencerAddr: this.sequencerAddress,
            batchL2Data: this.getBatchL2Data(),
            newStateRoot,
            oldLocalExitRoot,
            newLocalExitRoot,
            globalExitRoot,
            batchHashData,
            inputHash,
            numBatch: Scalar.toNumber(this.batchNumber),
            timestamp: this.timestamp,
        };
    }

    /**
     * Return all the transaction data concatenated
     */
    getBatchL2Data() {
        return this.rawTxs.reduce((previousValue, currentValue) => previousValue + currentValue.slice(2), '0x');
    }

    /**
     * Return circuit input
     */
    getCircuitInput() {
        this._isBuilded();
        return this.circuitInput;
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
};
