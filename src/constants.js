const ethers = require('ethers');
const { Scalar } = require('ffjavascript');

// Database keys
module.exports.DB_LAST_BATCH = ethers.utils.id(('ZKEVM_DB_LAST_BATCH'));
module.exports.DB_STATE_ROOT = ethers.utils.id(('ZKEVM_DB_STATE_ROOT'));
module.exports.DB_LOCAL_EXIT_ROOT = ethers.utils.id(('ZKEVM_DB_DB_LOCAL_EXIT_ROOT'));
module.exports.DB_GLOBAL_EXIT_ROOT = ethers.utils.id(('ZKEVM_DB_GLOBAL_EXIT_ROOT'));
module.exports.DB_ADDRESS_STORAGE = ethers.utils.id(('ZKEVM_DB_ADDRESS_STORAGE'));
module.exports.DB_TOUCHED_ACCOUNTS = ethers.utils.id(('ZKEVM_DB_TOUCHED_ACCOUNTS'));

// Default values and global constants
module.exports.DEFAULT_MAX_TX = 1000;
module.exports.SIGNATURE_BYTES = 32 + 32 + 1;
module.exports.FrSNARK = Scalar.e('21888242871839275222246405745257275088548364400416034343698204186575808495617');
module.exports.FrSTARK = Scalar.e('18446744069414584321');

// SMT constant keys
module.exports.SMT_KEY_BALANCE = 0;
module.exports.SMT_KEY_NONCE = 1;
module.exports.SMT_KEY_SC_CODE = 2;
module.exports.SMT_KEY_SC_STORAGE = 3;
module.exports.SMT_KEY_SC_LENGTH = 4;

// SMT constant
module.exports.BYTECODE_ELEMENTS_HASH = 8;
module.exports.BYTECODE_BYTES_ELEMENT = 7;
module.exports.BYTECODE_EMPTY = '0x0000000000000000000000000000000000000000000000000000000000000000';
module.exports.HASH_POSEIDON_ALL_ZEROES = '0xc71603f33a1144ca7953db0ab48808f4c4055e3364a246c33c18a9786cb0b359';

// EVM constant
module.exports.ADDRESS_BRIDGE = '0x9D98DeAbC42dd696Deb9e40b4f1CAB7dDBF55988';
module.exports.ADDRESS_GLOBAL_EXIT_ROOT_MANAGER_L2 = '0xAE4bB80bE56B819606589DE61d5ec3b522EEB032';
module.exports.GLOBAL_EXIT_ROOT_STORAGE_POS = 0;
module.exports.LOCAL_EXIT_ROOT_STORAGE_POS = 1;
module.exports.BATCH_GAS_LIMIT = 30000000;
module.exports.BATCH_DIFFICULTY = 0;
module.exports.ADDRESS_SYSTEM = '0x0000000000000000000000000000000000000000';
module.exports.STATE_ROOT_STORAGE_POS = 0;
module.exports.LAST_TX_STORAGE_POS = '0x0000000000000000000000000000000000000000000000000000000000000000';
