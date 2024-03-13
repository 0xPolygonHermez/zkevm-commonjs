/* eslint-disable no-continue */
/* eslint-disable prefer-const */
/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */
/* eslint-disable no-unused-expressions */
/* eslint-disable no-console */
/* eslint-disable multiline-comment-style */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */
/* eslint-disable guard-for-in */

const fs = require('fs');
const path = require('path');
const { Scalar } = require('ffjavascript');
const { argv } = require('yargs');

const ethers = require('ethers');
const { expect } = require('chai');
const {
    Address, toBuffer,
} = require('ethereumjs-util');
const { defaultAbiCoder } = require('@ethersproject/abi');
const lodash = require('lodash');

const artifactsPath = path.join(__dirname, 'artifacts/contracts');

const contractsPolygonHermez = require('@0xpolygonhermez/zkevm-contracts');
const {
    MemDB, ZkEVMDB, getPoseidon, processorUtils, smtUtils, Constants, stateUtils,
} = require('../index');
const { pathTestVectors } = require('./helpers/test-utils');
const { serializeChangeL2Block } = require('../index').processorUtils;
const { getL1InfoTreeValue } = require('../src/l1-info-tree-utils');

const pathInputs = path.join(__dirname, '../tools/inputs-examples');

describe('Processor', async function () {
    this.timeout(100000);

    let pathProcessorTests;

    if (argv.e2e) {
        pathProcessorTests = path.join(pathTestVectors, 'end-to-end/state-transition-e2e.json');
    } else if (argv.blockinfo) {
        pathProcessorTests = path.join(pathTestVectors, 'block-info/block-info.json');
    } else if (argv.selfdestruct) {
        pathProcessorTests = path.join(pathTestVectors, 'selfdestruct/selfdestruct.json');
    } else if (argv.feijoa) {
        pathProcessorTests = path.join(pathTestVectors, 'processor/state-transition-feijoa.json');
    } else {
        pathProcessorTests = path.join(pathTestVectors, 'processor/state-transition.json');
    }

    let update;
    let geninput;
    let poseidon;
    let F;

    let testVectors;

    before(async () => {
        poseidon = await getPoseidon();
        F = poseidon.F;
        testVectors = JSON.parse(fs.readFileSync(pathProcessorTests));

        update = (argv.update === true);
        geninput = (argv.geninput === true);
    });

    it('Check test vectors', async () => {
        for (let i = 0; i < testVectors.length; i++) {
            let {
                id,
                genesis,
                oldStateRoot,
                txs,
                newStateRoot,
                newBatchAccInputHash,
                sequencerAddress,
                expectedNewLeafs,
                batchL2Data,
                oldBatchAccInputHash,
                newLocalExitRoot,
                batchHashData,
                chainID,
                forkID,
                type,
                forcedHashData,
                forcedData,
                previousL1InfoTreeRoot,
                previousL1InfoTreeIndex,
                newL1InfoTreeRoot,
                newL1InfoTreeIndex,
            } = testVectors[i];

            const db = new MemDB(F);
            // create a zkEVMDB to compile the sc
            const zkEVMDB = await ZkEVMDB.newZkEVM(
                db,
                poseidon,
                [F.zero, F.zero, F.zero, F.zero],
                smtUtils.stringToH4(oldBatchAccInputHash),
                genesis,
                null,
                null,
                chainID,
                forkID,
            );

            // Check evm contract params
            const addressToContractInterface = {};
            for (const contract of genesis) {
                if (contract.contractName) {
                    // TransparentUpgradeableProxy
                    if (contract.contractName.includes('proxy')) {
                        const finalContractName = contract.contractName.replace(' proxy', '');
                        const contractInterface = new ethers.utils.Interface(contractsPolygonHermez[finalContractName].abi);
                        addressToContractInterface[contract.address] = contractInterface;
                    } else if (contractsPolygonHermez[contract.contractName]) {
                        // Add contract interface for future contract interaction
                        const contractInterface = new ethers.utils.Interface(contractsPolygonHermez[contract.contractName].abi);
                        addressToContractInterface[contract.address] = contractInterface;
                    } else if (contract.contractName.includes('implementation')) {
                        continue;
                    } else {
                        let contractInterface;
                        if (typeof contract.abi === 'undefined') {
                            const { abi } = require(`${artifactsPath}/${contract.contractName}.sol/${contract.contractName}.json`);
                            contractInterface = new ethers.utils.Interface(abi);
                        } else {
                            contractInterface = new ethers.utils.Interface(contract.abi);
                        }
                        addressToContractInterface[contract.address] = contractInterface;
                    }
                    const contractAddres = new Address(toBuffer(contract.address));

                    const contractAccount = await zkEVMDB.vm.stateManager.getAccount(contractAddres);
                    expect(await contractAccount.isContract()).to.be.true;

                    const contractCode = await zkEVMDB.vm.stateManager.getContractCode(contractAddres);
                    expect(contractCode.toString('hex')).to.be.equal(contract.bytecode.slice(2));

                    const dumpDB = await zkEVMDB.dumpStorage(contract.address);

                    for (const [key, value] of Object.entries(contract.storage)) {
                        const contractStorage = await zkEVMDB.vm.stateManager.getContractStorage(contractAddres, toBuffer(key));
                        expect(Scalar.eq(Scalar.fromString(contractStorage.toString('hex'), 16), Scalar.fromString(value, 16))).to.be.equal(true);
                        expect(Scalar.eq(Scalar.fromString(dumpDB[key], 16), Scalar.fromString(value, 16))).to.be.equal(true);
                    }
                }
            }
            const computedForcedHashData = type === 2 ? getL1InfoTreeValue(
                forcedData.GER,
                forcedData.blockHashL1,
                forcedData.minTimestamp,
            ) : Constants.ZERO_BYTES32;
            if (!update) {
                expect(smtUtils.h4toString(zkEVMDB.stateRoot)).to.be.equal(oldStateRoot);
                expect(forcedHashData).to.be.equal(computedForcedHashData);
            } else {
                testVectors[i].oldStateRoot = smtUtils.h4toString(zkEVMDB.stateRoot);
                testVectors[i].forcedHashData = computedForcedHashData;
            }

            const extraData = { forcedData, l1Info: {} };
            const batch = await zkEVMDB.buildBatch(
                sequencerAddress,
                type,
                forcedHashData,
                previousL1InfoTreeRoot,
                previousL1InfoTreeIndex,
                Constants.DEFAULT_MAX_TX,
                {},
                extraData,
            );

            /*
             * build, sign transaction and generate rawTxs
             * rawTxs would be the calldata inserted in the contract
             */
            const txProcessed = [];
            const rawTxs = [];

            for (let j = 0; j < txs.length; j++) {
                const txData = txs[j];

                if (txData.type === Constants.TX_CHANGE_L2_BLOCK) {
                    const rawChangeL2BlockTx = serializeChangeL2Block(txData);

                    // Append l1Info to l1Info object
                    extraData.l1Info[txData.indexL1InfoTree] = txData.l1InfoTree;

                    const customRawTx = `0x${rawChangeL2BlockTx}`;
                    rawTxs.push(customRawTx);
                    txProcessed.push(txData);

                    if (!update) {
                        expect(customRawTx).to.equal(txData.customRawTx);
                    } else {
                        txData.customRawTx = customRawTx;
                    }

                    continue;
                }

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
                            const functionData = addressToContractInterface[txData.to].encodeFunctionData(txData.function, txData.params);
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
                        processorUtils.addressToHexStringRlp(tx.to),
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
                    if (typeof tx.effectivePercentage === 'undefined') {
                        tx.effectivePercentage = 'ff';
                    }
                    customRawTx = signData.concat(r).concat(s).concat(v).concat(tx.effectivePercentage);
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

            for (let j = 0; j < rawTxs.length; j++) {
                batch.addRawTx(rawTxs[j]);
            }

            // execute the transactions added to the batch
            await batch.executeTxs();
            // consolidate state
            await zkEVMDB.consolidate(batch);

            const newRoot = batch.currentStateRoot;
            if (!update) {
                expect(smtUtils.h4toString(newRoot)).to.be.equal(newStateRoot);
                expect(smtUtils.h4toString(batch.newBatchAccInputHash)).to.be.equal(newBatchAccInputHash);
            } else {
                testVectors[i].newStateRoot = smtUtils.h4toString(newRoot);
                testVectors[i].newBatchAccInputHash = smtUtils.h4toString(batch.newBatchAccInputHash);
            }

            // Check errors on decode transactions
            const decodedTx = await batch.getDecodedTxs();

            for (let j = 0; j < decodedTx.length; j++) {
                const currentTx = decodedTx[j];
                const expectedTx = txProcessed[j];
                try {
                    expect(currentTx.reason).to.be.equal(expectedTx.reason);
                } catch (error) {
                    console.log({ currentTx }, { expectedTx }); // eslint-disable-line no-console
                    throw new Error(`BatchId: ${id}, TxId: ${expectedTx.id} ${error}`);
                }
            }

            // Check balances and nonces
            const updatedAccounts = batch.getUpdatedAccountsBatch();

            const newLeafs = {};
            for (const item in updatedAccounts) {
                const address = item;
                const account = updatedAccounts[address];
                newLeafs[address] = {};

                const newLeaf = await zkEVMDB.getCurrentAccountState(address);
                expect(newLeaf.balance.toString()).to.equal(account.balance.toString());
                expect(newLeaf.nonce.toString()).to.equal(account.nonce.toString());

                const smtNewLeaf = await zkEVMDB.getCurrentAccountState(address);
                expect(smtNewLeaf.balance.toString()).to.equal(account.balance.toString());
                expect(smtNewLeaf.nonce.toString()).to.equal(account.nonce.toString());

                newLeafs[address].balance = account.balance.toString();
                newLeafs[address].nonce = account.nonce.toString();

                const storage = await zkEVMDB.dumpStorage(address);
                const hashBytecode = await zkEVMDB.getHashBytecode(address);
                const bytecodeLength = await zkEVMDB.getLength(address);
                newLeafs[address].storage = storage;
                newLeafs[address].hashBytecode = hashBytecode;
                newLeafs[address].bytecodeLength = bytecodeLength;
            }

            for (const leaf of genesis) {
                if (!newLeafs[leaf.address.toLowerCase()]) {
                    newLeafs[leaf.address] = { ...leaf };
                    delete newLeafs[leaf.address].address;
                    delete newLeafs[leaf.address].bytecode;
                    delete newLeafs[leaf.address].contractName;
                }
            }

            if (!update) {
                for (const [address, leaf] of Object.entries(expectedNewLeafs)) {
                    expect(lodash.isEqual(leaf, newLeafs[address])).to.be.equal(true);
                }
            } else {
                testVectors[i].expectedNewLeafs = newLeafs;
            }

            // Check global and local exit roots
            const addressInstanceGlobalExitRoot = new Address(toBuffer(Constants.ADDRESS_GLOBAL_EXIT_ROOT_MANAGER_L2));
            const localExitRootPosBuffer = toBuffer(ethers.utils.hexZeroPad(Constants.LOCAL_EXIT_ROOT_STORAGE_POS, 32));

            // Check local exit root
            const localExitRootVm = await zkEVMDB.vm.stateManager.getContractStorage(addressInstanceGlobalExitRoot, localExitRootPosBuffer);
            const localExitRootSmt = (await stateUtils.getContractStorage(
                Constants.ADDRESS_GLOBAL_EXIT_ROOT_MANAGER_L2,
                zkEVMDB.smt,
                zkEVMDB.stateRoot,
                [Constants.LOCAL_EXIT_ROOT_STORAGE_POS],
            ))[Constants.LOCAL_EXIT_ROOT_STORAGE_POS];

            if (Scalar.eq(localExitRootSmt, Scalar.e(0))) {
                expect(localExitRootVm.toString('hex')).to.equal('');
                if (update) {
                    newLocalExitRoot = ethers.constants.HashZero;
                }
                expect(newLocalExitRoot).to.equal(ethers.constants.HashZero);
            } else {
                expect(localExitRootVm.toString('hex')).to.equal(localExitRootSmt.toString(16).padStart(64, '0'));
                if (update) {
                    newLocalExitRoot = `0x${localExitRootVm.toString('hex')}`;
                }
                expect(localExitRootVm.toString('hex')).to.equal(newLocalExitRoot.slice(2));
            }

            // Check the circuit input
            const circuitInput = await batch.getStarkInput();

            // Check the encode transaction match with the vector test
            if (!update) {
                expect(batchL2Data).to.be.equal(batch.getBatchL2Data());
                // Check the batchHashData and the input hash
                expect(batchHashData).to.be.equal(circuitInput.batchHashData);
                expect(newLocalExitRoot).to.be.equal(circuitInput.newLocalExitRoot);
                // Check l1InfoTreeRoot and l1InfoTreeIndex
                expect(newL1InfoTreeRoot).to.be.equal(circuitInput.newL1InfoTreeRoot);
                expect(newL1InfoTreeIndex).to.be.equal(circuitInput.newL1InfoTreeIndex);
            } else {
                testVectors[i].batchL2Data = batch.getBatchL2Data();
                testVectors[i].batchHashData = circuitInput.batchHashData;
                testVectors[i].newLocalExitRoot = circuitInput.newLocalExitRoot;
                testVectors[i].newL1InfoTreeRoot = circuitInput.newL1InfoTreeRoot;
                testVectors[i].newL1InfoTreeIndex = circuitInput.newL1InfoTreeIndex;
            }

            if (update && geninput) {
                const dstFile = path.join(pathInputs, `${path.basename(pathProcessorTests, '.json')}-${i}-input.json`);
                const folder = path.dirname(dstFile);

                if (!fs.existsSync(folder)) {
                    fs.mkdirSync(folder);
                }

                await fs.writeFileSync(dstFile, JSON.stringify(circuitInput, null, 2));
            }

            console.log(`Completed test ${i + 1}/${testVectors.length}`);
        }

        if (update) {
            await fs.writeFileSync(pathProcessorTests, JSON.stringify(testVectors, null, 2));
        }
    });
});
