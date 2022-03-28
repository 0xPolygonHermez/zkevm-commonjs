/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */
/* eslint-disable no-unused-expressions */
/* eslint-disable no-console */
/* eslint-disable multiline-comment-style */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */

const { Scalar } = require('ffjavascript');
const fs = require('fs');
const { argv } = require('yargs');

const ethers = require('ethers');
const { expect } = require('chai');
const {
    Address, toBuffer,
} = require('ethereumjs-util');
const { defaultAbiCoder } = require('@ethersproject/abi');
const path = require('path');
const lodash = require('lodash');

const artifactsPath = path.join(__dirname, 'artifacts/contracts');

const {
    MemDB, ZkEVMDB, getPoseidon, processorUtils, smtUtils,
} = require('../index');
const { pathTestVectors } = require('./helpers/test-utils');
const contractsPolygonHermez = require('@polygon-hermez/contracts-zkevm');

const { Block } = require('@ethereumjs/block');

describe('Processor', async function () {
    this.timeout(100000);

    const pathProcessorTests = path.join(pathTestVectors, 'end-to-end/state-transition.json');

    let update;
    let poseidon;
    let F;

    let testVectors;

    before(async () => {
        poseidon = await getPoseidon();
        F = poseidon.F;
        testVectors = JSON.parse(fs.readFileSync(pathProcessorTests));

        update = argv.update === true;
    });

    it('Check test vectors', async () => {
        for (let i = 0; i < testVectors.length; i++) {
            const {
                id,
                genesis,
                expectedOldRoot,
                txs,
                expectedNewRoot,
                chainIdSequencer,
                sequencerAddress,
                expectedNewLeafs,
                batchL2Data,
                oldLocalExitRoot,
                globalExitRoot,
                batchHashData,
                inputHash,
                timestamp,
            } = testVectors[i];

            const db = new MemDB(F);
            const deployedBridge = true;
            // create a zkEVMDB to compile the sc
            const zkEVMDB = await ZkEVMDB.newZkEVM(
                db,
                poseidon,
                [F.zero, F.zero, F.zero, F.zero],
                smtUtils.stringToH4(oldLocalExitRoot),
                genesis,
                null,
                null,
                deployedBridge
            );


            // Check evm contract params
            for (const contract of genesis) {
                if (contract.contractName) {
                    // Add contract interface for future contract interaction
                    if (contractsPolygonHermez[contract.contractName]) {
                        const contractInterface = new ethers.utils.Interface(contractsPolygonHermez[contract.contractName].abi);
                        contract.contractInterface = contractInterface;
                    } else {
                        const contractInterface = new ethers.utils.Interface(contract.abi);
                        contract.contractInterface = contractInterface;
                    }
                    const contractAddres = new Address(toBuffer(contract.address));

                    const contractAccount = await zkEVMDB.vm.stateManager.getAccount(contractAddres);
                    expect(await contractAccount.isContract()).to.be.true;

                    const contractCode = await zkEVMDB.vm.stateManager.getContractCode(contractAddres);
                    expect(contractCode.toString('hex')).to.be.equal(contract.bytecode.slice(2));

                    const dumpDB = await zkEVMDB.dumpStorage(contract.address);

                    for (const [key, value] of Object.entries(contract.storage)) {
                        const contractStorage = await zkEVMDB.vm.stateManager.getContractStorage(contractAddres, toBuffer(key));
                        expect(contractStorage.toString('hex')).to.equal(value.slice(2));
                        expect(dumpDB[key]).to.be.equal(value);
                    }
                }
            }

            if (!update) {
                expect(smtUtils.h4toString(zkEVMDB.stateRoot)).to.be.equal(expectedOldRoot);
            } else {
                testVectors[i].expectedOldRoot = smtUtils.h4toString(zkEVMDB.stateRoot);
            }

            /*
             * build, sign transaction and generate rawTxs
             * rawTxs would be the calldata inserted in the contract
             */
            const txProcessed = [];
            const rawTxs = [];
            for (let j = 0; j < txs.length; j++) {
                const txData = txs[j];

                const tx = {
                    to: txData.to,
                    nonce: txData.nonce,
                    value: processorUtils.toHexStringRlp(ethers.utils.parseUnits(txData.value, 'wei')),
                    gasLimit: txData.gasLimit,
                    gasPrice: processorUtils.toHexStringRlp(ethers.utils.parseUnits(txData.gasPrice, 'wei')),
                    chainId: txData.chainId,
                    data: txData.data || '0x',
                };

                // The tx will have paramsDeploy in case is a deployment with constructor
                // let params = '';
                // if (txData.paramsDeploy) {
                //     params = defaultAbiCoder.encode(txData.paramsDeploy.types, txData.paramsDeploy.values);
                //     tx.data += params.slice(2);
                // }

                if (txData.data) {
                    if (txData.to) {
                        if (txData.contractName) {
                            const contract = genesis.find((x) => x.contractName === txData.contractName);
                            const functionData = contract.contractInterface.encodeFunctionData(txData.function, txData.params);
                            //console.log(contract.contractInterface.getFunction("0x122650ff"));
                            if (!update) {
                                expect(functionData).to.equal(txData.data);
                            } else {
                                txData.data = functionData;
                                tx.data = functionData;
                            }
                        }
                    } else {
                        // Contract deployment from tx
                        delete tx.to;

                        const { bytecode } = require(`${artifactsPath}/${txData.contractName}.sol/${txData.contractName}.json`);
                        const params = defaultAbiCoder.encode(txData.paramsDeploy.types, txData.paramsDeploy.values);
                        expect(tx.data).to.equal(bytecode + params.slice(2));
                    }
                }

                if ((tx.to && tx.to !== '0x0' && !ethers.utils.isAddress(tx.to)) || !ethers.utils.isAddress(txData.from)) {
                    expect(txData.customRawTx).to.equal(undefined);
                    // eslint-disable-next-line no-continue
                    continue;
                }

                let customRawTx;
                const address = genesis.find((o) => o.address === txData.from);
                const wallet = new ethers.Wallet(address.pvtKey);
                if (tx.chainId === 0) {
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
                    const digest = ethers.utils.keccak256(signData);
                    const signingKey = new ethers.utils.SigningKey(address.pvtKey);
                    const signature = signingKey.signDigest(digest);
                    const r = signature.r.slice(2).padStart(64, '0'); // 32 bytes
                    const s = signature.s.slice(2).padStart(64, '0'); // 32 bytes
                    const v = (signature.v).toString(16).padStart(2, '0'); // 1 bytes
                    customRawTx = signData.concat(r).concat(s).concat(v);
                } else {
                    const rawTxEthers = await wallet.signTransaction(tx);
                    if (!update) {
                        expect(rawTxEthers).to.equal(txData.rawTx);
                    } else {
                        txData.rawTx = rawTxEthers;
                    }
                    customRawTx = processorUtils.rawTxToCustomRawTx(rawTxEthers);
                }

                if (!update) {
                    expect(customRawTx).to.equal(txData.customRawTx);
                } else {
                    txData.customRawTx = customRawTx;
                }

                if (txData.encodeInvalidData) {
                    customRawTx = customRawTx.slice(0, -6);
                }
                rawTxs.push(customRawTx);
                txProcessed.push(txData);
            }

            const batch = await zkEVMDB.buildBatch(timestamp, sequencerAddress, chainIdSequencer, smtUtils.stringToH4(globalExitRoot));
            for (let j = 0; j < rawTxs.length; j++) {
                batch.addRawTx(rawTxs[j]);
            }

            // execute the transactions added to the batch
            await batch.executeTxs();
            // consolidate state
            await zkEVMDB.consolidate(batch);

            const newRoot = batch.currentStateRoot;
            if (!update) {
                expect(smtUtils.h4toString(newRoot)).to.be.equal(expectedNewRoot);
            } else {
                testVectors[i].expectedNewRoot = smtUtils.h4toString(newRoot);
            }

            // Check errors on decode transactions
            const decodedTx = await batch.getDecodedTxs();

            for (let j = 0; j < decodedTx.length; j++) {
                const currentTx = decodedTx[j];
                const expectedTx = txProcessed[j];
                try {
                    expect(currentTx.reason).to.be.equal(expectedTx.reason);
                } catch (error) {
                    //console.log({ currentTx }, { expectedTx }); // eslint-disable-line no-console
                    throw new Error(`Batch Id : ${id} TxId:${expectedTx.id} ${error}`);
                }
            }

            // Check balances and nonces
            for (const [address, leaf] of Object.entries(expectedNewLeafs)) {
                // EVM
                const newLeaf = await zkEVMDB.getCurrentAccountState(address);
                expect(newLeaf.balance.toString()).to.equal(leaf.balance);
                expect(newLeaf.nonce.toString()).to.equal(leaf.nonce);

                // SMT
                const smtNewLeaf = await zkEVMDB.getCurrentAccountState(address);
                expect(smtNewLeaf.balance.toString()).to.equal(leaf.balance);
                expect(smtNewLeaf.nonce.toString()).to.equal(leaf.nonce);

                // Storage
                const storage = await zkEVMDB.dumpStorage(address);

                if (storage !== null) {
                    if (update) {
                        testVectors[i].expectedNewLeafs[address].storage = storage;
                    } else {
                        expect(lodash.isEqual(storage, leaf.storage)).to.be.equal(true);
                    }
                }
            }

            // Check the circuit input
            const circuitInput = await batch.getStarkInput();

            // Check the encode transaction match with the vector test
            if (!update) {
                expect(batchL2Data).to.be.equal(batch.getBatchL2Data());
                // Check the batchHashData and the input hash
                expect(batchHashData).to.be.equal(circuitInput.batchHashData);
                expect(inputHash).to.be.equal(circuitInput.inputHash);
            } else {
                testVectors[i].batchL2Data = batch.getBatchL2Data();
                testVectors[i].batchHashData = circuitInput.batchHashData;
                testVectors[i].inputHash = circuitInput.inputHash;
                delete testVectors[i].contractInterface;
            }

            console.log(`Completed test ${i + 1}/${testVectors.length}`);
        }
        if (update) {
            await fs.writeFileSync(pathProcessorTests, JSON.stringify(testVectors, null, 2));
        }
    });
});
