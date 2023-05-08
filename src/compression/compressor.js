/* eslint-disable no-prototype-builtins */
const { VALID_TX_TYPES } = require('./compressor-constants');
const { assertInterface, getTxSignedMessage } = require('./compressor-utils');
const encode = require('./encode');

class Compressor {
    constructor(db) {
        this.db = db;
    }

    // gets a transaction signed and compress all its fields according the specification
    compressTxData(tx) {
        // check tx parameter is an object
        if (typeof tx !== 'object') {
            throw new Error('Compressor:compressData: tx is not an object');
        }

        // TODO: infer 'type' based on tx parameters (could lead not controlled params)

        // check type property is present
        if (!tx.hasOwnProperty('type')) {
            throw new Error('Compressor:compressData: tx has not "type" property');
        }

        // check type is within a valid range
        if (Object.keys(VALID_TX_TYPES).includes(tx.type)) {
            let text = 'Compressor:compressData: type has is not within the valid range\n\n';
            text += `VALID TX TYPES: ${VALID_TX_TYPES}`;
            throw new Error(text);
        }

        assertInterface(tx);

        // Start new transaction and try to compress all its parameters
        const txParams = VALID_TX_TYPES[tx.type].interface;

        // add non-compressed transaction data
        tx.nonCompressed = getTxSignedMessage(tx);

        // add type name
        tx.nameType = VALID_TX_TYPES[tx.type].name;

        /// /////////////////////////////
        /// //  START COMPRESSION  //////
        /// /////////////////////////////

        tx.compressed = '0x';

        // for (let i = 0; i < txParams.length; i++) {
        //     const paramName = txParams[i];
        //     // tx.compressed += this[paramName](tx);
        // }

        tx.compressed += this['type'](tx);
    }

    /**
     * Compress nonce
     * @param {Object} tx - transaction object
     */
    type(tx) {
        console.log('HERE');

        return encode.smallValue(tx.type);
    }

    /**
     * Compress nonce
     * @param {Object} tx - transaction object
     */
    nonce(tx) {

    }

    // decompressData(tx) {

    // }
}

module.exports = Compressor;
