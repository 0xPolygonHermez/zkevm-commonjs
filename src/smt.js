/* eslint-disable prefer-destructuring */

const { Scalar } = require('ffjavascript');

const {
    scalar2fea, fea2scalar, nodeIsZero, nodeIsEq, isOneSiblings,
} = require('./smt-utils');

class SMT {
    /**
     * Constructor Sparse-merkle-tree
     * @param {Object} db - Database to use
     * @param {Object} hash - hash function
     * @param {Field} F - Field element
     */
    constructor(db, hash, F) {
        this.db = db;
        this.hash = hash;
        this.F = F;
        this.empty = [F.zero, F.zero, F.zero, F.zero];
    }

    /**
     * Insert node into the merkle-tree
     * @param {Array[Field]} oldRoot - previous root
     * @param {Array[Field]} key - path merkle-tree to insert the value
     * @param {Scalar} value - value to insert
     * @returns {Object} Information about the tree insertion
     *      {Array[Field]} oldRoot: previous root,
     *      {Array[Field]} newRoot: new root
     *      {Field} key: key modified,
     *      {Array[Field]} siblings: array of siblings,
     *      {Scalar} insKey: inserted key,
     *      {Scalar} insValue: insefted value,
     *      {Bool} isOld0: is new insert or delete,
     *      {Scalar} oldValue: old leaf value,
     *      {Scalar} newValue: new leaf value,
     *      {String} mode: action performed by the insertion,
     */
    async set(oldRoot, key, value) {
        const self = this;
        const { F } = self;
        let r = oldRoot;

        function getUniqueSibling(a) {
            let nFound = 0;
            let fnd;
            for (let i = 0; i < a.length; i += 4) {
                if (!nodeIsZero(a.slice(i, i + 4), F)) {
                    nFound += 1;
                    fnd = i / 4;
                }
            }
            if (nFound === 1) return fnd;

            return -1;
        }

        async function hashSave(a) {
            const h = self.hash(a);
            await self.db.setSmtNode(h, a);

            return h;
        }

        const keys = self.splitKey(key);
        let level = 0;

        const accKey = [];
        let foundKey;
        let siblings = [];

        let insKey;
        let insValue;
        const oldValue = Scalar.e(0);
        let mode;
        let newRoot = oldRoot;
        let isOld0 = true;
        let foundRKey;
        let foundOldValH;
        let foundVal;

        while (!nodeIsZero(r, F) && (typeof (foundKey) === 'undefined')) {
            siblings[level] = await self.db.getSmtNode(r);
            if (isOneSiblings(siblings[level], F)) {
                const hKV = await self.db.getSmtNode(siblings[level].slice(4));
                foundRKey = hKV.slice(0, 4);
                foundOldValH = hKV.slice(4);
                const foundValA = await self.db.getSmtNode(foundOldValH);
                foundVal = fea2scalar(F, foundValA);
                foundKey = this.joinKey(accKey, foundRKey);
            } else {
                r = siblings[level].slice(keys[level] * 4, keys[level] * 4 + 4);
                accKey.push(keys[level]);
                level += 1;
            }
        }

        level -= 1;
        accKey.pop();

        if (!Scalar.isZero(value)) {
            if (typeof (foundKey) !== 'undefined') {
                if (nodeIsEq(key, foundKey, F)) { // Update
                    mode = 'update';

                    const newValH = await hashSave(scalar2fea(F, value));
                    const newKVH = await hashSave([...foundRKey, ...newValH]);
                    const newLeafHash = await hashSave([F.one, F.zero, F.zero, F.zero, ...newKVH]);
                    if (level >= 0) {
                        for (let j = 0; j < 4; j++) {
                            siblings[level][keys[level] * 4 + j] = newLeafHash[j];
                        }
                    } else {
                        newRoot = newLeafHash;
                    }
                } else { // insert with foundKey
                    mode = 'insertFound';
                    const node = [];
                    let level2 = level + 1;
                    const foundKeys = self.splitKey(foundKey);
                    while (keys[level2] === foundKeys[level2]) level2 += 1;

                    const oldKey = this.removeKeyBits(foundKey, level2 + 1);
                    const oldKVH = await hashSave([...oldKey, ...foundOldValH]);
                    const oldLeafHash = await hashSave([F.one, F.zero, F.zero, F.zero, ...oldKVH]);

                    insKey = foundKey;
                    insValue = foundVal;
                    isOld0 = false;

                    const newKey = this.removeKeyBits(key, level2 + 1);
                    const newValH = await hashSave(scalar2fea(F, value));
                    const newKVH = await hashSave([...newKey, ...newValH]);
                    const newLeafHash = await hashSave([F.one, F.zero, F.zero, F.zero, ...newKVH]);

                    for (let i = 0; i < 8; i++) node[i] = F.zero;
                    for (let j = 0; j < 4; j++) {
                        node[keys[level2] * 4 + j] = newLeafHash[j];
                        node[foundKeys[level2] * 4 + j] = oldLeafHash[j];
                    }

                    let r2 = await hashSave(node);
                    level2 -= 1;

                    while (level2 !== level) {
                        for (let i = 0; i < 8; i++) node[i] = F.zero;
                        for (let j = 0; j < 4; j++) {
                            node[keys[level2] * 4 + j] = r2[j];
                        }

                        r2 = await hashSave(node);
                        level2 -= 1;
                    }

                    if (level >= 0) {
                        for (let j = 0; j < 4; j++) {
                            siblings[level][keys[level] * 4 + j] = r2[j];
                        }
                    } else {
                        newRoot = r2;
                    }
                }
            } else { // insert without foundKey
                mode = 'insertNotFound';

                const newKey = this.removeKeyBits(key, (level + 1));
                const newValH = await hashSave(scalar2fea(F, value));
                const newKVH = await hashSave([...newKey, ...newValH]);
                const newLeafHash = await hashSave([F.one, F.zero, F.zero, F.zero, ...newKVH]);

                if (level >= 0) {
                    for (let j = 0; j < 4; j++) {
                        siblings[level][keys[level] * 4 + j] = newLeafHash[j];
                    }
                } else {
                    newRoot = newLeafHash;
                }
            }
        } else if ((typeof (foundKey) !== 'undefined') && (nodeIsEq(key, foundKey, F))) { // Delete
            if (level >= 0) {
                for (let j = 0; j < 4; j++) {
                    siblings[level][keys[level] * 4 + j] = F.zero;
                }

                let uKey = getUniqueSibling(siblings[level]);

                if (uKey >= 0) {
                    mode = 'deleteFound';
                    siblings[level + 1] = await self.db.getSmtNode(siblings[level].slice(uKey * 4, uKey * 4 + 4));

                    if (isOneSiblings(siblings[level + 1], F)) {
                        const hKV = await self.db.getSmtNode(siblings[level + 1].slice(4));
                        const rKey = hKV.slice(0, 4);

                        const valH = hKV.slice(4);
                        const valA = await self.db.getSmtNode(valH);
                        const val = fea2scalar(F, valA);

                        insKey = this.joinKey([...accKey, uKey], rKey);
                        insValue = val;
                        isOld0 = false;

                        while ((uKey >= 0) && (level >= 0)) {
                            level -= 1;
                            if (level >= 0) {
                                uKey = getUniqueSibling(siblings[level]);
                            }
                        }

                        const oldKey = this.removeKeyBits(insKey, level + 1);

                        const oldKVH = await hashSave([...oldKey, ...valH]);
                        const oldLeafHash = await hashSave([F.one, F.zero, F.zero, F.zero, ...oldKVH]);

                        if (level >= 0) {
                            for (let j = 0; j < 4; j++) {
                                siblings[level][keys[level] * 4 + j] = oldLeafHash[j];
                            }
                        } else {
                            newRoot = oldLeafHash;
                        }
                    } else {
                        mode = 'deleteNotFound';
                    }
                } else {
                    mode = 'deleteNotFound';
                }
            } else {
                mode = 'deleteLast';
                newRoot = [F.zero, F.zero, F.zero, F.zero];
            }
        } else {
            mode = 'zeroToZero';
        }

        siblings = siblings.slice(0, level + 1);

        while (level >= 0) {
            newRoot = await hashSave(siblings[level]);
            level -= 1;
            if (level >= 0) {
                for (let j = 0; j < 4; j++) {
                    siblings[level][keys[level] * 4 + j] = newRoot[j];
                }
            }
        }

        return {
            oldRoot,
            newRoot,
            key,
            siblings,
            insKey,
            insValue,
            isOld0,
            oldValue,
            newValue: value,
            mode,
        };
    }

    /**
     * Get value merkle-tree
     * @param {Array[Field]} root - merkle-tree root
     * @param {Array[Field]} key - path to retoreve the value
     * @returns {Object} Information about the value to retrieve
     *      {Array[Field]} root: merkle-tree root,
     *      {Scalar} key: key to look for,
     *      {Scalar} value: value retrieved,
     *      {Array[Field]} siblings: array of siblings,
     *      {Bool} isOld0: is new insert or delete,
     *      {Scalar} insKey: key found,
     *      {Scalar} insValue: value found,
     */
    async get(root, key) {
        const self = this;
        const { F } = this;

        let r = root;

        const keys = self.splitKey(key);
        let level = 0;

        const accKey = [];
        let foundKey;
        let siblings = [];

        let insKey = F.zero;
        let insValue = Scalar.e(0);

        let value = Scalar.e(0);
        let isOld0 = true;

        let foundVal;

        while ((!nodeIsZero(r, F)) && (typeof (foundKey) === 'undefined')) {
            siblings[level] = await self.db.getSmtNode(r);
            if (isOneSiblings(siblings[level], F)) {
                const hKV = await self.db.getSmtNode(siblings[level].slice(4));
                const foundRKey = hKV.slice(0, 4);
                const foundOldValH = hKV.slice(4);
                const foundValA = await self.db.getSmtNode(foundOldValH);
                foundVal = fea2scalar(F, foundValA);
                foundKey = this.joinKey(accKey, foundRKey);
            } else {
                r = siblings[level].slice(keys[level] * 4, keys[level] * 4 + 4);
                accKey.push(keys[level]);
                level += 1;
            }
        }

        level -= 1;
        accKey.pop();

        if (typeof (foundKey) !== 'undefined') {
            if (nodeIsEq(key, foundKey, F)) {
                value = foundVal;
            } else {
                insKey = foundKey;
                insValue = foundVal;
                isOld0 = false;
            }
        }

        siblings = siblings.slice(0, level + 1);

        return {
            root,
            key,
            value,
            siblings,
            isOld0,
            insKey,
            insValue,
        };
    }

    /**
     * Get path for a giving key
     * @param {Scalar} k - key
     * @returns {Array[Number]} - path merkle-tree
     */
    splitKey(k) {
        const res = [];
        const F = this.F;
        const auxk = [F.toObject(k[0]), F.toObject(k[1]), F.toObject(k[2]), F.toObject(k[3])];
        for (let i = 0; i < 64; i++) {
            for (let j = 0; j < 4; j++) {
                res.push(Scalar.toNumber(Scalar.band(auxk[j], Scalar.e(1))));
                auxk[j] = Scalar.shr(auxk[j], 1);
            }
        }

        return res;
    }

    /**
     * Removes bits from the key depending on the smt level
     * @param {Array[Field]} k -key
     * @param {Number} nBits - bits to remove
     * @returns {Array[Field]} - remaining key bits to store
     */
    removeKeyBits(k, nBits) {
        const fullLevels = Math.floor(nBits / 4);
        const F = this.F;
        const auxk = [F.toObject(k[0]), F.toObject(k[1]), F.toObject(k[2]), F.toObject(k[3])];
        for (let i = 0; i < 4; i++) {
            let n = fullLevels;
            if (fullLevels * 4 + i < nBits) n += 1;
            auxk[i] = Scalar.shr(auxk[i], n);
        }

        return [F.e(auxk[0]), F.e(auxk[1]), F.e(auxk[2]), F.e(auxk[3])];
    }

    /**
     * Joins full key from remaining key and path already used
     * @param {Array[Number]} bits - key path used
     * @param {Array[Field]} k - remaining key
     * @returns {Array[Field]} - Full key
     */
    joinKey(bits, k) {
        const n = [0, 0, 0, 0];
        const F = this.F;
        const accs = [Scalar.zero, Scalar.zero, Scalar.zero, Scalar.zero];
        for (let i = 0; i < bits.length; i++) {
            if (bits[i]) {
                accs[i % 4] = Scalar.bor(accs[i % 4], Scalar.shl(Scalar.one, n[i % 4]));
            }
            n[i % 4] += 1;
        }
        const auxk = [F.toObject(k[0]), F.toObject(k[1]), F.toObject(k[2]), F.toObject(k[3])];
        for (let i = 0; i < 4; i++) {
            auxk[i] = Scalar.bor(Scalar.shl(auxk[i], n[i]), accs[i]);
        }

        return [F.e(auxk[0]), F.e(auxk[1]), F.e(auxk[2]), F.e(auxk[3])];
    }
}

module.exports = SMT;
