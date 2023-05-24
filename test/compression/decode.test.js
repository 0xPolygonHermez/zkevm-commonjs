/* eslint-disable no-await-in-loop */
const { Scalar } = require('ffjavascript');
const fs = require('fs');
const { argv } = require('yargs');
const path = require('path');
const { expect } = require('chai');

const {
    decode,
} = require('../../index').compression;

const pathTestVectors = path.join(__dirname, './test-vectors');

describe('Compressor:decode', async () => {
    const pathEncodeTests = path.join(pathTestVectors, './decode.json');
    let update;
    let testVectors;

    before(async () => {
        testVectors = JSON.parse(fs.readFileSync(pathEncodeTests));

        update = argv.update === true;
    });

    after(async () => {
        if (update) {
            await fs.writeFileSync(pathEncodeTests, JSON.stringify(testVectors, null, 2));
        }
    });

    it('dataLess32Bytes', async () => {
        for (let i = 5; i < testVectors.dataLess32Bytes.length; i++) {
            const test = testVectors.dataLess32Bytes[i];

            const computedOutput = decode.dataLess32Bytes(test.input);

            if (update) {
                test.output = `0x${computedOutput}`;
            } else {
                expect(`0x${computedOutput}`).to.be.equal(test.output);
            }
        }
    });

    it('largeData', async () => {
        for (let i = 0; i < testVectors.largeData.length; i++) {
            const test = testVectors.largeData[i];

            const computedOutput = decode.largeData(test.input);

            if (update) {
                test.output = `0x${computedOutput}`;
            } else {
                // console.log("input: ", test.input);
                // console.log("computedOutput: ", computedOutput);
                // console.log("test.output: ", test.output);
                expect(`0x${computedOutput}`).to.be.equal(test.output);
            }
        }
    });

    it('smallValue', async () => {
        for (let i = 0; i < testVectors.smallValue.length; i++) {
            const test = testVectors.smallValue[i];

            const computedOutput = decode.smallValue(test.input);

            if (update) {
                test.output = computedOutput;
            } else {
                expect(computedOutput).to.be.equal(test.output);
            }
        }
    });

    it('smallValue: isData', async () => {
        for (let i = 0; i < testVectors.smallValueIsData.length; i++) {
            const test = testVectors.smallValueIsData[i];

            const computedOutput = decode.smallValue(test.input, true);

            if (update) {
                test.output = `0x${computedOutput}`;
            } else {
                expect(`0x${computedOutput}`).to.be.equal(test.output);
            }
        }
    });

    it('compressed32Byte', async () => {
        for (let i = 0; i < testVectors.compressed32Byte.length; i++) {
            const test = testVectors.compressed32Byte[i];

            const computedOutput = decode.compressed32Byte(test.input);

            if (update) {
                test.output = `0x${computedOutput}`;
            } else {
                expect(computedOutput).to.be.equal(test.output);
            }
        }
    });

    it('compressedAddress', async () => {
        for (let i = 0; i < testVectors.compressedAddress.length; i++) {
            const test = testVectors.compressedAddress[i];

            const computedOutput = decode.compressedAddress(test.input);

            if (update) {
                test.output = `0x${computedOutput}`;
            } else {
                expect(computedOutput).to.be.equal(test.output);
            }
        }
    });

    it('compressedValue', async () => {
        for (let i = 0; i < testVectors.compressedValue.length; i++) {
            const test = testVectors.compressedValue[i];

            const computedOutput = decode.compressedValue(test.input);

            if (update) {
                test.output = computedOutput.toString();
            } else {
                expect(computedOutput.toString()).to.be.equal(test.output);
            }
        }
    });

    it('compressedValue: isData', async () => {
        for (let i = 0; i < testVectors.compressedValueIsData.length; i++) {
            const test = testVectors.compressedValueIsData[i];

            const computedOutput = decode.compressedValue(test.input, true);

            if (update) {
                test.output = `0x${computedOutput}`;
            } else {
                expect(`0x${computedOutput}`.toString()).to.be.equal(test.output);
            }
        }
    });

    it('uncompressedAddress', async () => {
        for (let i = 0; i < testVectors.uncompressedAddress.length; i++) {
            const test = testVectors.uncompressedAddress[i];

            const computedOutput = decode.uncompressedAddress(test.input);

            if (update) {
                test.output = `0x${computedOutput}`;
            } else {
                expect(`0x${computedOutput}`).to.be.equal(test.output);
            }
        }
    });

    it('uncompressedAddress: isData', async () => {
        for (let i = 0; i < testVectors.uncompressedAddressIsData.length; i++) {
            const test = testVectors.uncompressedAddressIsData[i];

            const computedOutput = decode.uncompressedAddress(test.input, true);

            if (update) {
                test.output = `0x${computedOutput}`;
            } else {
                expect(`0x${computedOutput}`).to.be.equal(test.output);
            }
        }
    });

    it('uncompressed32Bytes', async () => {
        for (let i = 0; i < testVectors.uncompressed32Bytes.length; i++) {
            const test = testVectors.uncompressed32Bytes[i];

            const computedOutput = decode.uncompressed32Bytes(test.input);

            if (update) {
                test.output = `0x${computedOutput}`;
            } else {
                expect(`0x${computedOutput}`).to.be.equal(test.output);
            }
        }
    });

    it('data32BytesPadRight', async () => {
        for (let i = 0; i < testVectors.data32BytesPadRight.length; i++) {
            const test = testVectors.data32BytesPadRight[i];

            const computedOutput = decode.data32BytesPadRight(test.input);

            if (update) {
                test.output = `0x${computedOutput}`;
            } else {
                expect(`0x${computedOutput}`).to.be.equal(test.output);
            }
        }
    });
});
