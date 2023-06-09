const { Scalar } = require('ffjavascript');

const constants = require('../constants');
const getPoseidon = require('../poseidon');
const { scalar2fea, stringToH4 } = require('../smt-utils');

/**
 * Compute smt key for an address in the data tree
 *   hk0: H([0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0])
 *   key: H([ethAddr[0:4], ethAddr[4:8], ethAddr[8:12], ethAddr[12:16], ethAddr[16:20], 0, 8, 0], [hk0[0], hk0[1], hk0[2], hk0[3]])
 * @param {String | Scalar} _ethAddr - ethereum address represented as hexadecimal string
 * @returns {Scalar} - key computed
 */
async function keyDataIndex(_ethAddr) {
    const poseidon = await getPoseidon();
    const { F } = poseidon;

    const constant = F.e(constants.SMT_KEY_DATA_INDEX);

    let ethAddr;
    if (typeof _ethAddr === 'string') {
        ethAddr = Scalar.fromString(_ethAddr, 16);
    } else {
        ethAddr = Scalar.e(_ethAddr);
    }

    const ethAddrArr = scalar2fea(F, ethAddr);

    const key1 = [ethAddrArr[0], ethAddrArr[1], ethAddrArr[2], ethAddrArr[3], ethAddrArr[4], ethAddrArr[5], constant, F.zero];
    const key1Capacity = stringToH4(constants.HASH_POSEIDON_ALL_ZEROES);

    return poseidon(key1, key1Capacity);
}

async function setDataIndex(ethAddr, index, smt, root) {
    const key = await keyDataIndex(ethAddr);

    const auxRes = await smt.set(root, key, Scalar.e(index));

    return auxRes.newRoot;
}

async function getDataIndex(ethAddr, smt, root) {
    const key = await keyDataIndex(ethAddr);

    const res = await smt.get(root, key);

    return res.value !== null ? res.value : Scalar.e(0);
}

module.exports = {
    keyDataIndex,
    setDataIndex,
    getDataIndex,
};
