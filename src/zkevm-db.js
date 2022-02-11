const { Scalar } = require('ffjavascript');
const VM = require('@ethereumjs/vm').default;
const Common = require('@ethereumjs/common').default;
const {
    Address, Account, BN, toBuffer,
} = require('ethereumjs-util');
const { Chain, Hardfork } = require('@ethereumjs/common');
const Constants = require('./constants');
const Processor = require('./processor');
const SMT = require('./smt');
const { getState } = require('./state-utils');

const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Berlin });

class ZkEVMDB {
    constructor(db, lastBatch, stateRoot, localExitRoot, globalExitRoot, arity, seqChainID, poseidon, sequencerAddress, vm) {
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
        this.vm = vm;
    }

    /**
     * Return a new Processor with the current RollupDb state
     * @param {Scalar} maxNTx - Maximum number of transactions
     */
    async buildBatch(maxNTx = Constants.DEFAULT_MAX_TX) {
        return new Processor(
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
            this.vm.copy(),
        );
    }

    /**
     * Consolidate a batch by writing it in the DB
     * @param {Object} processor - Processor object
     */
    async consolidate(processor) {
        if (processor.batchNumber !== Scalar.add(this.lastBatch, 1)) {
            throw new Error('Updating the wrong batch');
        }

        if (!processor.builded) {
            await processor.executeTxs();
        }

        // Populate actual DB with the keys and values inserted in the batch
        await processor.tmpSmtDB.populateSrcDb();

        // set state root
        await this.db.setValue(
            Scalar.add(Constants.DB_STATE_ROOT, processor.batchNumber),
            this.F.toString(processor.currentStateRoot),
        );

        // Set local exit root
        await this.db.setValue(
            Scalar.add(Constants.DB_LOCAL_EXIT_ROOT, processor.batchNumber),
            this.F.toString(processor.currentLocalExitRoot),
        );

        // Set global exit root
        await this.db.setValue(
            Scalar.add(Constants.DB_GLOBAL_EXIT_ROOT, processor.batchNumber),
            this.F.toString(processor.globalExitRoot),
        );

        // Set last batch number
        await this.db.setValue(
            Constants.DB_LAST_BATCH,
            processor.batchNumber,
        );

        // Update ZKEVMDB variables
        this.lastBatch = processor.batchNumber;
        this.stateRoot = processor.currentStateRoot;
        this.localExitRoot = processor.currentLocalExitRoot;
        this.globalExitRoot = processor.globalExitRoot;
        this.vm = processor.vm;
        // Consolidate batch in the evm
        await this.vm.stateManager.checkpoint();
        await this.vm.stateManager.commit();
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
     * @param {Uint8Array} root - Merkle root
     * @returns {Object} ZkEVMDB object
     */
    static async newZkEVM(db, seqChainID, arity, poseidon, sequencerAddress, stateRoot, localExitRoot, globalExitRoot, genesis, vm) {
        const lastBatch = await db.getValue(Constants.DB_LAST_BATCH);

        // If it is null, instantiate a new evm-db
        if (lastBatch === null) {
            const setSeqChainID = seqChainID || Constants.DEFAULT_SEQ_CHAINID;
            const setArity = arity || Constants.DEFAULT_ARITY;
            const newVm = new VM({ common });

            await db.setValue(Constants.DB_SEQ_CHAINID, setSeqChainID);
            await db.setValue(Constants.DB_ARITY, setArity);
            // Add genesis to the vm
            for (let j = 0; j < genesis.length; j++) {
                const {
                    address, balance, nonce,
                } = genesis[j];

                // Add account to VM
                const evmAddr = new Address(toBuffer(address));
                const evmAccData = {
                    nonce: Number(nonce),
                    balance: new BN(balance),
                };
                const evmAcc = Account.fromAccountData(evmAccData);
                await newVm.stateManager.putAccount(evmAddr, evmAcc);
            }
            // Consolidate genesis in the evm
            await newVm.stateManager.checkpoint();
            await newVm.stateManager.commit();

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
                newVm,
            );
        }

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
            vm,
        );
    }
}

module.exports = ZkEVMDB;
