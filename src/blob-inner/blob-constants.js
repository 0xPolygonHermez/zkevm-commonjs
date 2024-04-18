// General blob constants
const fieldElementsPerBlob = 4096;
const bytesPerFieldElement = 32;

module.exports.MAX_BLOB_DATA_BYTES = 126976;
module.exports.FIELD_ELEMENTS_PER_BLOB = fieldElementsPerBlob;
module.exports.BYTES_PER_FIELD_ELEMENT = bytesPerFieldElement;
module.exports.BLOB_BYTES = fieldElementsPerBlob * bytesPerFieldElement; // 131072
module.exports.ZKGAS_BATCH = 100000000;
module.exports.MAX_BATCHES_FORCED = 1;
module.exports.VERSIONED_HASH_VERSION_KZG = '01';
module.exports.MOCK_KZG_COMMITMENT = '0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d493471dcc4de8dec75d7aab85b567b6ccd41a';
module.exports.MOCK_KZG_PROOF = '0x81005434635456a16f74ff7023fbe0bf423abbc8a8deb093ffff455c0ad3b74181005434635456a16f74ff7023fbe0bf';

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
