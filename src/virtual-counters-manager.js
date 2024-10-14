/* eslint-disable no-undef */
/* eslint-disable multiline-comment-style */
/* eslint-disable no-restricted-globals */
/* eslint-disable consistent-return */
/* eslint-disable no-console */
/* eslint-disable max-len */
/* eslint-disable no-use-before-define */
/* eslint-disable prefer-destructuring */

// Maximum counters poseidon level when interacting with a small smt (blockInfoTree, touchedAccountsTree..), is constant
const MCPL = 23;
// Maximum counters poseidon level when interacting with a big smt (stateTree), is variable and can be updated
let MCP = 128;
const { Scalar, F1Field } = require('ffjavascript');
const { expectedModExpCounters } = require('./virtual-counters-manager-utils');

const FPEC = Scalar.e('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F');
const FNEC = Scalar.e('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
const FNEC_MINUS_ONE = Scalar.sub(FNEC, Scalar.e(1));

const SECP256R1_N = Scalar.e('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632550');
const SECP256R1_N_MINUS_ONE = Scalar.sub(SECP256R1_N, 1);
const SECP256R1_P = Scalar.e('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632550');
const SECP256R1_P_MINUS_ONE = Scalar.sub(SECP256R1_P, 1);
const SECP256R1_A = Scalar.e('0xffffffff00000001000000000000000000000000fffffffffffffffffffffffc');
const SECP256R1_B = Scalar.e('0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b');

const spentCountersByFunction = {};
module.exports = class VirtualCountersManager {
    /**
     * constructor class
     * @param {Object} config - database
     * @param {Boolean} config.verbose - Activate or deactivate verbose mode, default: false
     */
    constructor(config = {}) {
        this.configSteps = config.steps || 2 ** 23;
        // safe guard counters to not take into account (%RANGE = 1 / SAFE_RANGE)
        this.safeRange = config.safeRange || 20;
        this.totalSteps = Math.floor(this.configSteps - this.configSteps / this.safeRange);
        this.verbose = config.verbose || false;
        this.consumptionReport = [];
        this.MCPReduction = config.MCPReduction || 0.6;
        // Compute counter initial amounts
        this.currentCounters = {
            S: {
                amount: this.totalSteps,
                name: 'steps',
                initAmount: this.totalSteps,
            },
            A: {
                amount: Math.floor(this.totalSteps / 32),
                name: 'arith',
                initAmount: Math.floor(this.totalSteps / 32),
            },
            B: {
                amount: Math.floor(this.totalSteps / 16),
                name: 'binary',
                initAmount: Math.floor(this.totalSteps / 16),
            },
            M: {
                amount: Math.floor(this.totalSteps / 32),
                name: 'memAlign',
                initAmount: Math.floor(this.totalSteps / 32),
            },
            K: {
                amount: Math.floor((this.totalSteps / 155286) * 44),
                name: 'keccaks',
                initAmount: Math.floor((this.totalSteps / 155286) * 44),
            },
            D: {
                amount: Math.floor(this.totalSteps / 56),
                name: 'padding',
                initAmount: Math.floor(this.totalSteps / 56),
            },
            P: {
                amount: Math.floor(this.totalSteps / 31),
                name: 'poseidon',
                initAmount: Math.floor(this.totalSteps / 31),
            },
            SHA: {
                amount: Math.floor((this.totalSteps - 1) / 31488) * 7,
                name: 'sha256',
                initAmount: Math.floor((this.totalSteps - 1) / 31488) * 7,
            },
        };
        this.currentCountersSnapshot = {};
        this.customSnapshots = [];
        this.calledFunc = '';
        this.skipCounters = config.skipCounters || false;
    }

    /**
     *
     * @param {String} functionName function name identifier
     * @param {Object} inputsObject Inputs to pass to the function execution
     * @returns Virtual counters consumption of function execution
     */
    computeFunctionCounters(functionName, inputsObject = {}) {
        try {
            this.calledFunc = functionName;
            this._verbose(`Computing counters for function ${functionName}`);
            const func = this[functionName];
            this.initSnapshot();
            if (func && typeof func === 'function') {
                this[functionName](inputsObject);
            } else {
                this._checkCounters();
                this._throwError(`Invalid function ${functionName}`);
            }

            return this.getSnapshotConsumption();
        } catch (e) {
            this._verbose(`Error computing counters for function ${this.calledFunc}`);
            console.log(e);
            this._verbose(e);
            this._throwError(e);
        }
    }

    /**
     * Set sparse merkle tree levels for poseidon counters computation
     * @param {Number} levels number of levels
     */
    setSMTLevels(levels) {
        MCP = Math.floor(levels * this.MCPReduction);
    }

    /**
     * Inits main counters snapshot to monitor current function call consumption
     */
    initSnapshot() {
        this.currentCountersSnapshot = JSON.parse(JSON.stringify(this.currentCounters));
    }

    /**
     * Retrieves current virtual counters consumption
     * @returns Object with vcounters consumption
     */
    getSnapshotConsumption() {
        const spentCounters = {};
        Object.keys(this.currentCountersSnapshot).forEach((counter) => {
            spentCounters[this.currentCountersSnapshot[counter].name] = this.currentCountersSnapshot[counter].amount - this.currentCounters[counter].amount;
        });
        this._verbose(spentCounters);
        this.consumptionReport.push({
            function: this.calledFunc,
            vcounters: spentCounters,
        });
        this.currentCountersSnapshot = spentCounters;
        // Fill counters consumption by function
        if (!spentCountersByFunction[this.calledFunc]) {
            spentCountersByFunction[this.calledFunc] = spentCounters;
        } else {
            Object.keys(this.currentCountersSnapshot).forEach((counter) => {
                spentCountersByFunction[this.calledFunc][counter] += spentCounters[counter];
            });
        }

        return spentCounters;
    }

    /**
     * Inits custom snapshot
     * @param {String} id snapshot identifier
     */
    initCustomSnapshot(id) {
        this.customSnapshots[id] = JSON.parse(JSON.stringify(this.currentCounters));
    }

    /**
     * Retrieves custom snapshot consumption
     * @returns Object with vcounters consumption
     */
    computeCustomSnapshotConsumption(id) {
        if (!this.customSnapshots[id]) {
            this._throwError(`Invalid snapshot id ${id}`);
        }
        const spentCounters = {};
        Object.keys(this.customSnapshots[id]).forEach((counter) => {
            spentCounters[this.customSnapshots[id][counter].name] = this.customSnapshots[id][counter].amount - this.currentCounters[counter].amount;
        });

        return spentCounters;
    }
    /**
     *
     * FUNCTIONS
     *
     */

    batchProcessing(input) {
        this._checkInput(input, ['batchL2DataLength']);
        this._initBatchProcessing(input.batchL2DataLength);
        this._failAssert();
        this._consolidateBlock();
        this._finishBatchProcessing();
    }

    rlpParsing(input) {
        this._checkInput(input, ['txRLPLength', 'txDataLen', 'gasPriceLen', 'gasLimitLen', 'valueLen', 'chainIdLen', 'nonceLen']);
        const {
            txRLPLength, txDataLen, gasPriceLen, gasLimitLen, valueLen, chainIdLen, nonceLen,
        } = input;
        this._reduceCounters(250, 'S');
        this._reduceCounters(1 + 1, 'B');
        this._reduceCounters(Math.ceil((txRLPLength + 1) / 136), 'K');
        this._reduceCounters(Math.ceil((txRLPLength + 1) / 56) + 3, 'P');
        this._reduceCounters(Math.ceil((txRLPLength + 1) / 56) + 3, 'D');
        this._multiCall('_addBatchHashData', 21);
        /**
         * We need to calculate the counters consumption of `_checkNonLeadingZeros`, which calls `_getLenBytes`
         * _checkNonLeadingZeros is called 7 times
         * The worst case scenario each time `_checkNonLeadingZeros`+ `_getLenBytes` is called is the following:
         * readList -> approx 300000 bytes -> the size can be expressed with 3 bytes -> len(hex(300000)) = 3 bytes
         * gasPrice -> 256 bits -> 32 bytes
         * gasLimit -> 64 bits -> 8 bytes
         * value -> 256 bits -> 32 bytes
         * dataLen -> 300000 bytes -> xxxx bytes -> only called when txDataLen >= 56 bytes
         * chainId -> 64 bits -> 8 bytes
         * nonce -> 64 bits -> 8 bytes
         */
        this._reduceCounters(6 * 7, 'S'); // Steps to call _checkNonLeadingZeros 7 times
        const getLenBytesValues = [3, gasPriceLen, gasLimitLen, valueLen, chainIdLen, nonceLen];
        if (txDataLen >= 56) {
            getLenBytesValues.push(txDataLen);
        }
        getLenBytesValues.forEach((bytesLen) => {
            this._getLenBytes({ lenBytesInput: bytesLen });
        });
        this._divArith();
        this._multiCall('_addHashTx', 9 + Math.floor(txDataLen / 32));
        this._multiCall('_addL2HashTx', 8 + Math.floor(txDataLen / 32));
        this._multiCall('_addBatchHashByteByByte', txDataLen);
        this._SHLarith();
        input.isPrecompiled = false;
        this._ecrecover(input);
    }

    decodeChangeL2BlockTx() {
        this._reduceCounters(20, 'S');
        this._multiCall('_addBatchHashData', 3);
    }

    processTx(input) {
        this._checkInput(input, ['bytecodeLength', 'isDeploy']);
        this._reduceCounters(300, 'S');
        this._reduceCounters(11 + 7, 'B');
        this._reduceCounters(14 * MCP, 'P');
        this._reduceCounters(5, 'D');
        this._reduceCounters(2, 'A');
        this._reduceCounters(1, 'K');
        this._multiCall('_isColdAddress', 2);
        this._multiCall('_addArith', 3);
        this._subArith();
        this._divArith();
        this._multiCall('_mulArith', 4);
        this._fillBlockInfoTreeWithTxReceipt();
        this._processContractCall({ ...input, ...{ isCreate: false, isCreate2: false } });
    }

    processChangeL2Block(input) {
        this._checkInput(input, ['verifyMerkleProof']);
        this._reduceCounters(70, 'S');
        this._reduceCounters(4 + 4, 'B');
        this._reduceCounters(6 * MCP, 'P');
        this._reduceCounters(2, 'K');
        this._consolidateBlock();
        this._setupNewBlockInfoTree();
        if (input.verifyMerkleProof) {
            this._verifyMerkleProof();
        }
    }

    _verifyMerkleProof() {
        this._reduceCounters(250, 'S');
        this._reduceCounters(1, 'B');
        this._reduceCounters(33, 'K');
    }

    preECRecover(input) {
        this._checkInput(input, ['v', 'r', 's']);
        this._reduceCounters(35, 'S');
        this._reduceCounters(1, 'B');
        this._multiCall('_readFromCalldataOffset', 4);
        input.isPrecompiled = true;
        this._ecrecover(input);
        this._mStore32();
        this._mStoreX();
    }

    preECAdd() {
        this._reduceCounters(50, 'S');
        this._reduceCounters(1, 'B');
        this._multiCall('_readFromCalldataOffset', 4);
        this._multiCall('_mStore32', 4);
        this._mStoreX();
        this._ecAdd();
    }

    _ecAdd() {
        // Worst case scenario
        this._reduceCounters(800, 'S');
        this._reduceCounters(50, 'B');
        this._reduceCounters(50, 'A');
    }

    preECMul() {
        this._reduceCounters(50, 'S');
        this._reduceCounters(1, 'B');
        this._multiCall('_readFromCalldataOffset', 3);
        this._multiCall('_mStore32', 4);
        this._mStoreX();
        this._ecMul();
    }

    _ecMul() {
        // Worst case scenario
        this._reduceCounters(175000, 'S');
        this._reduceCounters(20000, 'B');
        this._reduceCounters(20000, 'A');
    }

    preECPairing(input) {
        this._checkInput(input, ['inputsCount']);
        this._reduceCounters(50, 'S');
        this._reduceCounters(1, 'B');
        this._multiCall('_readFromCalldataOffset', 6);
        this._divArith();
        this._mStore32();
        this._mStoreX();
        this._ecPairing(input.inputsCount);
    }

    _ecPairing(inputsCount) {
        // worst case scenario
        this._reduceCounters(16 + inputsCount * 200000 + 175000, 'S');
        this._reduceCounters(inputsCount * 4100 + 750, 'B');
        this._reduceCounters(inputsCount * 15000 + 17500, 'A');
    }

    preModExp(input) {
        this._checkInput(input, ['calldataLength', 'returnDataLength', 'bLen', 'mLen', 'eLen', 'base', 'exponent', 'modulus']);
        this._reduceCounters(100, 'S');
        this._reduceCounters(20, 'B');
        this._multiCall('_readFromCalldataOffset', 4);
        this._SHRarith();
        this._multiCall('_addArith', 2);
        this._multiCall('_divArith', 3);
        this._multiCall('_mulArith', 3);
        this._subArith();
        this._multiCall('_SHLarith', 2);
        this._multiCall('_mStoreX', 2);
        this._multiCall('_preModExpLoop', Math.floor(input.calldataLength / 32));
        this._multiCall('_preModExpLoop', Math.floor(input.returnDataLength / 32));
        if (input.modulus > 0) {
            this._modexp(input.bLen, input.mLen, input.eLen, input.base, input.exponent, input.modulus);
        }
    }

    _modexp(bLen, mLen, eLen, base, exponent, modulus) {
        const modexpCounters = expectedModExpCounters(Math.ceil(bLen / 32), Math.ceil(mLen / 32), Math.ceil(eLen / 32), base, exponent, modulus);
        this._reduceCounters(modexpCounters.steps, 'S');
        this._reduceCounters(modexpCounters.binaries, 'B');
        this._reduceCounters(modexpCounters.ariths, 'A');
    }

    _preModExpLoop() {
        this._reduceCounters(8, 'S');
        this._mStore32();
    }

    preSHA256(input) {
        this._checkInput(input, ['calldataLength']);
        this._reduceCounters(100, 'S');
        this._reduceCounters(1, 'B');
        this._reduceCounters(Math.ceil((input.calldataLength + 1 + 8) / 64), 'SHA');
        this._multiCall('_divArith', 2);
        this._mStore32();
        this._mStoreX();
        this._multiCall('_preSHA256Loop', Math.floor(input.calldataLength / 32));
        this._readFromCalldataOffset();
        this._SHRarith();
    }

    _preSHA256Loop() {
        this._reduceCounters(11, 'S');
        this._readFromCalldataOffset();
    }

    preIdentity(input) {
        this._checkInput(input, ['calldataLength', 'returnDataLength']);
        this._reduceCounters(45, 'S');
        this._reduceCounters(2, 'B');
        this._divArith();
        // identity loop
        this._multiCall('_identityLoop', Math.floor(input.calldataLength / 32));
        this._readFromCalldataOffset();
        this._mStoreX();
        // identity return loop
        this._multiCall('_identityReturnLoop', Math.floor(input.returnDataLength / 32));
        this._mLoadX();
        this._mStoreX();
    }

    _identityLoop() {
        this._reduceCounters(8, 'S');
        this._readFromCalldataOffset();
        this._mStore32();
    }

    _identityReturnLoop() {
        this._reduceCounters(12, 'S');
        this._mLoad32();
        this._mStore32();
    }

    preP256Verify(input) {
        this._checkInput(input, ['r', 's', 'x', 'y']);
        this._reduceCounters(50, 'S');
        this._reduceCounters(1, 'B');
        this._multiCall('_readFromCalldataOffset', 5);
        this._p256verify(input);
        this._mStore32();
        this._mStoreX();
    }

    _p256verify(input) {
        if(input.r === 0n) {
            this._reduceCounters(13, 'S');
            this._reduceCounters(1, 'B');
            return;
        } else if(Scalar.lt(SECP256R1_N_MINUS_ONE, input.r)) {
            this._reduceCounters(15, 'S');
            this._reduceCounters(2, 'B');
            return;
        } else if(input.s === 0n) {
            this._reduceCounters(17, 'S');
            this._reduceCounters(3, 'B');
            return;
        } else if(Scalar.lt(SECP256R1_N_MINUS_ONE, input.s)) {
            this._reduceCounters(19, 'S');
            this._reduceCounters(4, 'B');
            return;
        } else if(Scalar.lt(SECP256R1_P_MINUS_ONE, input.x)) {
            this._reduceCounters(22, 'S');
            this._reduceCounters(5, 'B');
            return;
        } else if(Scalar.lt(SECP256R1_P_MINUS_ONE, input.y)) {
            this._reduceCounters(24, 'S');
            this._reduceCounters(6, 'B');
            return;
        } else if(input.x === 0n && input.y === 0n) {
            this._reduceCounters(29, 'S');
            this._reduceCounters(8, 'B');
        } else {
            const aux_y2 = Scalar.exp(input.y, 2);
            const aux_x3 = Scalar.exp(input.x, 3);
            const aux_ax_b = Scalar.add(Scalar.mul(input.x, SECP256R1_A), SECP256R1_B);
            const aux_x3_ax_b = Scalar.add(aux_x3, aux_ax_b);
            if (!aux_y2.eq(aux_x3_ax_b)) {
                this._reduceCounters(104, 'S');
                this._reduceCounters(15, 'B');
                this._reduceCounters(12, 'A');
                return;
            }
            this._reduceCounters(7718, 'S');
            this._reduceCounters(22, 'B');
            this._reduceCounters(531, 'A');
        }
    }

    opAdd(input) {
        this._opcode(input);
        this._reduceCounters(10, 'S');
        this._reduceCounters(1, 'B');
    }

    opMul(input) {
        this._opcode(input);
        this._reduceCounters(10, 'S');
        this._mulArith();
    }

    opSub(input) {
        this._opcode(input);
        this._reduceCounters(10, 'S');
        this._reduceCounters(1, 'B');
    }

    opDiv(input) {
        this._opcode(input);
        this._reduceCounters(15, 'S');
        this._divArith();
    }

    opSDiv(input) {
        this._opcode(input);
        this._reduceCounters(25, 'S');
        this._reduceCounters(1, 'B');
        this._multiCall('_abs', 2);
        this._divArith();
    }

    opMod(input) {
        this._opcode(input);
        this._reduceCounters(20, 'S');
        this._divArith();
    }

    opSMod(input) {
        this._opcode(input);
        this._reduceCounters(20, 'S');
        this._reduceCounters(1, 'B');
        this._multiCall('_abs', 2);
        this._divArith();
    }

    opAddMod(input) {
        this._opcode(input);
        this._reduceCounters(30, 'S');
        this._reduceCounters(3, 'B');
        this._reduceCounters(1, 'A');
    }

    opMulMod(input) {
        this._opcode(input);
        this._reduceCounters(10, 'S');
        this._utilMulMod();
    }

    opExp(input) {
        this._opcode(input);
        this._checkInput(input, ['bytesExponentLength']);
        this._reduceCounters(10, 'S');
        this._getLenBytes({ lenBytesInput: input.bytesExponentLength });
        this._expAd({ lenBitsInput: input.bytesExponentLength * 8 });
    }

    opSignExtend(input) {
        this._opcode(input);
        this._reduceCounters(20, 'S');
        this._reduceCounters(6, 'B');
        this._reduceCounters(2 * MCP, 'P');
    }

    opBlockHash(input) {
        this._opcode(input);
        this._reduceCounters(15, 'S');
        this._reduceCounters(MCP, 'P');
        this._reduceCounters(1, 'K');
    }

    opCoinbase(input) {
        this._opcode(input);
        this._reduceCounters(5, 'S');
    }

    opTimestamp(input) {
        this._opcode(input);
        this._reduceCounters(5, 'S');
    }

    opNumber(input) {
        this._opcode(input);
        this._reduceCounters(5, 'S');
    }

    opDifficulty(input) {
        this._opcode(input);
        this._reduceCounters(5, 'S');
    }

    opGasLimit(input) {
        this._opcode(input);
        this._reduceCounters(5, 'S');
    }

    opChainId(input) {
        this._opcode(input);
        this._reduceCounters(5, 'S');
    }

    opCalldataLoad(input) {
        this._opcode(input);
        this._reduceCounters(15, 'S');
        this._readFromCalldataOffset();
    }

    opCalldataSize(input) {
        this._opcode(input);
        this._reduceCounters(10, 'S');
    }

    opCalldataCopy(input) {
        this._opcode(input);
        this._checkInput(input, ['inputSize']);
        this._reduceCounters(100, 'S');
        this._reduceCounters(2, 'B');
        this._saveMem({ length: input.inputSize });
        this._offsetUtil();
        this._multiCall('_opCalldataCopyLoop', Math.floor(input.inputSize / 32));
        this._readFromCalldataOffset();
        this._multiCall('_mStoreX', 2);
    }

    _opCalldataCopyLoop() {
        this._reduceCounters(30, 'S');
        this._readFromCalldataOffset();
        this._offsetUtil();
        this._reduceCounters(1, 'M');
    }

    opCodeSize(input) {
        this._opcode(input);
        this._reduceCounters(10, 'S');
        this._reduceCounters(MCP, 'P');
    }

    opExtCodeSize(input) {
        this._opcode(input);
        this._reduceCounters(10, 'S');
        this._reduceCounters(MCP, 'P');
        this._maskAddress();
        this._isColdAddress();
    }

    opExtCodeCopy(input) {
        this._opcode(input);
        this._checkInput(input, ['bytecodeLen', 'inputSize']);
        this._reduceCounters(60, 'S');
        this._maskAddress();
        this._isColdAddress();
        this._reduceCounters(2 * MCP + Math.ceil(input.bytecodeLen / 56), 'P');
        this._reduceCounters(Math.ceil(input.bytecodeLen / 56), 'D');
        this._multiCall('_divArith', 2);
        this._saveMem({ length: input.inputSize });
        this._mulArith();
        this._reduceCounters(input.inputSize, 'M');
        this._multiCall('_opCodeCopyLoop', input.inputSize);
        this._reduceCounters(1, 'B');
    }

    opCodeCopy(input) {
        this._opcode(input);
        this._checkInput(input, ['inputSize', 'isCreate', 'isDeploy']);
        if (input.isCreate || input.isDeploy) {
            this.opCalldataCopy(input);
        } else {
            this._reduceCounters(40, 'S');
            this._reduceCounters(3, 'B');
            this._saveMem({ length: input.inputSize });
            this._divArith();
            this._mulArith();
            this._multiCall('_opCodeCopyLoop', input.inputSize);
        }
    }

    _opCodeCopyLoop() {
        this._reduceCounters(30, 'S');
        this._reduceCounters(2, 'B');
        this._reduceCounters(1, 'M');
        this._offsetUtil();
    }

    opReturnDataSize(input) {
        this._opcode(input);
        this._reduceCounters(11, 'S');
        this._reduceCounters(1, 'B');
    }

    opReturnDataCopy(input) {
        this._opcode(input);
        this._checkInput(input, ['inputSize']);
        this._reduceCounters(50, 'S');
        this._reduceCounters(2, 'B');
        this._saveMem({ length: input.inputSize });
        this._divArith();
        this._mulArith();
        this._multiCall('_returnDataCopyLoop', Math.floor(input.inputSize / 32));
        this._mLoadX();
        this._mStoreX();
    }

    _returnDataCopyLoop() {
        this._reduceCounters(10, 'S');
        this._mLoad32();
        this._mStore32();
    }

    opExtCodeHash(input) {
        this._opcode(input);
        this._reduceCounters(10, 'S');
        this._reduceCounters(MCP, 'P');
        this._maskAddress();
        this._isColdAddress();
    }

    opLT(input) {
        this._opcode(input);
        this._reduceCounters(8, 'S');
        this._reduceCounters(1, 'B');
    }

    opGT(input) {
        this._opcode(input);
        this._reduceCounters(8, 'S');
        this._reduceCounters(1, 'B');
    }

    opSLT(input) {
        this._opcode(input);
        this._reduceCounters(8, 'S');
        this._reduceCounters(1, 'B');
    }

    opSGT(input) {
        this._opcode(input);
        this._reduceCounters(8, 'S');
        this._reduceCounters(1, 'B');
    }

    opEq(input) {
        this._opcode(input);
        this._reduceCounters(8, 'S');
        this._reduceCounters(1, 'B');
    }

    opIsZero(input) {
        this._opcode(input);
        this._reduceCounters(8, 'S');
        this._reduceCounters(1, 'B');
    }

    opAnd(input) {
        this._opcode(input);
        this._reduceCounters(10, 'S');
        this._reduceCounters(1, 'B');
    }

    opOr(input) {
        this._opcode(input);
        this._reduceCounters(10, 'S');
        this._reduceCounters(1, 'B');
    }

    opXor(input) {
        this._opcode(input);
        this._reduceCounters(10, 'S');
        this._reduceCounters(1, 'B');
    }

    opNot(input) {
        this._opcode(input);
        this._reduceCounters(10, 'S');
        this._reduceCounters(1, 'B');
    }

    opByte(input) {
        this._opcode(input);
        this._reduceCounters(15, 'S');
        this._reduceCounters(2, 'B');
        this._SHRarith();
    }

    opSHR(input) {
        this._opcode(input);
        this._reduceCounters(8, 'S');
        this._reduceCounters(1, 'B');
        this._SHRarithBit();
    }

    opSHL(input) {
        this._opcode(input);
        this._reduceCounters(8, 'S');
        this._reduceCounters(1, 'B');
        this._SHLarithBit();
    }

    opSAR(input) {
        this._opcode(input);
        this._reduceCounters(25, 'S');
        this._reduceCounters(5, 'B');
        this._SHRarithBit();
    }

    opStop(input) {
        this._opcode(input);
        this._reduceCounters(20, 'S');
    }

    opCreate(input) {
        this._opcode(input);
        this._checkInput(input, ['bytesNonceLength', 'inLength']);
        this._reduceCounters(70, 'S');
        this._reduceCounters(3, 'B');
        this._reduceCounters(3 * MCP, 'P');
        this._saveMem({ length: input.inLength });
        this._getLenBytes({ lenBytesInput: input.bytesNonceLength });
        this._computeGasSendCall();
        this._saveCalldataPointer();
        this._checkpointBlockInfoTree();
        this._checkpointTouched();
    }

    opCall(input) {
        this._opcode(input);
        this._checkInput(input, ['inLength', 'outLength']);
        this._reduceCounters(80, 'S');
        this._reduceCounters(5, 'B');
        this._maskAddress();
        this._saveMem({ length: input.inLength });
        this._saveMem({ length: input.outLength });
        this._isColdAddress();
        this._isEmptyAccount();
        this._computeGasSendCall();
        this._saveCalldataPointer();
        this._checkpointBlockInfoTree();
        this._checkpointTouched();
    }

    opCallCode(input) {
        this._opcode(input);
        this._checkInput(input, ['inLength', 'outLength']);
        this._reduceCounters(80, 'S');
        this._reduceCounters(5, 'B');
        this._maskAddress();
        this._saveMem({ length: input.inLength });
        this._saveMem({ length: input.outLength });
        this._isColdAddress();
        this._computeGasSendCall();
        this._saveCalldataPointer();
        this._checkpointBlockInfoTree();
        this._checkpointTouched();
    }

    opDelegateCall(input) {
        this._opcode(input);
        this._checkInput(input, ['inLength', 'outLength']);
        this._reduceCounters(80, 'S');
        this._maskAddress();
        this._saveMem({ length: input.inLength });
        this._saveMem({ length: input.outLength });
        this._isColdAddress();
        this._computeGasSendCall();
        this._saveCalldataPointer();
        this._checkpointBlockInfoTree();
        this._checkpointTouched();
    }

    opStaticCall(input) {
        this._opcode(input);
        this._checkInput(input, ['inLength', 'outLength']);
        this._reduceCounters(80, 'S');
        this._maskAddress();
        this._saveMem({ length: input.inLength });
        this._saveMem({ length: input.outLength });
        this._isColdAddress();
        this._computeGasSendCall();
        this._saveCalldataPointer();
        this._checkpointBlockInfoTree();
        this._checkpointTouched();
    }

    opCreate2(input) {
        this._opcode(input);
        this._checkInput(input, ['bytesNonceLength', 'inLength']);
        this._reduceCounters(80, 'S');
        this._reduceCounters(4, 'B');
        this._reduceCounters(2 * MCP, 'P');
        this._saveMem({ length: input.inLength });
        this._divArith();
        this._getLenBytes({ lenBytesInput: input.bytesNonceLength });
        this._computeGasSendCall();
        this._saveCalldataPointer();
        this._checkpointBlockInfoTree();
        this._checkpointTouched();
    }

    opReturn(input) {
        this._opcode(input);
        this._checkInput(input, ['isCreate', 'isDeploy', 'returnLength']);
        this._reduceCounters(30, 'S');
        this._reduceCounters(1, 'B');
        this._saveMem({ length: input.returnLength });
        if (input.isCreate || input.isDeploy) {
            if (input.isCreate) {
                this._reduceCounters(25, 'S');
                this._reduceCounters(2, 'B');
                this._reduceCounters(2 * MCP, 'P');
                this._checkBytecodeStartsEF();
                this._hashPoseidonLinearFromMemory({ memSize: input.returnLength });
            }
        } else {
            this._checkInput(input, ['returnLength']);
            this._multiCall('_opReturnLoop', Math.floor(input.returnLength / 32));
            this._mLoadX();
            this._mStoreX();
        }
    }

    _opReturnLoop() {
        this._reduceCounters(12, 'S');
        this._mLoad32();
        this._mStore32();
    }

    opRevert(input) {
        this._opcode(input);
        this._checkInput(input, ['revertSize']);
        this._reduceCounters(40, 'S');
        this._reduceCounters(1, 'B');
        this._revertTouched();
        this._revertBlockInfoTree();
        this._saveMem({ length: input.revertSize });
        this._multiCall('_opRevertLoop', Math.floor(input.revertSize / 32));
        this._mLoadX();
        this._mStoreX();
    }

    _opRevertLoop() {
        this._reduceCounters(12, 'S');
        this._mLoad32();
        this._mStore32();
    }

    opSendAll(input) {
        this._opcode(input);
        this._reduceCounters(60, 'S');
        this._reduceCounters(2 + 1, 'B');
        this._reduceCounters(4 * MCP, 'P');
        this._maskAddress();
        this._isEmptyAccount();
        this._isColdAddress();
        this._addArith();
    }

    opInvalid(input) {
        this._opcode(input);
        this._reduceCounters(50, 'S');
    }

    opAddress(input) {
        this._opcode(input);
        this._reduceCounters(6, 'S');
    }

    opSelfBalance(input) {
        this._opcode(input);
        this._reduceCounters(8, 'S');
        this._reduceCounters(MCP, 'P');
    }

    opBalance(input) {
        this._opcode(input);
        this._reduceCounters(8, 'S');
        this._reduceCounters(MCP, 'P');
        this._maskAddress();
        this._isColdAddress();
    }

    opOrigin(input) {
        this._opcode(input);
        this._reduceCounters(5, 'S');
    }

    opCaller(input) {
        this._opcode(input);
        this._reduceCounters(5, 'S');
    }

    opCallValue(input) {
        this._opcode(input);
        this._reduceCounters(5, 'S');
    }

    opGasPrice(input) {
        this._opcode(input);
        this._reduceCounters(5, 'S');
    }

    opGas(input) {
        this._opcode(input);
        this._reduceCounters(4, 'S');
    }

    opSha3(input) {
        this._opcode(input);
        this._checkInput(input, ['inputSize']);
        this._reduceCounters(40, 'S');
        this._reduceCounters(Math.ceil((input.inputSize + 1) / 136), 'K');
        this._saveMem({ length: input.inputSize });
        this._multiCall('_divArith', 2);
        this._mulArith();
        this._multiCall('_opSha3Loop', Math.floor(input.inputSize / 32));
        this._mLoadX();
        this._SHRarith();
    }

    _opSha3Loop() {
        this._reduceCounters(8, 'S');
        this._mLoad32();
    }

    opJump(input) {
        this._opcode(input);
        this._checkInput(input, ['isCreate', 'isDeploy']);
        this._reduceCounters(5, 'S');
        this._checkJumpDest(input);
    }

    opJumpI(input) {
        this._opcode(input);
        this._checkInput(input, ['isCreate', 'isDeploy']);
        this._reduceCounters(10, 'S');
        this._reduceCounters(1, 'B');
        this._checkJumpDest(input);
    }

    _checkJumpDest(input) {
        this._checkInput(input, ['isCreate', 'isDeploy']);
        this._reduceCounters(10, 'S');
        this._reduceCounters(1, 'B');
        if (input.isCreate) {
            if (input.isDeploy) {
                this._reduceCounters(1, 'B');
                this._mLoadX();
            }
        }
    }

    opPC(input) {
        this._opcode(input);
        this._reduceCounters(4, 'S');
    }

    opJumpDest(input) {
        this._opcode(input);
        this._reduceCounters(2, 'S');
    }

    opLog0(input) {
        this._opLog(input);
    }

    opLog1(input) {
        this._opLog(input);
    }

    opLog2(input) {
        this._opLog(input);
    }

    opLog3(input) {
        this._opLog(input);
    }

    opLog4(input) {
        this._opLog(input);
    }

    _opLog(input) {
        this._opcode(input);
        this._checkInput(input, ['inputSize']);
        this._reduceCounters(34 + 7 * 4, 'S'); // Count steps as if topics is 4
        this._saveMem({ length: input.inputSize });
        this._mulArith();
        this._divArith();
        this._reduceCounters(Math.ceil(input.inputSize / 56) + 4, 'P');
        this._reduceCounters(Math.ceil(input.inputSize / 56) + 4, 'D');
        this._multiCall('_opLogLoop', Math.floor((input.inputSize + 1) / 32));
        this._mLoadX();
        this._SHRarith();
        this._fillBlockInfoTreeWithLog();
        this._reduceCounters(1, 'B');
    }

    _opLogLoop() {
        this._reduceCounters(10, 'S');
        this._mLoad32();
    }

    opPush0(input) {
        this._opcode(input);
        this._reduceCounters(4, 'S');
    }

    _opPush1(input) {
        this._opPush({ pushBytes: 1, ...input });
    }

    _opPush2(input) {
        this._opPush({ pushBytes: 2, ...input });
    }

    _opPush3(input) {
        this._opPush({ pushBytes: 3, ...input });
    }

    _opPush4(input) {
        this._opPush({ pushBytes: 4, ...input });
    }

    _opPush5(input) {
        this._opPush({ pushBytes: 5, ...input });
    }

    _opPush6(input) {
        this._opPush({ pushBytes: 6, ...input });
    }

    _opPush7(input) {
        this._opPush({ pushBytes: 7, ...input });
    }

    _opPush8(input) {
        this._opPush({ pushBytes: 8, ...input });
    }

    _opPush9(input) {
        this._opPush({ pushBytes: 9, ...input });
    }

    _opPush10(input) {
        this._opPush({ pushBytes: 10, ...input });
    }

    _opPush11(input) {
        this._opPush({ pushBytes: 11, ...input });
    }

    _opPush12(input) {
        this._opPush({ pushBytes: 12, ...input });
    }

    _opPush13(input) {
        this._opPush({ pushBytes: 13, ...input });
    }

    _opPush14(input) {
        this._opPush({ pushBytes: 14, ...input });
    }

    _opPush15(input) {
        this._opPush({ pushBytes: 15, ...input });
    }

    _opPush16(input) {
        this._opPush({ pushBytes: 16, ...input });
    }

    _opPush17(input) {
        this._opPush({ pushBytes: 17, ...input });
    }

    _opPush18(input) {
        this._opPush({ pushBytes: 18, ...input });
    }

    _opPush19(input) {
        this._opPush({ pushBytes: 19, ...input });
    }

    _opPush20(input) {
        this._opPush({ pushBytes: 20, ...input });
    }

    _opPush21(input) {
        this._opPush({ pushBytes: 21, ...input });
    }

    _opPush22(input) {
        this._opPush({ pushBytes: 22, ...input });
    }

    _opPush23(input) {
        this._opPush({ pushBytes: 23, ...input });
    }

    _opPush24(input) {
        this._opPush({ pushBytes: 24, ...input });
    }

    _opPush25(input) {
        this._opPush({ pushBytes: 25, ...input });
    }

    _opPush26(input) {
        this._opPush({ pushBytes: 26, ...input });
    }

    _opPush27(input) {
        this._opPush({ pushBytes: 27, ...input });
    }

    _opPush28(input) {
        this._opPush({ pushBytes: 28, ...input });
    }

    _opPush29(input) {
        this._opPush({ pushBytes: 29, ...input });
    }

    _opPush30(input) {
        this._opPush({ pushBytes: 30, ...input });
    }

    _opPush31(input) {
        this._opPush({ pushBytes: 31, ...input });
    }

    _opPush32(input) {
        this._opPush({ pushBytes: 32, ...input });
    }

    _opPush(input) {
        this._opcode(input);
        this._checkInput(input, ['pushBytes', 'isCreate', 'isDeploy']);
        this._reduceCounters(2, 'S');
        if (input.isCreate || input.isDeploy) {
            if (input.isCreate) {
                this._reduceCounters(20, 'S');
                this._mLoadX();
                this._SHRarith();
            } else {
                this._reduceCounters(10, 'S');
                for (let i = 0; i < input.pushBytes; i++) {
                    this._reduceCounters(10, 'S');
                    this._SHLarith();
                }
            }
        } else {
            this._reduceCounters(10, 'S');
            this._readPush(input);
        }
    }

    opDup1(input) {
        this._opDup(input);
    }

    opDup2(input) {
        this._opDup(input);
    }

    opDup3(input) {
        this._opDup(input);
    }

    opDup4(input) {
        this._opDup(input);
    }

    opDup5(input) {
        this._opDup(input);
    }

    opDup6(input) {
        this._opDup(input);
    }

    opDup7(input) {
        this._opDup(input);
    }

    opDup8(input) {
        this._opDup(input);
    }

    opDup9(input) {
        this._opDup(input);
    }

    opDup10(input) {
        this._opDup(input);
    }

    opDup11(input) {
        this._opDup(input);
    }

    opDup12(input) {
        this._opDup(input);
    }

    opDup13(input) {
        this._opDup(input);
    }

    opDup14(input) {
        this._opDup(input);
    }

    opDup15(input) {
        this._opDup(input);
    }

    opDup16(input) {
        this._opDup(input);
    }

    _opDup(input) {
        this._opcode(input);
        this._reduceCounters(6, 'S');
    }

    opSwap1(input) {
        this._opSwap(input);
    }

    opSwap2(input) {
        this._opSwap(input);
    }

    opSwap3(input) {
        this._opSwap(input);
    }

    opSwap4(input) {
        this._opSwap(input);
    }

    opSwap5(input) {
        this._opSwap(input);
    }

    opSwap6(input) {
        this._opSwap(input);
    }

    opSwap7(input) {
        this._opSwap(input);
    }

    opSwap8(input) {
        this._opSwap(input);
    }

    opSwap9(input) {
        this._opSwap(input);
    }

    opSwap10(input) {
        this._opSwap(input);
    }

    opSwap11(input) {
        this._opSwap(input);
    }

    opSwap12(input) {
        this._opSwap(input);
    }

    opSwap13(input) {
        this._opSwap(input);
    }

    opSwap14(input) {
        this._opSwap(input);
    }

    opSwap15(input) {
        this._opSwap(input);
    }

    opSwap16(input) {
        this._opSwap(input);
    }

    _opSwap(input) {
        this._opcode(input);
        this._reduceCounters(7, 'S');
    }

    opPop(input) {
        this._opcode(input);
        this._reduceCounters(3, 'S');
    }

    opMLoad(input) {
        this._opcode(input);
        this._reduceCounters(8, 'S');
        this._saveMem({ length: 32 });
        this._mLoad32();
    }

    opMStore(input) {
        this._opcode(input);
        this._reduceCounters(22, 'S');
        this._reduceCounters(1, 'M');
        this._saveMem({ length: 32 });
        this._offsetUtil();
    }

    opMStore8(input) {
        this._opcode(input);
        this._reduceCounters(13, 'S');
        this._reduceCounters(1, 'M');
        this._saveMem({ length: 1 });
        this._offsetUtil();
    }

    opMSize(input) {
        this._opcode(input);
        this._reduceCounters(15, 'S');
        this._divArith();
    }

    opSLoad(input) {
        this._opcode(input);
        this._reduceCounters(10, 'S');
        this._reduceCounters(MCP, 'P');
        this._isColdSlot();
    }

    opSStore(input) {
        this._opcode(input);
        this._reduceCounters(70, 'S');
        this._reduceCounters(8, 'B');
        this._reduceCounters(3 * MCP, 'P');
        this._isColdSlot();
    }

    _opcode(input) {
        this._reduceCounters(12, 'S');
        if (input.isCreate2 || input.isCreate) {
            this._mLoadX();
            this._SHRarith();
        }
    }
    /**
     *
     * UTILS
     *
     */

    _expAd(input) {
        this._checkInput(input, ['lenBitsInput']);
        this._reduceCounters(30, 'S');
        this._reduceCounters(2, 'B');
        this._getLenBits({ lenBitsInput: input.lenBitsInput });
        for (let i = 0; i < input.lenBitsInput; i++) {
            this._reduceCounters(12, 'S');
            this._reduceCounters(2, 'B');
            this._divArith();
            this._mulArith();
            this._mulArith();
        }
    }

    _getLenBits(input) {
        this._checkInput(input, ['lenBitsInput']);
        this._reduceCounters(12, 'S');
        for (let i = 0; i < input.lenBitsInput; i++) {
            this._reduceCounters(9, 'S');
            this._reduceCounters(1, 'B');
            this._divArith();
        }
    }

    _setupNewBlockInfoTree() {
        this._reduceCounters(40, 'S');
        this._reduceCounters(7, 'B');
        this._reduceCounters(6 * MCPL, 'P');
    }

    _isColdSlot() {
        this._reduceCounters(20, 'S');
        this._reduceCounters(1, 'B');
        this._reduceCounters(2 * MCPL, 'P');
    }

    _readPush(input) {
        this._checkInput(input, ['pushBytes']);
        switch (input.pushBytes) {
        case 1:
            this._reduceCounters(2, 'S');
            break;
        case 2:
            this._reduceCounters(4, 'S');
            break;
        case 3:
            this._reduceCounters(5, 'S');
            break;
        case 4:
            this._reduceCounters(6, 'S');
            break;
        case 32:
            this._reduceCounters(45, 'S');
            break;
        default:
            this._reduceCounters(6 + input.pushBytes * 2, 'S'); // approx value, is a bit less
            break;
        }
    }

    _fillBlockInfoTreeWithLog() {
        this._reduceCounters(11, 'S');
        this._reduceCounters(MCPL, 'P');
        this._reduceCounters(1, 'B');
    }

    _revertTouched() {
        this._reduceCounters(2, 'S');
    }

    _revertBlockInfoTree() {
        this._reduceCounters(4, 'S');
    }

    _hashPoseidonLinearFromMemory(input) {
        this._checkInput(input, ['memSize']);
        this._reduceCounters(50, 'S');
        this._reduceCounters(1 + 1, 'B');
        this._reduceCounters(Math.ceil((input.memSize + 1) / 56), 'P');
        this._reduceCounters(Math.ceil((input.memSize + 1) / 56), 'D');
        this._divArith();
        this._multiCall('_hashPoseidonLinearFromMemoryLoop', Math.floor(input.memSize / 32));
        this._mLoadX();
        this._SHRarith();
    }

    _hashPoseidonLinearFromMemoryLoop() {
        this._reduceCounters(8, 'S');
        this._mLoad32();
    }

    _checkBytecodeStartsEF() {
        this._reduceCounters(20, 'S');
        this._mLoadX();
        this._SHRarith();
    }

    _isEmptyAccount() {
        this._reduceCounters(30, 'S');
        this._reduceCounters(3, 'B');
        this._reduceCounters(3 * MCP, 'P');
    }

    _saveCalldataPointer() {
        this._reduceCounters(6, 'S');
    }

    _checkpointTouched() {
        this._reduceCounters(2, 'S');
    }

    _checkpointBlockInfoTree() {
        this._reduceCounters(4, 'S');
    }

    _computeGasSendCall() {
        this._reduceCounters(25, 'S');
        this._reduceCounters(2, 'B');
    }

    _maskAddress() {
        this._reduceCounters(6, 'S');
        this._reduceCounters(1, 'B');
    }

    _SHLarithBit() {
        this._reduceCounters(50, 'S');
        this._reduceCounters(2, 'B');
        this._reduceCounters(2, 'A');
    }

    _SHRarithBit() {
        this._reduceCounters(30, 'S');
        this._reduceCounters(2, 'B');
        this._divArith();
    }

    _offsetUtil() {
        this._reduceCounters(10, 'S');
        this._reduceCounters(1, 'B');
    }

    _mLoad32() {
        this._reduceCounters(40, 'S');
        this._reduceCounters(2, 'B');
        this._reduceCounters(1, 'M');
        this._offsetUtil();
        this._SHRarith();
        this._SHLarith();
    }

    _mLoadX() {
        this._reduceCounters(30, 'S');
        this._reduceCounters(2, 'B');
        this._reduceCounters(1, 'M');
        this._offsetUtil();
        this._SHRarith();
        this._SHLarith();
    }

    _mStoreX() {
        this._reduceCounters(80, 'S');
        this._reduceCounters(1, 'B');
        this._reduceCounters(1, 'M');
        this._offsetUtil();
        this._multiCall('_SHRarith', 2);
        this._multiCall('_SHLarith', 2);
    }

    _mStore32() {
        this._reduceCounters(80, 'S');
        this._reduceCounters(1, 'B');
        this._reduceCounters(1, 'M');
        this._offsetUtil();
        this._multiCall('_SHRarith', 2);
        this._multiCall('_SHLarith', 2);
    }

    _saveMem(input) {
        this._checkInput(input, ['length']);
        if (input.length === 0) {
            this._reduceCounters(12, 'S');
            this._reduceCounters(1, 'B');

            return;
        }
        this._reduceCounters(50, 'S');
        this._reduceCounters(5, 'B');
        this._mulArith();
        this._divArith();
    }

    _readFromCalldataOffset() {
        this._reduceCounters(25, 'S');
        this._mLoadX();
    }

    _utilMulMod() {
        this._reduceCounters(50, 'S');
        this._reduceCounters(4, 'B');
        this._reduceCounters(2, 'A');
        this._mulArith();
    }

    _abs() {
        this._reduceCounters(10, 'S');
        this._reduceCounters(2, 'B');
    }

    _consolidateBlock() {
        this._reduceCounters(20, 'S');
        this._reduceCounters(2, 'B');
        this._reduceCounters(2 * MCPL, 'P');
    }

    _ecrecover(input) {
        this._checkInput(input, ['v', 'r', 's', 'isPrecompiled']);
        // Check ecrecover fails for invalid r,s,v
        const sUpperLimit = input.isPrecompiled ? Scalar.sub(FNEC, 1) : Scalar.div(FNEC, 2);
        if (input.r === 0n || Scalar.lt(FNEC_MINUS_ONE, input.r) || input.s === 0n || Scalar.lt(sUpperLimit, input.s) || (input.v !== 27n && input.v !== 28n)) {
            this._reduceCounters(45, 'S');
            this._reduceCounters(2, 'A');
            this._reduceCounters(8, 'B');

            return;
        }
        // Check if has sqrt to avoid counters at _checkSqrtFpEc
        const c = Scalar.mod(Scalar.add(Scalar.exp(input.r, 3), 7), FPEC);
        const Fec = new F1Field(FPEC);
        let r = Fec.sqrt(c);
        const parity = input.v === 27n ? 0n : 1n;
        if (r === null) {
            r = Scalar.e('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF');
        } else if ((r & 0x01n) !== parity) {
            r = Fec.neg(r);
        }
        const b = Number(Scalar.lt(r, FPEC));
        if (b === 0) {
            // Don't has root
            this._reduceCounters(4527, 'S');
            this._reduceCounters(1014, 'A');
            this._reduceCounters(10, 'B');

            return;
        }
        // Has root
        this._reduceCounters(6294, 'S');
        this._reduceCounters(528, 'A');
        this._reduceCounters(523, 'B');
        this._reduceCounters(1, 'K');
    }

    _processContractCall(input) {
        this._checkInput(input, ['bytecodeLength', 'isDeploy']);
        this._reduceCounters(40, 'S');
        this._reduceCounters(4 + 1, 'B');
        this._reduceCounters(1, 'P');
        this._reduceCounters(1, 'D');
        this._reduceCounters(2 * MCP, 'P');
        this._moveBalances();

        if (input.isDeploy || input.isCreate || input.isCreate2) {
            // End deploy
            this._reduceCounters(15, 'S');
            this._reduceCounters(2, 'B');
            this._reduceCounters(2 * MCP, 'P');
            this._checkBytecodeStartsEF();
            this._hashPoseidonLinearFromMemory({ memSize: input.bytecodeLength });
            if (input.isCreate) {
                this._reduceCounters(40, 'S');
                this._reduceCounters(1, 'K');
                this._maskAddress();
            } else if (input.isCreate2) {
                this._reduceCounters(40, 'S');
                this._divArith();
                this._reduceCounters(Math.ceil((input.bytecodeLength + 1) / 136) + 1, 'K');
                this._multiCall('_mLoad32', Math.floor(input.bytecodeLength / 32));
                this._mLoadX();
                this._SHRarith();
                this._reduceCounters(1, 'K');
                this._maskAddress();
            }
        } else {
            this._reduceCounters(Math.ceil((input.bytecodeLength + 1) / 56), 'P');
            this._reduceCounters(Math.ceil((input.bytecodeLength + 1) / 56), 'D');
            // This arith is used to compute the keccaks consumption so its bytecodeLength / 56, in case bytecodeLength < 56, no ariths are used
            if (input.bytecodeLength >= 56) {
                this._divArith();
            }
        }
    }

    _initBatchProcessing(batchL2DataLength) {
        // MCP + 100S + divArith + batchL2DataLength/136K + K
        this._reduceCounters(100, 'S');
        this._reduceCounters(MCP, 'P');
        this._reduceCounters(2, 'B');
        this._divArith();
        this._reduceCounters(Math.ceil((batchL2DataLength + 1) / 136), 'K');
    }

    _moveBalances() {
        this._reduceCounters(25, 'S');
        this._reduceCounters(3 + 2, 'B');
        this._reduceCounters(4 * MCP, 'P');
    }

    _fillBlockInfoTreeWithTxReceipt() {
        this._reduceCounters(20, 'S');
        this._reduceCounters(3 * MCPL, 'P');
    }

    _addArith() {
        this._reduceCounters(10, 'S');
        this._reduceCounters(1, 'B');
    }

    _subArith() {
        this._reduceCounters(10, 'S');
        this._reduceCounters(1, 'B');
    }

    _mulArith() {
        this._reduceCounters(40, 'S');
        this._reduceCounters(1, 'B');
        this._reduceCounters(1, 'A');
    }

    _isColdAddress() {
        this._reduceCounters(100, 'S');
        this._reduceCounters(2 + 1, 'B');
        this._reduceCounters(2 * MCPL, 'P');
    }

    _SHLarith() {
        this._reduceCounters(40, 'S');
        this._reduceCounters(2, 'B');
        this._reduceCounters(2, 'A');
    }

    _addHashTx() {
        this._reduceCounters(10, 'S');
    }

    _addL2HashTx() {
        this._reduceCounters(10, 'S');
    }

    _addBatchHashByteByByte() {
        this._reduceCounters(25, 'S');
        this._reduceCounters(1, 'B');
        this._SHRarith();
        this._addBatchHashData();
    }

    _getLenBytes(input) {
        this._checkInput(input, ['lenBytesInput']);
        this._reduceCounters(input.lenBytesInput * 7 + 12, 'S');
        this._reduceCounters(input.lenBytesInput * 1, 'B');
        this._multiCall('_SHRarith', input.lenBytesInput);
    }

    _SHRarith() {
        this._reduceCounters(40, 'S');
        this._reduceCounters(2, 'B');
        this._reduceCounters(1, 'A');
        this._divArith();
    }

    _addBatchHashData() {
        this._reduceCounters(10, 'S');
    }

    _finishBatchProcessing() {
        this._reduceCounters(200, 'S');
        this._reduceCounters(2, 'K');
        this._reduceCounters(MCP, 'P');
        this._reduceCounters(2, 'B');
    }

    _divArith() {
        this._reduceCounters(40, 'S');
        this._reduceCounters(3, 'B');
        this._reduceCounters(1, 'A');
    }

    _failAssert() {
        this._reduceCounters(2, 'S');
    }

    /**
     *
     * HELPERS
     *
     */

    /**
     * Calls a function multiple times
     * @param {String} functionName identifier
     * @param {Number} times Number of function calls
     * @param {Object} input function object
     */
    _multiCall(functionName, times, input) {
        for (let i = 0; i < times; i += 1) {
            this[functionName](input);
        }
    }

    /**
     * Checks object contains keys
     * @param {Object} input input function object
     * @param {Array} keys Array of keys to check
     */
    _checkInput(input = {}, keys = []) {
        // Check input object has keys
        keys.forEach((key) => {
            if (typeof input[key] === 'boolean') {
                input[key] = input[key] ? 1 : 0;
            }
            if (typeof input[key] === 'string') {
                input[key] = input[key].startsWith('0x') ? BigInt(input[key]) : BigInt(`0x${input[key]}`);
            }
            if (typeof input[key] !== 'number' && typeof input[key] !== 'bigint') {
                this._throwError(`Missing or invalid input ${key} at function ${this.calledFunc}`);
            }
        });
    }

    /**
     * Reduces counter by amount
     * @param {Number} amount vcounters to reduce
     * @param {String} counterType identifier
     */
    _reduceCounters(amount, counterType) {
        if (isNaN(amount)) this._throwError(`Invalid amount ${amount}`);
        if (!this.currentCounters[counterType]) this._throwError(`Invalid counter type ${counterType}`);
        this.currentCounters[counterType].amount -= amount;
        // this._verbose(`Reducing ${this.currentCounters[counterType].name} by ${amount} -> current amount: ${this.currentCounters[counterType].amount}`);
        this._checkCounter(counterType);
    }

    _checkCounters() {
        Object.keys(this.currentCounters).forEach((counter) => {
            this._checkCounter(counter);
        });
    }

    /**
     * Checks if counter is below 0, only if skipCounters is false
     * @param {String} counterType identifier
     */
    _checkCounter(counterType) {
        if (this.currentCounters[counterType].amount <= 0) {
            if (!this.skipCounters) {
                this._throwError(`Out of counters ${this.currentCounters[counterType].name}`);
            }
        }
    }

    _throwError(message) {
        throw new Error(message);
    }

    _verbose(message) {
        if (this.verbose) {
            console.log(message);
        }
    }

    /**
     * Retrieves current virtual counters consumption since instantiation of class
     * @returns {Object} Spent counters
     */
    getCurrentSpentCounters() {
        const spentCounters = {};
        Object.keys(this.currentCounters).forEach((counter) => {
            spentCounters[this.currentCounters[counter].name] = this.currentCounters[counter].initAmount - this.currentCounters[counter].amount;
        });
        this._verbose(spentCounters);

        return spentCounters;
    }
};
