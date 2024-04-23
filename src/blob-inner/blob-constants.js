// General blob constants
const fieldElementsPerBlob = 4096;
const bytesPerFieldElement = 32;

module.exports.MAX_BLOB_DATA_BYTES = 126976;
module.exports.KZG_COMMITMENT_BYTES = 48;
module.exports.KZG_PROOF_BYTES = 48;
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

// blob errors
module.exports.BLOB_ERRORS = {
    ROM_BLOB_ERROR_UNSPECIFIED: 'unspecified error',
    // ROM_ERROR_NO_ERROR indicates the execution ended successfully
    ROM_BLOB_ERROR_NO_ERROR: '',
    // ROM_BLOB_ERROR_INVALID_PARSING indicates that has been an error while parsing the blob data
    ROM_BLOB_ERROR_INVALID_PARSING: 'error_invalid_parsing',
    // ROM_BLOB_ERROR_INVALID_MSB_BYTE indicates that the MSB on one field element is different than zero (only for blob_type = 1)
    ROM_BLOB_ERROR_INVALID_MSB_BYTE: 'error_invalid_msb_byte',
    // ROM_BLOB_ERROR_INVALID_ZK_GAS_LIMIT not enough zk_gas_limit supplied to pay for batches proofs
    ROM_BLOB_ERROR_INVALID_ZK_GAS_LIMIT: 'error_invalid_zkgaslimit',
    // ROM_BLOB_ERROR_INVALID_BLOB_TYPE blob_type not supported
    ROM_BLOB_ERROR_INVALID_BLOB_TYPE: 'error_invalid_blob_type',
    // ROM_BLOB_ERROR_INVALID_COMPRESSION_TYPE compression type not supported
    ROM_BLOB_ERROR_INVALID_COMPRESSION_TYPE: 'error_invalid_compression_type',
    // ROM_BLOB_ERROR_INVALID_FORCED_BATCHES blobtype = 2 and numBatches > 1
    ROM_BLOB_ERROR_INVALID_FORCED_BATCHES: 'error_invalid_forced_batches',
    // ROM_BLOB_ERROR_INVALID_TOTALBODY_LEN totalBodyLen != blobDataLen - 1 (byte compression) - 4 (bytes totalBodyLen)
    ROM_BLOB_ERROR_INVALID_TOTALBODY_LEN: 'error_invalid_totalbody_len',
};
