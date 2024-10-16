/* eslint-disable prefer-destructuring */
/* eslint-disable no-plusplus */
/* eslint-disable max-len */
/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
/* eslint-disable no-restricted-syntax */
/* eslint-disable guard-for-in */
/* eslint-disable camelcase */
/* eslint-disable no-use-before-define */

function expectedModExpCounters(lenB, lenE, lenM, B, E, M) {
    const [Q_B_M, R_B_M] = [B / M, B % M];

    const lenQE2 = Math.floor(lenE / 2) || 1;

    // const log2E = Math.floor(Math.log(Number(E)) / Math.log(2));

    let nTimesOdd = 0;
    while (E > 0n) {
        nTimesOdd += Number(E & 1n);
        E >>= 1n;
    }
    const nTimesEven = lenE * 256 - nTimesOdd;

    const counters = { ariths: 0, binaries: 0, steps: 0 };
    const a = setupAndFirstDivCounters();
    const b = halfLoopCounters();
    const c = fullLoopCounters();

    for (const key in counters) {
        // counters[key] = a[key] + log2E * b[key];
        counters[key] = a[key] + nTimesEven * b[key] + nTimesOdd * c[key];
    }

    return counters;

    // Computes the length of the given unsigned integer x in base 2^256.
    function computeLenThisBase(x) {
        if (x === 0n) return 1;

        let len = 0;
        while (x > 0n) {
            x >>= 256n;
            len += 1;
        }

        return len;
    }

    // Counters computation of the setup and first division. + 2 last steps
    function setupAndFirstDivCounters() {
        return {
            steps:
                84
                + 2 // last 2 steps
                + 10 * lenB
                + 3 * lenM
                + (8 + 19 * lenM ) * computeLenThisBase(Q_B_M)
                + 12 * computeLenThisBase(R_B_M),
             binaries:
                4
                - lenM
                + computeLenThisBase(R_B_M)
                + 2 * computeLenThisBase(Q_B_M) * lenM,
            ariths:
                lenM * computeLenThisBase(Q_B_M)
        };
    }

    function halfLoopCounters() {
        return {
            steps:
                153
                + 82 * lenM
                + 6 * lenE
                + (80 * lenM * (lenM - 1)) / 2
                + 19 * lenM**2
                + 25 * lenQE2,
            binaries:
                9
                + 6 * lenM
                + (23 * lenM * (lenM - 1)) / 2
                + 2 * lenM**2
                + 3 * lenQE2,
            ariths:
                - 1
                + 2 * lenM
                + (2 * lenM * (lenM - 1)) / 2
                + lenM**2
        };
    }

    function fullLoopCounters() {
        return {
            steps:
                263
                + 114 * lenM
                + 6 * lenE
                + (80 * lenM * (lenM - 1)) / 2
                + 57 * lenM**2
                + 25 * lenQE2,
            binaries:
                17
                + 3 * lenM
                + (23 * lenM * (lenM - 1)) / 2
                + 6 * lenM**2
                + 3 * lenQE2,
            ariths:
                - 1
                + 2 * lenM
                + (2 * lenM * (lenM - 1)) / 2
                + 3 * lenM**2
        };
    }
}

module.exports = {
    expectedModExpCounters,
};
