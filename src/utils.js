/* eslint-disable no-use-before-define */
/* eslint-disable no-restricted-syntax */
const crypto = require('crypto');
const { Scalar } = require('ffjavascript');
const { FrSNARK } = require('./constants');

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
 * Convert a value into in its hexadecimal string representation
 * @param {Number | BigInt} _value - value to encode
 * @param {Boolean} prefix - attach '0x' at the beginning of the string
 * @returns {String} encoded value in hexadecimal string
 */
function valueToHexStr(_value, prefix = false) {
    if (!(typeof _value === 'number' || typeof _value === 'bigint')) {
        throw new Error(`${getFuncName()}: _value is not a number or BigInt type`);
    }

    if (prefix !== false && typeof prefix !== 'boolean') {
        throw new Error(`${getFuncName()}: _prefix is not a boolean`);
    }

    let valueHex = Scalar.e(_value).toString(16);
    valueHex = valueHex.length % 2 ? `0${valueHex}` : valueHex;

    return prefix ? `0x${valueHex}` : valueHex;
}

/**
 * Gets current fuction name being called
 * @returns {String} function name
 */
function getFuncName() {
    return getFuncName.caller.name;
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
        throw new Error(`${getFuncName()}: Must have an even number of hex digits to convert to bytes`);
    }

    const numBytes = hex.length / 2;
    const byteArray = [];

    for (let i = 0; i < numBytes; i++) {
        byteArray[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }

    return byteArray;
}

/**
 * Pad a string hex number with 0
 * @param {String} str - String input
 * @param {Number} length - Length of the resulting string
 * @returns {String} Resulting string
 */
function padZeros(str, length) {
    if (length > str.length) {
        str = '0'.repeat(length - str.length) + str;
    }

    return str;
}

/**
 * (Hash Sha256 of an hexadecimal string) % (Snark field)
 * @param {String} str - String input in hexadecimal encoding
 * @returns {Scalar} Resulting sha256 hash
 */
function sha256Snark(str) {
    const hash = crypto.createHash('sha256')
        .update(str, 'hex')
        .digest('hex');
    const h = Scalar.mod(Scalar.fromString(hash, 16), FrSNARK);

    return h;
}

module.exports = {
    log2,
    byteArray2HexString,
    hexString2byteArray,
    sha256Snark,
    padZeros,
    valueToHexStr,
    getFuncName,
};
