/* eslint-disable max-len */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-continue */
const ethers = require('ethers');

const { Scalar } = require('ffjavascript');
const SMT = require('../smt');
const TmpDB = require('../tmp-db');
const Constants = require('../constants');
const smtUtils = require('../smt-utils');

const { calculateAccBlobHash, calculateBlobHashData } = require('../contract-utils');
const { computeNewAccBatchHashData } = require('../batch-utils');
const { ENUM_TX_TYPES } = require('../compression/compressor-constants');
const { valueToHexStr } = require('../utils');

const blobUtils = require('./blob-utils');
const blobTreeUtils = require('./blob-tree-utils');
const Compressor = require('../compression/compressor');
const compressorUtils = require('../compression/compressor-utils');
const encode = require('../compression/encode');

const batchUtils = require('../batch-utils');

module.exports = class BlobProcessor {
    /**
     * constructor BlobProcessor class
     * @param {Object} db - database
     * @param {Object} poseidon - hash function
     * @param {Object} globalInputs - high level inputs. Set at snark level
     * @param {Array[Field]} globalInputs.oldBlobRoot - old blob root in hexadecimal string representation
     * @param {Number} globalInputs.chainId - old blob root in hexadecimal string representation
     * @param {Number} globalInputs.forkId - old blob root in hexadecimal string representation
     * @param {Array[Field]} globalInputs.oldAccBlobHash - old blob root in hexadecimal string representation
     * @param {Number} globalInputs.oldNumBlob - old blob root in hexadecimal string representation
     * @param {Object} privateInputs - necessary data to build accumulate blob hash
     * @param {String} privateInputs.historicGERRoot - necessary data to build accumulate blob hash
     * @param {BigInt} privateInputs.timestampLimit - necessary data to build accumulate blob hash
     * @param {String} privateInputs.sequencerAddress - necessary data to build accumulate blob hash
     * @param {Object} privateInputs.blobType - necessary data to build accumulate blob hash
     * @param {Bool} privateInputs.blobType.isEIP4844Active
     * @param {Bool} privateInputs.blobType.isForced
     * @param {Bool} privateInputs.blobType.addL1BlockHash
     * @param {String} privateInputs.L1BlockHash - necessary data to build accumulate blob hash
     * @param {Scalar} privateInputs.zkGasLimit - necessary data to build accumulate blob hash
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

        // globaInputs
        this.oldBlobRoot = globalInputs.oldBlobRoot;
        this.chainId = globalInputs.chainId;
        this.forkId = globalInputs.forkId;
        this.oldAccBlobHash = globalInputs.oldAccBlobHash;
        this.oldNumBlob = globalInputs.oldNumBlob;

        // privateInuts
        this.historicGERRoot = privateInputs.historicGERRoot;
        this.timestampLimit = privateInputs.timestampLimit;
        this.sequencerAddress = privateInputs.sequencerAddress;
        this.blobType = privateInputs.blobType;
        this.L1BlockHash = privateInputs.L1BlockHash;
        this.zkGasLimit = privateInputs.zkGasLimit;

        // outputs
        this.newBlobRoot = this.oldBlobRoot;
        this.newAccBlobHash = null;
        this.finalAccBatchHashData = smtUtils.h4toString([this.F.zero, this.F.zero, this.F.zero, this.F.zero]);
        this.newNumBlob = this.oldNumBlob + 1;

        this.tmpDB = new TmpDB(db);
        this.smt = new SMT(this.tmpDB, poseidon, poseidon.F);
        this.iCompressor = new Compressor(this.tmpDB, this.smt);

        this.compressedTxs = [];
        this.builded = false;
        this.isInvalid = false;

        this.batches = null;
        this.starkInput = {};
    }

    /**
     * Add a transaction to the blob processor
     * @param {Object} tx - transaction object
     *      tx.compressed - compressed transaction in hex string
     *      tx.r - signature parameter r
     *      tx.s - signature parameter s
     *      tx.v - signature parameter v (27 or 28)
     */
    addTxToBlob(tx) {
        this._isNotBuilded();

        // check at least one batch has started
        if (this.batches === null) {
            throw new Error('BlobProcessor:addTxToBlob: no batch has been initialized');
        }

        const currentBatchToFill = this.batches.length - 1;
        this.batches[currentBatchToFill].compressedTxs.push(tx);
    }

    /**
     * Add the header to create a new batch
     */
    newBatch() {
        if (this.batches === null) {
            this.batches = [];
        }

        this.batches.push({
            batchLenght: 0,
            compressedTxs: [],
            uncompressedTxs: [],
            serializedData: '',
        });
    }

    /**
     * Execute transactions
     */
    async executeTxs() {
        // build batch header
        const headerBatch = await this._buildHeaderBatch();

        // read data from blob tree
        await this._readBlobTree();

        // process all transactions
        for (let i = 0; i < this.batches.length; i++) {
            const batchInfo = this.batches[i];

            // process batch transactions
            for (let j = 0; j < batchInfo.compressedTxs.length; j++) {
                const {
                    compressed, v, r, s,
                } = batchInfo.compressedTxs[j];

                const compressedTx = compressed.startsWith('0x') ? compressed.slice(2) : compressed;

                // uncompress tx
                const uncompressedTx = await this.iCompressor.decompressData(compressedTx);

                // Do RLP and verify signature if tx.type != CHANGE_L2_BLOCK
                if (uncompressedTx.type === ENUM_TX_TYPES.CHANGE_L2_BLOCK) {
                    batchInfo.uncompressedTxs.push(uncompressedTx);
                    // add data to batch data
                    batchInfo.serializedData += batchUtils.serializeTx(uncompressedTx);
                } else {
                    batchInfo.uncompressedTxs.push(uncompressedTx);
                    const signData = compressorUtils.getTxSignedMessage(uncompressedTx);
                    const digest = ethers.utils.keccak256(signData);
                    // verify signature
                    try {
                        uncompressedTx.from = ethers.utils.recoverAddress(digest, {
                            r,
                            s,
                            v,
                        });
                    } catch (error) {
                        // next transaction
                        continue;
                    }
                    // add data to batch data
                    batchInfo.serializedData += batchUtils.serializeTx(uncompressedTx);
                }

                batchInfo.batchLenght += compressedTx.length / 2;
            }

            // add header to batchInfo.serializedData
            batchInfo.serializedData = headerBatch + batchInfo.serializedData;
        }

        // write data to blob tree
        await this._writeBlobTree();

        // compute blob start input
        await this._computeStarkInput();

        this.builded = true;
    }

    async _buildHeaderBatch() {
        const historicGERRootStr = smtUtils.h4toString(this.historicGERRoot);
        const timestampLimitStr = valueToHexStr(this.timestampLimit).padStart(8 * 2, '0');
        const sequencerAddrStr = this.sequencerAddress.startsWith('0x') ? this.sequencerAddress.slice(2) : this.sequencerAddress;
        const zkGasLimitStr = valueToHexStr(this.zkGasLimit).padStart(8 * 2, '0');
        const numBlobStr = valueToHexStr(this.oldNumBlob).padStart(8 * 2, '0');

        return `${historicGERRootStr}${timestampLimitStr}${sequencerAddrStr}${zkGasLimitStr}${numBlobStr}`;
    }

    async _readBlobTree() {
        this.addressTreeRoot = smtUtils.scalar2h4(await blobTreeUtils.getVar(Constants.SMT_KEY_BLOB_ADDRESS_ROOT, this.smt, this.oldBlobRoot));
        this.dataTreeRoot = smtUtils.scalar2h4(await blobTreeUtils.getVar(Constants.SMT_KEY_BLOB_DATA_ROOT, this.smt, this.oldBlobRoot));
        this.lastAddressIndex = await blobTreeUtils.getVar(Constants.SMT_KEY_BLOB_LAST_ADDRESS_INDEX, this.smt, this.oldBlobRoot);
        this.lastDataIndex = await blobTreeUtils.getVar(Constants.SMT_KEY_BLOB_LAST_DATA_INDEX, this.smt, this.oldBlobRoot);

        this.iCompressor.setGlobalDataDecompression(
            this.addressTreeRoot,
            this.dataTreeRoot,
            this.lastAddressIndex,
            this.lastDataIndex,
        );
    }

    async _writeBlobTree() {
        this.newAddressTreeRoot = this.iCompressor.addressTreeRoot;
        this.newDataTreeRoot = this.iCompressor.dataTreeRoot;
        this.newLastAddressIndex = this.iCompressor.lastAddressIndex;
        this.newLastDataIndex = this.iCompressor.lastDataIndex;

        this.newBlobRoot = await blobTreeUtils.setVar(Constants.SMT_KEY_BLOB_ADDRESS_ROOT, smtUtils.h4toScalar(this.newAddressTreeRoot), this.smt, this.oldBlobRoot);
        this.newBlobRoot = await blobTreeUtils.setVar(Constants.SMT_KEY_BLOB_DATA_ROOT, smtUtils.h4toScalar(this.newDataTreeRoot), this.smt, this.newBlobRoot);
        this.newBlobRoot = await blobTreeUtils.setVar(Constants.SMT_KEY_BLOB_LAST_ADDRESS_INDEX, this.newLastAddressIndex, this.smt, this.newBlobRoot);
        this.newBlobRoot = await blobTreeUtils.setVar(Constants.SMT_KEY_BLOB_LAST_DATA_INDEX, this.newLastDataIndex, this.smt, this.newBlobRoot);
    }

    async _computeStarkInput() {
        // join all batches data
        this.blobData = '0x';

        for (let i = 0; i < this.batches.length; i++) {
            const batchInfo = this.batches[i];

            // compress batch length --> //TODO: add encoding in compressor as generic function
            let compressedBatchLength;

            if (Scalar.lt(Scalar.e(batchInfo.batchLenght), 32)) {
                compressedBatchLength = encode.smallValue(batchInfo.batchLenght);
            } else {
                // check best encoding type
                const encodeLess32 = encode.dataLess32Bytes(valueToHexStr(batchInfo.batchLenght));
                const encodeCompressedValue = encode.compressedValue(batchInfo.batchLenght);

                if (encodeLess32.length > encodeCompressedValue.length) {
                    compressedBatchLength = encodeCompressedValue;
                } else {
                    compressedBatchLength = encodeLess32;
                }
            }

            // add batch length to blobdata
            this.blobData += compressedBatchLength;

            // add compressed txs
            for (let j = 0; j < batchInfo.compressedTxs.length; j++) {
                const {
                    compressed, v, r, s,
                } = batchInfo.compressedTxs[j];

                if (batchInfo.uncompressedTxs[j].type === ENUM_TX_TYPES.CHANGE_L2_BLOCK) {
                    const compressedTx = compressed.startsWith('0x') ? compressed.slice(2) : compressed;
                    this.blobData += compressedTx;
                } else {
                    const compressedTx = compressed.startsWith('0x') ? compressed.slice(2) : compressed;
                    this.blobData += compressedTx
                                + Scalar.fromString(r, 16).toString(16).padStart(64, '0')
                                + Scalar.fromString(s, 16).toString(16).padStart(64, '0')
                                + Scalar.e(v).toString(16).padStart(2, '0');
                }
            }
        }

        // build blob type
        const blobType = blobUtils.buildBlobType(
            this.blobType.isEIP4844Active,
            this.blobType.isForced,
            this.blobType.addL1BlockHash,
        );

        // compute hashBlobData & newAccBlobHash
        this.blobHashData = calculateBlobHashData(this.blobData);

        this.newAccBlobHash = calculateAccBlobHash(
            smtUtils.h4toString(this.oldAccBlobHash),
            this.blobHashData,
            blobType,
            smtUtils.h4toString(this.historicGERRoot),
            this.timestampLimit,
            this.sequencerAddress,
            this.L1BlockHash,
            this.zkGasLimit,
        );

        // compute finalAccBatchHashData
        for (let i = 0; i < this.batches.length; i++) {
            const batchInfo = this.batches[i];
            this.finalAccBatchHashData = await computeNewAccBatchHashData(this.finalAccBatchHashData, batchInfo.serializedData);
        }

        this.starkInput = {
            // inputs
            oldBlobRoot: smtUtils.h4toString(this.oldBlobRoot),
            chainId: this.chainId,
            forkId: this.forkId,
            oldAccBlobHash: smtUtils.h4toString(this.oldAccBlobHash),
            oldNumBlob: this.oldNumBlob,
            blobData: this.blobData,
            historicGERRoot: smtUtils.h4toString(this.historicGERRoot),
            timestampLimit: this.timestampLimit.toString(),
            sequencerAddress: this.sequencerAddress,
            L1BlockHash: this.L1BlockHash,
            blobType,
            zkGasLimit: this.zkGasLimit.toString(),
            // outputs
            finalAccBatchHashData: this.finalAccBatchHashData,
            newBlobRoot: smtUtils.h4toString(this.newBlobRoot),
            newAccBlobHash: this.newAccBlobHash,
            newNumBlob: this.newNumBlob,
            // debug properties
            blobHashData: this.blobHashData,
            db: await smtUtils.getCurrentDB(this.oldBlobRoot, this.db, this.F),
        };
    }

    /**
     * Return stark input
     */
    getStarkInput() {
        this._isBuilded();

        return this.starkInput;
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
    _isNotBuilded() {
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
