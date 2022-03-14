const { Scalar } = require('ffjavascript');
const { expect } = require('chai');
const ethers = require('ethers');

const {
    MemDB, SMT, smtUtils, TmpSmtDB, getPoseidon,
} = require('../index');

describe('TmpSmtDB', () => {
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

        // create TmpSmtDB
        const tmpDB = new TmpSmtDB(db);
        const smtTmp = new SMT(tmpDB, poseidon, poseidon.F);

        const keyBalance = await smtUtils.keyEthAddrBalance(address);
        const zeroRoot = smt.empty;

        const auxRes = await smt.set(zeroRoot, keyBalance, balance);
        const genesisRoot = auxRes.newRoot;

        const resBalance = await smt.get(genesisRoot, keyBalance);
        const resBalanceTmp = await smtTmp.get(genesisRoot, keyBalance);

        expect(resBalance).to.be.deep.equal(resBalanceTmp);
    });

    it('Update and populate memDB with tmpDb', async () => {
        const address = '0x617b3a3528F9cDd6630fd3301B9c8911F7Bf063D';
        const balance = Scalar.e(ethers.utils.parseEther('100'));

        const db = new MemDB(F);
        const smt = new SMT(db, poseidon, poseidon.F);

        // create TmpDB
        const tmpDB = new TmpSmtDB(db);

        // load smtTMp
        const smtTmp = new SMT(tmpDB, poseidon, poseidon.F);

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

        // populate db with the content of the tmpDb
        await tmpDB.populateSrcDb();

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
    });
});
