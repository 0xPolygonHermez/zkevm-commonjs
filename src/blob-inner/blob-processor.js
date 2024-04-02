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

const {
    isHex, computeBlobAccInputHash, computeBlobL2HashData, computePointZ, computePointY,
    computeBatchL2HashData, computeBatchAccInputHash,
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

        if(batchL2Data === "") {
            this.blobLength += 4;
        } else {
            // check hexadecimal string
            if (!isHex(batchL2Data)) {
                throw new Error('BlobProcessor:addBatchL2Data: invalid hexadecimal string');
            }
            this.batches.push(batchL2Data);
            this.blobLength += 4 + batchL2Data.length / 2;
        }
    
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

        // check hexadecimal string
        if (!isHex(_blobData)) {
            throw new Error('BlobProcessor:addBatchL2Data: invalid hexadecimal string');
        }

        // remove '0x' if necessary
        const blobData = _blobData.startsWith('0x') ? _blobData.slice(2) : _blobData;

        if ((blobData.length / 2) === blobConstants.BLOB_BYTES) {
            throw new Error(`BlobProcessor:addBatchL2Data: blob length is not ${blobConstants.BLOB_BYTES} bytes`);
        }
    }

    /**
     * Execute Blob
     */
    async execute() {
        // build blobData
        await this._buildBlobData();

        // check zkGasLimit
        await this._checkZkGasLimit();

        // read local exit root if necessary
        if (this.isInvalid === true) {
            await this._readLocalExitRoot();
        }

        // compute stark input
        await this._computeStarkInput();

        this.builded = true;
    }

    _buildBlobData() {
        if (this.addingBatchData === true) {
            // build blobdata with no spaces
            // Compression type: 1 byte
            let resBlobdata = `0x${Scalar.e(blobConstants.BLOB_COMPRESSION_TYPE.NO_COMPRESSION).toString(16)
                .padStart(2 * blobConstants.BLOB_ENCODING.BYTES_COMPRESSION_TYPE, '0')}`;

            // Add batches
            let batchesData = '';
            for (let i = 0; i < this.batches.length; i++) {
                const batch = this.batches[i];
                // add batch length
                batchesData += Scalar.e(batch.length / 2).toString(16)
                    .padStart(2 * blobConstants.BLOB_ENCODING.BYTES_BATCH_LENGTH, '0');
                // add batch
                batchesData += batch;
            }
            // add body length
            resBlobdata += Scalar.e(batchesData.length / 2).toString(16)
                .padStart(2 * blobConstants.BLOB_ENCODING.BYTES_BODY_LENGTH, '0');
            // add batches data
            resBlobdata += batchesData;

            if (this.blobType === blobConstants.BLOB_TYPE.CALLDATA || this.blobType === blobConstants.BLOB_TYPE.FORCED) {
                this.blobData = resBlobdata;
            } else if (this.blobType === blobConstants.BLOB_TYPE.EIP4844) {
            // build blob data with no spaces and then add 0x00 each 32 bytes
                this.blobData = '';
                const blobDataNoSpaces = resBlobdata.slice(2);
                // add 0x00 each 31 bytes
                for (let i = 0; i < blobDataNoSpaces.length; i += 62) {
                    this.blobData += `00${blobDataNoSpaces.slice(i, i + 62)}`;
                }
                // pad until blob space is reached
                this.blobData = `0x${this.blobData.padEnd(blobConstants.BLOB_BYTES * 2, '0')}`;
            } else {
                throw new Error('BlobProcessor:executeBlob: invalid blob type');
            }
        } else if (this.addingBlobData === true) {
            let tmpBlobdata = '';

            // if blobData is calldata or forced, no need to check and remove MSB each 32 bytes
            if (this.blobType === blobConstants.BLOB_TYPE.CALLDATA || this.blobType === blobConstants.BLOB_TYPE.FORCED) {
                tmpBlobdata = this.blobData;
            } else if (this.blobType === blobConstants.BLOB_TYPE.EIP4844) {
                // assure the most significant byte is '00' each slot of 32 bytes
                for (let i = 0; i < this.blobData.length; i += 64) {
                    const slot32 = this.blobData.slice(i, i + 64);
                    if (slot32.slice(0, 2) !== '00') {
                        this.isInvalid = true;

                        return;
                    }
                    tmpBlobdata += slot32.slice(2, 64);
                }
            }

            // parse blobdata
            let offsetBytes = 0;
            // read compression type
            // check 1 byte can be read
            if (tmpBlobdata.length / 2 < blobConstants.BLOB_ENCODING.BYTES_COMPRESSION_TYPE) {
                this.isInvalid = true;

                return;
            }

            const compressionType = Scalar.e(parseInt(tmpBlobdata.slice(offsetBytes, offsetBytes + 2), 16));
            if (compressionType !== blobConstants.BLOB_COMPRESSION_TYPE.NO_COMPRESSION) {
                this.isInvalid = true;

                return;
            }
            offsetBytes += blobConstants.BLOB_ENCODING.BYTES_COMPRESSION_TYPE * 2;

            // read body length
            // check 4 bytes can be read
            if (tmpBlobdata.length / 2 < offsetBytes + blobConstants.BLOB_ENCODING.BYTES_BODY_LENGTH) {
                this.isInvalid = true;

                return;
            }
            const bodyLen = Scalar.e(parseInt(tmpBlobdata.slice(offsetBytes, offsetBytes + blobConstants.BLOB_ENCODING.BYTES_BODY_LENGTH * 2), 16));
            offsetBytes += blobConstants.BLOB_ENCODING.BYTES_BODY_LENGTH * 2;

            // read batches
            let bytesBodyReaded = 0;
            while (offsetBytes < bodyLen) {
                // check 4 bytes can be read
                if (tmpBlobdata.length / 2 < offsetBytes + blobConstants.BLOB_ENCODING.BYTES_BATCH_LENGTH) {
                    this.isInvalid = true;

                    return;
                }
                const batchLength = Scalar.e(parseInt(tmpBlobdata.slice(offsetBytes, offsetBytes + blobConstants.BLOB_ENCODING.BYTES_BATCH_LENGTH * 2), 16));
                offsetBytes += blobConstants.BLOB_ENCODING.BYTES_BATCH_LENGTH * 2;
                bytesBodyReaded += blobConstants.BLOB_ENCODING.BYTES_BATCH_LENGTH;

                // check batchLength bytes can be read
                if (tmpBlobdata.length / 2 < offsetBytes + batchLength) {
                    this.isInvalid = true;

                    return;
                }

                // do not add empty batch
                if (batchLength !== 0) {
                    const batchData = tmpBlobdata.slice(offsetBytes, offsetBytes + 2 * batchLength);
                    this.batches.push(batchData);
                }
                offsetBytes += 2 * batchLength;
                bytesBodyReaded += batchLength;
            }

            // check length matches
            if (bodyLen !== bytesBodyReaded) {
                this.isInvalid = true;
            }
        } else {
            // TODO: Build empty blobInner with no batches. Almost same result
            throw new Error('BlobProcessor:executeBlob: no data added');
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
            this.pointZ = Constants.ZERO_BYTES32;
            this.pointY = Constants.ZERO_BYTES32;
        } else if (this.blobType === blobConstants.BLOB_TYPE.EIP4844) {
            // blobL2HashData not used
            this.blobL2HashData = Constants.ZERO_BYTES32;
            // compute points
            this.pointZ = await computePointZ(this.blobData);
            this.pointY = await computePointY(this.blobData, this.pointZ);
        } else {
            throw new Error('BlobProcessor:executeBlob: invalid blob type');
        }

        this.newBlobAccInputHash = computeBlobAccInputHash(
            this.oldBlobAccInputHash,
            this.lastL1InfoTreeIndex,
            this.lastL1InfoTreeRoot,
            this.timestampLimit,
            this.sequencerAddress,
            this.zkGasLimit,
            this.blobType,
            this.pointZ,
            this.pointY,
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
                this.finalAccBatchHashData = await computeBatchAccInputHash(
                    this.finalAccBatchHashData,
                    await computeBatchL2HashData(batchData),
                    this.sequencerAddress,
                    (this.blobType === blobConstants.BLOB_TYPE.FORCED) ? this.forcedHashData : Constants.ZERO_BYTES32,
                );
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
            y: this.pointY,
            z: this.pointZ,
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

        // add extra data
        // add DB
        this.starkInput.blobData = this.blobData;
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
