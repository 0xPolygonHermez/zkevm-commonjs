/* eslint-disable no-restricted-syntax */
/**
 * Log2 function
 * @param {Number} V - value
 * @returns {Number}
 */
function log2(V) {
    return (((V & 0xFFFF0000) !== 0
        ? (V &= 0xFFFF0000, 16) : 0) | ((V & 0xFF00FF00) !== 0
        ? (V &= 0xFF00FF00, 8) : 0) | ((V & 0xF0F0F0F0) !== 0
        ? (V &= 0xF0F0F0F0, 4) : 0) | ((V & 0xCCCCCCCC) !== 0
        ? (V &= 0xCCCCCCCC, 2) : 0) | ((V & 0xAAAAAAAA) !== 0));
}

/**
 * Converts a byte array into an hex string
 * @param {Array[Number]} byteArray - array of bytes
 * @returns {String} hexadecimal string
 */
function byteArray2HexString(byteArray) {
    let s = '';
    for (const byte of byteArray) {
        s += byte.toString(16).padStart(2, '0');
    }

    return s;
}

/**
 * Convert hex string into an array of bytes
 * @param {String} hex - hexadecimal string
 * @returns {Array[Number]}
 */
function hexString2byteArray(_hex) {
    const hex = _hex.startsWith('0x') ? _hex.slice(2) : _hex;

    if (hex.length % 2 !== 0) {
        throw new Error('Must have an even number of hex digits to convert to bytes');
    }

    const numBytes = hex.length / 2;
    const byteArray = [];

    for (let i = 0; i < numBytes; i++) {
        byteArray[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }

    return byteArray;
}

module.exports = {
    log2,
    byteArray2HexString,
    hexString2byteArray,
};
