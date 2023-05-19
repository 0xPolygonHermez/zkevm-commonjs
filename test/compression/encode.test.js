/* eslint-disable no-await-in-loop */
const { Scalar } = require('ffjavascript');
const fs = require('fs');
const { argv } = require('yargs');
const path = require('path');
const { expect } = require('chai');
const ethers = require('ethers');

const {
    encode,
} = require('../../index').compression;
const { largeData } = require('../../src/compression/encode');

const pathTestVectors = path.join(__dirname, './test-vectors');

describe('Compressor:encode', async () => {
    const pathEncodeTests = path.join(pathTestVectors, './encode.json');
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
        for (let i = 0; i < testVectors.dataLess32Bytes.length; i++) {
            const test = testVectors.dataLess32Bytes[i];

            const computedOutput = encode.dataLess32Bytes(test.input);

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

            const computedOutput = encode.largeData(test.input);

            if (update) {
                test.output = `0x${computedOutput}`;
            } else {
                expect(`0x${computedOutput}`).to.be.equal(test.output);
            }
        }
    });

    it('smallValue', async () => {
        for (let i = 0; i < testVectors.smallValue.length; i++) {
            const test = testVectors.smallValue[i];

            const computedOutput = encode.smallValue(test.input);

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

            const computedOutput = encode.compressed32Byte(test.input);

            if (update) {
                test.output = `0x${computedOutput}`;
            } else {
                expect(`0x${computedOutput}`).to.be.equal(test.output);
            }
        }
    });

    it('compressedAddress', async () => {
        for (let i = 0; i < testVectors.compressedAddress.length; i++) {
            const test = testVectors.compressedAddress[i];

            const computedOutput = encode.compressedAddress(test.input);

            if (update) {
                test.output = `0x${computedOutput}`;
            } else {
                expect(`0x${computedOutput}`).to.be.equal(test.output);
            }
        }
    });

    it('compressedValue', async () => {
        for (let i = 0; i < testVectors.compressedValue.length; i++) {
            const test = testVectors.compressedValue[i];

            const computedOutput = encode.compressedValue(Scalar.e(test.input));

            if (update) {
                test.output = `0x${computedOutput}`;
            } else {
                expect(`0x${computedOutput}`).to.be.equal(test.output);
            }
        }
    });

    it('uncompressedAddress', async () => {
        for (let i = 0; i < testVectors.uncompressedAddress.length; i++) {
            const test = testVectors.uncompressedAddress[i];

            const computedOutput = encode.uncompressedAddress(test.input);

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

            const computedOutput = encode.uncompressed32Bytes(test.input);

            if (update) {
                test.output = `0x${computedOutput}`;
            } else {
                expect(`0x${computedOutput}`).to.be.equal(test.output);
            }
        }
    });
});
