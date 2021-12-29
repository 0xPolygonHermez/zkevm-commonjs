const { expect } = require('chai');

const { performance } = require('perf_hooks');

const {
    getPoseidon,
} = require('../index');

describe('getPoseidon', () => {
    let firstTime;
    let secondTime;

    it('first get', async () => {
        const startTime = performance.now();
        await getPoseidon();
        const stopTime = performance.now();
        firstTime = stopTime - startTime;
    });

    it('second get', async () => {
        const startTime = performance.now();
        await getPoseidon();
        const stopTime = performance.now();
        secondTime = stopTime - startTime;
    });

    it('check times', async () => {
        expect(firstTime).to.be.greaterThan(secondTime);
    });
});
