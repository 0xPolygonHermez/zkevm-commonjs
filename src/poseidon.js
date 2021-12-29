const { buildPoseidon } = require('circomlibjs');

let poseidon;
let isBuild = false;

/**
 * singleton to build poseidon once
 * @returns {Object} - poseidon hash function
 */
async function getPoseidon() {
    if (isBuild === false) {
        poseidon = await buildPoseidon();
        isBuild = true;
    }
    return poseidon;
}

module.exports = getPoseidon;
