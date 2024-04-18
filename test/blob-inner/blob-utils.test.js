const { expect } = require('chai');

const {
    utils,
} = require('../../index').blobInner;

// eslint-disable-next-line prefer-arrow-callback
describe('blob utils', async function () {
    it('computeVersionedHash', async () => {
        const expectedValue = '0x01ef9c6c1dae51f6f666f0b8633e81101fa03033830366d19c56401313422502';

        const kzgCommitment = '0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d493471dcc4de8dec75d7aab85b567b6ccd41a';
        const versionedHash = utils.computeVersionedHash(kzgCommitment);

        expect(versionedHash).to.be.equal(expectedValue);
    });
});
