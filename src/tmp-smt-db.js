/**
 * This is a DB which intends to get all the state from the srcDB and
 * store all the inserts insetead of modifying the DB
 * in case the inserts are accepted, can be populated to the srcDB
 */
class TmpSmtDB {
    constructor(srcDb) {
        this.srcDb = srcDb;
        this.F = srcDb.F;
        this.inserts = {};
    }

    /**
     * Get function of the DB, return and array of values
     * Use the srcDb in case there's no inserts stored with this key
     * @param {Array[Field]} key - Key
     * @returns {Array[String]} Array of hex values
     */
    async getSmtNode(key) {
        if (typeof key.length === 'undefined' || key.length !== 4) {
            throw Error('SMT key must be an array of 4 Fields');
        }

        const keyS = this._key2Str(key);
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
        if (typeof key.length === 'undefined' || key.length !== 4) {
            throw Error('SMT key must be an array of 4 Fields');
        }

        const keyS = this._key2Str(key);

        this.inserts[keyS] = [];

        for (let i = 0; i < value.length; i++) {
            this.inserts[keyS].push(this.F.toString(value[i], 16).padStart(16, '0'));
        }
    }

    /**
     * Populate all the inserts made to the tmpDB to the srcDB
     */
    async populateSrcDb() {
        const insertKeys = Object.keys(this.inserts);
        for (let i = 0; i < insertKeys.length; i++) {
            const key = this._str2Key(insertKeys[i]);
            const value = this.inserts[insertKeys[i]].map((element) => this.F.e(`0x${element}`));
            await this.srcDb.setSmtNode(key, value);
        }
    }

    /**
     * Convert 4 fields into an hex string
     * @param {Array[Field]} key - key in Array Field representation
     * @returns {String} hex string
     */
    _key2Str(key) {
        let keyS = '';
        for (let i = 0; i < 4; i++) {
            keyS += this.F.toString(key[i], 16).padStart(16, '0');
        }

        return keyS;
    }

    /**
     * Convert hex string into an array of 4 Field elements
     * @param {String} _str - key in hex representation
     * @returns {Array[Field]} fields array
     */
    _str2Key(_str) {
        const str = _str.startsWith('0x') ? _str.slice(2) : _str;

        const res = [];

        res[0] = this.F.e(`0x${str.slice(0, 16)}`);
        res[1] = this.F.e(`0x${str.slice(16, 32)}`);
        res[2] = this.F.e(`0x${str.slice(32, 48)}`);
        res[3] = this.F.e(`0x${str.slice(48)}`);

        return res;
    }
}

module.exports = TmpSmtDB;
