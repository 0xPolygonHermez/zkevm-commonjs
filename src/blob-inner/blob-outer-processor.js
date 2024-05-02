/* eslint-disable max-len */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-continue */
const { Scalar } = require('ffjavascript');
const Constants = require('../constants');

module.exports = class BlobOuter {
    /**
     * constructor BlobOuterProcessor class
     * @param {Object} blobInner - blobInner stark inputs - outputs
     * @param {Object} aggBatches - aggregateBatches stark inputs - outputs
     */
    constructor(
        blobInner,
        aggBatches,
    ) {
        // inputs
        this.blobInner = blobInner;
        this.aggBatches = aggBatches;

        // internal use
        this.builded = false;

        // initialize outputs thta may chnage depending the blobInner and aggBatches
        this.newStateRoot = this.blobInner.oldStateRoot;
        this.newLocalExitRoot = Constants.ZERO_BYTES32;
        this.starkInput = {};
    }

    /**
     * Execute Blob Outer
     */
    async execute() {
        // build blobData
        await this._processBlobOuter();

        // compute stark input
        await this._computeStarkInput();

        this.builded = true;
    }

    /**
     * Process Blob Outer
     */
    _processBlobOuter() {
        // sanity check between blobInner and aggregation batches
        // oldStateRoot
        if (this.blobInner.oldStateRoot !== this.aggBatches.oldStateRoot) {
            throw new Error('BlobOuter:_processBlobOuter: oldStateRoot mismatch');
        }

        // forkID
        if (this.blobInner.forkID !== this.aggBatches.forkID) {
            throw new Error('BlobOuter:_processBlobOuter: oldBlobStateRoot mismatch');
        }

        // add table to map final outputs
        // | isInvalid | isZero(accBatch_blob) | isEqualAccBatch | isTimeOK | isIndexEqual | isRootEqual | isNewStateRootEqual | **newLocalExitRoot** | **newStateRoot** | **FAIL PROOF** |
        // |:---------:|:---------------------:|:---------------:|:--------:|:------------:|:-----------:|:-------------------:|:--------------------:|:----------------:|:--------------:|
        // |     1     |           X           |        X        |    X     |      X       |      X      |          X          |       blob_ler       |     blob_SR      |       0        |
        // |     0     |           1           |        X        |    X     |      X       |      X      |          X          |       blob_ler       |     blob_SR      |       0        |
        // |     0     |           0           |        0        |    X     |      X       |      X      |          X          |          X           |        X         |       1        |
        // |     0     |           0           |        1        |    0     |      X       |      X      |          X          |       blob_ler       |     blob_SR      |       0        |
        // |     0     |           0           |        1        |    1     |      0       |      X      |          X          |       blob_ler       |     blob_SR      |       0        |
        // |     0     |           0           |        1        |    1     |      1       |      0      |          X          |          X           |        X         |       1        |
        // |     0     |           0           |        1        |    1     |      1       |      1      |          1          |       batch_SR       |    batch_ler     |       0        |
        // |     0     |           0           |        1        |    1     |      1       |      1      |          0          |       blob_ler       |     blob_SR      |       0        |

        if (this.blobInner.isInvalid) {
            this.newLocalExitRoot = this.blobInner.localExitRootFromBlob;
            this.newStateRoot = this.blobInner.oldStateRoot;

            return;
        }

        // isZero(accBatch_blob)
        if (Scalar.eq(this.blobInner.newBlobAccInputHash, Constants.ZERO_BYTES32)) {
            this.newLocalExitRoot = this.blobInner.localExitRootFromBlob;
            this.newStateRoot = this.blobInner.oldStateRoot;

            return;
        }

        if (Scalar.neq(this.blobInner.finalAccBatchHashData, this.aggBatches.newBatchAccInputHash)) {
            throw new Error('BlobOuter:_processBlobOuter: accBatchHashData mismatch');
        }

        if (!Scalar.leq(this.aggBatches.newLastTimestamp, this.blobInner.timestampLimit)) {
            this.newLocalExitRoot = this.blobInner.localExitRootFromBlob;
            this.newStateRoot = this.blobInner.oldStateRoot;

            return;
        }

        if (Scalar.neq(this.blobInner.lastL1InfoTreeIndex, this.aggBatches.currentL1InfoTreeIndex)) {
            this.newLocalExitRoot = this.blobInner.localExitRootFromBlob;
            this.newStateRoot = this.blobInner.oldStateRoot;

            return;
        }

        if (Scalar.neq(this.blobInner.lastL1InfoTreeRoot, this.aggBatches.currentL1InfoTreeRoot)) {
            throw new Error('BlobOuter:_processBlobOuter: L1InfoTreeRoot mismatch');
        }

        if (Scalar.neq(this.blobInner.expectedNewStateRoot, this.aggBatches.newStateRoot)) {
            this.newLocalExitRoot = this.blobInner.localExitRootFromBlob;
            this.newStateRoot = this.blobInner.oldStateRoot;

            return;
        }

        // set outputs from batch aggregation
        this.newLocalExitRoot = this.aggBatches.newLocalExitRoot;
        this.newStateRoot = this.aggBatches.newStateRoot;
    }

    async _computeStarkInput() {
        this.starkInput = {
            // inputs
            oldStateRoot: this.aggBatches.oldStateRoot,
            oldBlobStateRoot: this.blobInner.oldBlobStateRoot,
            oldBlobAccInputHash: this.blobInner.oldBlobAccInputHash,
            oldNumBlob: this.blobInner.oldNumBlob,
            chainID: this.aggBatches.chainID,
            forkID: this.blobInner.forkID,
            // outputs
            newStateRoot: this.newStateRoot,
            newBlobStateRoot: this.blobInner.newBlobStateRoot,
            newBlobAccInputHash: this.blobInner.newBlobAccInputHash,
            newNumBlob: this.blobInner.newNumBlob,
            newLocalExitRoot: this.newLocalExitRoot,
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
     * Throw error if blob outer is not already builded
     */
    _isNotBuilded() {
        if (this.builded) {
            throw new Error('BlobProcessor:_isBuilded: already builded');
        }
    }

    /**
     * Throw error if blob outer is already builded
     */
    _isBuilded() {
        if (!this.builded) {
            throw new Error('BlobProcessor:_isBuilded: must first be builded');
        }
    }
};
