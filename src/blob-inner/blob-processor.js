/* eslint-disable max-len */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-continue */
const { Scalar } = require('ffjavascript');
const SMT = require('../smt');
const TmpDB = require('../tmp-smt-db');
const Constants = require('../constants');
const smtUtils = require('../smt-utils');
const stateUtils = require('../state-utils');
const { getCurrentDB } = require('../smt-utils');
const getKzg = require('./kzg-utils');

const {
    isHex, computeBlobAccInputHash, computeBlobL2HashData,
    computeBatchL2HashData, computeBatchAccInputHash, computeBlobDataFromBatches, parseBlobData,
    computeVersionedHash,
} = require('./blob-utils');
const blobConstants = require('./blob-constants');

module.exports = class BlobProcessor {
    /**
     * constructor BlobProcessor class
     * @param {Object} db - database
     * @param {Object} poseidon - hash function
     * @param {Object} globalInputs - high level inputs. Set at snark level
     * @param {Array[Field]} globalInputs.oldBlobStateRoot - old blob root in 4 field element array
     * @param {String} globalInputs.oldBlobAccInputHash - old blob accumlate input hash in hexadecimal string representation
     * @param {Number} globalInputs.oldNumBlob - old num blob in hexadecimal string representation
     * @param {Array[Field]} globalInputs.oldStateRoot - old state root in 4 field element array
     * @param {Number} globalInputs.forkID - old blob root in hexadecimal string representation
     * @param {Object} privateInputs - necessary data to build accumulate blob input hash
     * @param {String} privateInputs.lastL1InfoTreeIndex
     * @param {String} privateInputs.lastL1InfoTreeRoot
     * @param {BigInt} privateInputs.timestampLimit
     * @param {String} privateInputs.sequencerAddress
     * @param {BigInt} privateInputs.zkGasLimit
     * @param {Number} privateInputs.blobType
     * @param {String} privateInputs.forcedHashData
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
        this.oldBlobStateRoot = globalInputs.oldBlobStateRoot;
        this.oldBlobAccInputHash = globalInputs.oldBlobAccInputHash;
        this.oldNumBlob = globalInputs.oldNumBlob;
        this.oldStateRoot = globalInputs.oldStateRoot;
        this.forkID = globalInputs.forkID;

        // privateInputs
        this.lastL1InfoTreeIndex = privateInputs.lastL1InfoTreeIndex; // exposed as an output
        this.lastL1InfoTreeRoot = privateInputs.lastL1InfoTreeRoot; // exposed as an output
        this.timestampLimit = privateInputs.timestampLimit; // exposed as an output
        this.sequencerAddress = privateInputs.sequencerAddress;
        this.zkGasLimit = privateInputs.zkGasLimit;
        this.blobType = privateInputs.blobType;
        this.forcedHashData = privateInputs.forcedHashData;

        // outputs
        this.newBlobStateRoot = this.oldBlobStateRoot;
        this.newBlobAccInputHash = null;
        this.newNumBlob = this.oldNumBlob + 1;
        this.finalAccBatchHashData = smtUtils.h4toString([this.F.zero, this.F.zero, this.F.zero, this.F.zero]);
        this.localExitRootFromBlob = smtUtils.h4toString([this.F.zero, this.F.zero, this.F.zero, this.F.zero]);
        this.isInvalid = false;

        // internal use
        this.tmpDB = new TmpDB(db);
        this.smt = new SMT(this.tmpDB, poseidon, poseidon.F);

        this.blobLength = 0;
        this.builded = false;
        this.isInvalid = false;

        this.batches = [];
        this.starkInput = {};
    }

    /**
     * Add a batchL2Data to the blob inner processor
     * @param {Object} batchL2Data - Batch Processor
     */
    addBatchL2Data(_batchL2Data) {
        this._isNotBuilded();

        if (this.addingBlobData === true) {
            throw new Error('BlobProcessor:addBatchL2Data: cannot add batch data after blob data');
        }

        this.addingBatchData = true;

        // remove '0x' if necessary
        const batchL2Data = _batchL2Data.startsWith('0x') ? _batchL2Data.slice(2) : _batchL2Data;

        if (batchL2Data === '') {
            this.blobLength += blobConstants.BLOB_ENCODING.BYTES_BATCH_LENGTH;
        } else {
            // check hexadecimal string
            if (!isHex(batchL2Data)) {
                throw new Error('BlobProcessor:addBatchL2Data: invalid hexadecimal string');
            }
            this.blobLength += blobConstants.BLOB_ENCODING.BYTES_BATCH_LENGTH + batchL2Data.length / 2;
        }

        this.batches.push(batchL2Data);

        if (this.blobLength > blobConstants.MAX_BLOB_DATA_BYTES) {
            throw new Error('BlobProcessor:addBatchL2Data: blob length exceeds maximum size');
        }
    }

    /**
     * add directly all the blob data
     * @param {String} _blobData - blob data in hexadecimal string representation
     */
    addBlobData(_blobData) {
        this._isNotBuilded();

        if (this.addingBatchData === true) {
            throw new Error('BlobProcessor:addBlobData: cannot add blob data after batch data');
        }

        if (this.addingBlobData === true) {
            throw new Error('BlobProcessor:addBlobData: cannot add blob data twice');
        }

        this.addingBlobData = true;

        // remove '0x'
        const blobData = _blobData.startsWith('0x') ? _blobData.slice(2) : _blobData;

        // check hexadecimal string
        if (!isHex(blobData)) {
            throw new Error('BlobProcessor:addBlobData: invalid hexadecimal string');
        }

        this.blobData = blobData;

        if (this.blobType === blobConstants.BLOB_TYPE.EIP4844) {
            if ((blobData.length / 2) !== blobConstants.BLOB_BYTES) {
                throw new Error(`BlobProcessor:addBlobData: blob length is not ${blobConstants.BLOB_BYTES} bytes`);
            }
        }
    }

    /**
     * Execute Blob
     */
    async execute() {
        // load kzg
        this.kzg = await getKzg();

        // check blob type
        this._checkBlobType();

        // build blobData
        if (this.isInvalid === false) {
            this._buildBlobData();
        }

        // check forced batches
        if (this.isInvalid === false) {
            this._checkForcedBatches();
        }

        // check zkGasLimit if not already invalid blob
        if (this.isInvalid === false) {
            await this._checkZkGasLimit();
        }

        // read local exit root if necessary
        await this._readLocalExitRoot();

        // compute stark input
        await this._computeStarkInput();

        this.builded = true;
    }

    _checkBlobType() {
        if (this.blobType !== blobConstants.BLOB_TYPE.CALLDATA
            && this.blobType !== blobConstants.BLOB_TYPE.EIP4844
            && this.blobType !== blobConstants.BLOB_TYPE.FORCED) {
            if (this.addingBatchData === true) {
                throw new Error('BlobProcessor:executeBlob: invalid blob type not compatible with batch data');
            }
            this.isInvalid = true;
        }
    }

    _buildBlobData() {
        if (this.addingBatchData === true) {
            this.blobData = computeBlobDataFromBatches(this.batches, this.blobType);
        } else if (this.addingBlobData === true) {
            const res = parseBlobData(this.blobData, this.blobType);
            this.isInvalid = res.isInvalid;
            this.batches = res.batches;
        } else {
            throw new Error('BlobProcessor:executeBlob: no data added');
        }
    }

    _checkForcedBatches() {
        if (this.blobType === blobConstants.BLOB_TYPE.FORCED) {
            if (this.batches.length > blobConstants.MAX_BATCHES_FORCED) {
                this.isInvalid = true;
            }
        }
    }

    _checkZkGasLimit() {
        const minZkGasLimit = Scalar.mul(this.batches.length, blobConstants.ZKGAS_BATCH);

        if (Scalar.lt(this.zkGasLimit, minZkGasLimit)) {
            this.isInvalid = true;
        }
    }

    /**
     * Read the local exit root, which is a variable stored in some specific storage slot of the globalExitRootManagerL2
     * This will be performed after processing all the transactions
     */
    async _readLocalExitRoot() {
        const res = await stateUtils.getContractStorage(
            Constants.ADDRESS_GLOBAL_EXIT_ROOT_MANAGER_L2,
            this.smt,
            this.oldStateRoot,
            [Constants.LOCAL_EXIT_ROOT_STORAGE_POS],
        );

        const newLocalExitRoot = res[Constants.LOCAL_EXIT_ROOT_STORAGE_POS];
        if (Scalar.eq(newLocalExitRoot, Scalar.e(0))) {
            this.localExitRootFromBlob = Constants.ZERO_BYTES32;
        } else {
            this.localExitRootFromBlob = `0x${Scalar.e(newLocalExitRoot).toString(16).padStart(64, '0')}`;
        }
    }

    async _computeStarkInput() {
        // compute points Z & Y dependng on the blob type. Otherwise, compute batchL2HashData
        if (this.blobType === blobConstants.BLOB_TYPE.CALLDATA || this.blobType === blobConstants.BLOB_TYPE.FORCED) {
            // compute blobL2HashData
            this.blobL2HashData = await computeBlobL2HashData(this.blobData);
            // points not used
            this.kzgCommitment = Constants.ZERO_BYTES32;
            this.versionedHash = Constants.ZERO_BYTES32;
            this.pointZ = Constants.ZERO_BYTES32;
            this.pointY = Constants.ZERO_BYTES32;
            this.proof = Constants.ZERO_BYTES32;
        } else if (this.blobType === blobConstants.BLOB_TYPE.EIP4844) {
            // blobL2HashData not used
            this.blobL2HashData = Constants.ZERO_BYTES32;
            // compute kzg data
            this.kzgCommitment = this.kzg.blobToKzgCommitment(this.blobData);
            this.versionedHash = computeVersionedHash(this.kzgCommitment);
            this.pointZ = await this.kzg.computePointZ(this.kzgCommitment, this.blobData);
            const { proof, pointY } = this.kzg.computeKzgProof(this.blobData, this.pointZ);
            this.pointY = pointY;
            this.kzgProof = proof;
        } else {
            // enter here only if blobType is invalid. Hence, blobData has been added previously
            // blobL2HashData not used
            this.blobL2HashData = Constants.ZERO_BYTES32;
            // compute kzg data
            this.kzgCommitment = this.kzg.blobToKzgCommitment(this.blobData);
            this.versionedHash = computeVersionedHash(this.kzgCommitment);
            this.pointZ = await this.kzg.computePointZ(this.kzgCommitment, this.blobData);
            const { proof, pointY } = this.kzg.computeKzgProof(this.blobData, this.pointZ);
            this.pointY = pointY;
            this.kzgProof = proof;
        }

        this.newBlobAccInputHash = computeBlobAccInputHash(
            this.oldBlobAccInputHash,
            this.lastL1InfoTreeIndex,
            this.lastL1InfoTreeRoot,
            this.timestampLimit,
            this.sequencerAddress,
            this.zkGasLimit,
            this.blobType,
            this.versionedHash,
            this.blobL2HashData,
            this.forcedHashData,
        );

        // invalidate blob
        if (this.isInvalid === true) {
            this.finalAccBatchHashData = Constants.ZERO_BYTES32;
        } else {
            // compute finalAccBatchHashData
            for (let i = 0; i < this.batches.length; i++) {
                const batchData = this.batches[i];
                if (batchData !== '') {
                    this.finalAccBatchHashData = await computeBatchAccInputHash(
                        this.finalAccBatchHashData,
                        await computeBatchL2HashData(batchData),
                        this.sequencerAddress,
                        (this.blobType === blobConstants.BLOB_TYPE.FORCED) ? this.forcedHashData : Constants.ZERO_BYTES32,
                    );
                }
            }
        }

        this.starkInput = {
            // inputs
            oldBlobStateRoot: smtUtils.h4toString(this.oldBlobStateRoot),
            oldBlobAccInputHash: this.oldBlobAccInputHash,
            oldNumBlob: this.oldNumBlob,
            oldStateRoot: smtUtils.h4toString(this.oldStateRoot),
            forkID: this.forkID,
            // compute accInputHash
            versionedHash: this.versionedHash,
            blobType: this.blobType,
            sequencerAddr: this.sequencerAddress,
            zkGasLimit: this.zkGasLimit.toString(),
            forcedHashData: this.forcedHashData,
            blobL2HashData: this.blobL2HashData,
            // outputs
            newBlobStateRoot: smtUtils.h4toString(this.newBlobStateRoot),
            newBlobAccInputHash: this.newBlobAccInputHash,
            newNumBlob: this.newNumBlob,
            finalAccBatchHashData: this.finalAccBatchHashData,
            localExitRootFromBlob: this.localExitRootFromBlob,
            isInvalid: this.isInvalid,
            // outputs from blobAccInputHash
            timestampLimit: this.timestampLimit.toString(),
            lastL1InfoTreeIndex: this.lastL1InfoTreeIndex,
            lastL1InfoTreeRoot: this.lastL1InfoTreeRoot,
        };

        // add data kzg computations
        this.starkInput.kzgCommitment = this.kzgCommitment;
        this.starkInput.versionedHash = this.versionedHash;
        this.starkInput.kzgProof = this.kzgProof;
        this.starkInput.z = this.pointZ;
        this.starkInput.y = this.pointY;

        // add blobdata
        this.starkInput.blobData = this.blobData.startsWith('0x') ? this.blobData : `0x${this.blobData}`;

        // add DB
        this.starkInput.db = await getCurrentDB(this.oldStateRoot, this.db, this.F);
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
