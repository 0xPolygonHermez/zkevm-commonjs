const { expect } = require('chai');

const {
    utils,
} = require('../index');

// eslint-disable-next-line prefer-arrow-callback
describe('utils', async function () {
    it('byteArray2HexString & hexString2byteArray', async () => {
        const inputHex = '0x010203040506070809';
        const inputArray = utils.hexString2byteArray(inputHex);
        const outputHex = utils.byteArray2HexString(inputArray);

        expect(outputHex).to.be.equal(inputHex.slice(2));
    });
});
