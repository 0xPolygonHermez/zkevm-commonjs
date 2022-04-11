const path = require('path');
const { Scalar } = require('ffjavascript');

const pathTestVectors = path.join(__dirname, './test-vectors');

/**
 * Compute key that will result in a ath equals to the scalar input
 * @param {Scalar} s - scalar
 * @param {Field} F - field
 * @returns {Array[Field]} - computed key
 */
function scalar2key(s, F) {
    const auxk = [Scalar.zero, Scalar.zero, Scalar.zero, Scalar.zero];
    let r = Scalar.e(s);
    let i = 0;
    while (!Scalar.isZero(r)) {
        if (!Scalar.isZero(Scalar.band(r, Scalar.one))) {
            auxk[i % 4] = Scalar.add(auxk[i % 4], Scalar.shl(Scalar.one, Math.floor(i / 4)));
        }
        r = Scalar.shr(r, 1);
        i += 1;
    }

    return [F.e(auxk[0]), F.e(auxk[1]), F.e(auxk[2]), F.e(auxk[3])];
}

module.exports = {
    pathTestVectors,
    scalar2key,
};
