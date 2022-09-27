const { Client } = require('pg');
const { Scalar } = require('ffjavascript');
const { h4toString } = require('./smt-utils');

class Database {
    /**
     * Constructor Database
     * @param {Field} F - Field element
     * @param {Object} db - Initial database to load in memory
     */
    constructor(F, db) {
        this.F = F;
        this.useRemoteDB = false;
        this.connected = false;
        this.dbtable = 'state.merkletree';
        if (db) this.db = db;
        else this.db = {};
    }

    _checkUseRemoteDB() {
        if (!this.useRemoteDB) {
            throw new Error('SQL database is not configured');
        }
    }

    _checkConnected() {
        if (!this.connected) {
            throw new Error('SQL database is not connected');
        }
    }

    async _insertDB(hash, data) {
        this._checkConnected();

        // Remove initial "0x"
        const h = (hash.startsWith('0x') ? hash.slice(2) : hash);

        const query = `INSERT INTO ${this.dbtable} ( hash, data ) VALUES ( E'\\\\x${h}', E'\\\\x${data}' ) ON CONFLICT (hash) DO NOTHING;`;

        await this.client.query(query);
    }

    async _selectDB(hash) {
        this._checkConnected();

        // Remove initial "0x"
        const h = (hash.startsWith('0x') ? hash.slice(2) : hash);

        const query = `SELECT * FROM ${this.dbtable} WHERE hash = E'\\\\x${h}';`;

        const res = await this.client.query(query);

        if (res.rows.length === 0) {
            return null;
        }

        const dataS = Buffer.from(res.rows[0].data).toString('hex');

        return dataS;
    }

    /**
     * Connect to the database
     * @param {String} connectionString - Connection string for the database. If the value is "local" or "memdb" no remote SQL database will be used, data will be stored only in memory
     */
    async connect(connectionString, dbtable) {
        if (!['local', 'memdb'].includes(connectionString)) {
            this.useRemoteDB = true;
            if (dbtable) this.dbtable = dbtable;
            this.client = new Client({ connectionString });
            await this.client.connect();
            this.connected = true;
        }
    }

    /**
     * Disconnect from the remote SQL database
     */
    async disconnect() {
        this._checkUseRemoteDB();

        await this.client.end();
        this.connected = false;
    }

    /**
     * Get merkle-tree node value
     * @param {Array[Field]} key - key in Array Field representation
     * @returns {Array[Fields] | null} Node childs if found, otherwise return null
     */
    async getSmtNode(key) {
        if (key.length !== 4) {
            throw Error('SMT key must be an array of 4 Fields');
        }

        const keyS = h4toString(key);
        let found = false;

        if (typeof this.db[keyS] === 'undefined') {
            if (this.useRemoteDB) {
                const dataS = await this._selectDB(keyS);
                if (dataS !== null) {
                    if (dataS.length % 16 !== 0) {
                        throw new Error(`Found incorrect DATA value size: ${dataS.length}`);
                    }

                    for (let i = 0; i < dataS.length; i += 16) {
                        this.db[keyS].push(dataS.substring(i, i + 16));
                    }

                    found = true;
                }
            }
        } else found = true;

        if (found) {
            const data = [];
            for (let i = 0; i < this.db[keyS].length; i++) {
                data.push(this.F.e(`0x${this.db[keyS][i]}`));
            }

            if (this.capturing) {
                this.capturing[keyS] = this.db[keyS];
            }

            return data;
        }

        return null;
    }

    /**
     * Set merkle-tree node
     * @param {Array[Field]} key - key in Field representation
     * @param {Array[Field]} value - child array
     */
    async setSmtNode(key, value) {
        if (key.length !== 4) {
            throw Error('SMT key must be an array of 4 Fields');
        }

        const keyS = h4toString(key);

        this.db[keyS] = [];

        for (let i = 0; i < value.length; i++) {
            this.db[keyS].push(this.F.toString(value[i], 16).padStart(16, '0'));
        }

        if (this.useRemoteDB) {
            let dataS = '';
            for (let i = 0; i < this.db[keyS].length; i++) {
                dataS += this.db[keyS][i];
            }
            await this._insertDB(keyS, dataS);
        }
    }

    /**
     * Set value
     * @param {String | Scalar} key - key in scalar or hex representation
     * @param {Any} value - value to insert into the DB (JSON valid format)
     */
    async setValue(key, value) {
        const keyS = Scalar.e(key).toString(16).padStart(64, '0');
        const jsonS = JSON.stringify(value);

        this.db[keyS] = Buffer.from(jsonS, 'utf8').toString('hex');

        if (this.useRemoteDB) {
            await this._insertDB(keyS, this.db[keyS]);
        }
    }

    /**
     * Get value
     * @param {String | Scalar} key - key in scalar or hex representation
     * @returns {Any} - value retirved from database
     */
    async getValue(key) {
        const keyS = Scalar.e(key).toString(16).padStart(64, '0');
        let found = false;

        if (typeof this.db[keyS] === 'undefined') {
            if (this.useRemoteDB) {
                const dataS = await this._selectDB(keyS);
                if (dataS != null) {
                    this.db[keyS] = dataS;
                    found = true;
                }
            }
        } else found = true;

        if (found) {
            if (this.capturing) {
                this.capturing[keyS] = this.db[keyS];
            }

            return JSON.parse(Buffer.from(this.db[keyS], 'hex').toString('utf-8'));
        }

        return null;
    }

    /**
     * Get program value
     * @param {Array[Field]} key - key in Array Field representation
     * @returns {Array[Byte] | null} Node childs if found, otherwise return null
     */
    async getProgram(key) {
        if (key.length !== 4) {
            throw Error('Program key must be an array of 4 Fields');
        }

        const keyS = h4toString(key);
        let found = false;

        if (typeof this.db[keyS] === 'undefined') {
            if (this.useRemoteDB) {
                const dataS = await this._selectDB(keyS);
                if (dataS != null) {
                    this.db[keyS] = dataS;
                    found = true;
                }
            }
        } else found = true;

        if (found) {
            if (this.capturing) {
                this.capturing[keyS] = this.db[keyS];
            }

            return Array.prototype.slice.call(Buffer.from(this.db[keyS], 'hex'));
        }

        return null;
    }

    /**
     * Set program node
     * @param {Array[Field]} key - key in Field representation
     * @param {Array[byte]} value - child array
     */
    async setProgram(key, value) {
        if (key.length !== 4) {
            throw Error('Program key must be an array of 4 Fields');
        }

        const keyS = h4toString(key);

        this.db[keyS] = Buffer.from(value).toString('hex');

        if (this.useRemoteDB) {
            await this._insertDB(keyS, this.db[keyS]);
        }
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

module.exports = Database;
