/**
 * Build blobType
 * @param {Bool} isEIP4844Active - eip4844 used
 * @param {Bool} isForced - forced blob
 * @param {Bool} addL1BlockHash - add L1BlockHash to L2
 * @returns {Number} blobType
 */
function buildBlobType(isEIP4844Active, isForced, addL1BlockHash) {
    const eip4844 = (isEIP4844Active === true) ? 1 : 0;
    const forced = (isForced === true) ? 1 : 0;
    const L1blockHash = (addL1BlockHash === true) ? 1 : 0;

    return eip4844 + 2 * forced + 4 * L1blockHash;
}

module.exports = {
    buildBlobType,
};
