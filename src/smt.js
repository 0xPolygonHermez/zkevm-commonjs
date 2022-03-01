/* eslint-disable prefer-destructuring */

const { Scalar } = require('ffjavascript');

const { scalar2fea, fea2scalar } = require('./smt-utils');

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

    nodeIsZero(n) {
        return (this.F.isZero(n[0]) &&
            this.F.isZero(n[1]) &&
            this.F.isZero(n[2]) &&
            this.F.isZero(n[3]));
    }

    nodeIsEq(n1, n2) {
        return (this.F.eq(n1[0], n2[0]) &&
            this.F.eq(n1[1], n2[1]) &&
            this.F.eq(n1[2], n2[2]) &&
            this.F.eq(n1[3], n2[3]));
    }

    isOneSiblings(n) {
        return (this.F.eq(n[0], this.F.one) &&
            this.F.isZero(n[1]) &&
            this.F.isZero(n[2]) &&
            this.F.isZero(n[3]));
    }

    /**
     * Insert node into the merkle-tree
     * @param {Field} oldRoot - previous root
     * @param {Field} key - path merkle-tree to insert the value
     * @param {Scalar} value - value to insert
     * @returns {Object} Information about the tree insertion
     *      {Field} oldRoot: previous root,
     *      {Field} newRoot: new root
     *      {Field} key: key modified,
     *      {Array[Fields]} siblings: array of siblings,
     *      {Field} insKey: inserted key,
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
            for (let i = 0; i < a.length; i+=4) {
                if (!self.nodeIsZero (a.slice(i, i+4))) {
                    nFound += 1;
                    fnd = i/4;
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

        let accKey = Scalar.e(0);
        let lastAccKey = Scalar.e(0);
        let foundKey;
        let siblings = [];

        let insKey;
        let insValue;
        let oldValue = Scalar.e(0);
        let mode;
        let newRoot = oldRoot;
        let isOld0 = true;
        let foundRKey;
        let foundOldValH;
        let foundVal;

        while (!this.nodeIsZero(r) && (typeof(foundKey)=== "undefined")) {
            siblings[level] = await self.db.getSmtNode(r);
            if (this.isOneSiblings(siblings[level])) {
                const hKV =  await self.db.getSmtNode(siblings[level].slice(4));
                const foundRKeyH = hKV.slice(0, 4);
                const foundRKeyA =  await self.db.getSmtNode(foundRKeyH);
                foundOldValH = hKV.slice(4);
                const foundValA =  await self.db.getSmtNode(foundOldValH);
                foundRKey = fea2scalar(F, foundRKeyA);
                foundVal = fea2scalar(F, foundValA);
                foundKey = Scalar.add(
                    accKey,
                    Scalar.shl(
                        foundRKey,
                        level
                    ),
                );
            } else {
                r = siblings[level].slice(keys[level]*4, keys[level]*4+4);
                lastAccKey = accKey;
                accKey = Scalar.add(accKey, Scalar.shl(keys[level], level));
                level += 1;
            }
        }

        level -= 1;
        accKey = lastAccKey;

        if (!Scalar.isZero(value)) {
            const v = scalar2fea(F, value);
            if (typeof(foundKey)!== "undefined") {
                if (F.eq(key, foundKey)) { // Update
                    mode = 'update';

                    const newValH = await hashSave(scalar2fea(F, value));
                    const newKeyH = await hashSave(scalar2fea(F, foundRKey));
                    const newKVH = await hashSave([...newKeyH, ...newValH]);
                    const newLeafHash = await hashSave([F.one, F.zero, F.zero, F.zero, ...newKVH ]);
                    if (level >= 0) {
                        siblings[level][keys[level]] = newLeafHash;
                    } else {
                        newRoot = newLeafHash;
                    }
                } else { // insert with foundKey
                    mode = 'insertFound';
                    const node = [];
                    let level2 = level + 1;
                    const foundKeys = self.splitKey(foundKey);
                    while (keys[level2] === foundKeys[level2]) level2 += 1;


                    const oldKey = scalar2fea( F, Scalar.shr( foundKey, level2 + 1 ) );
                    const oldKeyH = await hashSave(oldKey);
                    const oldKVH = await hashSave([...oldKeyH, ...foundOldValH]);
                    const oldLeafHash = await hashSave([F.one, F.zero, F.zero, F.zero, ...oldKVH ]);


                    insKey = foundKey;
                    insValue = foundVal;
                    isOld0 = false;

                    const newKey = Scalar.shr(key, (level2 + 1));
                    const newKeyH = await hashSave(scalar2fea(F, newKey));
                    const newValH = await hashSave(scalar2fea(F, value));
                    const newKVH = await hashSave([...newKeyH, ...newValH]);
                    const newLeafHash = await hashSave([F.one, F.zero, F.zero, F.zero, ...newKVH ]);

                    for (let i = 0; i < 8; i++) node[i] = F.zero;
                    for (let j=0; j<4; j++) {
                        node[keys[level2]*4+j] = newLeafHash[j];
                        node[foundKeys[level2]*4+j] = oldLeafHash[j];
                    }

                    let r2 = await hashSave(node);
                    level2 -= 1;

                    while (level2 !== level) {
                        for (let i = 0; i <8; i++) node[i] = F.zero;
                        for (let j=0; j<4; j++) {
                            node[keys[level2]*4 + j] = r2[j];
                        }

                        r2 = await hashSave(node);
                        level2 -= 1;
                    }

                    if (level >= 0) {
                        for (let j=0; j<4; j++) {
                            siblings[level][keys[level]*4 +j] = r2[j];
                        }
                    } else {
                        newRoot = r2;
                    }
                }
            } else { // insert without foundKey
                mode = 'insertNotFound';


                const newKey = Scalar.shr(key, (level + 1));
                const newKeyH = await hashSave(scalar2fea(F, newKey));
                const newValH = await hashSave(scalar2fea(F, value));
                const newKVH = await hashSave([...newKeyH, ...newValH]);
                const newLeafHash = await hashSave([F.one, F.zero, F.zero, F.zero, ...newKVH ]);

                if (level >= 0) {
                    for (let j=0; j<4; j++) {
                        siblings[level][keys[level]*4 + j ] = newLeafHash[j];
                    }
                } else {
                    newRoot = newLeafHash;
                }
            }
        } else if ((typeof(foundKey)!=="undefined") && (F.eq(key, foundKey))) { // Delete
            if (level >= 0) {
                for (let j=0; j<4; j++) {
                    siblings[level][keys[level]*4 + j] = F.zero;
                }

                let uKey = getUniqueSibling(siblings[level]);

                if (uKey >= 0) {
                    mode = 'deleteFound';
                    siblings[level + 1] = await self.db.getSmtNode(siblings[level].slice(uKey*4, uKey*4+4));

                    if (self.isOneSiblings(siblings[level + 1])) {
                        const hKV =  await self.db.getSmtNode(siblings[level+1].slice(4));
                        const rKeyH = hKV.slice(0, 4);
                        const rKeyA =  await self.db.getSmtNode(rKeyH);
                        const rKey = fea2scalar(F, rKeyA);

                        const valH = hKV.slice(4);
                        const valA =  await self.db.getSmtNode(valH);
                        const val = fea2scalar(F, valA);
        
                        insKey = Scalar.add(
                            Scalar.add(accKey, Scalar.shl(uKey, level )),
                            Scalar.shl(
                                rKey,
                                level + 1
                            ),
                        );
                        insValue = val;
                        isOld0 = false;

                        while ((uKey >= 0) && (level >= 0)) {
                            level -= 1;
                            if (level >= 0) {
                                uKey = getUniqueSibling(siblings[level]);
                            }
                        }

                        const oldKey = Scalar.shr(insKey, level + 1 );

                        const oldKeyH = await hashSave(scalar2fea(F, oldKey));
                        const oldKVH = await hashSave([...oldKeyH, ...valH]);
                        const oldLeafHash = await hashSave([F.one, F.zero, F.zero, F.zero, ...oldKVH ]);

                        if (level >= 0) {
                            for (let j=0; j<4; j++) {
                                siblings[level][keys[level]*4+j] = oldLeafHash[j];
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
                for (let j=0; j<4; j++) {
                    siblings[level][keys[level]*4+j] = newRoot[j];
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
     * @param {Field} root - merkle-tree root
     * @param {Field} key - path to retoreve the value
     * @returns {Object} Information about the value to retrieve
     *      {Field} root: merkle-tree root,
     *      {Field} key: key to look for,
     *      {Scalar} value: value retrieved,
     *      {Array[Fields]} siblings: array of siblings,
     *      {Bool} isOld0: is new insert or delete,
     *      {Field} insKey: key found,
     *      {Scalar} insValue: value found,
     */
    async get(root, key) {
        const self = this;
        const { F } = this;

        let r = root;

        const keys = self.splitKey(key);
        let level = 0;

        let accKey = Scalar.e(0);
        let lastAccKey = Scalar.e(0);
        let foundKey;
        let siblings = [];

        let insKey = F.zero;
        let insValue = Scalar.e(0);

        let value = Scalar.e(0);
        let isOld0 = true;

        let foundVal;

        while ((!this.nodeIsZero(r)) && (typeof(foundKey) == "undefined")) {
            siblings[level] = await self.db.getSmtNode(r);
            if (this.isOneSiblings(siblings[level])) {
                const hKV =  await self.db.getSmtNode(siblings[level].slice(4));
                const foundRKeyH = hKV.slice(0, 4);
                const foundRKeyA =  await self.db.getSmtNode(foundRKeyH);
                const foundOldValH = hKV.slice(4);
                const foundValA =  await self.db.getSmtNode(foundOldValH);
                const foundRKey = fea2scalar(F, foundRKeyA);
                foundVal = fea2scalar(F, foundValA);
                foundKey = Scalar.add(
                    accKey,
                    Scalar.shl(
                        foundRKey,
                        level
                    ),
                );
            } else {
                r = siblings[level].slice(keys[level]*4, keys[level]*4+4);
                lastAccKey = accKey;
                accKey = Scalar.add(accKey, Scalar.shl(keys[level], level));
                level += 1;
            }
        }

        level -= 1;
        accKey = lastAccKey;

        if (typeof(foundKey)!=="undefined") {
            if (F.eq(key, foundKey)) {
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
     * @param {Field} k - key
     * @returns {Array[Number]} - path merkle-tree
     */
    splitKey(k) {
        const self = this;
        const res = [];
        let auxk = k;
        for (let i = 0; i < 256; i++) {
            res.push(Scalar.toNumber(Scalar.band(auxk, Scalar.e(1))));
            auxk = Scalar.shr(auxk, 1);
        }
        return res;
    }
}

module.exports = SMT;
