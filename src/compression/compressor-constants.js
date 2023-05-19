const ethers = require('ethers');

const ENUM_TX_TYPES = {
    PRE_EIP_155: 0,
    LEGACY: 1,
    EIP_2930: 2,
    EIP_1559: 3,
    CHANGE_L2_BLOCK: 4,
};

const VALID_TX_TYPES = {
    0: {
        name: 'PRE_EIP_155',
        interface: ['type', 'nonce', 'gasPrice', 'gasLimit', 'to', 'value', 'data'],
    },
    1: {
        name: 'LEGACY',
        interface: ['type', 'nonce', 'gasPrice', 'gasLimit', 'to', 'value', 'data', 'chainId'],
    },
    2: {
        name: 'EIP_2930',
        interface: ['type', 'chainId', 'nonce', 'gasPrice', 'gasLimit', 'to', 'value', 'data', 'accessList'],
    },
    3: {
        name: 'EIP_1559',
        interface: ['type', 'chainId', 'nonce', 'maxPriorityFeePerGas', 'maxFeePerGas', 'gasLimit', 'to', 'value', 'data', 'accessList'],
    },
    4: {
        name: 'CHANGE_L2_BLOCK',
        interface: ['type', 'deltaTimestamp', 'newGER', 'indexHistoricalGERTree'],
    },
};

const ENUM_ENCODING_TYPES = {
    DATA_LESS_32_BYTES: 0b000,
    LARGE_DATA_BYTES: 0b001,
    SMALL_VALUE: 0b010,
    COMPRESSED_32_BYTES: 0b011,
    COMPRESSED_ADDRESS: 0b100,
    COMPRESSED_VALUE: 0b101,
    UNCOMPRESSED_ADDRESS: 0b11000000,
    UNCOMPRESSED_32_BYTES: 0b11000001,
    DATA_32_BYTES_PAD_RIGHT: 0b111,
};

module.exports = {
    VALID_TX_TYPES,
    ENUM_TX_TYPES,
    ENUM_ENCODING_TYPES,
};
