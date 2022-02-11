const { Scalar } = require('ffjavascript');
const smtUtils = require('./smt-utils');

/**
 * Get the current state of an ethereum address
 * @param {String} ethAddr ethereum address
 * @param {Object} smt merkle tree structure
 * @param {Uint8Array} root merkle tree root
 * @returns {Object} ethereum address state
 */
async function getState(ethAddr, smt, root) {
    const keyBalance = await smtUtils.keyEthAddrBalance(ethAddr, smt.arity);
    const keyNonce = await smtUtils.keyEthAddrNonce(ethAddr, smt.arity);

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
 * @param {Uint8Array} root merkle tree root
 * @param {Scalar|Number} balance new balance
 * @param {Scalar|Number} nonce new nonce
 * @returns {Uint8Array} new state root
 */
async function setAccountState(ethAddr, smt, root, balance, nonce) {
    const keyBalance = await smtUtils.keyEthAddrBalance(ethAddr, smt.arity);
    const keyNonce = await smtUtils.keyEthAddrNonce(ethAddr, smt.arity);

    let auxRes = await smt.set(root, keyBalance, Scalar.e(balance));
    auxRes = await smt.set(auxRes.newRoot, keyNonce, Scalar.e(nonce));

    return auxRes.newRoot;
}

/**
 * Get the hash(bytecode) of a smart contract
 * @param {String} ethAddr ethereum address
 * @param {Object} smt merkle tree structure
 * @param {Uint8Array} root merkle tree root
 * @returns {String} hash(bytecode) represented as hexadecimal string
 */
async function getContractHashBytecode(ethAddr, smt, root) {
    const keyContractCode = await smtUtils.keyContractCode(ethAddr, smt.arity);
    const res = await smt.get(root, keyContractCode);

    return res.value.toString(16).padStart(64, '0');
}

/**
 * Set the bytecode of a smart contract
 * @param {String} ethAddr ethereum address
 * @param {Object} smt merkle tree structure
 * @param {Uint8Array} root merkle tree root
 * @param {String} bytecode smart contract bytecode represented as hexadecimal string
 * @returns {Uint8Array} new state root
 */
async function setContractBytecode(ethAddr, smt, root, bytecode) {
    const hashByteCode = await smtUtils.hashContractBytecode(bytecode);
    const keyContractCode = await smtUtils.keyContractCode(ethAddr, smt.arity);

    const res = await smt.set(root, keyContractCode, Scalar.fromString(hashByteCode, 16));

    return res.newRoot;
}

/**
 * Get the sorage values of a smart contract
 * @param {String} ethAddr ethereum address
 * @param {Object} smt merkle tree structure
 * @param {Uint8Array} root merkle tree root
 * @param {Array[String|Scalar]} storagePos smart contract storage position
 * @returns {Object} mapping [storagePosition - value]
 */
async function getContractStorage(ethAddr, smt, root, storagePos) {
    const res = {};

    for (let i = 0; i < storagePos.length; i++) {
        const pos = storagePos[i];
        const keyStoragePos = await smtUtils.keyContractStorage(ethAddr, pos, smt.arity);
        const resSMT = await smt.get(root, keyStoragePos);
        res[(Scalar.e(pos)).toString()] = resSMT.value;
    }

    return res;
}

/**
 * Set the storage of a smart contract address
 * @param {String} ethAddr ethereum address
 * @param {Object} smt merkle tree structure
 * @param {Uint8Array} root merkle tree root
 * @param {Object} storage [key-value] object containing [storagePos - stoValue]
 * @returns {Uint8Array} new state root
 */
async function setContractStorage(ethAddr, smt, root, storage) {
    let tmpRoot = root;

    const storagePos = Object.keys(storage);

    for (let i = 0; i < storagePos.length; i++) {
        const pos = storagePos[i];
        const value = storage[pos];

        const keyStoragePos = await smtUtils.keyContractStorage(ethAddr, pos, smt.arity);

        const auxRes = await smt.set(tmpRoot, keyStoragePos, Scalar.e(value));
        tmpRoot = auxRes.newRoot;
    }

    return tmpRoot;
}

module.exports = {
    getState,
    setAccountState,
    setContractBytecode,
    setContractStorage,
    getContractHashBytecode,
    getContractStorage,
};
