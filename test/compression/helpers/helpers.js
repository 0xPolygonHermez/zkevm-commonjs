/* eslint-disable no-continue */
/* eslint-disable no-console */
const { Scalar } = require('ffjavascript');
const { valueToHexStr } = require('../../../index').utils;

function getPerformance(nonCompressed, compressed, removeSignature = false) {
    const lenNonComp = ((nonCompressed.length - 2) / 2) + 65; // always add signature bytes
    const lenComp = ((compressed.length - 2) / 2) + (removeSignature ? 0 : 65);

    const ratio = `${((1 - (lenComp / lenNonComp)) * 100).toFixed(2)}%`.padEnd(6);
    const improvement = (lenNonComp / lenComp).toFixed(2);

    console.log(`${removeSignature ? 'no sig' : 'sig'}:`.padEnd(10), ratio, improvement);
}

/**
 * Check if 'data' could potentially have ethereum addresses encoded
 * @param {String} tx.data - transaction data
 * @returns {Array[String]} addresses found
 */
function getAddrFromData(_data) {
    const foundAddr = [];

    const data = _data.startsWith('0x') ? _data.slice(2) : _data;

    if (data.length > 4 * 2) {
        const offset = 4 * 2;
        const lenArgs = (data.length / 2) - 4;
        const blocks32 = Math.floor(lenArgs / 32);

        for (let i = 0; i < blocks32; i++) {
            const singleArg = data.slice(offset + i * 64, offset + (i + 1) * 64);

            // get first 12 bytes
            const header = Scalar.fromString(singleArg.slice(0, 12 * 2), 16);

            if (!Scalar.isZero(header)) {
                continue;
            }

            const bodyScalar = Scalar.fromString(singleArg.slice(-20 * 2), 16);
            const bodyStr = valueToHexStr(bodyScalar);

            // assume it could potentially be an address if the first 17 bytes are non-empty
            if (bodyStr.length > 17 * 2) {
                foundAddr.push(`0x${bodyStr.padStart(40, '0')}`);
            }
        }
    }

    return foundAddr;
}

module.exports = {
    getPerformance,
    getAddrFromData,
};
