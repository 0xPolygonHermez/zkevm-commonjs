const { Scalar } = require('ffjavascript');
const { h4toString, stringToH4 } = require('./smt-utils');

/**
 * This is a DB which intends to get all the state from the srcDB and
 * store all the inserts instead of modifying the DB
 * in case the inserts are accepted, can be populated to the srcDB
 */
class TmpDB {
    constructor(srcDb) {
        this.srcDb = srcDb;
        this.F = srcDb.F;
        this.inserts = {};
        this.insertsValues = {};
        this.insertsProgram = {};
    }

    /**
     * Get function of the DB, return and array of values
     * Use the srcDb in case there's no inserts stored with this key
     * @param {Array[Field]} key - Key
     * @returns {Array[String]} Array of hex values
     */
    async getSmtNode(key) {
        if (key.length !== 4) {
            throw Error('SMT key must be an array of 4 Fields');
        }

        const keyS = h4toString(key);
        let res = [];

        if (this.inserts[keyS]) {
            for (let i = 0; i < this.inserts[keyS].length; i++) {
                res.push(this.F.e(`0x${this.inserts[keyS][i]}`));
            }
        } else {
            res = await this.srcDb.getSmtNode(key);
        }

        return res;
    }

    /**
     * Set function of the DB, all the inserts will be stored
     * In the inserts Object
     * @param {Array[Fields]} key - Key
     * @param {Array[Fields]} value - Value
     */
    async setSmtNode(key, value) {
        if (key.length !== 4) {
            throw Error('SMT key must be an array of 4 Fields');
        }

        const keyS = h4toString(key);

        this.inserts[keyS] = [];

        for (let i = 0; i < value.length; i++) {
            this.inserts[keyS].push(this.F.toString(value[i], 16).padStart(16, '0'));
        }
    }

    /**
     * Get value from insertsValue if it exist, otherwise from the Db
     * @param {String | Scalar} key - key in scalar or hex representation
     * @returns {Any} - value retirved from database
     */
    async getValue(key) {
        const keyS = Scalar.e(key).toString(16).padStart(64, '0');

        let res;

        if (this.insertsValues[keyS]) {
            res = JSON.parse(this.insertsValues[keyS]);
        } else {
            res = await this.srcDb.getValue(key);
        }

        return res;
    }

    /**
     * Set value to insertsValues
     * @param {String | Scalar} key - key in scalar or hex representation
     * @param {Any} value - value to insert into the DB (JSON valid format)
     */
    async setValue(key, value) {
        const keyS = Scalar.e(key).toString(16).padStart(64, '0');
        this.insertsValues[keyS] = JSON.stringify(value);
    }

    /**
     * Set program node to insertsPrograms
     * @param {Array[Field]} key - key in Field representation
     * @param {Array[byte]} value - child array
     */
    async setProgram(key, value) {
        if (key.length !== 4) {
            throw Error('Program key must be an array of 4 Fields');
        }

        const keyS = h4toString(key);
        this.insertsProgram[keyS] = value;
    }

    /**
     * Get program value from insertedProgram. Otherwise get it from srcDb
     * @param {Array[Field]} key - key in Array Field representation
     * @returns {Array[Byte] | null} Node childs if found, otherwise return null
     */
    async getProgram(key) {
        if (key.length !== 4) {
            throw Error('Program key must be an array of 4 Fields');
        }

        const keyS = h4toString(key);

        let res;

        if (this.insertsProgram[keyS]) {
            res = this.insertsProgram[keyS];
        } else {
            res = await this.srcDb.getProgram(key);
        }

        return res;
    }

    /**
     * Populate all the inserts made to the tmpDB to the srcDB
     */
    async populateSrcDb() {
        // add smt nodes
        const insertKeys = Object.keys(this.inserts);
        for (let i = 0; i < insertKeys.length; i++) {
            const key = stringToH4(insertKeys[i]);
            const value = this.inserts[insertKeys[i]].map((element) => this.F.e(`0x${element}`));
            await this.srcDb.setSmtNode(key, value);
        }

        // add values
        const insertKeysValues = Object.keys(this.insertsValues);
        for (let i = 0; i < insertKeysValues.length; i++) {
            const key = Scalar.fromString(insertKeysValues[i], 16);
            const value = this.insertsValues[insertKeysValues[i]];
            await this.srcDb.setValue(key, value);
        }

        // add programs
        const insertKeysPrograms = Object.keys(this.insertsProgram);
        for (let i = 0; i < insertKeysPrograms.length; i++) {
            const key = stringToH4(insertKeysPrograms[i]);
            const value = this.insertsProgram[insertKeysPrograms[i]];
            await this.srcDb.setProgram(key, value);
        }
    }
}

module.exports = TmpDB;
