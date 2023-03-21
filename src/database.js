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
        this.readOnly = true;
        this.dbNodesTable = 'state.nodes';
        this.dbProgramTable = 'state.program';
        if (db) this.db = db;
        else this.db = {};
    }

    /**
     * Check if a remote connection to a SQL database is used
     */
    _checkUseRemoteDB() {
        if (!this.useRemoteDB) {
            throw new Error('SQL database is not configured');
        }
    }

    /**
     * Check if connected to the SQL database
     */
    _checkConnected() {
        if (!this.connected) {
            throw new Error('SQL database is not connected');
        }
    }

    /**
     * Insert data in the SQL database for a specific hash value
     * @param {String} tableName - name of the table where to insert the data
     * @param {String} hash - hash value
     * @param {String} data - data value
     */
    async _insertDB(tableName, hash, data) {
        this._checkConnected();

        // Remove initial "0x"
        const h = (hash.startsWith('0x') ? hash.slice(2) : hash);

        const query = `INSERT INTO ${tableName} ( hash, data ) VALUES ( E'\\\\x${h}', E'\\\\x${data}' ) ON CONFLICT (hash) DO NOTHING;`;

        await this.client.query(query);
    }

    /**
     * Retrieve data from the SQL database for a specific hash value
     * @param {String} tableName - name of the table from where to retrieve data
     * @param {String} hash - hash value
     */
    async _selectDB(tableName, hash) {
        this._checkConnected();

        // Remove initial "0x"
        const h = (hash.startsWith('0x') ? hash.slice(2) : hash);

        const query = `SELECT * FROM ${tableName} WHERE hash = E'\\\\x${h}';`;

        const res = await this.client.query(query);

        if (res.rows.length === 0) {
            return null;
        }

        const dataS = Buffer.from(res.rows[0].data).toString('hex');

        return dataS;
    }

    /**
     * Connect to the SQL database
     * @param {String} connectionString - Connection string for the database. If the value is "local" or "memdb" no remote SQL database will be used, data will be stored only in memory
     * @param {String} dbNodesTable - Name of the table used to store/read nodes data. Default is "state.nodes"
     * @param {String} dbProgramTable - Name of the table used to store/read program data. Default is "state.program"
     * @param {Object} options - options for DB connection
     * @param {Boolean} options.readOnly - read only on SQL DB connecton. Default: true
     */
    async connect(connectionString, dbNodesTable, dbProgramTable, options = {}) {
        if (connectionString && !['local', 'memdb'].includes(connectionString)) {
            this.useRemoteDB = true;
            if (dbNodesTable) this.dbNodesTable = dbNodesTable;
            if (dbProgramTable) this.dbProgramTable = dbProgramTable;
            if (options.readOnly === false) this.readOnly = false;
            this.client = new Client({ connectionString });
            await this.client.connect();
            this.connected = true;
        }
    }

    /**
     * Disconnect from the SQL database
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
                const dataS = await this._selectDB(this.dbNodesTable, keyS);
                if (dataS !== null) {
                    if (dataS.length % 16 !== 0) {
                        throw new Error(`Found incorrect DATA value size: ${dataS.length}`);
                    }

                    this.db[keyS] = [];
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

        if (this.useRemoteDB && !this.readOnly) {
            let dataS = '';
            for (let i = 0; i < this.db[keyS].length; i++) {
                dataS += this.db[keyS][i];
            }
            await this._insertDB(this.dbNodesTable, keyS, dataS);
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

        if (this.useRemoteDB && !this.readOnly) {
            await this._insertDB(this.dbProgramTable, keyS, this.db[keyS]);
        }
    }

    /**
     * Get value
     * @param {String | Scalar} key - key in scalar or hex representation
     * @returns {Any} - value retrieved from database
     */
    async getValue(key) {
        const keyS = Scalar.e(key).toString(16).padStart(64, '0');
        let found = false;

        if (typeof this.db[keyS] === 'undefined') {
            if (this.useRemoteDB) {
                const dataS = await this._selectDB(this.dbProgramTable, keyS);
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
                const dataS = await this._selectDB(this.dbProgramTable, keyS);
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

        if (this.useRemoteDB && !this.readOnly) {
            await this._insertDB(this.dbProgramTable, keyS, this.db[keyS]);
        }
    }

    /**
     * Enable capture of data read from the SQL database
     */
    startCapture() {
        this.capturing = {};
    }

    /**
     * Stop capturing data read from the SQL database
     */
    endCapture() {
        const res = this.capturing;
        delete this.capturing;

        return res;
    }
}

module.exports = Database;
