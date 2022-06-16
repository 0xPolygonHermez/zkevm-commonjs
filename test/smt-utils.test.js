const fs = require('fs');
const path = require('path');
const { Scalar } = require('ffjavascript');
const { expect } = require('chai');
const lodash = require('lodash');
const { argv } = require('yargs');

const {
    smtUtils, getPoseidon, Constants, SMT, MemDB,
} = require('../index');
const { pathTestVectors, scalar2key } = require('./helpers/test-utils');
const { h4toScalar } = require('../src/smt-utils');

// eslint-disable-next-line prefer-arrow-callback
describe('smtUtils', async function () {
    this.timeout(60000);

    const pathKeysBalance = path.join(pathTestVectors, 'merkle-tree/smt-key-eth-balance.json');
    const pathKeysNonce = path.join(pathTestVectors, 'merkle-tree/smt-key-eth-nonce.json');
    const pathKeysContractCode = path.join(pathTestVectors, 'merkle-tree/smt-key-contract-code.json');
    const pathKeysContractStorage = path.join(pathTestVectors, 'merkle-tree/smt-key-contract-storage.json');
    const pathKeysContractLength = path.join(pathTestVectors, 'merkle-tree/smt-key-contract-length.json');
    const pathHashBytecode = path.join(pathTestVectors, 'merkle-tree/smt-hash-bytecode.json');

    let update;
    let poseidon;
    let F;
    let testVectorsKeysBalance;
    let testVectorsKeysNonce;
    let testVectorsKeysContractStorage;
    let testVectorsKeysContractCode;
    let testVectorsKeysContractLength;
    let testVectorsHashBytecode;

    before(async () => {
        poseidon = await getPoseidon();
        F = poseidon.F;
        testVectorsKeysBalance = JSON.parse(fs.readFileSync(pathKeysBalance));
        testVectorsKeysNonce = JSON.parse(fs.readFileSync(pathKeysNonce));
        testVectorsKeysContractCode = JSON.parse(fs.readFileSync(pathKeysContractCode));
        testVectorsKeysContractStorage = JSON.parse(fs.readFileSync(pathKeysContractStorage));
        testVectorsKeysContractLength = JSON.parse(fs.readFileSync(pathKeysContractLength));
        testVectorsHashBytecode = JSON.parse(fs.readFileSync(pathHashBytecode));

        update = argv.update === true;
    });

    it('scalar2fea & fea2scalar', async () => {
        const value = (Scalar.e('115792089237316195423570985008687907853269984665640564039457584007913129639935')).toString(16);

        const fea = smtUtils.string2fea(F, value);
        const str = smtUtils.fea2String(F, fea);

        expect(str).to.be.equal(`0x${value}`);
    });

    it('fea2String & string2fea', async () => {
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

    it('h4toScalar, scalar2h4, h4toString & stringToH4', async () => {
        const input = [Scalar.e(0), Scalar.e('18446744069414584321'), Scalar.e('4294967296'), Scalar.e('328469')];

        const resScalar = smtUtils.h4toScalar(input);
        const resString = smtUtils.h4toString(input);
        expect(resString).to.be.equal(`0x${Scalar.toString(resScalar, 16).padStart(64, '0')}`);

        const resTest = smtUtils.stringToH4(resString);
        expect(lodash.isEqual(resTest, input)).to.be.equal(true);

        const init = smtUtils.scalar2h4(resScalar);
        expect(lodash.isEqual(init, input)).to.be.equal(true);
    });

    it('keyEthAddrBalance', async () => {
        for (let i = 0; i < testVectorsKeysBalance.length; i++) {
            const {
                leafType, ethAddr, expectedKey,
            } = testVectorsKeysBalance[i];

            const res = await smtUtils.keyEthAddrBalance(ethAddr);

            if (update) {
                testVectorsKeysBalance[i].expectedKey = h4toScalar(res).toString();
            } else {
                expect(h4toScalar(res).toString()).to.be.equal(expectedKey);
                expect(leafType).to.be.equal(Constants.SMT_KEY_BALANCE);
            }
        }

        if (update) {
            fs.writeFileSync(pathKeysBalance, JSON.stringify(testVectorsKeysBalance, null, 2));
        }
    });

    it('keyEthAddrNonce', async () => {
        for (let i = 0; i < testVectorsKeysNonce.length; i++) {
            const {
                leafType, ethAddr, expectedKey,
            } = testVectorsKeysNonce[i];

            const res = await smtUtils.keyEthAddrNonce(ethAddr);

            if (update) {
                testVectorsKeysNonce[i].expectedKey = h4toScalar(res).toString();
            } else {
                expect(h4toScalar(res).toString()).to.be.equal(expectedKey);
                expect(leafType).to.be.equal(Constants.SMT_KEY_NONCE);
            }
        }

        if (update) {
            fs.writeFileSync(pathKeysNonce, JSON.stringify(testVectorsKeysNonce, null, 2));
        }
    });

    it('keyContractCode', async () => {
        for (let i = 0; i < testVectorsKeysContractCode.length; i++) {
            const {
                leafType, ethAddr, expectedKey,
            } = testVectorsKeysContractCode[i];

            const res = await smtUtils.keyContractCode(ethAddr);

            if (update) {
                testVectorsKeysContractCode[i].expectedKey = h4toScalar(res).toString();
            } else {
                expect(h4toScalar(res).toString()).to.be.equal(expectedKey);
                expect(leafType).to.be.equal(Constants.SMT_KEY_SC_CODE);
            }
        }

        if (update) {
            fs.writeFileSync(pathKeysContractCode, JSON.stringify(testVectorsKeysContractCode, null, 2));
        }
    });

    it('keyContractStorage', async () => {
        for (let i = 0; i < testVectorsKeysContractStorage.length; i++) {
            const {
                leafType, ethAddr, storagePosition, expectedKey,
            } = testVectorsKeysContractStorage[i];

            const res = await smtUtils.keyContractStorage(ethAddr, storagePosition);

            if (update) {
                testVectorsKeysContractStorage[i].expectedKey = h4toScalar(res).toString();
            } else {
                expect(h4toScalar(res).toString()).to.be.equal(expectedKey);
                expect(leafType).to.be.equal(Constants.SMT_KEY_SC_STORAGE);
            }
        }

        if (update) {
            fs.writeFileSync(pathKeysContractStorage, JSON.stringify(testVectorsKeysContractStorage, null, 2));
        }
    });

    it('keyContractLength', async () => {
        for (let i = 0; i < testVectorsKeysContractLength.length; i++) {
            const {
                leafType, ethAddr, expectedKey,
            } = testVectorsKeysContractLength[i];

            const res = await smtUtils.keyContractLength(ethAddr);

            if (update) {
                testVectorsKeysContractLength[i].expectedKey = h4toScalar(res).toString();
            } else {
                expect(h4toScalar(res).toString()).to.be.equal(expectedKey);
                expect(leafType).to.be.equal(Constants.SMT_KEY_SC_LENGTH);
            }
        }

        if (update) {
            fs.writeFileSync(pathKeysContractLength, JSON.stringify(testVectorsKeysContractLength, null, 2));
        }
    });

    it('getCurrentDB', async () => {
        const db = new MemDB(F);
        const smt = new SMT(db, poseidon, poseidon.F);

        const r1 = await smt.set(smt.empty, scalar2key(1, F), Scalar.e(1));
        const r2 = await smt.set(r1.newRoot, scalar2key(2, F), Scalar.e(2));
        const r3 = await smt.set(r2.newRoot, scalar2key(3, F), Scalar.e(3));
        const r4 = await smt.set(r3.newRoot, scalar2key(4, F), Scalar.e(4));
        const r5 = await smt.set(r4.newRoot, scalar2key(17, F), Scalar.e(5));

        const fullDB = await smtUtils.getCurrentDB(r5.newRoot, db, F);

        const expectedNodes = 16;
        expect(expectedNodes).to.be.equal(Object.keys(fullDB).length);
    });

    it('hashContractBytecode', async () => {
        for (let i = 0; i < testVectorsHashBytecode.length; i++) {
            const { bytecode, expectedHash } = testVectorsHashBytecode[i];
            const hashBytecode = await smtUtils.hashContractBytecode(bytecode);
            if (update) {
                testVectorsHashBytecode[i].expectedHash = hashBytecode;
            } else {
                expect(hashBytecode).to.be.equal(expectedHash);
            }
        }

        if (update) {
            fs.writeFileSync(pathHashBytecode, JSON.stringify(testVectorsHashBytecode, null, 2));
        }
    });
});
