/* eslint-disable no-continue */
/* eslint-disable no-prototype-builtins */
const { Scalar } = require('ffjavascript');

const { parseInt } = require('lodash');
const { VALID_TX_TYPES, ENUM_ENCODING_TYPES, ENUM_TX_TYPES } = require('./compressor-constants');
const { assertInterface, getTxSignedMessage } = require('./compressor-utils');
const encode = require('./encode');
const decode = require('./decode');
const { valueToHexStr } = require('../utils');
const Constants = require('../constants');
const { setAddressIndex, getAddressIndex } = require('../blob/address-tree-utils');
const { setDataIndex, getDataIndex } = require('../blob/data-tree-utils');

// TODO: Decompress part should be in a different class with global vars coming from the blob
class Compressor {
    constructor(db, smt) {
        this.db = db;
        this.smt = smt;
    }

    async setGlobalDataDecompression(
        addressTreeRoot,
        dataTreeRoot,
        lastAddressIndex,
        lastDataIndex,
    ) {
        this.addressTreeRoot = addressTreeRoot;
        this.dataTreeRoot = dataTreeRoot;
        this.lastAddressIndex = lastAddressIndex;
        this.lastDataIndex = lastDataIndex;
    }

    // gets a transaction signed and compress all its fields according the specification
    async compressTxData(tx) {
        // check tx parameter is an object
        if (typeof tx !== 'object') {
            throw new Error('Compressor:compressData: tx is not an object');
        }

        // check type property is present
        if (!tx.hasOwnProperty('type')) {
            throw new Error('Compressor:compressData: tx not "type" property');
        }

        // check type is within a valid range
        if (Object.keys(VALID_TX_TYPES).includes(tx.type)) {
            let text = 'Compressor:compressData: type is not within the valid range\n\n';
            text += `VALID TX TYPES: ${VALID_TX_TYPES}`;
            throw new Error(text);
        }

        assertInterface(tx);

        // Start new transaction and try to compress all its parameters
        const txParams = VALID_TX_TYPES[tx.type].interface;

        // add non-compressed transaction data
        const res = {};
        res.nonCompressed = getTxSignedMessage(tx);

        // add type name
        res.nameType = VALID_TX_TYPES[tx.type].name;

        /// /////////////////////////////
        /// //  START COMPRESSION  //////
        /// /////////////////////////////

        res.compressed = '0x';

        for (let i = 0; i < txParams.length; i++) {
            const paramName = txParams[i];
            const dataToAdd = await this[paramName](tx);
            if (paramName === 'data') {
                // console.log(`   ${paramName}`);
                // console.log(`       final: ${dataToAdd}`);
            }
            res.compressed += dataToAdd;
        }

        return res;
    }

    /**
     * Compress nonce
     * @param {Object} tx - transaction object
     */
    type(tx) {
        return encode.smallValue(tx.type);
    }

    /**
     * Compress nonce
     * @param {Object} tx - transaction object
     */
    nonce(tx) {
        // encode small value if less than 32
        if (Scalar.lt(Scalar.e(tx.nonce), 32)) {
            return encode.smallValue(tx.nonce);
        }

        // encode 32 bytes data
        return encode.dataLess32Bytes(valueToHexStr(tx.nonce));
    }

    /**
     * Compress gasPrice
     * @param {Object} tx - transaction object
     */
    gasPrice(tx) {
        // encode small value if less than 32
        if (Scalar.lt(Scalar.e(tx.gasPrice), 32)) {
            return encode.smallValue(tx.gasPrice);
        }

        // check best encoding type
        const encodeLess32 = encode.dataLess32Bytes(valueToHexStr(tx.gasPrice));
        const encodeCompressedValue = encode.compressedValue(tx.gasPrice);

        if (encodeLess32.length > encodeCompressedValue.length) {
            return encodeCompressedValue;
        }

        return encodeLess32;
    }

    /**
     * Compress gasPrice
     * @param {Object} tx - transaction object
     */
    gasLimit(tx) {
        // encode small value if less than 32
        if (Scalar.lt(Scalar.e(tx.gasLimit), 32)) {
            return encode.smallValue(tx.gasLimit);
        }

        // check best encoding type
        const encodeLess32 = encode.dataLess32Bytes(valueToHexStr(tx.gasLimit));
        const encodeCompressedValue = encode.compressedValue(tx.gasLimit);

        if (encodeLess32.length > encodeCompressedValue.length) {
            return encodeCompressedValue;
        }

        return encodeLess32;
    }

    /**
     * Compress to
     * @param {Object} tx - transaction object
     */
    async to(tx) {
        // check if it a deployment
        if (tx.to === '0x') {
            return encode.compressedAddress(0);
        }

        // check if address has an index
        const keyCompressedAddress = Scalar.add(
            Constants.DB_COMPRESSOR_ADDRESS,
            Scalar.fromString(tx.to, 16),
        );

        const indexAddressCompressed = await this.db.getValue(keyCompressedAddress);
        if (indexAddressCompressed !== null) {
            return encode.compressedAddress(indexAddressCompressed);
        }

        return encode.uncompressedAddress(tx.to);
    }

    /**
     * Compress value
     * @param {Object} tx - transaction object
     */
    value(tx) {
        // encode small value if less than 32
        if (Scalar.lt(Scalar.e(tx.value), 32)) {
            return encode.smallValue(tx.value);
        }

        // check best encoding type
        const encodeLess32 = encode.dataLess32Bytes(valueToHexStr(tx.value));
        const encodeCompressedValue = encode.compressedValue(tx.value);

        if (encodeLess32.length > encodeCompressedValue.length) {
            return encodeCompressedValue;
        }

        return encodeLess32;
    }

    /**
     * Compress chainId
     * @param {Object} tx - transaction object
     */
    chainId(tx) {
        // encode small value if less than 32
        if (Scalar.lt(Scalar.e(tx.chainId), 32)) {
            return encode.smallValue(tx.chainId);
        }

        // check best encoding type
        const encodeLess32 = encode.dataLess32Bytes(valueToHexStr(tx.chainId));
        const encodeCompressedValue = encode.compressedValue(tx.chainId);

        if (encodeLess32.length > encodeCompressedValue.length) {
            return encodeCompressedValue;
        }

        return encodeLess32;
    }

    /**
     * Compress data
     * @param {Object} tx - transaction object
     */
    async data(tx) {
        // console.log('       tx.data.length: ', tx.data.length);

        // remove '0x'
        const dataHex = tx.data.startsWith('0x') ? tx.data.slice(2) : tx.data;
        const dataLengthBytes = dataHex.length / 2;

        // compress dataLengthBytes
        let compressDataLengthBytes;

        if (Scalar.lt(Scalar.e(dataLengthBytes), 32)) {
            compressDataLengthBytes = encode.smallValue(dataLengthBytes);
        } else {
            // check best encoding type
            const encodeLess32Len = encode.dataLess32Bytes(valueToHexStr(dataLengthBytes));
            const encodeCompressedValueLen = encode.compressedValue(dataLengthBytes);

            if (encodeLess32Len.length > encodeCompressedValueLen.length) {
                compressDataLengthBytes = encodeCompressedValueLen;
            } else {
                compressDataLengthBytes = encodeLess32Len;
            }
        }

        if (Scalar.eq(dataLengthBytes, 0)) {
            return compressDataLengthBytes;
        }

        // Start compress 'data'
        // do not compress deployment data
        if (tx.to === '0x') {
            if (Scalar.lt((dataHex.length / 2), 32)) {
                return compressDataLengthBytes + encode.dataLess32Bytes(tx.data);
            }

            return compressDataLengthBytes + encode.largeData(tx.data);
        }

        // get selector and iterate over 32 bytes chunks
        let fullDataCompressed;
        let remainingBytes = dataHex.length / 2;

        if (Scalar.gt(remainingBytes, 4)) {
            let offset = 0;

            // selector: get 4 bytes
            fullDataCompressed = encode.dataLess32Bytes(dataHex.slice(offset, offset + 4 * 2));
            // console.log('           selector old:', dataHex.slice(offset, offset + 4 * 2));
            // console.log('           selector new:', fullDataCompressed);
            remainingBytes -= 4;

            const blocks32Bytes = Math.floor(remainingBytes / 32);
            const dataTail = remainingBytes % 32;
            offset = 8;

            // console.log(`           block32bytes: ${blocks32Bytes}`);
            // console.log(`           dataTail: ${dataTail}`);

            for (let i = 0; i < blocks32Bytes; i++) {
                const dataToCompress = dataHex.slice(offset + i * 64, offset + ((i + 1) * 64));
                const dataScalar = Scalar.fromString(dataToCompress, 16);
                // console.log(`           dataToCompress: ${dataToCompress}`);
                // try to encode it as a small value
                if (Scalar.lt(dataScalar, 32)) {
                    fullDataCompressed += encode.smallValue(dataScalar);
                    // console.log(`               smallValue: ${encode.smallValue(dataScalar)}`);
                    continue;
                }

                // try to encode it as compressed 32 bytes
                const keyCompressedData32 = Scalar.add(
                    Constants.DB_COMPRESSOR_32_BYTES,
                    dataScalar,
                );

                const indexDataTree = await this.db.getValue(keyCompressedData32);
                if (indexDataTree !== null) {
                    fullDataCompressed += encode.compressed32Byte(indexDataTree);
                    // console.log(`               compressed32Byte: ${encode.compressed32Byte(indexDataTree)}`);
                    continue;
                }

                // try to compress it a compressed address
                const keyCompressedAddress = Scalar.add(
                    Constants.DB_COMPRESSOR_ADDRESS,
                    dataScalar,
                );

                const indexAddressCompressed = await this.db.getValue(keyCompressedAddress);

                if (indexAddressCompressed !== null) {
                    fullDataCompressed += encode.compressedAddress(indexAddressCompressed);
                    // console.log(`               compressedaddress: ${encode.compressedAddress(indexAddressCompressed)}`);
                    continue;
                }

                // check best encoding type among: encodeLess32, encodeCompressedValue & encode32BytesPadRight
                const dataTrim = valueToHexStr(dataScalar);
                let encodeLess32 = null;
                if (dataTrim.length / 2 < 32) {
                    encodeLess32 = encode.dataLess32Bytes(dataTrim);
                }

                const dataNoZerosRight = dataToCompress.replace(/00+$/, '');
                // console.log("dataToCompress: ", dataToCompress);
                // console.log("dataNoZerosRight: ", dataNoZerosRight);
                let encode32BytesPadright = null;
                if (dataNoZerosRight.length / 2 < 32) {
                    encode32BytesPadright = encode.data32BytesPadRight(dataNoZerosRight);
                }

                const encodeCompressedValue = encode.compressedValue(dataScalar);

                if ((encodeLess32 !== null && encodeLess32.length / 2 < 32)
                    || (encode32BytesPadright !== null && encode32BytesPadright.length / 2 < 32)
                    || encodeCompressedValue.length / 2 < 32) {
                    if (encodeLess32 === null) {
                        // compare compressed value & 32 byte pad right
                        if (encode32BytesPadright.length < encodeCompressedValue.length) {
                            fullDataCompressed += encode32BytesPadright;
                            // console.log(`               compressed32BytePadright: ${encode32BytesPadright}`);
                            continue;
                        }
                        fullDataCompressed += encodeCompressedValue;
                        // console.log(`               compressedValue: ${encodeCompressedValue}`);
                        continue;
                    }

                    if (encode32BytesPadright === null) {
                        // compare compressed value & less than 32 bytes
                        if (encodeLess32.length < encodeCompressedValue.length) {
                            fullDataCompressed += encodeLess32;
                            // console.log(`               encodeLess32: ${encodeLess32}`);
                            continue;
                        }
                        fullDataCompressed += encodeCompressedValue;
                        // console.log(`               encodeCompressedValue: ${encodeCompressedValue}`);
                        continue;
                    }

                    // choose the best encoding among compressed value, encode less 32 bytes & 32 byte pad right
                    const lessBytes = Math.min(encodeCompressedValue.length, encodeLess32.length, encode32BytesPadright.length);
                    if (lessBytes === encodeCompressedValue.length) {
                        fullDataCompressed += encodeCompressedValue;
                        // console.log(`               encodeCompressedValue: ${encodeCompressedValue}`);
                        continue;
                    } else if (lessBytes === encodeLess32.length) {
                        fullDataCompressed += encodeLess32;
                        // console.log(`               encodeLess32: ${encodeLess32}`);
                        continue;
                    } else {
                        fullDataCompressed += encode32BytesPadright;
                        // console.log(`               compressed32BytePadright: ${encode32BytesPadright}`);
                        continue;
                    }
                }

                // if cannot be compressed, added to the bytes 32 data tree
                fullDataCompressed += encode.uncompressed32Bytes(dataToCompress);
                // console.log(`               uncompressed32Bytes: ${encode.uncompressed32Bytes(dataToCompress)}`);
            }

            // add tail
            if (dataTail !== 0) {
                fullDataCompressed += encode.dataLess32Bytes(dataHex.slice(-dataTail * 2));
            }

            return compressDataLengthBytes + fullDataCompressed;
        }

        return compressDataLengthBytes + encode.dataLess32Bytes(dataHex);
    }

    /**
     * Compress deltaTimestamp
     * @param {Object} tx - transaction object
     * @returns {String} encoding string in hexadecimal
     */
    deltaTimestamp(tx) {
        // encode small value if less than 32
        if (Scalar.lt(Scalar.e(tx.deltaTimestamp), 32)) {
            return encode.smallValue(tx.deltaTimestamp);
        }

        // return data less 32 bytes encoding
        return encode.dataLess32Bytes(valueToHexStr(tx.deltaTimestamp));
    }

    /**
     * Compress newGER
     * zero value or hash output
     * @param {Object} tx - transaction object
     * @returns {String} encoding string in hexadecimal
     */
    newGER(tx) {
        // encode small value if less than 32
        if (Scalar.lt(Scalar.e(tx.newGER), 32)) {
            return encode.smallValue(tx.newGER);
        }

        // return large data
        return encode.largeData(tx.newGER);
    }

    /**
     * Compress indexHistoricalGERTree
     * @param {Object} tx
     * @returns {String} encoding string in hexadecimal
     */
    indexHistoricalGERTree(tx) {
        // encode small value if less than 32
        if (Scalar.lt(Scalar.e(tx.indexHistoricalGERTree), 32)) {
            return encode.smallValue(tx.indexHistoricalGERTree);
        }

        // check best encoding type
        const encodeLess32 = encode.dataLess32Bytes(valueToHexStr(tx.indexHistoricalGERTree));
        const encodeCompressedValue = encode.compressedValue(tx.indexHistoricalGERTree);

        if (encodeLess32.length > encodeCompressedValue.length) {
            return encodeCompressedValue;
        }

        return encodeLess32;
    }

    /**
     * Compress effectivePercentage
     * @param {Object} tx
     * @returns {String} encoding string in hexadecimal
     */
    effectivePercentage(tx) {
        // encode small value if less than 32
        if (Scalar.lt(Scalar.e(tx.effectivePercentage), 32)) {
            return encode.smallValue(tx.effectivePercentage);
        }

        // check best encoding type
        const encodeLess32 = encode.dataLess32Bytes(valueToHexStr(tx.effectivePercentage));
        const encodeCompressedValue = encode.compressedValue(tx.effectivePercentage);

        if (encodeLess32.length > encodeCompressedValue.length) {
            return encodeCompressedValue;
        }

        return encodeLess32;
    }

    /// ///////////////////////////
    /// ///  DECOMPRESSION  ///////
    /// ///////////////////////////

    async decompressData(_txCompressed) {
        const txObject = {};

        // remove '0x'
        const txCompressed = _txCompressed.startsWith('0x') ? _txCompressed.slice(2) : _txCompressed;

        // Start reading
        let offset = 0;

        // type
        const { value, newOffset } = await this.getNextValue(txCompressed, offset, false);
        txObject.type = value;
        offset += newOffset;

        // continue parsing depending on specific transaction type
        switch (txObject.type) {
        case ENUM_TX_TYPES.PRE_EIP_155:
            return this.decompressPreEip155(txCompressed, txObject, offset);
        case ENUM_TX_TYPES.LEGACY:
            return this.decompressLegacy(txCompressed, txObject, offset);
        case ENUM_TX_TYPES.CHANGE_L2_BLOCK:
            return this.decompressChangeL2Block(txCompressed, txObject, offset);
        default:
            throw new Error(`Compressor:decompressData: tx.type ${txObject.type} not supported`);
        }
    }

    async decompressChangeL2Block(txCompressed, txObject, _offset) {
        let offset = _offset;
        let res;

        // get deltaTimestamp
        res = await this.getNextValue(txCompressed, offset, false);
        txObject.deltaTimestamp = Scalar.fromString(res.value, 16);
        offset = res.newOffset;

        // get newGER
        res = await this.getNextValue(txCompressed, offset, false);
        txObject.newGER = `0x${res.value}`;
        offset = res.newOffset;

        // get indexHistoricalGERTree
        res = await this.getNextValue(txCompressed, offset, false);
        txObject.indexHistoricalGERTree = parseInt(res.value, 16);
        offset = res.newOffset;

        return txObject;
    }

    async decompressLegacy(txCompressed, txObject, _offset) {
        let offset = _offset;
        let res;

        // get nonce
        res = await this.getNextValue(txCompressed, offset, false);
        txObject.nonce = res.value;
        offset = res.newOffset;

        // get gasPrice
        res = await this.getNextValue(txCompressed, offset, false);
        txObject.gasPrice = res.value;
        offset = res.newOffset;

        // get gasLimit
        res = await this.getNextValue(txCompressed, offset, false);
        txObject.gasLimit = res.value;
        offset = res.newOffset;

        // get to
        res = await this.getNextValue(txCompressed, offset, false);
        txObject.to = `0x${res.value}`;
        offset = res.newOffset;

        // get value
        res = await this.getNextValue(txCompressed, offset, false);
        txObject.value = res.value;
        offset = res.newOffset;

        // get data length
        res = await this.getNextValue(txCompressed, offset, false);
        const dataLength = res.value;
        offset = res.newOffset;

        // read data
        txObject.data = '0x';
        let dataRead = 0;
        while (dataLength > dataRead) {
            res = await this.getNextValue(txCompressed, offset, true);
            txObject.data += res.value;
            offset = res.newOffset;
            dataRead += res.value.length / 2;
        }

        // get chainId
        res = await this.getNextValue(txCompressed, offset, false);
        txObject.chainId = parseInt(res.value, 16);
        offset = res.newOffset;

        // get effectivePercentage
        res = await this.getNextValue(txCompressed, offset, false);
        txObject.effectivePercentage = parseInt(res.value, 16);
        offset = res.newOffset;

        return txObject;
    }

    async getNextValue(txCompressed, offset, isData) {
        // get encoding type from the first byte
        const headerNumber = parseInt(txCompressed.slice(offset, offset + 2), 16);
        const { encodingType, bytesToRead } = decode.getBytesToRead(headerNumber);

        let value;
        let newOffset = offset;

        // trigger action depending on the encoding
        if (encodingType === ENUM_ENCODING_TYPES.DATA_LESS_32_BYTES
            || encodingType === ENUM_ENCODING_TYPES.SMALL_VALUE
            || encodingType === ENUM_ENCODING_TYPES.COMPRESSED_VALUE
            || encodingType === ENUM_ENCODING_TYPES.DATA_32_BYTES_PAD_RIGHT) {
            value = decode.decodeData(txCompressed.slice(offset, offset + bytesToRead * 2), isData);
            newOffset += bytesToRead * 2;
        } else if (encodingType === ENUM_ENCODING_TYPES.LARGE_DATA_BYTES) {
            // large data
            // lengthBytestoRead = bytesToRead - 1;
            const lengthBytestoRead = bytesToRead - 1;
            newOffset += 2;
            const finalBytesToRead = parseInt(txCompressed.slice(newOffset, newOffset + lengthBytestoRead * 2), 16);

            newOffset += lengthBytestoRead * 2;
            value = decode.decodeData(txCompressed.slice(offset, newOffset + finalBytesToRead * 2), isData);

            newOffset += finalBytesToRead * 2;
        } else if (encodingType === ENUM_ENCODING_TYPES.COMPRESSED_32_BYTES) {
            const index = decode.decodeData(txCompressed.slice(offset, offset + bytesToRead * 2), isData);
            newOffset += bytesToRead * 2;

            // read from DB the 32byte compressed
            const key = Scalar.add(
                Constants.DB_COMPRESSOR_INDEX_32_BYTES,
                Scalar.e(index),
            );
            value = await this.db.getValue(key);
        } else if (encodingType === ENUM_ENCODING_TYPES.COMPRESSED_ADDRESS) {
            const index = decode.decodeData(txCompressed.slice(offset, offset + bytesToRead * 2), isData);
            newOffset += bytesToRead * 2;

            // read from DB the 32byte compressed
            const key = Scalar.add(
                Constants.DB_COMPRESSOR_INDEX_ADDRESS,
                Scalar.e(index),
            );
            value = await this.db.getValue(key);
        } else if (encodingType === ENUM_ENCODING_TYPES.UNCOMPRESSED) {
            if (headerNumber === ENUM_ENCODING_TYPES.UNCOMPRESSED_ADDRESS) {
                value = decode.decodeData(txCompressed.slice(offset, offset + bytesToRead * 2), isData);
                newOffset += bytesToRead * 2;

                // check address has not any index assigned
                const oldIndex = await getAddressIndex(value, this.smt, this.addressTreeRoot);

                if (Scalar.eq(oldIndex, 0)) {
                // read last index assigned in address tree
                    this.lastAddressIndex = Scalar.add(this.lastAddressIndex, 1);
                    const indexToWrite = this.lastAddressIndex;

                    // write address tree abd DB
                    this.addressTreeRoot = await setAddressIndex(value, indexToWrite, this.smt, this.addressTreeRoot);
                }
            } else if (headerNumber === ENUM_ENCODING_TYPES.UNCOMPRESSED_32_BYTES) {
                value = decode.decodeData(txCompressed.slice(offset, offset + bytesToRead * 2), isData);
                newOffset += bytesToRead * 2;

                // check address has not any index assigned
                const oldIndex = await getDataIndex(value, this.smt, this.dataTreeRoot);

                if (Scalar.eq(oldIndex, 0)) {
                // read last index assigned in address tree
                    this.lastDataIndex = Scalar.add(this.lastDataIndex, 1);
                    // if SMT_DATA_MAX_INDEX is reached, start overwriting
                    const indexToWrite = Scalar.mod(this.lastDataIndex, Constants.SMT_DATA_MAX_INDEX);

                    // write address tree abd DB
                    this.dataTreeRoot = await setDataIndex(value, indexToWrite, this.smt, this.dataTreeRoot);
                }
            } else {
                throw new Error('Compressor:decompressData: not supported encoding type');
                // TODO: invalid blob
            }
        } else {
            throw new Error('Compressor:decompressData: not supported encoding type');
            // TODO: invalid blob
        }

        return {
            newOffset,
            value,
        };
    }
}

module.exports = Compressor;
