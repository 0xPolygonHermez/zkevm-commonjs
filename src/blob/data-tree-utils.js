const { Scalar } = require('ffjavascript');

const constants = require('../constants');
const getPoseidon = require('../poseidon');
const { scalar2fea, stringToH4 } = require('../smt-utils');

/**
 * Compute smt key for an address in the data tree
 *   hk0: H([bytes32[0:4], bytes32[4:8], bytes32[8:12], bytes32[12:16], bytes32[16:20], bytes32[20:24], bytes32[24:28], bytes32[28:32]], [0, 0, 0, 0])
 *   key: H([0, 0, 0, 0, 0, 0, 9, 0], [hk0[0], hk0[1], hk0[2], hk0[3]])
 * @param {String | Scalar} _bytes32 - _bytes32 represented as hexadecimal string
 * @returns {Scalar} - key computed
 */
async function keyDataIndex(_bytes32) {
    const poseidon = await getPoseidon();
    const { F } = poseidon;

    const constant = F.e(constants.SMT_KEY_DATA_INDEX);

    let bytes32;
    if (typeof _bytes32 === 'string') {
        bytes32 = Scalar.fromString(_bytes32, 16);
    } else {
        bytes32 = Scalar.e(_bytes32);
    }

    const bytes32Arr = scalar2fea(F, bytes32);

    const key0 = [bytes32Arr[0], bytes32Arr[1], bytes32Arr[2], bytes32Arr[3], bytes32Arr[4], bytes32Arr[5], bytes32Arr[6], bytes32Arr[7]];
    const key0Capacity = [F.zero, F.zero, F.zero, F.zero];

    const key1 = [F.zero, F.zero, F.zero, F.zero, F.zero, F.zero, constant, F.zero];
    const key1Capacity = await poseidon(key0, key0Capacity);

    return poseidon(key1, key1Capacity);
}

async function setDataIndex(bytes32, index, smt, root) {
    const key = await keyDataIndex(bytes32);

    const auxRes = await smt.set(root, key, Scalar.e(index));

    return auxRes.newRoot;
}

async function getDataIndex(bytes32, smt, root) {
    const key = await keyDataIndex(bytes32);

    const res = await smt.get(root, key);

    return res.value !== null ? res.value : Scalar.e(0);
}

module.exports = {
    keyDataIndex,
    setDataIndex,
    getDataIndex,
};
