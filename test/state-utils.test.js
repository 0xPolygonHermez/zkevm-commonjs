/* eslint-disable quote-props */
const { Scalar } = require('ffjavascript');
const { expect } = require('chai');
const lodash = require('lodash');

const {
    smtUtils, SMT, MemDB, getPoseidon, stateUtils,
} = require('../index');

// eslint-disable-next-line prefer-arrow-callback
describe('smtUtils', async function () {
    this.timeout(60000);

    let poseidon;
    let F;

    before(async () => {
        poseidon = await getPoseidon();
        F = poseidon.F;
    });

    it('set-get account', async () => {
        const db = new MemDB(F);
        const smt = new SMT(db, poseidon, poseidon.F);

        const ethAddr = '0x12345';
        const account = {
            balance: Scalar.e('1000000000'),
            nonce: Scalar.e('735'),
        };

        const root = await stateUtils.setAccountState(ethAddr, smt, smt.empty, account.balance, account.nonce);
        const resAccount = await stateUtils.getState(ethAddr, smt, root);

        expect(account.balance.toString()).to.be.equal(resAccount.balance.toString());
        expect(account.nonce.toString()).to.be.equal(resAccount.nonce.toString());
    });

    it('set-get hash bytecode and length', async () => {
        const db = new MemDB(F);
        const smt = new SMT(db, poseidon, poseidon.F);

        const ethAddr = '0x123456';
        const bytecode = '0x6789AB';

        const hashBytecode = await smtUtils.hashContractBytecode(bytecode);
        const root = await stateUtils.setContractBytecode(ethAddr, smt, smt.empty, bytecode);

        const resHashBytecode = await stateUtils.getContractHashBytecode(ethAddr, smt, root);
        const resBytecodeLength = await stateUtils.getContractBytecodeLength(ethAddr, smt, root);

        expect(resBytecodeLength.toString()).to.be.equal(((bytecode.length - 2) / 2).toString());
        expect(hashBytecode).to.be.equal(resHashBytecode);
    });

    it('set-get contract storage', async () => {
        const db = new MemDB(F);
        const smt = new SMT(db, poseidon, poseidon.F);

        const ethAddr = '0x12345';
        const storage = {
            '873274': Scalar.e(23),
            '7264': Scalar.e(57),
            '2873': Scalar.e(77),
        };

        const root = await stateUtils.setContractStorage(ethAddr, smt, smt.empty, storage);
        const resStorage = await stateUtils.getContractStorage(ethAddr, smt, root, Object.keys(storage));

        expect(lodash.isEqual(resStorage, storage)).to.be.equal(true);
    });
});
