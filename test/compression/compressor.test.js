/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */
const { Scalar, utils } = require('ffjavascript');
const fs = require('fs');
const { argv } = require('yargs');
const path = require('path');
const { assert, expect } = require('chai');
const ethers = require('ethers');

const { ratio, getAddrFromData } = require('./helpers/helpers');

const {
    compression, getPoseidon, MemDB, Constants,
} = require('../../index');

const { scalar2key } = require('../helpers/test-utils');

const pathTestVectors = path.join(__dirname, './test-vectors');

describe('Compressor', async function () {
    this.timeout(100000);
    let poseidon;
    let F;

    const pathCompressorTests = path.join(pathTestVectors, './compressor.json');
    let update;
    let testVectors;

    before(async () => {
        poseidon = await getPoseidon();
        F = poseidon.F;
        testVectors = JSON.parse(fs.readFileSync(pathCompressorTests));

        update = argv.update === true;
    });

    after(async () => {
        if (update) {
            await fs.writeFileSync(pathCompressorTests, JSON.stringify(testVectors, null, 2));
        }
    });

    // it('Compressor: no compressed address/bytes32', async () => {
    //     const db = new MemDB(F);

    //     const compressor = new compression.Compressor(db);

    //     for (let i = 0; i < testVectors.length; i++) {
    //         const { tx, expected, extraInfo } = testVectors[i];
    //         console.log(extraInfo.name);
    //         const txToCompress = { ...tx };
    //         // set big int values
    //         txToCompress.nonce = Scalar.e(txToCompress.nonce);
    //         txToCompress.gasPrice = Scalar.e(txToCompress.gasPrice);
    //         txToCompress.gasLimit = Scalar.e(txToCompress.gasLimit);
    //         txToCompress.value = Scalar.e(txToCompress.value);
    //         txToCompress.chainId = Number(txToCompress.chainId);

    //         const txCompressed = await compressor.compressTxData(txToCompress);

    //         const r = ratio(txCompressed.nonCompressed, txCompressed.compressed);
    //         const rSig = ratio(txCompressed.nonCompressed, txCompressed.compressed, 65);
    //         console.log(`   ratio: ${r}`);
    //         console.log(`   ratio with sig: ${r}`);
    //         console.log(`   improvement: ${txCompressed.nonCompressed.length / txCompressed.compressed.length}x`);
    //         console.log('///////////////////');
    //         console.log('///////////////////\n\n');
    //         if (update) {
    //             expected.compressed = txCompressed.compressed;
    //             expected.nonCompressed = txCompressed.nonCompressed;
    //         } else {
    //             expect(expected.compressed).to.be.equal(txCompressed.compressed);
    //             expect(expected.nonCompressed).to.be.equal(txCompressed.nonCompressed);
    //         }
    //     }
    // });

    it('Compressor: compressed addresses', async () => {
        console.log('/////////////////////////////////');
        console.log('/////////FULL COMPRESSED/////////');
        console.log('/////////////////////////////////\n\n');

        const db = new MemDB(F);

        const compressor = new compression.Compressor(db);

        // add addresses to DB from 'to'
        let indexAddressTree = 1;
        for (let i = 0; i < testVectors.length; i++) {
            const { tx } = testVectors[i];

            // 'to' address
            if (tx.to !== '0x') {
                const keyAddress = Scalar.add(
                    Constants.DB_COMPRESSOR_ADDRESS,
                    Scalar.fromString(tx.to, 16),
                );

                await db.setValue(keyAddress, indexAddressTree);
                indexAddressTree += 1;
            }

            // parse data
            const dataAddr = getAddrFromData(tx.data);
            for (const addr of dataAddr) {
                const keyAddress = Scalar.add(
                    Constants.DB_COMPRESSOR_ADDRESS,
                    Scalar.fromString(addr, 16),
                );

                await db.setValue(keyAddress, indexAddressTree);
                indexAddressTree += 1;
            }
        }

        for (let i = 0; i < testVectors.length; i++) {
            const { tx, expected, extraInfo } = testVectors[i];
            console.log(extraInfo.name);
            const txToCompress = { ...tx };

            // set big int values
            txToCompress.nonce = Scalar.e(txToCompress.nonce);
            txToCompress.gasPrice = Scalar.e(txToCompress.gasPrice);
            txToCompress.gasLimit = Scalar.e(txToCompress.gasLimit);
            txToCompress.value = Scalar.e(txToCompress.value);
            txToCompress.chainId = Number(txToCompress.chainId);

            const txCompressed = await compressor.compressTxData(txToCompress);
            const r = ratio(txCompressed.nonCompressed, txCompressed.compressed);
            const rSig = ratio(txCompressed.nonCompressed, txCompressed.compressed, 65);

            console.log(`   ratio: ${r}`);
            console.log(`   ratio with sig: ${rSig}`);
            console.log(`   length non-compressed: ${(txCompressed.nonCompressed.length - 2) / 2}`);
            console.log(`   length full-compressed: ${(txCompressed.compressed.length - 2) / 2}`);
            console.log(`   improvement: ${(txCompressed.nonCompressed.length - 2) / (txCompressed.compressed.length - 2)}x`);
            console.log('///////////////////');
            console.log('///////////////////\n\n');

            if (update) {
                expected.fullCompressed = txCompressed.compressed;
            } else {
                expect(expected.fullCompressed).to.be.equal(txCompressed.compressed);
            }
        }
    });
});
