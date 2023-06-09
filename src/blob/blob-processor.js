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

module.exports = class BlobProcessor {
    /**
     * constructor BlobProcessor class
     * @param {Object} db - database
     * @param {Object} poseidon - hash function
     * @param {Object} globalInputs - high level inputs. Set at snark level
     * @param {String} globalInputs.oldBlobRoot - old blob root in hexadecimal string representation
     * @param {String} globalInputs.chainId - old blob root in hexadecimal string representation
     * @param {String} globalInputs.forkId - old blob root in hexadecimal string representation
     * @param {String} globalInputs.oldAccBlobHash - old blob root in hexadecimal string representation
     * @param {String} globalInputs.oldNumBlob - old blob root in hexadecimal string representation
     * @param {Object} privateInputs - necessary data to build accumulate blob hash
     * @param {Object} privateInputs.historicGERRoot - necessary data to build accumulate blob hash
     * @param {Object} privateInputs.timestampLimit - necessary data to build accumulate blob hash
     * @param {Object} privateInputs.sequencerAddress - necessary data to build accumulate blob hash
     * @param {Object} privateInputs.blobHashType - necessary data to build accumulate blob hash
     * @param {Object} privateInputs.zkGasLimit - necessary data to build accumulate blob hash
    */
    constructor(
        db,
        poseidon,
        globalInputs,
        privateInputs,
    ) {
        this.db = db;

        this.poseidon = poseidon;
        this.F = poseidon.F;

        this.globalInputs = globalInputs;
        this.privateInputs = privateInputs;

        this.tmpSmtDB = new TmpSmtDB(db);
        this.smt = new SMT(this.tmpSmtDB, poseidon, poseidon.F);

        this.compressedTxs = [];
        this.builded = false;
        this.isInvalid = false;

        this.batches = [];
    }

    /**
     * Add a transaction to the blob processor
     * @param {Object} tx - transaction object
     *      tx.compressed - serialized transaction in hex string
     *      tx.v - signature parameter v (27 or 28)
     *      tx.r - signature parameter r
     *      tx.s - signature parameter s
     */
    addTxToBlob(tx) {
        this._isNotBuilded();
        this.compressedTxs.push(tx);
    }

    /**
     * Execute transactions
     */
    async executeTxs() {
        // for each tx:
          // uncompress transaction
          // verify signature
        for (let i = 0; i < this.compressedTxs.length; i++) {
            const compressedTx = this.compressedTxs[i];

            // A - Check TxType
            // A.1 --> newBatch: open empty array into this.batches with property batchLenght
            // A.2 --> standard tx: continue
        // B - get tx original data
            // B.1 --> save data to proper trees and save them on blobTree
            // B.2 --> not overwrite if an address already have an index
        // C - Do RLP of the tx
        // D - Verify signature (get from)
        // E - Add data to batchData
        // E - Check batchLenght
            // E.1 --> compute batchHashData
            // E.3 --> compute AccBatchHashData
            // E.2 --> move to next batch

            // uncompress tx
            const invalidUncompress = await this._uncompressTx(compressedTx);
            if (invalidUncompress) {
                this.invalidBlob();

                return;
            }

            // verify signature
            const invalidSignature = await this._verifySignature(compressedTx);
            if (invalidSignature) {
                this.invalidBlob();

                return;
            }
        }
    }

    /**
     *
     */
    async _uncompressTx() {

    }

    /**
     * Invalidate blob
     */
    invalidBlob() {
        this.isInvalid = true;
    }

    /**
     * Throw error if blob is already builded
     */
    isNotBuilded() {
        if (this.builded) {
            throw new Error('BlobProcessor:_isBuilded: already builded');
        }
    }

    /**
     * Throw error if blob is already builded
     */
    _isBuilded() {
        if (!this.builded) {
            throw new Error('BlobProcessor:_isBuilded: must first be builded');
        }
    }
};
