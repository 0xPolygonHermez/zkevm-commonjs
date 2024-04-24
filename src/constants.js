const ethers = require('ethers');
const { Scalar } = require('ffjavascript');

// Database keys
module.exports.DB_LAST_BATCH = ethers.utils.id(('ZKEVM_DB_LAST_BATCH'));
module.exports.DB_STATE_ROOT = ethers.utils.id(('ZKEVM_DB_STATE_ROOT'));
module.exports.DB_ACC_INPUT_HASH = ethers.utils.id(('ZKEVM_DB_ACC_INPUT_HASH'));
module.exports.DB_LOCAL_EXIT_ROOT = ethers.utils.id(('ZKEVM_DB_LOCAL_EXIT_ROOT'));
module.exports.DB_GLOBAL_EXIT_ROOT = ethers.utils.id(('ZKEVM_DB_GLOBAL_EXIT_ROOT'));
module.exports.DB_ADDRESS_STORAGE = ethers.utils.id(('ZKEVM_DB_ADDRESS_STORAGE'));
module.exports.DB_TOUCHED_ACCOUNTS = ethers.utils.id(('ZKEVM_DB_TOUCHED_ACCOUNTS'));
module.exports.DB_STARK_INPUT = ethers.utils.id(('ZKEVM_DB_STARK_INPUT'));
module.exports.DB_AGG_BATCHES = ethers.utils.id(('ZKEVM_DB_AGG_BATCHES'));
module.exports.DB_STARK_BLOB_INNER = ethers.utils.id(('ZKEVM_DB_BLOB_INNER'));
// blob DB keys
module.exports.DB_OUTER_STATE_ROOT = ethers.utils.id(('DB_OUTER_STATE_ROOT'));
module.exports.DB_BLOB_STATE_ROOT = ethers.utils.id(('DB_BLOB_STATE_ROOT'));
module.exports.DB_BLOB_ACC_INPUT_HASH = ethers.utils.id(('DB_BLOB_ACC_INPUT_HASH'));
module.exports.DB_LAST_NUM_BLOB = ethers.utils.id(('DB_LAST_NUM_BLOB'));
module.exports.DB_OUTER_LOCAL_EXIT_ROOT = ethers.utils.id(('DB_OUTER_LOCAL_EXIT_ROOT'));
module.exports.DB_STARK_BLOB_OUTER = ethers.utils.id(('DB_STARK_BLOB_OUTER'));

// Default values and global constants
module.exports.DEFAULT_MAX_TX = 1000;
module.exports.SIGNATURE_BYTES = 32 + 32 + 1;
module.exports.EFFECTIVE_PERCENTAGE_BYTES = 1;
module.exports.FrSNARK = Scalar.e('21888242871839275222246405745257275088548364400416034343698204186575808495617');
module.exports.FrSTARK = Scalar.e('18446744069414584321');

// SMT constant keys
module.exports.SMT_KEY_BALANCE = 0;
module.exports.SMT_KEY_NONCE = 1;
module.exports.SMT_KEY_SC_CODE = 2;
module.exports.SMT_KEY_SC_STORAGE = 3;
module.exports.SMT_KEY_SC_LENGTH = 4;

// SMT touched-tree constant keys
module.exports.SMT_KEY_TOUCHED_ADDR = 5;
module.exports.SMT_KEY_TOUCHED_SLOTS = 6;

// SMT block header constant keys
module.exports.SMT_KEY_BLOCK_HEADER_PARAM = 7;
module.exports.SMT_KEY_BLOCK_HEADER_TRANSACTION_HASH = 8;
module.exports.SMT_KEY_BLOCK_HEADER_STATUS = 9;
module.exports.SMT_KEY_BLOCK_HEADER_CUMULATIVE_GAS_USED = 10;
module.exports.SMT_KEY_BLOCK_HEADER_LOGS = 11;
module.exports.SMT_KEY_BLOCK_HEADER_EFFECTIVE_PERCENTAGE = 12;

// SMT block header data leaf keys
module.exports.INDEX_BLOCK_HEADER_PARAM_BLOCK_HASH = 0;
module.exports.INDEX_BLOCK_HEADER_PARAM_COINBASE = 1;
module.exports.INDEX_BLOCK_HEADER_PARAM_NUMBER = 2;
module.exports.INDEX_BLOCK_HEADER_PARAM_GAS_LIMIT = 3;
module.exports.INDEX_BLOCK_HEADER_PARAM_TIMESTAMP = 4;
module.exports.INDEX_BLOCK_HEADER_PARAM_GER = 5;
module.exports.INDEX_BLOCK_HEADER_PARAM_BLOCK_HASH_L1 = 6;
module.exports.INDEX_BLOCK_HEADER_PARAM_GAS_USED = 7;

// SMT constant
module.exports.BYTECODE_ELEMENTS_HASH = 8;
module.exports.BYTECODE_BYTES_ELEMENT = 7;
module.exports.BYTECODE_EMPTY = '0x0000000000000000000000000000000000000000000000000000000000000000';
module.exports.HASH_POSEIDON_ALL_ZEROES = '0xc71603f33a1144ca7953db0ab48808f4c4055e3364a246c33c18a9786cb0b359';

// EVM constant
module.exports.ADDRESS_BRIDGE = '0x9D98DeAbC42dd696Deb9e40b4f1CAB7dDBF55988';
module.exports.ADDRESS_GLOBAL_EXIT_ROOT_MANAGER_L2 = '0xa40D5f56745a118D0906a34E69aeC8C0Db1cB8fA';
module.exports.GLOBAL_EXIT_ROOT_STORAGE_POS = 0;
module.exports.LOCAL_EXIT_ROOT_STORAGE_POS = 1;
module.exports.BLOCK_GAS_LIMIT = 1125899906842624;
module.exports.TX_GAS_LIMIT = 30000000;
module.exports.BATCH_DIFFICULTY = 0;
module.exports.ADDRESS_SYSTEM = '0x000000000000000000000000000000005ca1ab1e';

// Adress system storage slots
module.exports.LAST_BLOCK_STORAGE_POS = 0;
module.exports.STATE_ROOT_STORAGE_POS = 1;
module.exports.TIMESTAMP_STORAGE_POS = 2;
module.exports.BLOCK_INFO_ROOT_STORAGE_POS = 3;

// Bridge Leaf Types
module.exports.BRIDGE_LEAF_TYPE_ASSET = 0;
module.exports.BRIDGE_LEAF_TYPE_MESSAGE = 1;

// Tx Types
module.exports.TX_CHANGE_L2_BLOCK = 11;

// Tx Type 11: Change L2 Block constants
module.exports.DELTA_TIMESTAMP_BYTES = 4;
module.exports.INDEX_L1INFOTREE_BYTES = 4;
module.exports.TYPE_BYTES = 1;
module.exports.COINBASE_BYTES = 20;

// Bridge
module.exports.GLOBAL_INDEX_MAINNET_FLAG = Scalar.pow(2, 64);

// Common
module.exports.ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';
