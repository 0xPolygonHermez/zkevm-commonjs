const { expect } = require('chai');
const { Scalar } = require('ffjavascript');

const {
    getL1InfoTreeValue,
} = require('../index').l1InfoTreeUtils;

describe('L1 info tree utils', () => {
    it('getL1InfoTreeValue', async () => {
        const globalExitRoot = '0x16994edfddddb9480667b64174fc00d3b6da7290d37b8db3a16571b4ddf0789f';
        const blockHash = '0x24a5871d68723340d9eadc674aa8ad75f3e33b61d5a9db7db92af856a19270bb';
        const timestamp = Scalar.e('1697231573');

        const expectedValue = '0xf62f487534b899b1c362242616725878188ca891fab60854b792ca0628286de7';

        const res = getL1InfoTreeValue(globalExitRoot, blockHash, timestamp);

        expect(res).to.be.equal(expectedValue);
    });
});
