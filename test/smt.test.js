/* eslint-disable no-await-in-loop */
const { Scalar } = require('ffjavascript');
const { assert } = require('chai');

const { SMT, MemDB, getPoseidon } = require('../index');

describe('SMT', async function () {
    let poseidon;
    let F;
    this.timeout(100000);

    before(async () => {
        poseidon = await getPoseidon();
        F = poseidon.F;
    });

    it('It should add and remove an element', async () => {
        const db = new MemDB(F);
        const smt = new SMT(db, poseidon, poseidon.F);

        const r1 = await smt.set(smt.empty, Scalar.e(1), Scalar.e(2));
        const r2 = await smt.set(r1.newRoot, Scalar.e(1), Scalar.e(0));

        assert(smt.nodeIsZero(r2.newRoot));
    });

    it('It should update an element', async () => {
        const db = new MemDB(F);
        const smt = new SMT(db, poseidon, poseidon.F);

        const r1 = await smt.set(smt.empty, Scalar.e(1), Scalar.e(2));
        const r2 = await smt.set(r1.newRoot, Scalar.e(1), Scalar.e(3));
        const r3 = await smt.set(r2.newRoot, Scalar.e(1), Scalar.e(2));

        assert(smt.nodeIsEq(r1.newRoot, r3.newRoot));
    });


    it('It should add a shared element', async () => {
        const db = new MemDB(F);
        const smt = new SMT(db, poseidon, poseidon.F);

        const r1 = await smt.set(smt.empty, Scalar.e(8), Scalar.e(2));
        const r2 = await smt.set(r1.newRoot, Scalar.e(9), Scalar.e(3));
        const r3 = await smt.set(r2.newRoot, Scalar.e(8), Scalar.e(0));
        const r4 = await smt.set(r3.newRoot, Scalar.e(9), Scalar.e(0));

        assert(smt.nodeIsZero(r4.newRoot));
    });

    it('It should add a shared element', async () => {
        const db = new MemDB(F);
        const smt = new SMT(db, poseidon, poseidon.F);

        const r1 = await smt.set(smt.empty, Scalar.e(7), Scalar.e(2));
        const r2 = await smt.set(r1.newRoot, Scalar.e(15), Scalar.e(3));
        const r3 = await smt.set(r2.newRoot, Scalar.e(7), Scalar.e(0));
        const r4 = await smt.set(r3.newRoot, Scalar.e(15), Scalar.e(0));

        assert(smt.nodeIsZero(r4.newRoot));
    });

    it('It should add a shared element', async () => {
        const db = new MemDB(F);
        const smt = new SMT(db, poseidon, poseidon.F);

        const r1 = await smt.set(smt.empty, Scalar.e(7), Scalar.e(107));
        const r2 = await smt.set(r1.newRoot, Scalar.e(15), Scalar.e(115));
        const r3 = await smt.set(r2.newRoot, Scalar.e(3), Scalar.e(103));
        const r4 = await smt.set(r3.newRoot, Scalar.e(7), Scalar.e(0));
        const r5 = await smt.set(r4.newRoot, Scalar.e(15), Scalar.e(0));
        const r6 = await smt.set(r5.newRoot, Scalar.e(3), Scalar.e(0));

        assert(smt.nodeIsZero(r6.newRoot));
    });

    it('Add-Remove 128 elements', async () => {
        const N = 128;
        const db = new MemDB(F);
        const smt = new SMT(db, poseidon, poseidon.F);

        let r = {
            newRoot: smt.empty,
        };

        for (let i = 0; i < N; i++) {
            r = await smt.set(r.newRoot, Scalar.e(i), Scalar.e(i + 1000));
        }

        for (let i = 0; i < N; i++) {
            r = await smt.set(r.newRoot, Scalar.e(i), Scalar.e(0));
        }

        assert(smt.nodeIsZero(r.newRoot));
    });

    it('Should read random', async () => {
//        const N = 64;
        const N = 3;
        const db = new MemDB(F);
        const smt = new SMT(db, poseidon, poseidon.F);

        const vals = {};

        let r = {
            newRoot: smt.empty,
        };

        let rr;

        for (let i = 0; i < N; i++) {
//            const key = Math.floor(Math.random() * 64);
//            const val = Math.floor(Math.random() * 2);
            const key=i;
            const val=i;
            vals[key] = val;
            r = await smt.set(r.newRoot, Scalar.e(key), Scalar.e(val));
        }

        for (let i = 0; i < N; i++) {
            rr = await smt.get(r.newRoot, Scalar.e(i));
            const v = vals[i] ? vals[i] : 0;
            assert(Scalar.eq(rr.value, Scalar.e(v)));
        }
    });

    it('It should add elements with similar keys', async () => {
        const db = new MemDB(F);
        const smt = new SMT(db, poseidon, poseidon.F);

        const expectedRoot = [
            16653234378288810553n, 2860457735487827690n, 93436030721967441n, 6974864601318093322n
        ];

        const r0 = await smt.set(smt.empty, Scalar.e(0), Scalar.e(2)); // 0x00
        const r1 = await smt.set(r0.newRoot, Scalar.e(4369), Scalar.e(2)); // 0x1111
        const r2 = await smt.set(r1.newRoot, Scalar.e(69905), Scalar.e(3)); // 0x11111

        assert(smt.nodeIsEq(expectedRoot, r2.newRoot));
    });

});
