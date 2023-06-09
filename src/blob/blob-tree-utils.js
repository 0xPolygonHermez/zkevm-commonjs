const { Scalar } = require('ffjavascript');

const constants = require('../constants');
const getPoseidon = require('../poseidon');
const { scalar2fea, stringToH4 } = require('../smt-utils');

async function keyVar(varPosition) {
    const poseidon = await getPoseidon();
    const { F } = poseidon;

    const constant = F.e(constants.SMT_KEY_BLOB_CONSTANT);

    const varPos = Scalar.e(varPosition);

    const varPosArr = scalar2fea(F, varPos);

    const key1 = [varPosArr[0], varPosArr[1], varPosArr[2], varPosArr[3], varPosArr[4], varPosArr[5], constant, F.zero];
    const key1Capacity = stringToH4(constants.HASH_POSEIDON_ALL_ZEROES);

    return poseidon(key1, key1Capacity);
}

async function setVar(varPos, value, smt, root) {
    const key = await keyVar(varPos);

    const auxRes = await smt.set(root, key, Scalar.e(value));

    return auxRes.newRoot;
}

async function getVar(varPos, smt, root) {
    const key = await keyVar(varPos);

    const res = await smt.get(root, key);

    return res.value !== null ? res.value : Scalar.e(0);
}

module.exports = {
    keyVar,
    setVar,
    getVar,
};
