/* eslint-disable no-continue */
/* eslint-disable no-prototype-builtins */
const { Scalar } = require('ffjavascript');

const { VALID_TX_TYPES } = require('./compressor-constants');
const { assertInterface, getTxSignedMessage } = require('./compressor-utils');
const encode = require('./encode');
const { valueToHexStr } = require('../utils');
const Constants = require('../constants');

class Compressor {
    constructor(db) {
        this.db = db;
    }

    // gets a transaction signed and compress all its fields according the specification
    async compressTxData(tx) {
        // check tx parameter is an object
        if (typeof tx !== 'object') {
            throw new Error('Compressor:compressData: tx is not an object');
        }

        // TODO: infer 'type' based on tx parameters (could lead not controlled params)

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
     * Compress chainId
     * @param {Object} tx - transaction object
     */
    chainId(tx) {
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
     * Compress data
     * @param {Object} tx - transaction object
     */
    async data(tx) {
        // console.log('       tx.data.length: ', tx.data.length);

        // remove '0x'
        const dataHex = tx.data.startsWith('0x') ? tx.data.slice(2) : tx.data;

        // do not compress deployment data
        if (tx.to === '0x') {
            if (Scalar.lt((dataHex.length / 2), 32)) {
                return encode.dataLess32Bytes(tx.data);
            }

            return encode.largeData(tx.data);
        }

        // 0xa9059cbb00000000000000000000000053639833b2332ec84c34690201afde75eb96cf520000000000000000000000000000000000000000000000197211d7e1398fe000

        // get selector and itarate over 32 bytes chunks
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

            return fullDataCompressed;
        }

        return encode.dataLess32Bytes(dataHex);
    }

    // decompressData(tx) {

    // }
}

module.exports = Compressor;
