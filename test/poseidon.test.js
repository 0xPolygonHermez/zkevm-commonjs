/* eslint-disable prefer-arrow-callback */
const { expect } = require('chai');
const { performance } = require('perf_hooks');

const { buildPoseidon } = require('circomlibjs');
const {
    getPoseidon,
} = require('../index');

describe('getPoseidon', async function () {
    this.timeout(30000);
    const numtimes = 5;
    let firstTime;
    let secondTime;

    it('get 10 times poseidon from singleton', async () => {
        const startTime = performance.now();
        for (let i = 0; i < numtimes; i++) {
            await getPoseidon();
        }
        const stopTime = performance.now();
        firstTime = stopTime - startTime;
    });

    it('get 10 times poseidon without singleton', async () => {
        const startTime = performance.now();
        for (let i = 0; i < numtimes; i++) {
            await buildPoseidon();
        }
        const stopTime = performance.now();
        secondTime = stopTime - startTime;
    });

    it('check times', async () => {
        expect(secondTime).to.be.greaterThan(firstTime);
    });
});
