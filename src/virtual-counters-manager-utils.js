/* eslint-disable prefer-destructuring */
/* eslint-disable no-plusplus */
/* eslint-disable max-len */
/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
/* eslint-disable no-restricted-syntax */
/* eslint-disable guard-for-in */
/* eslint-disable camelcase */
/* eslint-disable no-use-before-define */
/**
 * Computes the expected modExp counters for the given inputs.
 * @param ctx - Context.
 * @param tag - Tag.
 * @sets ctx.ctx.emodExpCounters.
 */

const BASE = 1n << 256n;

function expectedModExpCounters(lenB, lenE, lenM, B, E, M) {
    const [Q_B_M, R_B_M] = [B / M, B % M];
    const Bsq = B * B;
    const NZ_Bsq = 2 * lenB - computeLenThisBase(Bsq);
    const [Q_Bsq_M, R_Bsq_M] = [Bsq / M, Bsq % M];
    const BM = B * M;

    const E2 = Math.floor(lenE / 2) || 1;

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

    // Computes the positions of the first different chunk between x and y.
    function first_diff_chunk(x, y) {
        const xLen = computeLenThisBase(x);
        const yLen = computeLenThisBase(y);

        if (xLen > yLen || xLen < yLen) {
            return xLen;
        }

        let i = xLen - 1;
        while (i >= 0 && ((x >> (256n * BigInt(i))) & 0xffffffffffffffffffffffffffffffffn) === ((y >> (256n * BigInt(i))) & 0xffffffffffffffffffffffffffffffffn)) {
            i -= 1;
        }

        return i + 1;
    }

    // Counters computation of the setup and first division.
    function setupAndFirstDivCounters() {
        return {
            steps:
                218
                + 39 * lenB
                + 45 * lenM
                + computeLenThisBase(Q_B_M) * (30 + 33 * lenM)
                + 17 * computeLenThisBase(R_B_M)
                - 14 * first_diff_chunk(B, M)
                - 7 * first_diff_chunk(M, R_B_M),
            binaries:
                12
                + 6 * lenB
                + 3 * lenM
                + computeLenThisBase(Q_B_M) * (1 + 4 * lenM)
                + computeLenThisBase(R_B_M)
                - 4 * first_diff_chunk(B, M)
                - 2 * first_diff_chunk(M, R_B_M),
            ariths: 1 + computeLenThisBase(Q_B_M) * lenM,
        };
    }

    // Counters computation of the half loop.
    function halfLoopCounters() {
        return {
            steps:
                399
                + 100 * lenB
                + 61 * ((lenB * (lenB + 1)) / 2)
                + 48 * lenM
                + 19 * lenE
                + 44 * E2
                + computeLenThisBase(Q_Bsq_M) * (30 + 33 * lenM)
                + 14 * computeLenThisBase(R_Bsq_M)
                - 14 * first_diff_chunk(Bsq, M)
                - 7 * first_diff_chunk(M, R_Bsq_M)
                - 5 * NZ_Bsq,
            binaries:
                23
                + 14 * lenB
                + 9 * ((lenB * (lenB + 1)) / 2)
                + 3 * lenM
                + 2 * lenE
                + 3 * E2
                + computeLenThisBase(Q_Bsq_M) * (1 + 4 * lenM)
                + computeLenThisBase(R_Bsq_M)
                - 4 * first_diff_chunk(Bsq, M)
                - 2 * first_diff_chunk(M, R_Bsq_M)
                - NZ_Bsq,
            ariths:
                2
                + lenB
                + (lenB * (lenB + 1)) / 2
                + E2
                + computeLenThisBase(Q_Bsq_M) * lenM,
        };
    }

    // Counters computation of the full loop.
    function fullLoopCounters() {
        return {
            steps:
                674
                + 180 * lenB
                + 61 * ((lenB * (lenB + 1)) / 2)
                + 149 * lenM
                + 19 * lenE
                + 44 * E2
                + 66 * lenB * lenM
                + computeLenThisBase(Q_Bsq_M) * (30 + 33 * lenM)
                + 14 * computeLenThisBase(R_Bsq_M)
                - 14 * first_diff_chunk(BM, M)
                - 14 * first_diff_chunk(Bsq, M)
                - 7 * first_diff_chunk(M, [0n])
                - 7 * first_diff_chunk(M, R_Bsq_M)
                - 5 * NZ_Bsq,
            binaries:
                36
                + 21 * lenB
                + 9 * ((lenB * (lenB + 1)) / 2)
                + 12 * lenM
                + 2 * lenE
                + 3 * E2
                + 8 * lenB * lenM
                + computeLenThisBase(Q_Bsq_M) * (1 + 4 * lenM)
                + computeLenThisBase(R_Bsq_M)
                - 4 * first_diff_chunk(BM, M)
                - 4 * first_diff_chunk(Bsq, M)
                - 2 * first_diff_chunk(M, [0n])
                - 2 * first_diff_chunk(M, R_Bsq_M)
                - NZ_Bsq,
            ariths:
                4
                + lenB
                + (lenB * (lenB + 1)) / 2
                + E2
                + 2 * lenB * lenM
                + computeLenThisBase(Q_Bsq_M) * lenM,
        };
    }
}

module.exports = {
    expectedModExpCounters,
};
