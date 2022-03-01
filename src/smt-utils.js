const { Scalar } = require('ffjavascript');

const constants = require('./constants');
const getPoseidon = require('./poseidon');

/**
 * Converts a Scalar into an array of 4 elements encoded as Fields elements where each one represents 64 bits
 * result = [Scalar[0:64], scalar[64:128], scalar[128:192], scalar[192:256]]
 * @param {Field} Fr - field element
 * @param {Scalar} scalar - value to convert
 * @returns {Array[Field]} array of fields
 */
function scalar2fea(Fr, scalar) {
    scalar = Scalar.e(scalar);
    const r0 = Scalar.band(scalar, Scalar.e('0xFFFFFFFFFFFFFFFF'));
    const r1 = Scalar.band(Scalar.shr(scalar, 64), Scalar.e('0xFFFFFFFFFFFFFFFF'));
    const r2 = Scalar.band(Scalar.shr(scalar, 128), Scalar.e('0xFFFFFFFFFFFFFFFF'));
    const r3 = Scalar.band(Scalar.shr(scalar, 192), Scalar.e('0xFFFFFFFFFFFFFFFF'));

    return [Fr.e(r0), Fr.e(r1), Fr.e(r2), Fr.e(r3)];
}

/**
 * Field elemetn array to Scalar
 * result = arr[0] + arr[1]*(2^64) + arr[2]*(2^128) + + arr[3]*(2^192)
 * @param {Field} F - field element
 * @param {Array[Field]} arr - array of fields elements
 * @returns {Scalar}
 */
function fea2scalar(Fr, arr) {
    let res = Fr.toObject(arr[0]);
    res = Scalar.add(res, Scalar.shl(Fr.toObject(arr[1]), 64));
    res = Scalar.add(res, Scalar.shl(Fr.toObject(arr[2]), 128));
    res = Scalar.add(res, Scalar.shl(Fr.toObject(arr[3]), 192));

    return res;
}

/**
 * Field elenent to 32bit number
 * @param {Field} Fr - field element
 * @param {Field} fe - field to convert
 * @returns {Number}
 */
function fe2n(Fr, fe) {
    const maxInt = Scalar.e('0x7FFFFFFF');
    const minInt = Scalar.sub(Fr.p, Scalar.e('0x80000000'));
    const o = Fr.toObject(fe);
    if (Scalar.gt(o, maxInt)) {
        const on = Scalar.sub(Fr.p, o);
        if (Scalar.gt(o, minInt)) {
            return -Scalar.toNumber(on);
        }
        throw new Error('Accessing a no 32bit value');
    } else {
        return Scalar.toNumber(o);
    }
}

/**
 * Leaf type 0: H([ethAddr[0:8], ethAddr[8:16], ethAddr[16:24], 0, 0, ...])
 * @param {String | Scalar} _ethAddr - ethereum address represented as hexadecimal string
 * @param {Number} arity - merkle tree bits per level. p.e: 4 is 2**4 levels each tree layer
 * @returns {Scalar} - key computed
 */
async function keyEthAddrBalance(_ethAddr, arity = 4) {
    const poseidon = await getPoseidon();
    const { F } = poseidon;

    const constant = F.e(constants.SMT_KEY_BALANCE);

    let ethAddr;
    if (typeof _ethAddr === 'string') {
        ethAddr = Scalar.fromString(_ethAddr, 16);
    } else {
        ethAddr = Scalar.e(_ethAddr);
    }

    const ethAddrArr = scalar2fea(F, ethAddr);

    const key = [ethAddrArr[0], ethAddrArr[1], ethAddrArr[2], constant];

    // fill zeros until 2**arity
    for (let i = key.length; i < (1 << arity); i++) {
        key.push(F.zero);
    }

    return poseidon(key);
}

/**
 * Leaf type 1: H([ethAddr[0:8], ethAddr[8:16], ethAddr[16:24], 1, 0, ...])
 * @param {String | Scalar} _ethAddr - ethereum address represented as hexadecimal string
 * @param {Number} arity - merkle tree bits per level. p.e: 4 is 2**4 levels each tree layer
 * @returns {Scalar} - key computed
 */
async function keyEthAddrNonce(_ethAddr, arity = 4) {
    const poseidon = await getPoseidon();
    const { F } = poseidon;

    const constant = F.e(constants.SMT_KEY_NONCE);

    let ethAddr;
    if (typeof _ethAddr === 'string') {
        ethAddr = Scalar.fromString(_ethAddr, 16);
    } else {
        ethAddr = Scalar.e(_ethAddr);
    }

    const ethAddrArr = scalar2fea(F, ethAddr);

    const key = [ethAddrArr[0], ethAddrArr[1], ethAddrArr[2], constant];

    // fill zeros until 2**arity
    for (let i = key.length; i < (1 << arity); i++) {
        key.push(F.zero);
    }

    return poseidon(key);
}

/**
 * Leaf type 2: H([ethAddr[0:8], ethAddr[8:16], ethAddr[16:24], 2, 0, ...])
 * @param {String | Scalar} _ethAddr - ethereum address represented as hexadecimal string
 * @param {Number} arity - merkle tree bits per level. p.e: 4 is 2**4 levels each tree layer
 * @returns {Scalar} - key computed
 */
async function keyContractCode(_ethAddr, arity = 4) {
    const poseidon = await getPoseidon();
    const { F } = poseidon;

    const constant = F.e(constants.SMT_KEY_SC_CODE);

    let ethAddr;
    if (typeof _ethAddr === 'string') {
        ethAddr = Scalar.fromString(_ethAddr, 16);
    } else {
        ethAddr = Scalar.e(_ethAddr);
    }

    const ethAddrArr = scalar2fea(F, ethAddr);

    const key = [ethAddrArr[0], ethAddrArr[1], ethAddrArr[2], constant];

    // fill zeros until 2**arity
    for (let i = key.length; i < (1 << arity); i++) {
        key.push(F.zero);
    }

    return poseidon(key);
}

/**
 * Leaf type 3: H([ethAddr[0:8], ethAddr[8:16], ethAddr[16:24], 3, 0,
 *      stoPos[0:8], stoPos[8:16], stoPos[16:24], stoPos[24:32], ...])
 * @param {String | Scalar} _ethAddr - ethereum address represented as hexadecimal string
 * @param {Number | Scalar} _storagePos - smart contract storage position
 * @param {Number} arity - merkle tree bits per level. p.e: 4 is 2**4 levels each tree layer
 * @returns {Scalar} - key computed
 */
async function keyContractStorage(_ethAddr, _storagePos, arity = 4) {
    const poseidon = await getPoseidon();
    const { F } = poseidon;

    const constant = F.e(constants.SMT_KEY_SC_STORAGE);

    let ethAddr;
    if (typeof _ethAddr === 'string') {
        ethAddr = Scalar.fromString(_ethAddr, 16);
    } else {
        ethAddr = Scalar.e(_ethAddr);
    }

    const ethAddrArr = scalar2fea(F, ethAddr);

    const storagePos = Scalar.e(_storagePos);
    const storagePosArray = scalar2fea(F, storagePos);

    const key = [ethAddrArr[0], ethAddrArr[1], ethAddrArr[2], constant,
        storagePosArray[0], storagePosArray[1], storagePosArray[2], storagePosArray[3]];

    // fill zeros until 2**arity
    for (let i = key.length; i < (1 << arity); i++) {
        key.push(F.zero);
    }

    return poseidon(key);
}

/**
 * Fill the dbObject with all the childs recursively
 * @param {Uint8Array} node merkle node
 * @param {Object} db Mem DB
 * @param {Object} dbObject Object that will be fullfilled
 * @param {Object} Fr - poseidon F
 * @returns {Array} merkle tree
 */
async function fillDBArray(node, db, dbObject, Fr) {
    const childArray = await db.getSmtNode(node);
    const childArrayHex = childArray.map((value) => Fr.toString(value, 16).padStart(64, '0'));
    const nodeHex = Fr.toString(node, 16).padStart(64, '0');
    dbObject[nodeHex] = childArrayHex;

    if (Scalar.fromString(childArrayHex[0], 16) !== Scalar.e(1)) {
        for (let i = 0; i < childArrayHex.length; i++) {
            if (Scalar.fromString(childArrayHex[i], 16) !== Scalar.e(0)) {
                await fillDBArray(Fr.e(`0x${childArrayHex[i]}`), db, dbObject, Fr);
            }
        }
    }
}

/**
 * Return all merkle tree nodes and leafs in an Object
 * @param {Uint8Array} root merkle root
 * @param {Object} db Mem DB
 * @param {Object} Fr - poseidon F
 * @returns {Object} merkle tree
 */
async function getCurrentDB(root, db, Fr) {
    const dbObject = {};
    if (Scalar.eq(Scalar.e(Fr.toString(root)), Scalar.e(0))) {
        return null;
    }
    await fillDBArray(root, db, dbObject, Fr);

    return dbObject;
}

/**
 * Computes the bytecode hash in order to add it to the state-tree
 * @param {String} bytecode - smart contract bytecode representes as hex string
 * @returns {String} bytecode hash represented as hex string
 */
async function hashContractBytecode(_bytecode) {
    const poseidon = await getPoseidon();
    const { F } = poseidon;

    const bytecode = _bytecode.startsWith('0x') ? _bytecode.slice(2) : _bytecode;

    const numBytes = bytecode.length / 2;

    let numHashes;
    if (numBytes < constants.BYTECODE_CHUNKS * 31) {
        numHashes = 1;
    } else {
        const remainingBytes = numBytes - constants.BYTECODE_CHUNKS * 31;
        numHashes = 1 + Math.ceil(remainingBytes / ((constants.BYTECODE_CHUNKS - 1) * 31));
    }

    let tmpHash;
    let bytesPointer = 0;

    for (let i = 0; i < numHashes; i++) {
        const maxBytesToAdd = (i === 0) ? (constants.BYTECODE_CHUNKS) * 31 : (constants.BYTECODE_CHUNKS - 1) * 31;
        const elementsToHash = [];

        if (i !== 0) {
            elementsToHash.push(tmpHash);
        }
        const subsetBytecode = bytecode.slice(bytesPointer, bytesPointer + maxBytesToAdd * 2);
        bytesPointer += maxBytesToAdd * 2;

        let tmpElem = '';
        let counter = 0;

        for (let j = 0; j < maxBytesToAdd; j++) {
            let byteToAdd = '00';
            if (j < subsetBytecode.length / 2) {
                byteToAdd = subsetBytecode.slice(j * 2, (j + 1) * 2);
            }

            tmpElem = tmpElem.concat(byteToAdd);
            counter += 1;

            if (counter === 31) {
                elementsToHash.push(F.e(Scalar.fromString(tmpElem, 16)));
                tmpElem = '';
                counter = 0;
            }
        }
        tmpHash = poseidon(elementsToHash);
    }

    return F.toString(tmpHash, 16).padStart(64, '0');
}

module.exports = {
    scalar2fea,
    fea2scalar,
    fe2n,
    keyEthAddrBalance,
    keyEthAddrNonce,
    keyContractCode,
    keyContractStorage,
    getCurrentDB,
    hashContractBytecode,
};
