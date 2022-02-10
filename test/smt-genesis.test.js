const { Scalar } = require('ffjavascript');
const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

const {
    MemDB, SMT, smtUtils, getPoseidon,
} = require('../index');
const { pathTestVectors } = require('./helpers/test-utils');

describe('smt test vectors: key-genesis', async function () {
    this.timeout(10000);
    let poseidon;
    let F;

    let testVectors;

    before(async () => {
        poseidon = await getPoseidon();
        F = poseidon.F;
        testVectors = JSON.parse(fs.readFileSync(path.join(pathTestVectors, 'merkle-tree/smt-genesis.json')));
    });

    it('Should check test vectors', async () => {
        // build tree and check root
        for (let i = 0; i < testVectors.length; i++) {
            const dataTest = testVectors[i];
            const { arity, addresses, expectedRoot } = dataTest;

            const db = new MemDB(F);
            const smt = new SMT(db, arity, poseidon, poseidon.F);

            let tmpRoot = F.zero;

            for (let j = 0; j < addresses.length; j++) {
                const { address, balance, nonce } = addresses[j];

                const keyAddress = await smtUtils.keyEthAddrBalance(address, arity);
                const keyNonce = await smtUtils.keyEthAddrNonce(address, arity);

                let auxRes = await smt.set(tmpRoot, keyAddress, Scalar.e(balance));
                auxRes = await smt.set(auxRes.newRoot, keyNonce, Scalar.e(nonce));
                tmpRoot = auxRes.newRoot;
            }

            expect(F.toString(tmpRoot)).to.be.equal(expectedRoot);
        }
    });
});
