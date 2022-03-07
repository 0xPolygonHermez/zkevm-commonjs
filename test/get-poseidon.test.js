/* eslint-disable prefer-arrow-callback */
const { expect } = require('chai');
const { performance } = require('perf_hooks');

const {
    getPoseidon,
} = require('../index');

describe('getPoseidon', async function () {
    this.timeout(30000);
    const numtimes = 5;
    let firstTime;
    let secondTime;

    it('get one time poseidon', async () => {
        const startTime = performance.now();
        for (let i = 0; i < numtimes; i++) {
            await getPoseidon();
        }
        const stopTime = performance.now();
        firstTime = stopTime - startTime;
    });

    it('get 10 times poseidon', async () => {
        const startTime = performance.now();
        for (let i = 0; i < numtimes; i++) {
            await getPoseidon();
        }
        const stopTime = performance.now();
        secondTime = stopTime - startTime;
    });

    it('check times', async () => {
        expect(10 * firstTime).to.be.greaterThan(firstTime + 9 * secondTime);
    });
});
