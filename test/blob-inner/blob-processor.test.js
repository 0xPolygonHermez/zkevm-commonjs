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
    blobInner, MemDB, SMT, getPoseidon, smtUtils,
} = require('../../index');
const { pathTestVectors } = require('../helpers/test-utils');

const pathInputs = path.join(__dirname, '../tools/inputs-examples');

describe('BlobProcessor', async function () {
    this.timeout(100000);

    let pathBlobTests = path.join(pathTestVectors, 'blob-inner/blob-inner-data.json');

    let update;
    let geninput;
    let poseidon;
    let F;

    let testVectors;

    before(async () => {
        poseidon = await getPoseidon();
        F = poseidon.F;
        testVectors = JSON.parse(fs.readFileSync(pathBlobTests));

        update = (argv.update === true);
        geninput = (argv.geninput === true);
    });

    it('Check test vectors', async () => {
        for (let i = 0; i < testVectors.length; i++) {
            let {
                id,
                preExecution,
                inputBlob,
                batches,
                expected,
                evmDb,
            } = testVectors[i];

            const db = new MemDB(F);

            // PreExecution
            // Add localExitRoot to the DB
            const smt = new SMT(db, poseidon, poseidon.F);

            // Update smt with the new timestamp
            const oldstateRoot = await stateUtils.setContractStorage(
                Constants.ADDRESS_GLOBAL_EXIT_ROOT_MANAGER_L2,
                smt,
                [F.zero, F.zero, F.zero, F.zero],
                { [Constants.LOCAL_EXIT_ROOT_STORAGE_POS]: preExecution.initLocalExitRoot },
            );



            if (update && geninput) {
                const dstFile = path.join(pathInputs, `${path.basename(pathBlobTests, '.json')}-${i}-input.json`);
                const folfer = path.dirname(dstFile);

                if (!fs.existsSync(folfer)) {
                    fs.mkdirSync(folfer);
                }

                await fs.writeFileSync(dstFile, JSON.stringify(blobInput, null, 2));
            }

            console.log(`Completed test ${i + 1}/${testVectors.length}`);
        }

        if (update) {
            await fs.writeFileSync(pathBlobTests, JSON.stringify(testVectors, null, 2));
        }
    });
});
