const { Scalar } = require('ffjavascript');
const { expect } = require('chai');
const ethers = require('ethers');

const {
    MemDB, SMT, smtUtils, TmpDB, getPoseidon,
} = require('../index');

describe('TmpDB', () => {
    let poseidon;
    let F;

    before(async () => {
        poseidon = await getPoseidon();
        F = poseidon.F;
    });

    it('Check that tmpDB gets the state from srcDb', async () => {
        const address = '0x617b3a3528F9cDd6630fd3301B9c8911F7Bf063D';
        const balance = Scalar.e(ethers.utils.parseEther('100'));

        // memDB
        const db = new MemDB(F);
        const smt = new SMT(db, poseidon, poseidon.F);

        // create TmpDB
        const tmpDB = new TmpDB(db);
        const smtTmp = new SMT(tmpDB, poseidon, poseidon.F);

        // smt nodes
        const keyBalance = await smtUtils.keyEthAddrBalance(address);
        const zeroRoot = smt.empty;

        const auxRes = await smt.set(zeroRoot, keyBalance, balance);
        const genesisRoot = auxRes.newRoot;

        const resBalance = await smt.get(genesisRoot, keyBalance);
        const resBalanceTmp = await smtTmp.get(genesisRoot, keyBalance);

        expect(resBalance).to.be.deep.equal(resBalanceTmp);

        // values
        const key = Scalar.e(5843756759);
        const value = 42;

        await db.setValue(key, value);

        const resValue = await db.getValue(key);
        const resValueTmp = await tmpDB.getValue(key);

        expect(resValue).to.be.equal(resValueTmp);

        // programs
        const keyProgram = [Scalar.e(1), Scalar.e(2), Scalar.e(3), Scalar.e(4)];
        const valueProgram = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07];

        await db.setProgram(keyProgram, valueProgram);

        const resProgram = await db.getProgram(keyProgram);
        const resProgramTmp = await tmpDB.getProgram(keyProgram);

        expect(resProgram).to.be.deep.equal(resProgramTmp);
    });

    it('Update and populate memDB with tmpDb', async () => {
        const address = '0x617b3a3528F9cDd6630fd3301B9c8911F7Bf063D';
        const balance = Scalar.e(ethers.utils.parseEther('100'));

        const db = new MemDB(F);
        const smt = new SMT(db, poseidon, poseidon.F);

        // create TmpDB
        const tmpDB = new TmpDB(db);

        // load smtTMp
        const smtTmp = new SMT(tmpDB, poseidon, poseidon.F);

        // smt nodes
        const keyBalance = await smtUtils.keyEthAddrBalance(address);
        const zeroRoot = smt.empty;

        const auxRes = await smtTmp.set(zeroRoot, keyBalance, balance);
        const genesisRoot = auxRes.newRoot;

        let resBalance;
        try {
            resBalance = await smt.get(genesisRoot, keyBalance);
        } catch (error) {
            resBalance = { value: Scalar.e(0) };
        }
        const resBalanceTmp = await smtTmp.get(genesisRoot, keyBalance);

        expect(resBalance.value).to.be.equal(Scalar.e(0));
        expect(resBalanceTmp.value).to.be.equal(balance);

        // values
        const key = Scalar.e(5843756759);
        const value = 42;

        await tmpDB.setValue(key, value);

        const resValue = await db.getValue(key);
        const resValueTmp = await tmpDB.getValue(key);

        expect(resValue).to.be.equal(null);
        expect(resValueTmp).to.be.equal(value);

        // programs
        const keyProgram = [Scalar.e(1), Scalar.e(2), Scalar.e(3), Scalar.e(4)];
        const valueProgram = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07];

        await tmpDB.setProgram(keyProgram, valueProgram);

        const resProgram = await db.getProgram(keyProgram);
        const resProgramTmp = await tmpDB.getProgram(keyProgram);

        expect(resProgram).to.be.deep.equal(null);
        expect(resProgramTmp).to.be.deep.equal(valueProgram);

        // populate db with the content of the tmpDb
        await tmpDB.populateSrcDb();

        // check smt nodes
        let resBalance2;
        try {
            resBalance2 = await smt.get(genesisRoot, keyBalance);
        } catch (error) {
            resBalance2 = { value: Scalar.e(0) };
        }
        const resBalance2Tmp = await smtTmp.get(genesisRoot, keyBalance);
        const tempDBArray = await smtUtils.getCurrentDB(genesisRoot, tmpDB, F);
        const DBArray = await smtUtils.getCurrentDB(genesisRoot, db, F);

        expect(resBalance2Tmp.value).to.be.equal(balance);
        expect(resBalance2Tmp.value.toString()).to.be.equal(resBalance2.value.toString());
        expect(tempDBArray).to.be.deep.equal(DBArray);

        // check values and programs
        const resValueFinal = await db.getValue(key);
        const resProgramFinal = await db.getProgram(keyProgram);

        expect(resValueFinal).to.be.equal(value);
        expect(resProgramFinal).to.be.deep.equal(valueProgram);
    });
});
