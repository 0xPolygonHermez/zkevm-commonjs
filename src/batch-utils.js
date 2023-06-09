const { Scalar } = require('ffjavascript');

const { ENUM_TX_TYPES } = require('./compression/compressor-constants');
const { getFuncName, valueToHexStr } = require('./utils');
const getPoseidon = require('./poseidon');
const { linearPoseidon, stringToH4, h4toString } = require('./smt-utils');

/**
 * Serialize transaction for the batch
 * fields: [type | nonce | gasPrice | gasLimit | isDeploy | to | value | dataLen | data | effPer | from ]
 * bytes:  [ 1   |   8   |    32    |     8    |    1     | 20 |   32  |    3    |  XX  |    1   |  20  ]
 * @param {Object} tx - transaction object
 * @returns {String} - Serialized tx in hexadecimal string
 */
function serializeLegacy(tx) {
    let data = Scalar.e(0);

    let offsetBits = 0;

    data = Scalar.add(data, Scalar.shl(tx.from, offsetBits));
    offsetBits += 160;

    data = Scalar.add(data, Scalar.shl(tx.effectivePercentage, offsetBits));
    offsetBits += 8;

    const dataByteLen = tx.data.startsWith('0x') ? (tx.data.slice(2).length / 2) : (tx.data.length / 2);

    if (dataByteLen !== 0) {
        data = Scalar.add(data, Scalar.shl(Scalar.fromString(tx.data, 16), offsetBits));
        offsetBits += dataByteLen * 8;
    }

    data = Scalar.add(data, Scalar.shl(dataByteLen * 8, offsetBits));
    offsetBits += 24;

    data = Scalar.add(data, Scalar.shl(tx.value, offsetBits));
    offsetBits += 256;

    // deploy sets flag 'isDeployment' to 1 & 'to' = 0
    if (tx.to === '0x' || tx.to === null) {
        data = Scalar.add(data, Scalar.shl(0, offsetBits));
        offsetBits += 160;

        data = Scalar.add(data, Scalar.shl(1, offsetBits));
        offsetBits += 8;
    } else {
        data = Scalar.add(data, Scalar.shl(Scalar.fromString(tx.to, 16), offsetBits));
        offsetBits += 160;

        data = Scalar.add(data, Scalar.shl(0, offsetBits));
        offsetBits += 8;
    }

    data = Scalar.add(data, Scalar.shl(tx.gasLimit, offsetBits));
    offsetBits += 64;

    data = Scalar.add(data, Scalar.shl(tx.gasPrice, offsetBits));
    offsetBits += 256;

    data = Scalar.add(data, Scalar.shl(tx.nonce, offsetBits));
    offsetBits += 64;

    data = Scalar.add(data, Scalar.shl(tx.type, offsetBits));
    offsetBits += 8;

    return valueToHexStr(data).padStart(offsetBits / 4, '0');
}

/**
 * Serialize transaction for the batch
 * fields: [type | deltaTimestamp | newGER | indexHistoricalGERTree ]
 * bytes:  [  1  |       8        |   32   |           4            ]
 * @param {Object} tx - transaction object
 * @returns {String} - Serialized tx in hexadecimal string
 */
function serializeChangeL2Block(tx) {
    let data = Scalar.e(0);

    let offsetBits = 0;

    data = Scalar.add(data, Scalar.shl(tx.indexHistoricalGERTree, offsetBits));
    offsetBits += 32;

    data = Scalar.add(data, Scalar.shl(tx.newGER, offsetBits));
    offsetBits += 256;

    data = Scalar.add(data, Scalar.shl(tx.deltaTimestamp, offsetBits));
    offsetBits += 64;

    data = Scalar.add(data, Scalar.shl(tx.type, offsetBits));
    offsetBits += 8;

    return valueToHexStr(data).padStart(offsetBits / 4, '0');
}

/**
 * Deserialize transaction for the batch
 * fields: [type | nonce | gasPrice | gasLimit | isDeploy | to | value | dataLen | data | effPer | from ]
 * bytes:  [ 1   |   8   |    32    |      8   |    1     | 20 |   32  |    3    |  XX  |    1   |  20  ]
 * @param {String} _serializedTx - serialized transaction
 * @returns {Object} - transaction object
 */
function deserializeLegacy(_serializedTx) {
    const tx = {};

    let offsetChars = 0;
    const serializedTx = _serializedTx.startsWith('0x') ? _serializedTx.slice(2) : _serializedTx;

    tx.type = parseInt(serializedTx.slice(offsetChars, 1 * 2), 16);
    offsetChars += 1 * 2;

    tx.nonce = Scalar.fromString(serializedTx.slice(offsetChars, offsetChars + 8 * 2), 16);
    offsetChars += 8 * 2;

    tx.gasPrice = Scalar.fromString(serializedTx.slice(offsetChars, offsetChars + 32 * 2), 16);
    offsetChars += 32 * 2;

    tx.gasLimit = Scalar.fromString(serializedTx.slice(offsetChars, offsetChars + 8 * 2), 16);
    offsetChars += 8 * 2;

    tx.isDeploy = parseInt(serializedTx.slice(offsetChars, offsetChars + 1 * 2), 16);
    offsetChars += 1 * 2;

    tx.to = `0x${serializedTx.slice(offsetChars, offsetChars + 20 * 2)}`;
    offsetChars += 20 * 2;

    tx.value = Scalar.fromString(serializedTx.slice(offsetChars, offsetChars + 32 * 2), 16);
    offsetChars += 32 * 2;

    const dataLen = parseInt(serializedTx.slice(offsetChars, offsetChars + 3 * 2), 16);
    offsetChars += 3 * 2;

    tx.data = `0x${serializedTx.slice(offsetChars, offsetChars + dataLen * 2)}`;
    offsetChars += dataLen * 2;

    tx.effectivePercentage = parseInt(serializedTx.slice(offsetChars, offsetChars + 1 * 2), 16);
    offsetChars += 1 * 2;

    tx.from = `0x${serializedTx.slice(offsetChars, offsetChars + 20 * 2)}`;
    offsetChars += 20 * 2;

    return tx;
}

/**
 * Deserialize transaction for the batch
 * fields: [type | deltaTimestamp | newGER | indexHistoricalGERTree ]
 * bytes:  [  1  |       8        |   32   |           4            ]
 * @param {String} _serializedTx - serialized transaction
 * @returns {Object} - transaction object
 */
function deserializeChangeL2Block(_serializedTx) {
    const tx = {};

    let offsetChars = 0;
    const serializedTx = _serializedTx.startsWith('0x') ? _serializedTx.slice(2) : _serializedTx;

    tx.type = parseInt(serializedTx.slice(offsetChars, offsetChars + 1 * 2), 16);
    offsetChars += 1 * 2;

    tx.deltaTimestamp = Scalar.fromString(serializedTx.slice(offsetChars, offsetChars + 8 * 2), 16);
    offsetChars += 8 * 2;

    tx.newGER = `0x${serializedTx.slice(offsetChars, offsetChars + 32 * 2)}`;
    offsetChars += 32 * 2;

    tx.indexHistoricalGERTree = parseInt(serializedTx.slice(offsetChars, offsetChars + 4 * 2), 16);

    return tx;
}

/**
 * Serialize transaction to be read by the batch
 * @param {Object} tx - transaction object
 * @returns {String} - Encode tx in hexadecimal string
 */
function serializeTx(tx) {
    switch (tx.type) {
    case ENUM_TX_TYPES.PRE_EIP_155:
        return serializeLegacy(tx);
    case ENUM_TX_TYPES.LEGACY:
        return serializeLegacy(tx);
    case ENUM_TX_TYPES.CHANGE_L2_BLOCK:
        return serializeChangeL2Block(tx);
    default:
        throw new Error(`${getFuncName()}: tx.type ${tx.type} not supported`);
    }
}

/**
 * Deserialize transaction to be read by the batch
 * @param {String} _serializedTx - serialized transaction
 * @returns {Object} - transaction object
 */
function deserializeTx(_serializedTx) {
    const serializedTx = _serializedTx.startsWith('0x') ? _serializedTx.slice(2) : _serializedTx;

    const type = parseInt(serializedTx.slice(0, 1 * 2), 16);

    switch (type) {
    case ENUM_TX_TYPES.PRE_EIP_155:
        return deserializeLegacy(serializedTx);
    case ENUM_TX_TYPES.LEGACY:
        return deserializeLegacy(serializedTx);
    case ENUM_TX_TYPES.CHANGE_L2_BLOCK:
        return deserializeChangeL2Block(serializedTx);
    default:
        throw new Error(`${getFuncName()}: tx.type ${type} not supported`);
    }
}

/**
 * Computes newAccBatchHashData
 * @param {String} oldAccBatchHashData - oldAccBatchHashData
 * @param {String} batchData -batch data
 * @returns NewAccBatchHashData in hexadecimal string
 */
async function computeNewAccBatchHashData(oldAccBatchHashData, batchData) {
    const poseidon = await getPoseidon();
    const { F } = poseidon;

    console.log(oldAccBatchHashData);
    console.log(batchData);
    // compute batchHashData
    const batcHashData = await linearPoseidon(batchData);
    const batcHashDataFields = stringToH4(batcHashData);

    // get oldAccBatchHashData fields
    const oldAccBatchHashDataFields = stringToH4(oldAccBatchHashData);

    const input = [
        oldAccBatchHashDataFields[0],
        oldAccBatchHashDataFields[1],
        oldAccBatchHashDataFields[2],
        oldAccBatchHashDataFields[3],
        batcHashDataFields[0],
        batcHashDataFields[1],
        batcHashDataFields[2],
        batcHashDataFields[3],
    ];
    const capacity = [F.zero, F.zero, F.zero, F.zero];

    const newAccBatchHashDataFields = poseidon(input, capacity);

    return h4toString(newAccBatchHashDataFields);
}

module.exports = {
    serializeTx,
    deserializeTx,
    computeNewAccBatchHashData,
};
