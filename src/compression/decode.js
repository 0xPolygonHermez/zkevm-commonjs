const { Scalar } = require('ffjavascript');

const { ENUM_ENCODING_TYPES } = require('./compressor-constants');
const { getFuncName, valueToHexStr } = require('../utils');

/**
 * Decode type '000': data < 32 bytes
 * @param {String} _data - data string represented as hexadecimal string
 * @returns {String} decoded data with no '0x' prefix
 */
function dataLess32Bytes(_data) {
    if (typeof _data !== 'string') {
        throw new Error(`${getFuncName()}: data is not a string`);
    }

    const data = _data.startsWith('0x') ? _data.slice(2) : _data;
    if (data.length % 2) {
        throw new Error(`${getFuncName()}: data is not a aligned to a byte`);
    }

    if (parseInt(data.slice(0, 2), 16) >> 5 !== ENUM_ENCODING_TYPES.DATA_LESS_32_BYTES) {
        throw new Error(`${getFuncName()}: header does not match`);
    }

    const bytesToRead = parseInt(data.slice(0, 2), 16) & 0x1F;

    // build decompressed string
    return data.slice(2, 2 + 2 * bytesToRead);
}

/**
 * Decode type '001': large data
 * @param {String} _data - data string represented as hexadecimal string
 * @returns {String} decoded large data with no '0x' prefix
 */
function largeData(_data) {
    if (typeof _data !== 'string') {
        throw new Error(`${getFuncName()}: data is not a string`);
    }

    const data = _data.startsWith('0x') ? _data.slice(2) : _data;

    if (data.length % 2) {
        throw new Error(`${getFuncName()}: data is not a aligned to a byte`);
    }

    if (parseInt(data.slice(0, 2), 16) >> 5 !== ENUM_ENCODING_TYPES.LARGE_DATA_BYTES) {
        throw new Error(`${getFuncName()}: header does not match`);
    }

    const bytesLenght = parseInt(data.slice(0, 2), 16) & 0x1F;
    const bytesToRead = parseInt(data.slice(2, 2 + 2 * bytesLenght), 16);

    return data.slice(2 + 2 * bytesLenght, 2 + 2 * bytesLenght + 2 * bytesToRead);
}

/**
 * Decode type '002': small value
 * @param {String} _data - value
 * @returns {Number | String} decoded small value as a Number (String if is in data)
 */
function smallValue(_data, isData = false) {
    if (typeof _data !== 'string') {
        throw new Error(`${getFuncName()}: data is not a string`);
    }

    const data = _data.startsWith('0x') ? _data.slice(2) : _data;

    if (data.length % 2) {
        throw new Error(`${getFuncName()}: data is not a aligned to a byte`);
    }

    const num = parseInt(data.slice(0, 2), 16);

    if ((num >> 5) !== ENUM_ENCODING_TYPES.SMALL_VALUE) {
        throw new Error(`${getFuncName()}: header does not match`);
    }

    const resSmallNum = num & 0x1f;

    if (isData === true) {
        return valueToHexStr(resSmallNum).padStart(64, '0');
    }

    return resSmallNum;
}

/**
 * Decode type '003': compressed 32 byte data
 * @param {String} _data - compressed index address tree
 * @returns {Number} decoded index compressed 32 bytes
 */
function compressed32Byte(_data) {
    if (typeof _data !== 'string') {
        throw new Error(`${getFuncName()}: data is not a string`);
    }

    const data = _data.startsWith('0x') ? _data.slice(2) : _data;

    if (data.length % 2) {
        throw new Error(`${getFuncName()}: data is not a aligned to a byte`);
    }

    if (parseInt(data.slice(0, 2), 16) >> 5 !== ENUM_ENCODING_TYPES.COMPRESSED_32_BYTES) {
        throw new Error(`${getFuncName()}: header does not match`);
    }

    const bytesToRead = parseInt(data.slice(0, 2), 16) & 0x1F;

    return parseInt(data.slice(2, 2 + 2 * bytesToRead), 16);
}

/**
 * Decode type '004': compressed address
 * @param {String} _data - compressed index address tree
 * @returns {Number} decoded index compressed address
 */
function compressedAddress(_data) {
    if (typeof _data !== 'string') {
        throw new Error(`${getFuncName()}: data is not a string`);
    }

    const data = _data.startsWith('0x') ? _data.slice(2) : _data;

    if (data.length % 2) {
        throw new Error(`${getFuncName()}: data is not a aligned to a byte`);
    }

    if (parseInt(data.slice(0, 2), 16) >> 5 !== ENUM_ENCODING_TYPES.COMPRESSED_ADDRESS) {
        throw new Error(`${getFuncName()}: header does not match`);
    }

    const bytesToRead = parseInt(data.slice(0, 2), 16) & 0x1F;

    return parseInt(data.slice(2, 2 + 2 * bytesToRead), 16);
}

/**
 * Decode type '005': compressed value
 * @param {String} _data - compressed value
 * @returns {BigInt} decoded value
 */
function compressedValue(_data, isData = false) {
    if (typeof _data !== 'string') {
        throw new Error(`${getFuncName()}: data is not a string`);
    }

    const data = _data.startsWith('0x') ? _data.slice(2) : _data;

    if (data.length % 2) {
        throw new Error(`${getFuncName()}: data is not a aligned to a byte`);
    }

    if (parseInt(data.slice(0, 2), 16) >> 5 !== ENUM_ENCODING_TYPES.COMPRESSED_VALUE) {
        throw new Error(`${getFuncName()}: header does not match`);
    }

    const bytesMantissa = parseInt(data.slice(0, 2), 16) & 0x1f;

    const mantissa = Scalar.fromString(data.slice(2, 2 + 2 * bytesMantissa), 16);
    const exponent = Scalar.fromString(data.slice(2 + 2 * bytesMantissa, 2 + 2 * bytesMantissa + 2), 16);

    const value = Scalar.mul(mantissa, Scalar.pow(10, exponent));

    if (isData === true) {
        return valueToHexStr(value).padStart(64, '0');
    }

    return value;
}

/**
 * Decode type '006' | '00000': uncompressed address
 * @param {String} _data - uncompressed
 * @returns {String} decoded address
 */
function uncompressedAddress(_data, isData = false) {
    if (typeof _data !== 'string') {
        throw new Error(`${getFuncName()}: data is not a string`);
    }

    const data = _data.startsWith('0x') ? _data.slice(2) : _data;

    if (data.length % 2) {
        throw new Error(`${getFuncName()}: data is not a aligned to a byte`);
    }

    if (parseInt(data.slice(0, 2), 16) !== ENUM_ENCODING_TYPES.UNCOMPRESSED_ADDRESS) {
        throw new Error(`${getFuncName()}: header does not match`);
    }

    const address = data.slice(2, 2 + 2 * 20);

    if (isData) {
        return address.padStart(64, '0');
    }

    return address;
}

/**
 * Decode type '006' | '00001': uncompressed 32 bytes
 * @param {String} _data - uncompressed 32 byte data
 * @returns {String} decode 32 bytes with no '0x' prefix
 */
function uncompressed32Bytes(_data) {
    if (typeof _data !== 'string') {
        throw new Error(`${getFuncName()}: data is not a string`);
    }

    const data = _data.startsWith('0x') ? _data.slice(2) : _data;

    if (data.length % 2) {
        throw new Error(`${getFuncName()}: data is not a aligned to a byte`);
    }

    if (parseInt(data.slice(0, 2), 16) !== ENUM_ENCODING_TYPES.UNCOMPRESSED_32_BYTES) {
        throw new Error(`${getFuncName()}: header does not match`);
    }

    const bytes32 = data.slice(2, 2 + 2 * 32);

    return bytes32;
}

/**
 * Encode type '111': data < 32 bytes
 * @param {String} _data - data string represented as hexadecimal string
 * @returns {String} encode data < 32 bytes with no '0x' prefix
 */
function data32BytesPadRight(_data) {
    if (typeof _data !== 'string') {
        throw new Error(`${getFuncName()}: data is not a string`);
    }

    const data = _data.startsWith('0x') ? _data.slice(2) : _data;

    if (data.length % 2) {
        throw new Error(`${getFuncName()}: data is not a aligned to a byte`);
    }

    if (parseInt(data.slice(0, 2), 16) >> 5 !== ENUM_ENCODING_TYPES.DATA_32_BYTES_PAD_RIGHT) {
        throw new Error(`${getFuncName()}: header does not match`);
    }

    const bytesToRead = parseInt(data.slice(0, 2), 16) & 0x1f;

    const bytes32 = data.slice(2, 2 + 2 * bytesToRead);

    return bytes32.padEnd(64, '0');
}

/**
 * Determine encoding type and bytes to read
 * @param {Number} header - 1 byte
 */
function getBytesToRead(header) {
    const encodingType = header >> 5;
    let bytesToRead = 1;

    switch (encodingType) {
    case ENUM_ENCODING_TYPES.DATA_LESS_32_BYTES:
        bytesToRead += (header & 0x1f);
        break;
    case ENUM_ENCODING_TYPES.LARGE_DATA_BYTES:
        bytesToRead += (header & 0x1f);
        break;
    case ENUM_ENCODING_TYPES.SMALL_VALUE:
        bytesToRead += 0;
        break;
    case ENUM_ENCODING_TYPES.COMPRESSED_32_BYTES:
        bytesToRead += (header & 0x1f);
        break;
    case ENUM_ENCODING_TYPES.COMPRESSED_ADDRESS:
        bytesToRead += (header & 0x1f);
        break;
    case ENUM_ENCODING_TYPES.COMPRESSED_VALUE:
        bytesToRead += (header & 0x1f) + 1;
        break;
    case ENUM_ENCODING_TYPES.UNCOMPRESSED:
        if (header === ENUM_ENCODING_TYPES.UNCOMPRESSED_ADDRESS) {
            bytesToRead += 20;
        } else if (header === ENUM_ENCODING_TYPES.UNCOMPRESSED_32_BYTES) {
            bytesToRead += 32;
        } else {
            throw new Error(`${getFuncName()}: encodingType ${encodingType} not supported`);
        }
        break;
    case ENUM_ENCODING_TYPES.DATA_32_BYTES_PAD_RIGHT:
        bytesToRead = (header & 0x1f);
        break;
    default:
        throw new Error(`${getFuncName()}: encodingType ${encodingType} not supported`);
    }

    return { encodingType, bytesToRead };
}

function decodeData(dataEncoded, isData = false) {
    const header = parseInt(dataEncoded.slice(0, 2), 16);
    const encodingType = header >> 5;

    switch (encodingType) {
    case ENUM_ENCODING_TYPES.DATA_LESS_32_BYTES:
        return dataLess32Bytes(dataEncoded);
    case ENUM_ENCODING_TYPES.LARGE_DATA_BYTES:
        return largeData(dataEncoded);
    case ENUM_ENCODING_TYPES.SMALL_VALUE:
        return smallValue(dataEncoded, isData);
    case ENUM_ENCODING_TYPES.COMPRESSED_32_BYTES:
        return compressed32Byte(dataEncoded);
    case ENUM_ENCODING_TYPES.COMPRESSED_ADDRESS:
        return compressedAddress(dataEncoded);
    case ENUM_ENCODING_TYPES.COMPRESSED_VALUE:
        return compressedValue(dataEncoded, isData);
    case ENUM_ENCODING_TYPES.UNCOMPRESSED:
        if (header === ENUM_ENCODING_TYPES.UNCOMPRESSED_ADDRESS) {
            return uncompressedAddress(dataEncoded, isData);
        } if (header === ENUM_ENCODING_TYPES.UNCOMPRESSED_32_BYTES) {
            return uncompressed32Bytes(dataEncoded, isData);
        }
        throw new Error(`${getFuncName()}: encodingType ${encodingType} not supported`);

    case ENUM_ENCODING_TYPES.DATA_32_BYTES_PAD_RIGHT:
        return data32BytesPadRight(dataEncoded);
    default:
        throw new Error(`${getFuncName()}: encodingType ${encodingType} not supported`);
    }
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
    data32BytesPadRight,
    getBytesToRead,
    decodeData,
};
