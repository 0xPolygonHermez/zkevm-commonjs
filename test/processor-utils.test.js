/* eslint-disable global-require */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-continue */

const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
const { expect } = require('chai');
const { Scalar } = require('ffjavascript');
const { processorUtils } = require('../index');
const { Constants } = require('../index');
const { pathTestVectors } = require('./helpers/test-utils');

describe('Processor utils', () => {
    let testVectors;
    let testVectorsEffGasPrice;

    before(async () => {
        testVectors = JSON.parse(fs.readFileSync(path.join(pathTestVectors, 'zkevm-db/state-transition.json')));
        testVectorsEffGasPrice = JSON.parse(fs.readFileSync(path.join(pathTestVectors, 'effective-gas-price/effective-gas-price.json')));
    });

    it('Check encode and decode transactions', async () => {
        for (let i = 0; i < testVectors.length; i++) {
            const {
                genesis,
                txs,
            } = testVectors[i];

            const walletMap = {};

            // load wallets
            for (let j = 0; j < genesis.length; j++) {
                const {
                    address, pvtKey,
                } = genesis[j];
                const newWallet = new ethers.Wallet(pvtKey);
                expect(address).to.be.equal(newWallet.address);
                walletMap[address] = newWallet;
            }

            /*
             * build, sign transaction and generate rawTxs
             * rawTxs would be the calldata inserted in the contract
             */
            for (let j = 0; j < txs.length; j++) {
                const txData = txs[j];

                if (txData.type === Constants.TX_CHANGE_L2_BLOCK) {
                    continue;
                }

                const tx = {
                    to: txData.to,
                    nonce: txData.nonce,
                    value: ethers.utils.parseUnits(txData.value, 'wei'),
                    gasLimit: txData.gasLimit,
                    gasPrice: ethers.utils.parseUnits(txData.gasPrice, 'wei'),
                    chainId: txData.chainId,
                    data: txData.data || '0x',
                };

                if (!ethers.utils.isAddress(tx.to) || !ethers.utils.isAddress(txData.from)) {
                    expect(txData.customRawTx).to.equal(undefined);
                    continue;
                }

                try {
                    let customRawTx;

                    if (tx.chainId === 0) {
                        const signData = ethers.utils.RLP.encode([
                            processorUtils.toHexStringRlp(Scalar.e(tx.nonce)),
                            processorUtils.toHexStringRlp(tx.gasPrice),
                            processorUtils.toHexStringRlp(tx.gasLimit),
                            processorUtils.addressToHexStringRlp(tx.to),
                            processorUtils.toHexStringRlp(tx.value),
                            processorUtils.toHexStringRlp(tx.data),
                            processorUtils.toHexStringRlp(tx.chainId),
                            '0x',
                            '0x',
                        ]);
                        const digest = ethers.utils.keccak256(signData);
                        const signingKey = new ethers.utils.SigningKey(walletMap[txData.from].privateKey);
                        const signature = signingKey.signDigest(digest);
                        const r = signature.r.slice(2).padStart(64, '0'); // 32 bytes
                        const s = signature.s.slice(2).padStart(64, '0'); // 32 bytes
                        const v = (signature.v).toString(16).padStart(2, '0'); // 1 bytes
                        if (typeof tx.effectivePercentage === 'undefined') {
                            tx.effectivePercentage = 'ff';
                        }
                        customRawTx = signData.concat(r).concat(s).concat(v).concat(tx.effectivePercentage);
                    } else {
                        const rawTxEthers = await walletMap[txData.from].signTransaction(tx);
                        customRawTx = processorUtils.rawTxToCustomRawTx(rawTxEthers);

                        const reconstructedEthers = processorUtils.customRawTxToRawTx(customRawTx);
                        expect(rawTxEthers).to.equal(reconstructedEthers);
                    }
                    expect(customRawTx).to.equal(txData.customRawTx);

                    // Test decode raw tx prover method
                    const { txDecoded, rlpSignData } = processorUtils.decodeCustomRawTxProverMethod(customRawTx);
                    const signData = ethers.utils.RLP.encode([
                        processorUtils.toHexStringRlp(Scalar.e(tx.nonce)),
                        processorUtils.toHexStringRlp(tx.gasPrice),
                        processorUtils.toHexStringRlp(tx.gasLimit),
                        processorUtils.toHexStringRlp(tx.to),
                        processorUtils.toHexStringRlp(tx.value),
                        processorUtils.toHexStringRlp(tx.data),
                        processorUtils.toHexStringRlp(tx.chainId),
                        '0x',
                        '0x',
                    ]);
                    expect(rlpSignData).to.equal(signData);

                    const txParams = Object.keys(txDecoded);
                    txParams.forEach((key) => {
                        if (txDecoded[key] === '0x' && key !== 'data') {
                            txDecoded[key] = '0x00';
                        }
                    });
                    expect(Number(txDecoded.nonce)).to.equal(tx.nonce);
                    expect(txDecoded.gasPrice).to.equal(ethers.utils.hexlify(tx.gasPrice));
                    expect(txDecoded.gasLimit).to.equal(ethers.utils.hexlify(tx.gasLimit));
                    expect(ethers.utils.hexlify(txDecoded.to)).to.equal(ethers.utils.hexlify(tx.to));
                    expect(txDecoded.value).to.equal(ethers.utils.hexlify(tx.value));
                    expect(Number(txDecoded.chainID)).to.equal(tx.chainId);
                } catch (error) {
                    expect(txData.customRawTx).to.equal(undefined);
                }
            }
        }
    });

    it('toHexStringRlp', async () => {
        const testHexStringRLP = [
            [0, '0x'],
            ['0x', '0x'],
            ['0x00', '0x00'],
            ['0x0000', '0x0000'],
            ['0x1234', '0x1234'],
            [Scalar.e('0x1234'), '0x1234'],
            [1234n, '0x04d2'],
        ];

        for (let i = 0; i < testHexStringRLP.length; i++) {
            const input = testHexStringRLP[i][0];
            const expectedOut = testHexStringRLP[i][1];

            const out = processorUtils.toHexStringRlp(input);

            expect(out).to.be.equal(expectedOut);
        }
    });

    it('addressToHexStringRlp', async () => {
        const testHexStringRLP = [
            [undefined, '0x'],
            ['0x', '0x'],
            ['0x00', '0x0000000000000000000000000000000000000000'],
            ['0x0000', '0x0000000000000000000000000000000000000000'],
            [0, '0x0000000000000000000000000000000000000000'],
            ['0x01', '0x0000000000000000000000000000000000000001'],
            [1, '0x0000000000000000000000000000000000000001'],
            ['0x1234', '0x0000000000000000000000000000000000001234'],
            [Scalar.e('0x1234'), '0x0000000000000000000000000000000000001234'],
            [1234n, '0x00000000000000000000000000000000000004d2'],
        ];

        for (let i = 0; i < testHexStringRLP.length; i++) {
            const input = testHexStringRLP[i][0];
            const expectedOut = testHexStringRLP[i][1];

            const out = processorUtils.addressToHexStringRlp(input);
            expect(out).to.be.equal(expectedOut);
        }
    });

    it('computeEffectiveGasPrice', async () => {
        for (let i = 0; i < testVectorsEffGasPrice.length; i++) {
            const { gasPrice, effectivePercentage, expectedOutput } = testVectorsEffGasPrice[i];

            const computedOutput = `0x${processorUtils.computeEffectiveGasPrice(gasPrice, effectivePercentage).toString(16)}`;
            expect(computedOutput).to.be.equal(expectedOutput);
        }
    });

    it('encodedStringToArray', async () => {
        for (let i = 0; i < testVectors.length; i++) {
            const {
                batchL2Data,
                txs,
            } = testVectors[i];

            const arrayTxs = processorUtils.encodedStringToArray(batchL2Data);

            expect(arrayTxs.length).to.be.equal(txs.length);

            for (let j = 0; j < arrayTxs.length; j++) {
                expect(arrayTxs[j]).to.be.equal(txs[j].customRawTx);
            }
        }
    });
});
