/* eslint-disable no-continue */
/* eslint-disable no-console */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */
const { Scalar } = require('ffjavascript');
const fs = require('fs');
const { argv } = require('yargs');
const path = require('path');
const { expect } = require('chai');

const { getAddrFromData, getPerformance } = require('./helpers/helpers');

const {
    compression, getPoseidon, MemDB, Constants, txUtils,
} = require('../../index');

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

    it('Compressor: no compressed address/bytes32', async () => {
        const db = new MemDB(F);

        const compressor = new compression.Compressor(db);

        for (let i = 0; i < testVectors.length; i++) {
            console.log(i);
            const { tx, expected, extraInfo } = testVectors[i];

            if (argv.verbose) {
                console.log(extraInfo.name);
            }

            const txToCompress = txUtils.parseTx(tx);
            console.log(txToCompress);
            const txCompressed = await compressor.compressTxData(txToCompress);

            if (argv.verbose) {
                getPerformance(txCompressed.nonCompressed, txCompressed.compressed);
                getPerformance(txCompressed.nonCompressed, txCompressed.compressed, true);
            }

            if (update) {
                expected.compressed = txCompressed.compressed;
                expected.nonCompressed = txCompressed.nonCompressed;
            } else {
                expect(expected.compressed).to.be.equal(txCompressed.compressed);
                expect(expected.nonCompressed).to.be.equal(txCompressed.nonCompressed);
            }
        }
    });

    it('Compressor: compressed addresses', async () => {
        if (argv.verbose) {
            console.log('/////////////////////////////////');
            console.log('/////////FULL COMPRESSED/////////');
            console.log('/////////////////////////////////\n\n');
        }

        const db = new MemDB(F);

        const compressor = new compression.Compressor(db);

        // add addresses to DB from 'to'
        let indexAddressTree = 1;
        for (let i = 0; i < testVectors.length; i++) {
            const { tx } = testVectors[i];

            if (tx.type === compression.compressorConstants.ENUM_TX_TYPES.CHANGE_L2_BLOCK) {
                continue;
            }

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

            if (argv.verbose) {
                console.log(extraInfo.name);
            }

            const txToCompress = txUtils.parseTx(tx);

            const txCompressed = await compressor.compressTxData(txToCompress);

            if (argv.verbose) {
                getPerformance(txCompressed.nonCompressed, txCompressed.compressed);
                getPerformance(txCompressed.nonCompressed, txCompressed.compressed, true);
            }

            if (update) {
                expected.fullCompressed = txCompressed.compressed;
            } else {
                expect(expected.fullCompressed).to.be.equal(txCompressed.compressed);
            }
        }
    });
});
