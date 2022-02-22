/* eslint-disable no-console */
/* eslint-disable multiline-comment-style */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */
const { Scalar } = require('ffjavascript');

const ethers = require('ethers');
const { expect } = require('chai');

const {
    MemDB, ZkEVMDB, getPoseidon, processorUtils,
} = require('../index');
const testVectors = require('./helpers/processor-tests.json');

describe('Processor', async function () {
    this.timeout(100000);
    let poseidon;
    let F;

    before(async () => {
        poseidon = await getPoseidon();
        F = poseidon.F;
    });

    it('Check test vectors', async () => {
        for (let i = 0; i < testVectors.length; i++) {
            const {
                id,
                arity,
                genesis,
                expectedOldRoot,
                txs,
                expectedNewRoot,
                chainIdSequencer,
                sequencerAddress,
                expectedNewLeafs,
                batchL2Data,
                localExitRoot,
                globalExitRoot,
                batchHashData,
                inputHash,
                timestamp,
            } = testVectors[i];

            const db = new MemDB(F);

            // create a zkEVMDB to compile the sc
            const zkEVMDB = await ZkEVMDB.newZkEVM(
                db,
                arity,
                poseidon,
                F.zero,
                F.e(Scalar.e(localExitRoot)),
                genesis,
            );

            expect(`0x${Scalar.e(F.toString(zkEVMDB.stateRoot)).toString(16).padStart(64, '0')}`).to.be.equal(expectedOldRoot);

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
                    value: ethers.utils.parseUnits(txData.value, 'wei'),
                    gasLimit: txData.gasLimit,
                    gasPrice: ethers.utils.parseUnits(txData.gasPrice, 'wei'),
                    chainId: txData.chainId,
                    data: txData.data || '0x',
                };

                if (txData.data) {
                    // Check tx data
                    const contract = genesis.contracts.find((x) => x.contractName === txData.contractName);
                    const functionData = contract.contractInterface.encodeFunctionData(txData.function, txData.params);
                    expect(functionData).to.equal(txData.data);
                }
                if (!ethers.utils.isAddress(tx.to) || !ethers.utils.isAddress(txData.from)) {
                    expect(txData.customRawTx).to.equal(undefined);
                    // eslint-disable-next-line no-continue
                    continue;
                }

                let customRawTx;
                const address = genesis.accounts.find((o) => o.address === txData.from);
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
                    expect(rawTxEthers).to.equal(txData.rawTx);
                    customRawTx = processorUtils.rawTxToCustomRawTx(rawTxEthers);
                }

                expect(customRawTx).to.equal(txData.customRawTx);

                if (txData.encodeInvalidData) {
                    customRawTx = customRawTx.slice(0, -6);
                }
                rawTxs.push(customRawTx);
                txProcessed.push(txData);
            }

            const batch = await zkEVMDB.buildBatch(timestamp, sequencerAddress, chainIdSequencer, F.e(Scalar.e(globalExitRoot)));
            for (let j = 0; j < rawTxs.length; j++) {
                batch.addRawTx(rawTxs[j]);
            }

            // execute the transactions added to the batch
            await batch.executeTxs();
            // consolidate state
            await zkEVMDB.consolidate(batch);

            const newRoot = batch.currentStateRoot;
            expect(`0x${Scalar.e(F.toString(newRoot)).toString(16).padStart(64, '0')}`).to.be.equal(expectedNewRoot);

            // Check errors on decode transactions
            const decodedTx = await batch.getDecodedTxs();

            for (let j = 0; j < decodedTx.length; j++) {
                const currentTx = decodedTx[j];
                const expectedTx = txProcessed[j];
                try {
                    expect(currentTx.reason).to.be.equal(expectedTx.reason);
                } catch (error) {
                    console.log({ currentTx }, { expectedTx }); // eslint-disable-line no-console
                    throw new Error(`Batch Id : ${id} TxId:${expectedTx.id} ${error}`);
                }
            }

            // Check balances and nonces
            for (const [address, leaf] of Object.entries(expectedNewLeafs)) { // eslint-disable-line
                const newLeaf = await zkEVMDB.getCurrentAccountState(address);
                expect(newLeaf.balance.toString()).to.equal(leaf.balance);
                expect(newLeaf.nonce.toString()).to.equal(leaf.nonce);
            }

            // Check the circuit input
            const circuitInput = await batch.getCircuitInput();

            // Check the encode transaction match with the vector test
            expect(batchL2Data).to.be.equal(batch.getBatchL2Data());

            // Check the batchHashData and the input hash
            expect(batchHashData).to.be.equal(circuitInput.batchHashData);
            expect(inputHash).to.be.equal(circuitInput.inputHash);
            console.log(`Completed test ${i + 1}/${testVectors.length}`);

            // /*
            //  *  // Save outuput in file
            //  *  const dir = path.join(__dirname, './helpers/inputs-executor/');
            //  *  if (!fs.existsSync(dir)) {
            //  *      fs.mkdirSync(dir);
            //  *  }
            //  *  await fs.writeFileSync(`${dir}input_${id}.json`, JSON.stringify(circuitInput, null, 2));
            //  */
            // const expectedInput = require(`./helpers/inputs-executor/input_${id}.json`); // eslint-disable-line
            // expect(circuitInput).to.be.deep.equal(expectedInput);
        }
    });
});
