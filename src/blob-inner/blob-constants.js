// General blob constants
const fieldElementsPerBlob = 4096;
const bytesPerFieldElement = 32;

module.exports.MAX_BLOB_DATA_BYTES = 126976;
module.exports.FIELD_ELEMENTS_PER_BLOB = fieldElementsPerBlob;
module.exports.BYTES_PER_FIELD_ELEMENT = bytesPerFieldElement;
module.exports.BLOB_BYTES = fieldElementsPerBlob * bytesPerFieldElement; // 131072
module.exports.ZKGAS_BATCH = 100000000;
module.exports.MAX_BATCHES_FORCED = 1;

// blob type
module.exports.BLOB_TYPE = {
    CALLDATA: 0,
    EIP4844: 1,
    FORCED: 2,
};

// Blob compression type
module.exports.BLOB_COMPRESSION_TYPE = {
    NO_COMPRESSION: 0,
    STATELESS: 1,
    FULL: 2,
};

// Blob encoding
module.exports.BLOB_ENCODING = {
    BYTES_COMPRESSION_TYPE: 1,
    BYTES_BODY_LENGTH: 4,
    BYTES_BATCH_LENGTH: 4,
};
