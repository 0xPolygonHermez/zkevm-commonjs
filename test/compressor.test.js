/* eslint-disable no-await-in-loop */
const { Scalar } = require('ffjavascript');
const { assert } = require('chai');
const ethers = require('ethers');

const {
    compression, getPoseidon, MemDB
} = require('../index');

const { scalar2key } = require('./helpers/test-utils');

describe('Compressor', async function () {
    let poseidon;
    let F;
    this.timeout(100000);

    before(async () => {
        poseidon = await getPoseidon();
        F = poseidon.F;
    });

    it('It should add and remove an element', async () => {
        const db = new MemDB(F);

        const compressor = new compression.Compressor(db);

        const txLegacy = {
            type: 1,
            nonce: 13,
            gasPrice: Scalar.e('123000000000'),
            gasLimit: 1000000,
            to: '0x3ec49e613AE70BEb0631D7666f46D4ff2813932E',
            value: '',
            data: '0x',
            chainId: 5,
        };

        await compressor.compressTxData(txLegacy);

        console.log(txLegacy);
    });
});
