const { Scalar } = require('ffjavascript');

const Constants = require('./constants');
const Executor = require('./executor');
const SMT = require('./smt');
const { getState } = require('./state-utils');

class ZkEVMDB {
    constructor(db, lastBatch, stateRoot, localExitRoot, globalExitRoot, arity, seqChainID, poseidon, sequencerAddress) {
        this.db = db;
        this.lastBatch = lastBatch || Scalar.e(0);
        this.poseidon = poseidon;
        this.F = poseidon.F;

        this.stateRoot = stateRoot || this.F.e(0);
        this.localExitRoot = localExitRoot || this.F.e(0);
        this.globalExitRoot = globalExitRoot || this.F.e(0);

        this.arity = arity;
        this.seqChainID = seqChainID;
        this.sequencerAddress = sequencerAddress;

        this.smt = new SMT(this.db, this.arity, this.poseidon, this.F);
    }

    /**
     * Return a new Executor with the current RollupDb state
     * @param {Scalar} maxNTx - Maximum number of transactions
     */
    async buildBatch(maxNTx = Constants.DEFAULT_MAX_TX) {
        return new Executor(
            this.db,
            Scalar.add(this.lastBatch, 1),
            this.arity,
            this.poseidon,
            maxNTx,
            this.seqChainID,
            this.stateRoot,
            this.sequencerAddress,
            this.localExitRoot,
            this.globalExitRoot,
        );
    }

    /**
     * Consolidate a batch by writing it in the DB
     * @param {Object} executor - Executor object
     */
    async consolidate(executor) {
        if (executor.batchNumber !== Scalar.add(this.lastBatch, 1)) {
            throw new Error('Updating the wrong batch');
        }

        if (!executor.builded) {
            await executor.executeTxs();
        }

        // Populate actual DB with the keys and values inserted in the batch
        await executor.tmpSmtDB.populateSrcDb();

        // set state root
        await this.db.setValue(
            Scalar.add(Constants.DB_STATE_ROOT, executor.batchNumber),
            this.F.toString(executor.currentStateRoot),
        );

        // Set local exit root
        await this.db.setValue(
            Scalar.add(Constants.DB_LOCAL_EXIT_ROOT, executor.batchNumber),
            this.F.toString(executor.currentLocalExitRoot),
        );

        // Set global exit root
        await this.db.setValue(
            Scalar.add(Constants.DB_GLOBAL_EXIT_ROOT, executor.batchNumber),
            this.F.toString(executor.globalExitRoot),
        );

        // Set last batch number
        await this.db.setValue(
            Constants.DB_LAST_BATCH,
            executor.batchNumber,
        );

        // Update ZKEVMDB variables
        this.lastBatch = executor.batchNumber;
        this.stateRoot = executor.currentStateRoot;
        this.localExitRoot = executor.currentLocalExitRoot;
        this.globalExitRoot = executor.globalExitRoot;
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
     * @returns {Scalar} batch Number
     */
    getCurrentNumBatch() {
        return this.lastBatch;
    }

    /**
     * Get the current state root
     * @returns {Uint8Array} state root
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
     * Get the current global exit root
     * @returns {String} global exit root
     */
    getCurrentGlobalExitRoot() {
        return this.globalExitRoot;
    }

    /**
     * Create a new instance of the ZkEVMDB
     * @param {Object} db - Mem db object
     * @param {Object} seqChainID - Sequencer chian id
     * @param {Object} poseidon - Poseidon object
     * @param {String} sequencerAddress - Sequencer address
     * @param {Uint8Array} root - Executor object
     * @returns {Object} ZkEVMDB object
     */
    static async newZkEVM(db, seqChainID, arity, poseidon, sequencerAddress, stateRoot, localExitRoot, globalExitRoot) {
        try {
            const lastBatch = await db.getValue(Constants.DB_LAST_BATCH);
            const DBStateRoot = await db.getValue(Scalar.add(Constants.DB_STATE_ROOT, lastBatch));
            const DBLocalExitRoot = await db.getValue(Scalar.add(Constants.DB_LOCAL_EXIT_ROOT, lastBatch));
            const DBGlobalExitRoot = await db.getValue(Scalar.add(Constants.DB_GLOBAL_EXIT_ROOT, lastBatch));
            const dBSeqChainID = Scalar.toNumber(await db.getValue(Constants.DB_SEQ_CHAINID));
            const dBArity = Scalar.toNumber(await db.getValue(Constants.DB_ARITY));

            return new ZkEVMDB(
                db,
                lastBatch,
                DBStateRoot,
                DBLocalExitRoot,
                DBGlobalExitRoot,
                dBArity,
                dBSeqChainID,
                poseidon,
                sequencerAddress,
            );
        } catch (error) {
            const setSeqChainID = seqChainID || Constants.DEFAULT_SEQ_CHAINID;
            const setArity = arity || Constants.DEFAULT_ARITY;

            await db.setValue(Constants.DB_SEQ_CHAINID, setSeqChainID);
            await db.setValue(Constants.DB_ARITY, setArity);

            return new ZkEVMDB(
                db,
                Scalar.e(0),
                stateRoot,
                localExitRoot,
                globalExitRoot,
                setArity,
                setSeqChainID,
                poseidon,
                sequencerAddress,
            );
        }
    }
}

module.exports = ZkEVMDB;
