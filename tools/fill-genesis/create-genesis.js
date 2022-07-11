/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */
/* eslint-disable no-unused-expressions */
/* eslint-disable no-console */
/* eslint-disable multiline-comment-style */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */
/* eslint-disable guard-for-in */
/* eslint-disable import/no-extraneous-dependencies */

const { Scalar } = require('ffjavascript');
const fs = require('fs');

const ethers = require('ethers');
const {
    Address,
} = require('ethereumjs-util');
const { defaultAbiCoder } = require('@ethersproject/abi');
const path = require('path');

const artifactsPath = path.join(__dirname, '../../test/artifacts/contracts');

const { argv } = require('yargs');
const contractsPolygonHermez = require('@0xpolygonhermez/contracts-zkevm');
const {
    MemDB, ZkEVMDB, getPoseidon, processorUtils, smtUtils, Constants,
} = require('../../index');

// Example of use: node create-genesis.js --gen genesis-gen.json --out genesis.json

async function main() {
    // load generator
    const inputPath = (typeof argv.gen === 'undefined') ? undefined : argv.gen;
    if (inputPath === undefined) { throw Error('Input genesis must be provided'); }

    // load output file
    const outPath = (typeof argv.out === 'undefined') ? undefined : argv.out;
    if (outPath === undefined) { throw Error('Output file must be specified'); }

    const genesisGenerator = require(path.join(__dirname, inputPath));

    const genesisOutput = {};

    const globalExitRoot = ethers.constants.HashZero;
    const localExitRoot = ethers.constants.HashZero;

    const poseidon = await getPoseidon();
    const { F } = poseidon;
    const {
        genesis,
        txs,
        sequencerAddress,
        timestamp,
    } = genesisGenerator;

    const db = new MemDB(F);

    // create a zkEVMDB to compile the sc
    const zkEVMDB = await ZkEVMDB.newZkEVM(
        db,
        poseidon,
        [F.zero, F.zero, F.zero, F.zero],
        smtUtils.stringToH4(localExitRoot),
        genesis,
    );

    /*
     * build, sign transaction and generate rawTxs
     * rawTxs would be the calldata inserted in the contract
     */
    const addressToContractName = {};
    const rawTxs = [];
    for (let j = 0; j < txs.length; j++) {
        const currentTx = txs[j];

        const tx = {
            to: currentTx.to || '0x',
            nonce: currentTx.nonce,
            value: processorUtils.toHexStringRlp(ethers.utils.parseUnits(currentTx.value, 'wei')),
            gasLimit: currentTx.gasLimit,
            gasPrice: processorUtils.toHexStringRlp(ethers.utils.parseUnits(currentTx.gasPrice, 'wei')),
            chainId: currentTx.chainId,
            data: currentTx.data || '0x',
        };

        // Contract deployment from tx
        let bytecode;
        if (contractsPolygonHermez[currentTx.contractName]) {
            bytecode = contractsPolygonHermez[currentTx.contractName].bytecode;
        } else {
            ({ bytecode } = require(`${artifactsPath}/${currentTx.contractName}.sol/${currentTx.contractName}.json`));
        }

        if (currentTx.paramsDeploy) {
            const params = defaultAbiCoder.encode(currentTx.paramsDeploy.types, currentTx.paramsDeploy.values);
            tx.data = bytecode + params.slice(2);
        } else {
            tx.data = bytecode;
        }

        const addressContract = await ethers.utils.getContractAddress(
            { from: currentTx.from, nonce: currentTx.nonce },
        );
        addressToContractName[addressContract.toLowerCase()] = currentTx.contractName;

        let customRawTx;
        const address = genesis.find((o) => o.address === currentTx.from);
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
            customRawTx = processorUtils.rawTxToCustomRawTx(rawTxEthers);
        }
        rawTxs.push(customRawTx);
    }
    const batch = await zkEVMDB.buildBatch(timestamp, sequencerAddress, smtUtils.stringToH4(globalExitRoot));
    for (let j = 0; j < rawTxs.length; j++) {
        batch.addRawTx(rawTxs[j]);
    }

    // execute the transactions added to the batch
    await batch.executeTxs();
    // consolidate state
    await zkEVMDB.consolidate(batch);

    const newRoot = batch.currentStateRoot;
    genesisOutput.root = smtUtils.h4toString(newRoot);

    const updatedAccounts = batch.getUpdatedAccountsBatch();
    const currentVM = batch.vm;
    const accountsOutput = [];

    for (const item in updatedAccounts) {
        const address = item;
        const account = updatedAccounts[address];
        const currentAccountOutput = {};
        currentAccountOutput.balance = account.balance.toString();
        currentAccountOutput.nonce = account.nonce.toString();
        currentAccountOutput.address = address;

        // If account is a contract, update storage and bytecode
        if (account.isContract()) {
            const addressInstance = Address.fromString(address);
            const smCode = await currentVM.stateManager.getContractCode(addressInstance);
            const sto = await currentVM.stateManager.dumpStorage(addressInstance);
            const storage = {};
            const keys = Object.keys(sto).map((v) => `0x${v}`);
            const values = Object.values(sto).map((v) => `0x${v}`);
            for (let k = 0; k < keys.length; k++) {
                storage[keys[k]] = ethers.utils.RLP.decode(values[k]);
            }

            currentAccountOutput.bytecode = `0x${smCode.toString('hex')}`;
            currentAccountOutput.storage = storage;
            currentAccountOutput.contractName = addressToContractName[address];
        } else if (address !== Constants.ADDRESS_SYSTEM && address !== Constants.ADDRESS_GLOBAL_EXIT_ROOT_MANAGER_L2) {
            currentAccountOutput.pvtKey = (genesis.find((o) => o.address.toLowerCase() === address.toLowerCase())).pvtKey;
        }
        accountsOutput.push(currentAccountOutput);
    }

    // add accounts that has not been used
    for (let i = 0; i < genesis.length; i++) {
        const item = genesis[i];
        if (typeof updatedAccounts[item.address.toLowerCase()] === 'undefined') {
            accountsOutput.push(item);
        }
    }

    genesisOutput.genesis = accountsOutput;
    const genesisOutputPath = path.join(__dirname, outPath);
    await fs.writeFileSync(genesisOutputPath, JSON.stringify(genesisOutput, null, 2));

    if (argv.update) {
        const updatePath = (typeof argv.update === 'undefined') ? undefined : argv.update;

        if (!fs.existsSync(updatePath)) {
            throw new Error('Update file does not exist');
        }

        const testVectors = JSON.parse(fs.readFileSync(updatePath));
        testVectors[0].genesis = genesisOutput.genesis;
        testVectors[0].expectedOldRoot = genesisOutput.root;
        await fs.writeFileSync(updatePath, JSON.stringify(testVectors, null, 2));
    }
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
