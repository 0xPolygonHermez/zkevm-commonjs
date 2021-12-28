const ethers = require('ethers');

module.exports.DB_LastBatch = ethers.utils.id(('Rollup_DB_LastBatch'));
module.exports.DB_StateRoot = ethers.utils.id(('Rollup_DB_StateRoot'));
module.exports.DB_LocalExitRoot = ethers.utils.id(('Rollup_DB_LocalExitRoot'));
module.exports.DB_GlobalExitRoot = ethers.utils.id(('Rollup_DB_GlobalExitRoot'));

module.exports.DB_SeqChainID = ethers.utils.id(('Rollup_DB_SeqChainID'));
module.exports.DB_Arity = ethers.utils.id(('Rollup_DB_Arity'));

module.exports.defaultSeqChainID = 1000;
module.exports.defaultArity = 4;

module.exports.smtKeyBalance = 0;
module.exports.smtKeyNonce = 1;

module.exports.defaultMaxTx = 100;
