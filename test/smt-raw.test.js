const { Scalar } = require('ffjavascript');
const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

const { MemDB, SMT, getPoseidon } = require('../index');
const { pathTestVectors } = require('./helpers/test-utils');

describe('smt test vectors: key-smt', async function () {
    this.timeout(10000);
    let poseidon;
    let F;

    let testVectors;

    before(async () => {
        poseidon = await getPoseidon();
        F = poseidon.F;
        testVectors = JSON.parse(fs.readFileSync(path.join(pathTestVectors, 'merkle-tree/smt-raw.json')));
    });

    it('Should check test vectors', async () => {
        // build tree and check root
        for (let i = 0; i < testVectors.length; i++) {
            const dataTest = testVectors[i];
            const { arity, keys, values } = dataTest;

            const db = new MemDB(F);
            const smt = new SMT(db, arity, poseidon, poseidon.F);

            expect(keys.length).to.be.equal(values.length);

            let tmpRoot = F.zero;

            for (let j = 0; j < keys.length; j++) {
                const key = F.e(keys[j]);
                const value = Scalar.e(values[j]);

                const res = await smt.set(tmpRoot, key, value);
                tmpRoot = res.newRoot;
            }

            expect(F.toString(tmpRoot)).to.be.equal(dataTest.expectedRoot);
        }
    });
});
