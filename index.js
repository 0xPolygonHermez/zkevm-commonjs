/* eslint-disable global-require */
module.exports.Constants = require('./src/constants');
module.exports.contractUtils = require('./src/contract-utils');
module.exports.Processor = require('./src/processor');
module.exports.processorUtils = require('./src/processor-utils');
module.exports.MemDB = require('./src/mem-db');
module.exports.smtUtils = require('./src/smt-utils');
module.exports.SMT = require('./src/smt');
module.exports.stateUtils = require('./src/state-utils');
module.exports.TmpSmtDB = require('./src/tmp-smt-db');
module.exports.utils = require('./src/utils');
module.exports.ZkEVMDB = require('./src/zkevm-db');
module.exports.getPoseidon = require('./src/poseidon_opt');
module.exports.MTBridge = require('./src/mt-bridge');
module.exports.mtBridgeUtils = require('./src/mt-bridge-utils');
module.exports.Database = require('./src/database');
module.exports.l1InfoTreeUtils = require('./src/l1-info-tree-utils');
module.exports.VirtualCountersManager = require('./src/virtual-counters-manager');
module.exports.blockUtils = require('./src/block-utils');
module.exports.blobUtils = require('./src/blob-inner/blob-utils');

// Blob inner
module.exports.blobInner = {
    Processor: require('./src/blob-inner/blob-processor'),
    utils: require('./src/blob-inner/blob-utils'),
    Constants: require('./src/blob-inner/blob-constants'),
    frBLS12381: require('./src/blob-inner/fr-bls-12-381'),
};
