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
    // console.log(JSON.stringify(counters, null, 2));
    function computeLenThisBase(x) {
        if (x === 0n) return 1;

        let len = 0;
        while (x > 0n) {
            x >>= 256n;
            len += 1;
        }

        return len;
    }

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

/**
     * Compares two unsigned integers represented as arrays of BigInts.
     * @param a - Unsigned integer represented as an array of BigInts.
     * @param b - Unsigned integer represented as an array of BigInts.
     * @returns 1 if a > b, -1 if a < b, 0 if a == b.
     */
function compare(a, b) {
    const alen = a.length;
    const blen = b.length;
    if (alen !== blen) {
        return alen >= blen ? 1 : -1;
    }
    for (let i = alen - 1; i >= 0; i--) {
        if (a[i] !== b[i]) {
            return a[i] > b[i] ? 1 : -1;
        }
    }

    return 0;
}

/**
     * Removes leading zeros from a.
     * @param a - Unsigned integer represented as an array of BigInts.
     * @returns a with leading zeros removed. It sets a.length = 0 if a = [0n]
     */
function trim(a) {
    let i = a.length;
    while (a[--i] === 0n);
    a.length = i + 1;
}

/**
     * Computes the subtraction of two unsigned integers a,b represented as arrays of BigInts. Assumes a >= b.
     * @param a - Unsigned integer represented as an array of BigInts.
     * @param b - Unsigned integer represented as an array of BigInts.
     * @returns a - b.
     */
function _MP_sub(a, b) {
    const alen = a.length;
    const blen = b.length;
    const result = new Array(alen);
    let diff = 0n;
    let carry = 0n;
    let i = 0;
    for (i = 0; i < blen; i++) {
        diff = a[i] - b[i] - carry;
        carry = diff < 0n ? 1n : 0n;
        result[i] = diff + carry * BASE;
    }
    for (i = blen; i < alen; i++) {
        diff = a[i] - carry;
        if (diff < 0n) {
            diff += BASE;
        } else {
            result[i++] = diff;
            break;
        }
        result[i] = diff;
    }
    for (; i < alen; i++) {
        result[i] = a[i];
    }
    trim(result);

    return result;
}

/**
     * Computes the subtraction of two unsigned integers represented as arrays of BigInts.
     * @param a - Unsigned integer represented as an array of BigInts.
     * @param b - Unsigned integer represented as an array of BigInts.
     * @returns a - b.
     */
function MP_sub(a, b) {
    let result;
    if (compare(a, b) >= 0) {
        result = _MP_sub(a, b);
    } else {
        result = _MP_sub(b, a);
        result[result.length - 1] = -result[result.length - 1];
    }
    if (result.length === 0) {
        result.push(0n);
    }

    return result;
}

/**
     * Computes the multiplication of an unsigned integer represented as an array of BigInts and an unsigned integer represented as a BigInt.
     * @param a - Unsigned integer represented as an array of BigInts.
     * @param b - Unsigned integer represented as a BigInt.
     * @returns a * b.
     */
function MP_short_mul(a, b) {
    const alen = a.length;
    const len = alen;
    const result = new Array(len).fill(0n);
    let product;
    let carry = 0n;
    let i;
    for (i = 0; i < alen; i++) {
        product = a[i] * b + carry;
        carry = product / BASE;
        result[i] = product - carry * BASE;
    }
    while (carry > 0n) {
        result[i++] = carry % BASE;
        carry /= BASE;
    }
    trim(result);

    return result;
}

/**
     * Computes the normalisation of two unsigned integers a,b as explained here https://www.codeproject.com/Articles/1276311/Multiple-Precision-Arithmetic-Division-Algorithm.
     * @param a - Unsigned integer represented as an array of BigInts.
     * @param b - Unsigned integer represented as an array of BigInts.
     * @returns Normalised a and b to achieve better performance for MPdiv.
     */
function normalize(a, b) {
    let bm = b[b.length - 1];
    let shift = 1n; // shift cannot be larger than log2(base) - 1
    while (bm < BASE / 2n) {
        b = MP_short_mul(b, 2n); // left-shift b by 2
        bm = b[b.length - 1];
        shift *= 2n;
    }

    a = MP_short_mul(a, shift); // left-shift a by 2^shift

    return [a, b, shift];
}

/**
     * Computes the next digit of the quotient.
     * @param an - Unsigned integer represented as an array of BigInts. This is the current dividend.
     * @param b - Unsigned integer represented as an array of BigInts.
     * @returns The next digit of the quotient.
     */
function findQn(an, b) {
    const b_l = b.length;
    const bm = b[b_l - 1];
    if (compare(an, b) === -1) {
        return 0n;
    }

    const n = an.length;
    let aguess = [];
    if (an[n - 1] < bm) {
        aguess = [an[n - 2], an[n - 1]];
    } else {
        aguess = [an[n - 1]];
    }

    if (an[n - 1] < bm) {
        return _MPdiv_short(aguess, bm)[0][0]; // this is always a single digit
    } if (an[n - 1] === bm) {
        if (b_l < n) {
            return BASE - 1n;
        }

        return 1n;
    }

    return 1n;
}

/**
     * Computes the division of two unsigned integers represented as arrays of BigInts.
     * @param a - Unsigned integer represented as an array of BigInts.
     * @param b - Unsigned integer represented as an array of BigInts.
     * @returns [quotient, remainder] of a / b.
     */
function _MPdiv(a, b) {
    let shift;
    [a, b, shift] = normalize(a, b);
    let a_l = a.length;
    const quotient = [];
    let remainder = [];
    let an = [];
    while (compare(an, b) === -1) {
        an.unshift(a[--a_l]);
    }

    let test;
    let qn;
    while (a_l >= 0) {
        qn = findQn(an, b);
        test = MP_short_mul(b, qn);
        while (compare(test, an) === 1) {
            // maximum 2 iterations
            qn--;
            test = MP_sub(test, b);
        }

        quotient.unshift(qn);
        remainder = MP_sub(an, test);
        an = remainder;
        if (a_l === 0) break;
        an.unshift(a[--a_l]);
    }
    remainder = _MPdiv_short(remainder, shift)[0];
    trim(quotient);
    trim(remainder);

    return [quotient, remainder];
}

/**
     * Computes the division of an unsigned integer represented as an array of BigInts and an unsigned integer represented as a BigInt.
     * @param a - Unsigned integer represented as an array of BigInts.
     * @param b - Unsigned integer represented as a BigInt.
     * @returns [quotient, remainder] of a / b.
     */
function _MPdiv_short(a, b) {
    const a_l = a.length;
    const quotient = [];
    let remainder = 0n;

    let dividendi;
    let qi;
    for (let i = a_l - 1; i >= 0; i--) {
        dividendi = remainder * BASE + a[i];
        qi = dividendi / b;
        remainder = dividendi - qi * b;
        quotient[i] = qi;
    }
    trim(quotient);

    return [quotient, remainder];
}

/**
     * Computes the division of two unsigned integers represented as arrays of BigInts.
     * @param ctx - Context.
     * @param tag - Tag.
     * @sets ctx.quotient and ctx.remainder.
     */
function eval_MPdiv(ctx, tag) {
    const addr1 = Number(evalCommand(ctx, tag.params[0]));
    const len1 = Number(evalCommand(ctx, tag.params[1]));
    const addr2 = Number(evalCommand(ctx, tag.params[2]));
    const len2 = Number(evalCommand(ctx, tag.params[3]));

    const input1 = [];
    const input2 = [];
    for (let i = 0; i < len1; ++i) {
        input1.push(fea2scalar(ctx.Fr, ctx.mem[addr1 + i]));
    }
    for (let i = 0; i < len2; ++i) {
        input2.push(fea2scalar(ctx.Fr, ctx.mem[addr2 + i]));
    }

    const [quo, rem] = _MPdiv(input1, input2);

    ctx.quotient = quo;
    ctx.remainder = rem;
}

/**
     *
     * @param ctx - Context.
     * @param tag - Tag.
     * @returns Quotient chunk at the given position.
     */
function eval_receiveQuotientChunk(ctx, tag) {
    const pos = Number(evalCommand(ctx, tag.params[0]));
    const quoi = ctx.quotient[pos];

    return quoi;
}

/**
     *
     * @param ctx - Context.
     * @param tag - Tag.
     * @returns Remainder chunk at the given position.
     */
function eval_receiveRemainderChunk(ctx, tag) {
    const pos = Number(evalCommand(ctx, tag.params[0]));
    const remi = ctx.remainder[pos];

    return remi;
}

/**
     *
     * @param ctx - Context.
     * @param tag - Tag.
     * @returns Length of the quotient.
     */
function eval_receiveLenQuotient(ctx) {
    return ctx.quotient.length;
}

/**
     *
     * @param ctx - Context.
     * @param tag - Tag.
     * @returns Length of the remainder.
     */
function eval_receiveLenRemainder(ctx) {
    return ctx.remainder.length;
}

/**
     * Computes the division of an unsigned integer represented as an array of BigInts and an unsigned integer represented as a BigInt.
     * @param ctx - Context.
     * @param tag - Tag.
     * @sets ctx.quotient_short and ctx.remainder_short.
     */
function eval_MPdiv_short(ctx, tag) {
    const addr1 = Number(evalCommand(ctx, tag.params[0]));
    const len1 = Number(evalCommand(ctx, tag.params[1]));
    const input2 = evalCommand(ctx, tag.params[2]);

    const input1 = [];
    for (let i = 0; i < len1; ++i) {
        input1.push(fea2scalar(ctx.Fr, ctx.mem[addr1 + i]));
    }

    const [quo, rem] = _MPdiv_short(input1, input2);

    ctx.quotient_short = quo;
    ctx.remainder_short = rem;
}

/**
     *
     * @param ctx - Context.
     * @param tag - Tag.
     * @returns Short quotient chunk at the given position.
     */
function eval_receiveQuotientChunk_short(ctx, tag) {
    const pos = Number(evalCommand(ctx, tag.params[0]));
    const quoi = ctx.quotient_short[pos];

    return quoi;
}

/**
     *
     * @param ctx - Context.
     * @param tag - Tag.
     * @returns Short remainder chunk at the given position.
     */
function eval_receiveRemainderChunk_short(ctx) {
    const remi = ctx.remainder_short;

    return remi;
}

/**
     *
     * @param ctx - Context.
     * @param tag - Tag.
     * @returns Length of the short quotient.
     */
function eval_receiveLenQuotient_short(ctx) {
    return ctx.quotient_short.length;
}

module.exports = {
    expectedModExpCounters,
};
