const { Scalar } = require('ffjavascript');
const smtUtils = require('./smt-utils');

/**
 * Get the current state of an ethereum address
 * @param {String} ethAddr ethereum address
 * @param {Object} smt merkle tree structure
 * @param {Array[Field]} root merkle tree root
 * @returns {Object} ethereum address state
 */
async function getState(ethAddr, smt, root) {
    const keyBalance = await smtUtils.keyEthAddrBalance(ethAddr);
    const keyNonce = await smtUtils.keyEthAddrNonce(ethAddr);

    let response;
    try {
        const resBalance = await smt.get(root, keyBalance);
        const resNonce = await smt.get(root, keyNonce);
        response = {
            balance: resBalance.value,
            nonce: resNonce.value,
        };
    } catch (error) {
        response = {
            balance: Scalar.e(0),
            nonce: Scalar.e(0),
        };
    }

    return response;
}

/**
 * Set a state of an ethereum address
 * @param {String} ethAddr ethereum address
 * @param {Object} smt merkle tree structure
 * @param {Array[Field]} root merkle tree root
 * @param {Scalar|Number} balance new balance
 * @param {Scalar|Number} nonce new nonce
 * @returns {Array[Field]} new state root
 */
async function setAccountState(ethAddr, smt, root, balance, nonce) {
    const keyBalance = await smtUtils.keyEthAddrBalance(ethAddr);
    const keyNonce = await smtUtils.keyEthAddrNonce(ethAddr);

    let auxRes = await smt.set(root, keyBalance, Scalar.e(balance));
    auxRes = await smt.set(auxRes.newRoot, keyNonce, Scalar.e(nonce));

    return auxRes.newRoot;
}

/**
 * Get the hash(bytecode) of a smart contract
 * @param {String} ethAddr ethereum address
 * @param {Object} smt merkle tree structure
 * @param {Array[Field]} root merkle tree root
 * @returns {String} hash(bytecode) represented as hexadecimal string
 */
async function getContractHashBytecode(ethAddr, smt, root) {
    const keyContractCode = await smtUtils.keyContractCode(ethAddr);
    const res = await smt.get(root, keyContractCode);

    return `0x${res.value.toString(16).padStart(64, '0')}`;
}

/**
 * Get the bytecode length of a smart contract
 * @param {String} ethAddr ethereum address
 * @param {Object} smt merkle tree structure
 * @param {Array[Field]} root merkle tree root
 * @returns {Number} contract length in bytes
 */
async function getContractBytecodeLength(ethAddr, smt, root) {
    const keyContractLength = await smtUtils.keyContractLength(ethAddr);
    const res = await smt.get(root, keyContractLength);

    return Number(res.value);
}

/**
 * Set the bytecode and its length of a smart contract
 * @param {String} ethAddr ethereum address
 * @param {Object} smt merkle tree structure
 * @param {Array[Field]} root merkle tree root
 * @param {String} bytecode smart contract bytecode represented as hexadecimal string
 * @param {Bool} flagDelete flag to set bytecode to 0
 * @returns {Array[Field]} new state root
 */
async function setContractBytecode(ethAddr, smt, root, bytecode) {
    const keyContractCode = await smtUtils.keyContractCode(ethAddr);
    const keyContractLength = await smtUtils.keyContractLength(ethAddr);

    const hashByteCode = await smtUtils.hashContractBytecode(bytecode);
    let parsedBytecode = bytecode.startsWith('0x') ? bytecode.slice(2) : bytecode.slice();
    parsedBytecode = (parsedBytecode.length % 2) ? `0${parsedBytecode}` : parsedBytecode;
    const bytecodeLength = parsedBytecode.length / 2;
    let res = await smt.set(root, keyContractCode, Scalar.fromString(hashByteCode, 16));
    res = await smt.set(res.newRoot, keyContractLength, bytecodeLength);

    return res.newRoot;
}

/**
 * Get the sorage values of a smart contract
 * @param {String} ethAddr ethereum address
 * @param {Object} smt merkle tree structure
 * @param {Array[Field]} root merkle tree root
 * @param {Array[String|Scalar]} storagePos smart contract storage position
 * @returns {Object} mapping [storagePosition - value]
 */
async function getContractStorage(ethAddr, smt, root, storagePos) {
    const res = {};

    for (let i = 0; i < storagePos.length; i++) {
        const pos = storagePos[i];
        const keyStoragePos = await smtUtils.keyContractStorage(ethAddr, pos);
        const resSMT = await smt.get(root, keyStoragePos);
        res[(Scalar.e(pos)).toString()] = resSMT.value;
    }

    return res;
}

/**
 * Set the storage of a smart contract address
 * @param {String} ethAddr ethereum address
 * @param {Object} smt merkle tree structure
 * @param {Array[Field]} root merkle tree root
 * @param {Object} storage [key-value] object containing [storagePos - stoValue]
 * @returns {Array[Field]} new state root
 */
async function setContractStorage(ethAddr, smt, root, storage) {
    let tmpRoot = root;

    const storagePos = Object.keys(storage);

    for (let i = 0; i < storagePos.length; i++) {
        const pos = storagePos[i];
        const value = storage[pos];

        const keyStoragePos = await smtUtils.keyContractStorage(ethAddr, pos);

        const auxRes = await smt.set(tmpRoot, keyStoragePos, Scalar.e(value));
        tmpRoot = auxRes.newRoot;
    }

    return tmpRoot;
}

/**
 * Set the smt genesis with an array of addresses, amounts and nonces
 * @param {String} addressArray ethereum address array
 * @param {Object} amountArray amount array
 * @param {Array[Field]} nonceArray nonce array
 * @param {Object} smt merkle tree structure
 */
async function setGenesisBlock(addressArray, amountArray, nonceArray, smt) {
    let currentRoot = smt.empty;
    for (let i = 0; i < addressArray.length; i++) {
        currentRoot = await setAccountState(addressArray[i], smt, currentRoot, amountArray[i], nonceArray[i]);
    }

    return currentRoot;
}

module.exports = {
    getState,
    setAccountState,
    setContractBytecode,
    setContractStorage,
    getContractBytecodeLength,
    getContractHashBytecode,
    getContractStorage,
    setGenesisBlock,
};
