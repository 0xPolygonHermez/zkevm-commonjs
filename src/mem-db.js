const { Scalar } = require('ffjavascript');
const { stringifyBigInts, unstringifyBigInts } = require('ffjavascript').utils;

class MemDB {
    /**
     * Constructor Memory Db
     * @param {Field} F - Field element
     * @param {Object} db - Database to load
     */
    constructor(F, db) {
        if (db) {
            this.db = db;
        } else {
            this.db = {};
        }
        this.F = F;
    }

    /**
     * Get merkle-tree node value
     * @param {Field} key - key in Field representation
     * @returns {Array[Fields] | null} Node childs if found, otherwise return null
     */
    async getSmtNode(key) {
        const keyS = this.key2Str(key);
        const res = [];

        if (typeof this.db[keyS] === 'undefined') {
            return null;
        }

        for (let i = 0; i < this.db[keyS].length; i++) {
            res.push(this.F.e(`0x${this.db[keyS][i]}`));
        }

        if (this.capturing) {
            this.capturing[keyS] = this.db[keyS];
        }

        return res;
    }

    key2Str(key) {
        let keyS="";
        for (let i=0; i<4; i++) {
            keyS = keyS + this.F.toString(key[i], 16).padStart(16, '0');
        }
        return keyS;
    }

    /**
     * Set merkle-tree node
     * @param {Field} key - key in Field representation
     * @param {Array[Field]} value - child array
     */
    async setSmtNode(key, value) {
        const keyS = this.key2Str(key);
        this.db[keyS] = [];

        for (let i = 0; i < value.length; i++) {
            this.db[keyS].push(this.F.toString(value[i], 16).padStart(16, '0'));
        }
    }

    /**
     * Set value
     * @param {String | Scalar} key - key in scalar or hex representation
     * @param {Any} value - value to insert into the DB (JSON valid format)
     */
    async setValue(key, value) {
        const keyS = this.key2Str(key);
        this.db[keyS] = [];
        
        for (let i = 0; i < value.length; i++) {
            this.db[keyS].push(this.F.toString(value[i], 16).padStart(16, '0'));
        }
    }

    /**
     * Get value
     * @param {String | Scalar} key - key in scalar or hex representation
     * @returns {Any} - value retirved from database
     */
    async getValue(key) {
        const keyS = this.key2Str(key);

        if (typeof this.db[keyS] === 'undefined') {
            return null;
        }

        const res = [];
        for (let i = 0; i < 8; i++) {
            res[i] = this.F.e("0x"+this.db[keyS][i]);
        }

        return res;
    }

    startCapture() {
        this.capturing = {};
    }

    endCapture() {
        const res = this.capturing;
        delete this.capturing;

        return res;
    }
}

module.exports = MemDB;
