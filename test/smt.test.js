/* eslint-disable no-await-in-loop */
const { Scalar } = require('ffjavascript');
const { assert } = require('chai');

const {
    SMT, MemDB, getPoseidon, smtUtils,
} = require('../index');

const { scalar2key } = require('./helpers/test-utils');

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

        const r1 = await smt.set(smt.empty, scalar2key(1, F), Scalar.e(2));

        const rGet = await smt.get(r1.newRoot, scalar2key(1, F));

        assert(Scalar.eq(rGet.value, Scalar.e(2)));

        const r2 = await smt.set(r1.newRoot, scalar2key(1, F), Scalar.e(0));
        assert(smtUtils.nodeIsZero(r2.newRoot, F));
    });

    it('It should update an element 1', async () => {
        const db = new MemDB(F);
        const smt = new SMT(db, poseidon, poseidon.F);

        const r1 = await smt.set(smt.empty, scalar2key(1, F), Scalar.e(2));
        const r2 = await smt.set(r1.newRoot, scalar2key(1, F), Scalar.e(3));
        const r3 = await smt.set(r2.newRoot, scalar2key(1, F), Scalar.e(2));

        assert(smtUtils.nodeIsEq(r1.newRoot, r3.newRoot, F));
    });

    it('It should add a shared element 2', async () => {
        const db = new MemDB(F);
        const smt = new SMT(db, poseidon, poseidon.F);

        const r1 = await smt.set(smt.empty, scalar2key(8, F), Scalar.e(2));
        const r2 = await smt.set(r1.newRoot, scalar2key(9, F), Scalar.e(3));
        const r3 = await smt.set(r2.newRoot, scalar2key(8, F), Scalar.e(0));
        const r4 = await smt.set(r3.newRoot, scalar2key(9, F), Scalar.e(0));

        assert(smtUtils.nodeIsZero(r4.newRoot, F));
    });

    it('It should add a shared element 3', async () => {
        const db = new MemDB(F);
        const smt = new SMT(db, poseidon, poseidon.F);

        const r1 = await smt.set(smt.empty, scalar2key(7, F), Scalar.e(2));
        const r2 = await smt.set(r1.newRoot, scalar2key(15, F), Scalar.e(3));
        const r3 = await smt.set(r2.newRoot, scalar2key(7, F), Scalar.e(0));
        const r4 = await smt.set(r3.newRoot, scalar2key(15, F), Scalar.e(0));

        assert(smtUtils.nodeIsZero(r4.newRoot, F));
    });

    it('It should add a shared element', async () => {
        const db = new MemDB(F);
        const smt = new SMT(db, poseidon, poseidon.F);

        const r1 = await smt.set(smt.empty, scalar2key(7, F), Scalar.e(107));
        const r2 = await smt.set(r1.newRoot, scalar2key(15, F), Scalar.e(115));
        const r3 = await smt.set(r2.newRoot, scalar2key(3, F), Scalar.e(103));
        const r4 = await smt.set(r3.newRoot, scalar2key(7, F), Scalar.e(0));
        const r5 = await smt.set(r4.newRoot, scalar2key(15, F), Scalar.e(0));
        const r6 = await smt.set(r5.newRoot, scalar2key(3, F), Scalar.e(0));

        assert(smtUtils.nodeIsZero(r6.newRoot, F));
    });

    it('Add-Remove 128 elements', async () => {
        const N = 128;
        const db = new MemDB(F);
        const smt = new SMT(db, poseidon, poseidon.F);

        let r = {
            newRoot: smt.empty,
        };

        for (let i = 0; i < N; i++) {
            r = await smt.set(r.newRoot, scalar2key(i, F), Scalar.e(i + 1000));
        }

        for (let i = 0; i < N; i++) {
            r = await smt.set(r.newRoot, scalar2key(i, F), Scalar.e(0));
        }

        assert(smtUtils.nodeIsZero(r.newRoot, F));
    });

    it('Should read random', async () => {
        const N = 3;
        const db = new MemDB(F);
        const smt = new SMT(db, poseidon, poseidon.F);

        const vals = {};

        let r = {
            newRoot: smt.empty,
        };

        let rr;

        for (let i = 0; i < N; i++) {
            const key = i;
            const val = i;
            vals[key] = val;
            r = await smt.set(r.newRoot, scalar2key(key, F), Scalar.e(val));
        }

        for (let i = 0; i < N; i++) {
            rr = await smt.get(r.newRoot, scalar2key(i, F));
            const v = vals[i] ? vals[i] : 0;
            assert(Scalar.eq(rr.value, Scalar.e(v)));
        }
    });

    it('It should add elements with similar keys', async () => {
        const db = new MemDB(F);
        const smt = new SMT(db, poseidon, poseidon.F);

        const expectedRoot = [
            442750481621001142n,
            12174547650106208885n,
            10730437371575329832n,
            4693848817100050981n,
        ];

        const r0 = await smt.set(smt.empty, scalar2key(0, F), Scalar.e(2)); // 0x00
        const r1 = await smt.set(r0.newRoot, scalar2key(4369, F), Scalar.e(2)); // 0x1111
        const r2 = await smt.set(r1.newRoot, scalar2key(69905, F), Scalar.e(3)); // 0x11111

        assert(smtUtils.nodeIsEq(expectedRoot, r2.newRoot, F));
    });

    it('It should update leaf with more than one level depth', async () => {
        const db = new MemDB(F);
        const smt = new SMT(db, poseidon, poseidon.F);

        const expectedRoot = [
            13590506365193044307n,
            13215874698458506886n,
            4743455437729219665n,
            1933616419393621600n,
        ];

        const r0 = await smt.set(
            smt.empty,
            scalar2key(Scalar.e('56714103185361745016746792718676985000067748055642999311525839752090945477479'), F),
            Scalar.e('8163644824788514136399898658176031121905718480550577527648513153802600646339'),
        );

        const r1 = await smt.set(
            r0.newRoot,
            scalar2key(Scalar.e('980275562601266368747428591417466442501663392777380336768719359283138048405'), F),
            Scalar.e('115792089237316195423570985008687907853269984665640564039457584007913129639934'),
        );

        const r2 = await smt.set(
            r1.newRoot,
            scalar2key(Scalar.e('53001048207672216258532366725645107222481888169041567493527872624420899640125'), F),
            Scalar.e('115792089237316195423570985008687907853269984665640564039457584007913129639935'),
        );

        const r3 = await smt.set(
            r2.newRoot,
            scalar2key(Scalar.e('60338373645545410525187552446039797737650319331856456703054942630761553352879'), F),
            Scalar.e('7943875943875408'),
        );

        const r4 = await smt.set(
            r3.newRoot,
            scalar2key(Scalar.e('56714103185361745016746792718676985000067748055642999311525839752090945477479'), F),
            Scalar.e('35179347944617143021579132182092200136526168785636368258055676929581544372820'),
        );
        assert(smtUtils.nodeIsEq(expectedRoot, r4.newRoot, F));
    });

    it('It should Zero to Zero with isOldZero=0', async () => {
        const db = new MemDB(F);
        const smt = new SMT(db, poseidon, poseidon.F);

        const r0 = await smt.set(smt.empty, scalar2key(0x1, F), Scalar.e(2)); // 0x00
        const r1 = await smt.set(r0.newRoot, scalar2key(0x2, F), Scalar.e(3)); // 0x00
        const r2 = await smt.set(r1.newRoot, scalar2key(0x10000, F), Scalar.e(0)); // 0x1111

        assert(!r2.isOldZero);
    });
});
