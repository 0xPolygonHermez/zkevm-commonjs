/* eslint-disable no-use-before-define */
/* eslint-disable max-len */
const { ethers } = require('ethers');
const { Scalar } = require('ffjavascript');
const Constants = require('./constants');
const smtUtils = require('./smt-utils');
const { valueToHexStr } = require('./utils');

/**
 * Extract an integer from a byte array
 * @param {Uint8Array} data - Byte array
 * @param {Number} offset - Offset of the data array
 * @param {Number} length - Length of the integer in bytes
 * @returns {Number} - Extracted integer
 */
function unarrayifyInteger(data, offset, length) {
    let result = 0;
    for (let i = 0; i < length; i++) {
        result = (result * 256) + data[offset + i];
    }

    return result;
}

/**
 * Convert a custom rawTx  [rlp(nonce, gasprice, gaslimit, to, value, data, chainId, 0, 0)|r|s|v|effectivePercentage]
 * to a standard raw tx [rlp(nonce, gasprice, gaslimit, to, value, data, r, s, v)]
 * @param {String} customRawTx -  Custom raw transaction
 * @returns {String} - Standar raw transaction
 */
function customRawTxToRawTx(customRawTx) {
    const signatureCharacters = Constants.SIGNATURE_BYTES * 2;
    const effectivePercentageCharacters = Constants.EFFECTIVE_PERCENTAGE_BYTES * 2;
    const rlpSignData = customRawTx.slice(0, -(signatureCharacters + effectivePercentageCharacters));
    const signature = `0x${customRawTx.slice(-(signatureCharacters + effectivePercentageCharacters), -effectivePercentageCharacters)}`;

    const txFields = ethers.utils.RLP.decode(rlpSignData);

    const signatureParams = ethers.utils.splitSignature(signature);
    let rlpFields;
    if (txFields[6] === undefined) {
        const v = ethers.utils.hexlify(signatureParams.v);
        const r = ethers.BigNumber.from(signatureParams.r).toHexString(); // does not have necessary 32 bytes
        const s = ethers.BigNumber.from(signatureParams.s).toHexString(); // does not have necessary 32 bytes
        rlpFields = [...txFields, v, r, s];
    } else {
        const v = ethers.utils.hexlify(signatureParams.v - 27 + txFields[6] * 2 + 35);
        const r = ethers.BigNumber.from(signatureParams.r).toHexString(); // does not have necessary 32 bytes
        const s = ethers.BigNumber.from(signatureParams.s).toHexString(); // does not have necessary 32 bytes
        rlpFields = [...txFields.slice(0, -3), v, r, s];
    }

    return ethers.utils.RLP.encode(rlpFields);
}

/**
 * Reduce an array of rawTx to a single string wich will be the BatchL2Data
 * @param {Array} rawTxs -  Array of rawTxs
 * @returns {String} - Reduced array
 */
function arrayToEncodedString(rawTxs) {
    return rawTxs.reduce((previousValue, currentValue) => previousValue + currentValue.slice(2), '0x');
}

/**
 * Convert a number type to a hex string starting with 0x and with a integer number of bytes
 * @param {Number | BigInt | BigNumber | Object | String} num - Number
 * @returns {Number} - Hex string
 */
function toHexStringRlp(num) {
    let numHex;
    if (typeof num === 'number' || typeof num === 'bigint' || typeof num === 'object') {
        numHex = Scalar.toString(Scalar.e(num), 16);
        // if it's an integer and it's value is 0, the standard is set to 0x, instead of 0x00 ( because says that always is codified in the shortest way)
        if (Scalar.e(num) === Scalar.e(0)) return '0x';
    } else if (typeof num === 'string') {
        numHex = num.startsWith('0x') ? num.slice(2) : num;
    }
    numHex = (numHex.length % 2 === 1) ? (`0x0${numHex}`) : (`0x${numHex}`);

    return numHex;
}

/**
 * Convert a Ethereum address hex string starting with 0x and with a integer number of bytes
 * @param {Number | BigInt | BigNumber | Object | String} address - address
 * @returns {Number} - address hex string
 */
function addressToHexStringRlp(address) {
    // empty address: deployment
    if (typeof address === 'undefined' || (typeof address === 'string' && address === '0x')) {
        return '0x';
    }

    let addressScalar;
    if (typeof address === 'number' || typeof address === 'bigint' || typeof address === 'object') {
        addressScalar = Scalar.e(address);
    } else if (typeof address === 'string') {
        const tmpAddr = address.startsWith('0x') ? address : `0x${address}`;
        addressScalar = Scalar.fromString(tmpAddr, 16);
    }

    return `0x${Scalar.toString(addressScalar, 16).padStart(40, '0')}`;
}

/**
 * Convert a standar rawTx of ethereum [rlp(nonce,gasprice,gaslimit,to,value,data,r,s,v)]
 * to our custom raw tx [rlp(nonce,gasprice,gaslimit,to,value,data,0,0)|r|s|v|effectivePercentage]
 * @param {String} rawTx - Standar raw transaction
 * @returns {String} - Custom raw transaction
 */
function rawTxToCustomRawTx(rawTx, effectivePercentage) {
    const tx = ethers.utils.parseTransaction(rawTx);
    const signData = ethers.utils.RLP.encode([
        toHexStringRlp(tx.nonce),
        toHexStringRlp(tx.gasPrice),
        toHexStringRlp(tx.gasLimit),
        addressToHexStringRlp(tx.to || '0x'),
        toHexStringRlp(tx.value),
        toHexStringRlp(tx.data),
        toHexStringRlp(tx.chainId),
        '0x',
        '0x',
    ]);
    const r = tx.r.slice(2);
    const s = tx.s.slice(2);
    const v = (tx.v - tx.chainId * 2 - 35 + 27).toString(16).padStart(2, '0'); // 1 byte
    if (typeof effectivePercentage === 'undefined') {
        effectivePercentage = 'ff';
    }

    return signData.concat(r).concat(s).concat(v).concat(effectivePercentage);
}

/**
 * Decode the BatchL2Data to an array of rawTxs
 * @param {String} encodedTransactions -  Reduced array
 * @returns {Array} - Array of rawTxs
 */
function encodedStringToArray(encodedTransactions) {
    const encodedTxBytes = ethers.utils.arrayify(encodedTransactions);
    const decodedRawTx = [];

    let offset = 0;

    while (offset < encodedTxBytes.length) {
        if (encodedTxBytes[offset] === Constants.TX_CHANGE_L2_BLOCK) {
            const bytesToRead = 1 + Constants.DELTA_TIMESTAMP_BYTES + Constants.INDEX_L1INFOTREE_BYTES;
            const tx = ethers.utils.hexlify(encodedTxBytes.slice(offset, offset + bytesToRead));
            decodedRawTx.push(tx);
            offset += bytesToRead;
        } else if (encodedTxBytes[offset] >= 0xf8) {
            const lengthLength = encodedTxBytes[offset] - 0xf7;
            if (offset + 1 + lengthLength > encodedTxBytes.length) {
                throw new Error('encodedTxBytes short segment too short');
            }

            const length = unarrayifyInteger(encodedTxBytes, offset + 1, lengthLength);
            if (offset + 1 + lengthLength + length > encodedTxBytes.length) {
                throw new Error('encodedTxBytes long segment too short');
            }

            const bytesToRead = 1 + lengthLength + length + Constants.SIGNATURE_BYTES + Constants.EFFECTIVE_PERCENTAGE_BYTES;
            decodedRawTx.push(ethers.utils.hexlify(encodedTxBytes.slice(offset, offset + bytesToRead)));
            offset += bytesToRead;
        } else if (encodedTxBytes[offset] >= 0xc0) {
            const length = encodedTxBytes[offset] - 0xc0;
            if (offset + 1 + length > encodedTxBytes.length) {
                throw new Error('encodedTxBytes array too short');
            }

            const bytesToRead = 1 + length + Constants.SIGNATURE_BYTES + Constants.EFFECTIVE_PERCENTAGE_BYTES;
            decodedRawTx.push(ethers.utils.hexlify(encodedTxBytes.slice(offset, offset + bytesToRead)));
            offset += bytesToRead;
        } else {
            throw new Error('Error encodedStringToArray');
        }
    }

    return decodedRawTx;
}

/**
 * Decode The next string in rlp, wich has 0-55 bytes long
 * @param {Uint8Array} data - Byte array
 * @param {Number} offset - Offset of the data array
 * @returns {Object} - Return the bytes consumed and the result encoded in hex string
 */
function decodeNextShortStringRLP(encodedTxBytes, offset) {
    if (encodedTxBytes[offset] >= 0xb8) {
        throw new Error('Should be a short string RLP');
    } else if (encodedTxBytes[offset] >= 0x80) {
        const length = encodedTxBytes[offset] - 0x80;
        const result = ethers.utils.hexlify(encodedTxBytes.slice(offset + 1, offset + 1 + length));

        return { consumed: (1 + length), result };
    } else {
        return { consumed: 1, result: ethers.utils.hexlify(encodedTxBytes[offset]) };
    }
}

/**
 * Decode The next string in rlp
 * @param {String} encodedTxBytes - Reduced array
 * @returns {Array} - Array of rawTxs
 */
function decodeNextStringRLP(encodedTxBytes, offset) {
    if (encodedTxBytes[offset] >= 0xb8) {
        const lengthLength = encodedTxBytes[offset] - 0xb7;
        const length = unarrayifyInteger(encodedTxBytes, offset + 1, lengthLength);
        const result = ethers.utils.hexlify(encodedTxBytes.slice(offset + 1 + lengthLength, offset + 1 + lengthLength + length));

        return { consumed: (1 + lengthLength + length), result };
    }

    return decodeNextShortStringRLP(encodedTxBytes, offset);
}

/**
 * Decode the BatchL2Data to an array of rawTxs using the prover method
 * @param {String} encodedTransactions - Reduced array
 * @returns {Object} - The object contain the  Array of rawTxs and the rlpSignData as the prover does
 */
function decodeCustomRawTxProverMethod(encodedTransactions) {
    // should check total len before read
    const encodedTxBytes = ethers.utils.arrayify(encodedTransactions);
    const txDecoded = {};

    let offset = 0; // in zkasm this is the p

    let txListLength = 0;
    let headerLength = 0;
    // Decode list length
    if (encodedTxBytes[offset] < 0xc0) {
        throw new Error('headerList should be a list');
    } else if (encodedTxBytes[offset] >= 0xf8) {
        const lengthLength = encodedTxBytes[offset] - 0xf7;
        txListLength = unarrayifyInteger(encodedTxBytes, offset + 1, lengthLength);
        offset = offset + 1 + lengthLength;
        headerLength = 1 + lengthLength;
    } else if (encodedTxBytes[offset] >= 0xc0) {
        txListLength = encodedTxBytes[offset] - 0xc0;
        offset += 1;
        headerLength = 1;
    }

    // Nonce read
    const decodedNonce = decodeNextShortStringRLP(encodedTxBytes, offset);
    offset += decodedNonce.consumed;
    txDecoded.nonce = decodedNonce.result;

    // GasPrice read
    const decodedGasPrice = decodeNextShortStringRLP(encodedTxBytes, offset);
    offset += decodedGasPrice.consumed;
    txDecoded.gasPrice = decodedGasPrice.result;

    // gas read
    const decodedGasLimit = decodeNextShortStringRLP(encodedTxBytes, offset);
    offset += decodedGasLimit.consumed;
    txDecoded.gasLimit = decodedGasLimit.result;

    // To READ
    if (encodedTxBytes[offset] === 0x80) {
        txDecoded.to = '0x';
        offset += 1;
    } else if (encodedTxBytes[offset] === 0x94) {
        const length = 20;
        txDecoded.to = ethers.utils.hexlify(encodedTxBytes.slice(offset + 1, offset + 1 + length));
        offset += 1 + length;
    } else {
        throw new Error('To should be an address or empty');
    }

    // Value READ
    const decodedValue = decodeNextShortStringRLP(encodedTxBytes, offset);
    offset += decodedValue.consumed;
    txDecoded.value = decodedValue.result;

    // Data READ
    const decodedData = decodeNextStringRLP(encodedTxBytes, offset);
    offset += decodedData.consumed;
    txDecoded.data = decodedData.result;

    // Don't decode chainId if tx is legacy
    if (txListLength + headerLength !== offset) {
        // chainID READ
        const decodedChainID = decodeNextShortStringRLP(encodedTxBytes, offset);
        offset += decodedChainID.consumed;
        txDecoded.chainID = decodedChainID.result;

        if ((encodedTxBytes[offset] !== 0x80) || encodedTxBytes[offset + 1] !== 0x80) {
            throw new Error('The last 2 values should be 0x8080');
        }
        offset += 2;
    }

    if (txListLength + headerLength !== offset) {
        throw new Error('Invalid list length');
    }

    const rlpSignData = ethers.utils.hexlify(encodedTxBytes.slice(0, offset));

    const lenR = 32;
    const lenS = 32;
    const lenV = 1;
    const lenEffectivePercentage = 1;

    txDecoded.r = ethers.utils.hexlify(encodedTxBytes.slice(offset, offset + lenR));
    offset += lenR;
    // r: assert to read 32 bytes
    if (txDecoded.r.length !== (2 + 2 * lenR)) {
        throw new Error('Invalid signature length: R');
    }

    txDecoded.s = ethers.utils.hexlify(encodedTxBytes.slice(offset, offset + lenS));
    offset += lenS;
    // s: assert to read 32 bytes
    if (txDecoded.s.length !== (2 + 2 * lenS)) {
        throw new Error('Invalid signature length: S');
    }

    txDecoded.v = ethers.utils.hexlify(encodedTxBytes.slice(offset, offset + lenV));
    offset += lenV;
    // v: assert to read 32 bytes
    if (txDecoded.v.length !== (2 + 2 * lenV)) {
        throw new Error('Invalid signature length: V');
    }

    txDecoded.effectivePercentage = ethers.utils.hexlify(encodedTxBytes.slice(offset, offset + lenEffectivePercentage));
    offset += lenEffectivePercentage;
    if (txDecoded.effectivePercentage === '0x') {
        txDecoded.effectivePercentage = '0xff';
    }

    return { txDecoded, rlpSignData };
}

/**
 * Computes the effective gas price for a transaction
 * @param {String | BigInt} gasPrice in hex string or BigInt
 * @param {String | BigInt} effectivePercentage in hex string or BigInt
 * @returns effectiveGasPrice as BigInt
 */
function computeEffectiveGasPrice(gasPrice, effectivePercentage) {
    const effectivegasPrice = Scalar.div(
        Scalar.mul(Scalar.e(gasPrice), (Scalar.e(Number(effectivePercentage) + 1))),
        256,
    );

    return effectivegasPrice;
}

/**
 * Computes the L2 transaction hash from a transaction
 * @param {Object} tx tx to compute l2 hash, must have nonce, gasPrice, gasLimit, to, value, data, from in hex string
 * @returns computed l2 tx hash
 */
async function computeL2TxHash(tx) {
    const hash = `${formatL2TxHashParam(tx.nonce)}${formatL2TxHashParam(tx.gasPrice)}${formatL2TxHashParam(tx.gasLimit)}${formatL2TxHashParam(tx.to)}${formatL2TxHashParam(tx.value)}${formatL2TxHashParam(tx.data)}${formatL2TxHashParam(tx.from)}`;
    const txHash = await smtUtils.linearPoseidon(hash);

    return txHash;
}

function formatL2TxHashParam(param) {
    if (param.startsWith('0x')) {
        param = param.slice(2);
    }
    if (param === '00' || param === '') {
        return param;
    }
    // format to bytes
    if (param.length % 2 === 1) {
        param = `0${param}`;
    }
    // Checks hex correctness
    const res = Buffer.from(param, 'hex').toString('hex');
    if (res === '' || res.length !== param.length) {
        throw new Error('Invalid hex string');
    }

    return res;
}

/**
 * Decode string into a changeL2Transaction transaction type
 * @param {String} _rawTx
 * @returns {Object} transaction object
 */
async function decodeChangeL2BlockTx(_rawTx) {
    const tx = {};

    let offsetChars = 0;
    const serializedTx = _rawTx.startsWith('0x') ? _rawTx.slice(2) : _rawTx;

    let charsToRead = Constants.TYPE_BYTES * 2;

    tx.type = parseInt(serializedTx.slice(offsetChars, offsetChars + charsToRead), 16);
    offsetChars += charsToRead;

    charsToRead = Constants.DELTA_TIMESTAMP_BYTES * 2;
    tx.deltaTimestamp = Scalar.fromString(serializedTx.slice(offsetChars, offsetChars + charsToRead), 16);
    offsetChars += charsToRead;

    charsToRead = Constants.INDEX_L1INFOTREE_BYTES * 2;
    tx.indexL1InfoTree = parseInt(serializedTx.slice(offsetChars, offsetChars + charsToRead), 16);

    return tx;
}

/**
 * Serialize transaction for the batch
 * fields: [type | deltaTimestamp | indexL1InfoTree ]
 * bytes:  [  1  |       4        |         4       ]
 * @param {Object} tx - transaction object
 * @returns {String} - Serialized tx in hexadecimal string
 */
function serializeChangeL2Block(tx) {
    let data = Scalar.e(0);

    let offsetBits = 0;

    data = Scalar.add(data, Scalar.shl(tx.indexL1InfoTree, offsetBits));
    offsetBits += Constants.INDEX_L1INFOTREE_BYTES * 8;

    data = Scalar.add(data, Scalar.shl(tx.deltaTimestamp, offsetBits));
    offsetBits += Constants.DELTA_TIMESTAMP_BYTES * 8;

    data = Scalar.add(data, Scalar.shl(tx.type, offsetBits));
    offsetBits += Constants.TYPE_BYTES * 8;

    return valueToHexStr(data).padStart(offsetBits / 4, '0');
}

module.exports = {
    decodeCustomRawTxProverMethod,
    rawTxToCustomRawTx,
    toHexStringRlp,
    customRawTxToRawTx,
    arrayToEncodedString,
    encodedStringToArray,
    addressToHexStringRlp,
    computeEffectiveGasPrice,
    computeL2TxHash,
    decodeChangeL2BlockTx,
    serializeChangeL2Block,
};
