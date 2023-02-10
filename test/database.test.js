const { Scalar } = require('ffjavascript');
const { expect } = require('chai');

const {
    Database, getPoseidon,
} = require('../index');

describe('Database', () => {
    let poseidon;
    let F;
    let db;

    before(async () => {
        poseidon = await getPoseidon();
        F = poseidon.F;
    });

    it('create new instance', async () => {
        db = new Database(F);
        // await db.connect('postgresql://statedb:statedb@127.0.0.1:5432/testdb');
    });

    it('getSmtNode: no value', async () => {
        const key = [F.e(1), F.e(1), F.e(1), F.e(1)];

        // no value found
        const res = await db.getSmtNode(key);
        expect(res).to.be.equal(null);
    });

    it('setSmtNode & getSmtNode', async () => {
        const key = [F.e(1), F.e(2), F.e(3), F.e(4)];
        const value = [F.e(0), F.e(1), F.e(2), F.e(3), F.e(4), F.e(5), F.e(6), F.e(7)];

        await db.setSmtNode(key, value);
        const res = await db.getSmtNode(key);
        expect(value).to.be.deep.equal(res);
    });

    it('getValue: no value', async () => {
        const key = Scalar.e(100);

        // no value found
        const res = await db.getValue(key);
        expect(res).to.be.equal(null);
    });

    it('setValue & getValue', async () => {
        const key = Scalar.e(101);
        const value = { testN: 2, testStr: 'helloworld' };

        await db.setValue(key, value);
        const res = await db.getValue(key);

        expect(value).to.be.deep.equal(res);
    });

    it('getProgram: no value', async () => {
        const key = [F.e(1), F.e(1), F.e(1), F.e(1)];

        // no program found
        const res = await db.getProgram(key);
        expect(res).to.be.equal(null);
    });

    it('setProgram & getProgram', async () => {
        const key = [F.e(5), F.e(6), F.e(7), F.e(8)];
        const value = [10, 11, 12, 13, 14, 15];

        await db.setProgram(key, value);
        const res = await db.getProgram(key);
        expect(value).to.be.deep.equal(res);
    });
});
