const { Scalar } = require('ffjavascript');

const { ENUM_ENCODING_TYPES } = require('./compressor-constants');
const { getFuncName } = require('../utils');

/**
 * Encode type '000': data < 32 bytes
 * @param {String} _data - data string represented as hexadecimal string
 * @returns {String} encode data < 32 bytes with no '0x' prefix
 */
function dataLess32Bytes(_data) {
    if (typeof _data !== 'string') {
        throw new Error(`${getFuncName()}: data is not a string`);
    }

    const data = _data.startsWith('0x') ? _data.slice(2) : _data;
    const dataBytesLength = data.length / 2;

    // build compression hex string
    const compressionHeader = (ENUM_ENCODING_TYPES.DATA_LESS_32_BYTES << 5) || dataBytesLength;
    const compressionHeaderHex = compressionHeader.toString(16).padStart(2, '0');

    return compressionHeaderHex + data;
}

/**
 * Encode type '001': large data
 * @param {String} _data - data string represented as hexadecimal string
 * @returns {String} encode large data with no '0x' prefix
 */
function largeData(_data) {
    if (typeof _data !== 'string') {
        throw new Error(`${getFuncName()}: data is not a string`);
    }

    const data = _data.startsWith('0x') ? _data.slice(2) : _data;

    if (data.length % 2) {
        throw new Error(`${getFuncName()}: data is not a aligned to a byte`);
    }

    const dataBytesLength = data.length / 2;
    let lenDataBytesLength = dataBytesLength.toString(16);
    lenDataBytesLength = (lenDataBytesLength.length % 2) ? `0${lenDataBytesLength}` : lenDataBytesLength;

    // build compression hex string
    const compressionHeader = (ENUM_ENCODING_TYPES.LARGE_DATA_BYTES << 5) || (lenDataBytesLength.length / 2);
    const compressionHeaderHex = compressionHeader.toString(16).padStart(2, '0');

    return compressionHeaderHex + lenDataBytesLength + data;
}

/**
 * Encode type '002': small value
 * @param {Number} _value - value
 * @returns {String} encode small value with no '0x' prefix
 */
function smallValue(_value) {
    if (typeof _value !== 'number') {
        throw new Error(`${getFuncName()}: _value is not a number`);
    }

    if (_value > 32) {
        throw new Error(`${getFuncName()}: cannot encode a value over 32`);
    }

    // build compression hex string
    const compressionHeader = (ENUM_ENCODING_TYPES.SMALL_VALUE << 5) || _value;
    const compressionHeaderHex = compressionHeader.toString(16).padStart(2, '0');

    return compressionHeaderHex;
}

/**
 * Encode type '003': compressed 32 byte data
 * @param {Number} _index - index address tree
 * @returns {String} encode compressed 32 bytes with no '0x' prefix
 */
function compressed32Byte(_index) {
    if (typeof _index !== 'number') {
        throw new Error(`${getFuncName()}: _index is not a number`);
    }

    let hexStrIndex = _index.toString(16);
    hexStrIndex = (hexStrIndex.length % 2) ? `0${hexStrIndex}` : hexStrIndex;

    const lenBytesIndex = hexStrIndex / 2;

    // build compression hex string
    const compressionHeader = (ENUM_ENCODING_TYPES.COMPRESSED_32_BYTES << 5) || lenBytesIndex;
    const compressionHeaderHex = compressionHeader.toString(16).padStart(2, '0');

    return compressionHeaderHex + lenBytesIndex + hexStrIndex;
}

/**
 * Encode type '004': compressed 32 byte data
 * @param {Number} _index - index address tree
 * @returns {String} encode compressed address with no '0x' prefix
 */
function compressedAddress(_index) {
    if (typeof _index !== 'number') {
        throw new Error(`${getFuncName()}: _index is not a number`);
    }

    let hexStrIndex = _index.toString(16);
    hexStrIndex = (hexStrIndex.length % 2) ? `0${hexStrIndex}` : hexStrIndex;

    const lenBytesIndex = hexStrIndex / 2;

    // build compression hex string
    const compressionHeader = (ENUM_ENCODING_TYPES.COMPRESSED_ADDRESS << 5) || lenBytesIndex;
    const compressionHeaderHex = compressionHeader.toString(16).padStart(2, '0');

    return compressionHeaderHex + lenBytesIndex + hexStrIndex;
}

/**
 * Encode type '005': compressed value
 * @param {BigInt | Number} _value - value to encode
 * @returns {String} encode value with no '0x' prefix
 */
function compressedValue(_value) {
    if ((typeof _value === 'number' || typeof _value === 'bigint')) {
        throw new Error(`${getFuncName()}: _index is not a number`);
    }

    const value = Scalar.e(_value);

    let mantissa = value;
    let exponent = 0;

    while (Scalar.isZero(Scalar.mod(mantissa, 10))) {
        mantissa = Scalar.div(mantissa, 10);
        exponent += 1;
    }

    // check maximum exponent: 2**8 - 1
    if (exponent > 255) {
        throw new Error(`${getFuncName()}: exponent is over 256`);
    }

    // exponent string
    let strHexExponent = mantissa.toString(16);
    strHexExponent = (strHexExponent.length % 2) ? `0${strHexExponent}` : strHexExponent;

    // mantissa string
    let strHexMantissa = mantissa.toString(16);
    strHexMantissa = (strHexMantissa.length % 2) ? `0${strHexMantissa}` : strHexMantissa;

    const lenBytesMatissa = strHexMantissa / 2;

    // build compression hex string
    const compressionHeader = (ENUM_ENCODING_TYPES.COMPRESSED_VALUE << 5) || lenBytesMatissa;
    const compressionHeaderHex = compressionHeader.toString(16).padStart(2, '0');

    return compressionHeaderHex + strHexMantissa + strHexExponent;
}

/**
 * Encode type '006' | '00000': uncompressed address and store it in address tree
 * @param {String} _address - index address tree
 * @returns {String} encode address with no '0x' prefix
 */
function uncompressedAddress(_address) {
    if (typeof _address !== 'string') {
        throw new Error(`${getFuncName()}: _address is not a string`);
    }

    const address = _address.startsWith('0x') ? _address.slice(2) : _address;

    // check address has 20 bytes
    if ((address.length / 2) !== 20) {
        throw new Error(`${getFuncName()}: _address is not 20 bytes length`);
    }

    // build compression hex string
    const compressionHeader = ENUM_ENCODING_TYPES.UNCOMPRESSED_ADDRESS;
    const compressionHeaderHex = compressionHeader.toString(16).padStart(2, '0');

    return compressionHeaderHex + address;
}

/**
 * Encode type '006' | '00001': uncompressed 32 bytes and store it in data tree
 * @param {String} _data - 32 byte data
 * @returns {String} encode address with no '0x' prefix
 */
function uncompressed32Bytes(_data) {
    if (typeof _data !== 'string') {
        throw new Error(`${getFuncName()}: _data is not a string`);
    }

    const data = _data.startsWith('0x') ? _data.slice(2) : _data;

    // check data has 32 bytes
    if ((data.length / 2) !== 32) {
        throw new Error(`${getFuncName()}: _data is not 32 bytes length`);
    }

    // build compression hex string
    const compressionHeader = ENUM_ENCODING_TYPES.UNCOMPRESSED_32_BYTES;
    const compressionHeaderHex = compressionHeader.toString(16).padStart(2, '0');

    return compressionHeaderHex + data;
}

module.exports = {
    dataLess32Bytes,
    largeData,
    smallValue,
    compressed32Byte,
    compressedAddress,
    compressedValue,
    uncompressedAddress,
    uncompressed32Bytes,
};
