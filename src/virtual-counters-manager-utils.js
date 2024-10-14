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
    const Bsq = B * B;
    const [Q_Bsq_M, R_Bsq_M] = [Bsq / M, Bsq % M];

    const lenE2 = Math.floor(lenE / 2) || 1;

    const log2E = Math.floor(Math.log(Number(E)) / Math.log(2));

    const counters = { ariths: 0, binaries: 0, steps: 0 };
    const a = setupAndFirstDivCounters();
    const b = oddIterationCounters();

    for (const key in counters) {
        counters[key] = a[key] + log2E * b[key];
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

    // Counters computation of the setup and first division.
    function setupAndFirstDivCounters() {
        return {
            steps:
                74
                + 2 // last 2 steps
                + 10 * lenB
                + 26 * lenM
                + (8 + 19 * lenM ) * computeLenThisBase(Q_B_M)
                + 8 * computeLenThisBase(R_B_M),
             binaries:
                2
                + 2 * lenM
                + 2 * computeLenThisBase(Q_B_M) * lenM,
            ariths:
                lenM 
                + (19 * lenM - 18) * computeLenThisBase(Q_B_M)
        };
    }

    // Counters computation of the half loop.
    function oddIterationCounters() {
        return {
            steps:
                229
                + 14 * lenB
                + 6 * lenE
                + 68 * lenM
                + 51 * lenB**2
                + 38 * lenB * lenM
                + 25 * lenE2
                + (19 * lenM + 8) * computeLenThisBase(Q_Bsq_M) 
                + 8 * computeLenThisBase(R_Bsq_M),
            binaries:
                11
                - 9 * lenB
                + 3 * lenM
                + 9 * lenB**2
                + 4 * lenB * lenM
                + 2 * lenE2
                + 2 * computeLenThisBase(Q_Bsq_M) * lenM,
            ariths:
                - 1
                - 16 * lenB
                - 16 * lenM
                + lenB**2
                + 38 * lenB * lenM
                + (19 * lenM - 18) * computeLenThisBase(Q_Bsq_M),
        };
    }
}

module.exports = {
    expectedModExpCounters,
};
