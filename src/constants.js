const ethers = require('ethers');
const { Scalar } = require('ffjavascript');

// Database keys
module.exports.DB_LAST_BATCH = ethers.utils.id(('ZKEVM_DB_LAST_BATCH'));
module.exports.DB_STATE_ROOT = ethers.utils.id(('ZKEVM_DB_STATE_ROOT'));
module.exports.DB_LOCAL_EXIT_ROOT = ethers.utils.id(('ZKEVM_DB_DB_LOCAL_EXIT_ROOT'));
module.exports.DB_GLOBAL_EXIT_ROOT = ethers.utils.id(('ZKEVM_DB_GLOBAL_EXIT_ROOT'));
module.exports.DB_SEQ_CHAINID = ethers.utils.id(('ZKEVM_DB_SEQ_CHAINID'));
module.exports.DB_ARITY = ethers.utils.id(('ZKEVM_DB_ARITY'));

// Default values
module.exports.DEFAULT_SEQ_CHAINID = 1000;
module.exports.DEFAULT_ARITY = 4;
module.exports.DEFAULT_MAX_TX = 100;

// SMT constant keys
module.exports.SMT_KEY_BALANCE = 0;
module.exports.SMT_KEY_NONCE = 1;
module.exports.SMT_KEY_SC_CODE = 2;
module.exports.SMT_KEY_SC_STORAGE = 3;

module.exports.Fr = Scalar.e('21888242871839275222246405745257275088548364400416034343698204186575808495617');
