const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

const {
    MemDB, SMT, stateUtils, getPoseidon,
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
        testVectors = JSON.parse(fs.readFileSync(path.join(pathTestVectors, 'merkle-tree/smt-full-genesis.json')));
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
                const {
                    address, balance, nonce,
                    bytecode, storage,
                } = addresses[j];

                // add balance and nonce
                tmpRoot = await stateUtils.setAccountState(address, smt, tmpRoot, balance, nonce);

                // add bytecode if defined
                if (typeof bytecode !== 'undefined') {
                    tmpRoot = await stateUtils.setContractBytecode(address, smt, tmpRoot, bytecode);
                }

                // add storage if defined
                if (typeof storage !== 'undefined') {
                    tmpRoot = await stateUtils.setContractStorage(address, smt, tmpRoot, storage);
                }
            }

            expect(F.toString(tmpRoot)).to.be.equal(expectedRoot);
        }
    });
});
