const { Scalar } = require('ffjavascript');
const { expect } = require('chai');

const {
    MemDB, getPoseidon,
} = require('../index');

describe('MemDB', () => {
    let poseidon;
    let F;
    let db;

    before(async () => {
        poseidon = await getPoseidon();
        F = poseidon.F;
    });

    it('create new instance', async () => {
        db = new MemDB(F);
    });

    it('getSmtNode: no value', async () => {
        const key = [F.e(1), F.e(1), F.e(1), F.e(1)];

        // no value found
        const res = await db.getSmtNode(key);
        expect(res).to.be.equal(null);
    });

    it('getValue: no value', async () => {
        const key = Scalar.e(1);

        // no value found
        const res = await db.getValue(key);
        expect(res).to.be.equal(null);
    });

    it('setValue & getValue', async () => {
        const key = Scalar.e(1);
        const value = { testN: 2, testStr: 'helloworld' };

        await db.setValue(key, value);
        const res = await db.getValue(key);

        expect(value).to.be.deep.equal(res);
    });

    it('setSmtNode & getSmtNode', async () => {
        const key = [F.e(1), F.e(2), F.e(3), F.e(4)];
        const value = [F.e(0), F.e(1), F.e(2), F.e(3), F.e(4), F.e(5), F.e(6), F.e(7)];

        await db.setSmtNode(key, value);
        const res = await db.getSmtNode(key);
        expect(value).to.be.deep.equal(res);
    });
});
