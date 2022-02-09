const fs = require('fs');
const path = require('path');
const { Scalar } = require('ffjavascript');
const { expect } = require('chai');

const {
    smtUtils, getPoseidon, Constants, SMT, MemDB,
} = require('../index');

// eslint-disable-next-line prefer-arrow-callback
describe('smtUtils', async function () {
    this.timeout(60000);

    let poseidon;
    let F;
    let testVectorsKeysBalance;
    let testVectorsKeysNonce;
    let testVectorsKeysContractStorage;
    let testVectorsKeysContractCode;
    let testVectorsHashBytecode;

    before(async () => {
        poseidon = await getPoseidon();
        F = poseidon.F;
        testVectorsKeysBalance = JSON.parse(fs.readFileSync(path.join(__dirname, '../test-vectors/merkle-tree/smt-key-eth-balance.json')));
        testVectorsKeysNonce = JSON.parse(fs.readFileSync(path.join(__dirname, '../test-vectors/merkle-tree/smt-key-eth-nonce.json')));
        testVectorsKeysContractCode = JSON.parse(fs.readFileSync(path.join(__dirname, '../test-vectors/merkle-tree/smt-key-contract-code.json')));
        testVectorsKeysContractStorage = JSON.parse(fs.readFileSync(path.join(__dirname, '../test-vectors/merkle-tree/smt-key-contract-storage.json')));
        testVectorsHashBytecode = JSON.parse(fs.readFileSync(path.join(__dirname, '../test-vectors/merkle-tree/smt-hash-bytecode.json')));
    });

    it('scalar2fea & fea2scalar', async () => {
        const value = Scalar.e('115792089237316195423570985008687907853269984665640564039457584007913129639935');

        const fea = smtUtils.scalar2fea(F, value);
        const sca = smtUtils.fea2scalar(F, fea);

        expect(sca.toString()).to.be.equal(value.toString());
    });

    it('fe2n: positive', async () => {
        // positive value
        const number = 1;
        const value = F.e(number);

        const res = smtUtils.fe2n(F, value);
        expect(res).to.be.equal(number);
    });

    it('fe2n: negative', async () => {
        // positive value
        const number = -1;
        const value = F.e(number);

        const res = smtUtils.fe2n(F, value);
        expect(res).to.be.equal(number);
    });

    it('fe2n: error over 32 bit value', async () => {
        /*
         * 1 bit is used as a sign
         * over 32 bits
         */
        let number = 2 ** 31;
        let value = F.e(number);

        try {
            smtUtils.fe2n(F, value);
            expect(true).to.be.equal(false);
        } catch (error) {
            expect(error.message.includes('Accessing a no 32bit value')).to.be.equal(true);
        }

        // edge case
        number = (2 ** 31) - 1;
        value = F.e(number);

        const res = smtUtils.fe2n(F, value);
        expect(res).to.be.equal(number);
    });

    it('keyEthAddrBalance', async () => {
        for (let i = 0; i < testVectorsKeysBalance.length; i++) {
            const dataTest = testVectorsKeysBalance[i];
            const { leafType, arity, ethAddr } = dataTest;

            const res = await smtUtils.keyEthAddrBalance(ethAddr, arity);
            expect(F.toString(res)).to.be.equal(dataTest.expectedKey);
            expect(leafType).to.be.equal(Constants.SMT_KEY_BALANCE);
        }
    });

    it('keyEthAddrNonce', async () => {
        for (let i = 0; i < testVectorsKeysNonce.length; i++) {
            const dataTest = testVectorsKeysNonce[i];
            const { leafType, arity, ethAddr } = dataTest;

            const res = await smtUtils.keyEthAddrNonce(ethAddr, arity);
            expect(F.toString(res)).to.be.equal(dataTest.expectedKey);
            expect(leafType).to.be.equal(Constants.SMT_KEY_NONCE);
        }
    });

    it('keyContractCode', async () => {
        for (let i = 0; i < testVectorsKeysContractCode.length; i++) {
            const dataTest = testVectorsKeysContractCode[i];
            const { leafType, arity, ethAddr } = dataTest;

            const res = await smtUtils.keyContractCode(ethAddr, arity);
            expect(F.toString(res)).to.be.equal(dataTest.expectedKey);
            expect(leafType).to.be.equal(Constants.SMT_KEY_SC_CODE);
        }
    });

    it('keyContractStorage', async () => {
        for (let i = 0; i < testVectorsKeysContractStorage.length; i++) {
            const dataTest = testVectorsKeysContractStorage[i];
            const {
                leafType, arity, ethAddr, storagePosition,
            } = dataTest;

            const res = await smtUtils.keyContractStorage(ethAddr, storagePosition, arity);
            expect(F.toString(res)).to.be.equal(dataTest.expectedKey);
            expect(leafType).to.be.equal(Constants.SMT_KEY_SC_STORAGE);
        }
    });

    it('getCurrentDB', async () => {
        const db = new MemDB(F);
        const smt = new SMT(db, 4, poseidon, poseidon.F);

        const r1 = await smt.set(F.zero, F.e(1), Scalar.e(1));
        const r2 = await smt.set(r1.newRoot, F.e(2), Scalar.e(2));
        const r3 = await smt.set(r2.newRoot, F.e(3), Scalar.e(3));
        const r4 = await smt.set(r3.newRoot, F.e(4), Scalar.e(4));
        const r5 = await smt.set(r4.newRoot, F.e(17), Scalar.e(5));

        const fullDB = await smtUtils.getCurrentDB(r5.newRoot, db, F);

        const expectedNodes = 7;
        expect(expectedNodes).to.be.equal(Object.keys(fullDB).length);
    });

    it('hashContractBytecode', async () => {
        for (let i = 0; i < testVectorsHashBytecode.length; i++) {
            const { bytecode, expectedHash } = testVectorsHashBytecode[i];
            const hashBytecode = await smtUtils.hashContractBytecode(bytecode);

            expect(hashBytecode).to.be.equal(expectedHash);
        }
    });
});
