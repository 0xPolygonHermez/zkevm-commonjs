const { Scalar } = require('ffjavascript');
const smtUtils = require('../smt-utils');

function parseGlobalInputs(_globalInputs) {
    return {
        oldBlobStateRoot: smtUtils.stringToH4(_globalInputs.oldBlobStateRoot),
        oldBlobAccInputHash: _globalInputs.oldBlobAccInputHash,
        oldNumBlob: Number(_globalInputs.oldNumBlob),
        oldStateRoot: smtUtils.stringToH4(_globalInputs.oldStateRoot),
        forkID: Number(_globalInputs.forkID),
    };
}

function parsePrivateInputs(_privateInputs) {
    return {
        lastL1InfoTreeIndex: Number(_privateInputs.lastL1InfoTreeIndex),
        lastL1InfoTreeRoot: _privateInputs.lastL1InfoTreeRoot,
        timestampLimit: Scalar.e(_privateInputs.timestampLimit),
        sequencerAddress: _privateInputs.sequencerAddress,
        zkGasLimit: Scalar.e(_privateInputs.zkGasLimit),
        blobType: Number(_privateInputs.blobType),
        forcedHashData: _privateInputs.forcedHashData,
    };
}

module.exports = {
    parseGlobalInputs,
    parsePrivateInputs,
};
