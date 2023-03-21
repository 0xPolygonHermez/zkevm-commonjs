const { expect } = require('chai');

const fs = require('fs');
const path = require('path');

const { contractUtils } = require('../index');

const { pathTestVectors } = require('./helpers/test-utils');

describe('contractUtils', function () {
    this.timeout(10000);
    let testVector;

    const expectedBatchHashData = '0x80cc22bc1a205c21f2b8c87e6185e1215fb60e3d83c609fd3bf3cdc586a6244b';
    // TODO: input taken from pil-stark
    const expectedStarkHashExecutor = '0x704d5cfd3e44b82028f7f8cae31168267a7422c5a447b90a65134116da5a8432';
    const expectedSnarkInputHash = '594262252873243840875998239270722753577223730670772204748849761598102435680';

    before(async () => {
        testVector = JSON.parse(fs.readFileSync(path.join(pathTestVectors, 'inputs-executor/input_executor.json')));
    });

    it('calculateBatchHashData', async () => {
        const {
            batchL2Data,
        } = testVector;
        const computedBatchHashData = await contractUtils.calculateBatchHashData(
            batchL2Data,
        );

        expect(computedBatchHashData).to.be.equal(expectedBatchHashData);
    });

    it('calculateStarkInput', async () => {
        const {
            oldAccInputHash,
            globalExitRoot,
            timestamp,
            sequencerAddr,
        } = testVector;

        const computedGlobalHash = await contractUtils.calculateAccInputHash(
            oldAccInputHash,
            expectedBatchHashData,
            globalExitRoot,
            timestamp,
            sequencerAddr,
        );

        expect(computedGlobalHash).to.be.equal(expectedStarkHashExecutor);
    });

    it('calculateSnarkInput', async () => {
        const aggregatorAddress = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';

        const {
            oldStateRoot,
            newStateRoot,
            newLocalExitRoot,
            oldAccInputHash,
            newAccInputHash,
            oldNumBatch,
            newNumBatch,
            chainID,
            forkID,
        } = testVector;

        const computedSnark = await contractUtils.calculateSnarkInput(
            oldStateRoot,
            newStateRoot,
            newLocalExitRoot,
            oldAccInputHash,
            newAccInputHash,
            oldNumBatch,
            newNumBatch,
            chainID,
            aggregatorAddress,
            forkID,
        );

        expect(computedSnark.toString()).to.be.equal(expectedSnarkInputHash.toString());
    });

    it('generateSolidityInputs', async () => {
        const proof = {
            curve: 'bn128',
            evaluations: {
                a: '4983158065320214845283038983582714794121964269562335314678893656777021441179',
                b: '16954997558800292241285829119127460476904096592673528833252764751611060529484',
                c: '19907833497231071751218286765571700657325411817908398200273971646708015379973',
                inv: '18709665057908509070263370622788831970132874950834195224194644231239185584210',
                qc: '20180602900474771698084616126077100208356111092204988183321341655700554153925',
                ql: '7184999557986328041227742592357896348308235205977343838440292814392908122881',
                qm: '15746852530918129899779268569777451179135139920956069008692985644822220905703',
                qo: '13462912426112262926122926010350351554433337487986864956678163989077059113211',
                qr: '6568608538196612762571047871488288774379289573507562301133500821227615565887',
                s1: '4145481673072174106132167909558117791672267673805945989604332690796053782432',
                s2: '15782738447523150431534509736720608895283309997276128169797612832103285063167',
                s3: '19634098809781954721014027775373460063999142848882963646522218392404089810535',
                t1w: '12615874520776110669137696889769441431608620414683221044483077139972249600041',
                t2w: '11090232877753387518493513406564271995307200865708888231927238026947532688442',
                z: '7913346757900002207061111855181610923063545513720236141063077259230406195290',
                zw: '6945617974772266811420525947339673414061993254604597387828495161555542243328',
            },
            polynomials: {
                C1: [
                    '1516727195767032049478026110690514930328617858088881270561325457504317755265',
                    '10229217548795788059590132216160098233900569755246947343259447557867867172692',
                    '1',
                ],
                C2: [
                    '3475379816990314882936193548878132035412215578240917195896393268962061568972',
                    '10751373682874687105995746569663280587012340153544618395586133953388185455780',
                    '1',
                ],
                W1: [
                    '12027817076964442105066123439933980891010823272467787472712480987240897894022',
                    '1758471555828315015802732549631060772594129568829830200815254450382850741062',
                    '1',
                ],
                W2: [
                    '20071089056538896761442454883397954176108153445163507949192920056889877719511',
                    '5269947004785587272927540811637953545419916464090031798344937064625701134544',
                    '1',
                ],
            },
            protocol: 'fflonk',
        };

        const expectedOut = '0x035a6fea6f3dfcb8ebd4db937e0d8dfdc0bbef5f05dd423fa3c41aae263c4f81169d882e7cb494ca843ab8bff6449f0bdabc256bed73659ae2db3ec858336f5407aefec9ee7a52d1909e38c1cd205c6e3e19bcc3ca2b7c5d3cea0861b7bdcbcc17c50fd5edb732be11fee3d4a8d7ebdecebd11b83841e45795971b0d2d090ca41a9780d2cfec264b2c87a25340b972c9ca7e4219da6af97d6ad8f1a01356d68603e342771b5c0197cf3c5dd4076a20354bf12e49758c24f61bc692618523d3462c5fd575cb8b10518cf4b82ac3d19d7e083f2291d762f36e6e74bd6e836fe9d70ba6af2e7081674972f6dd833eb72a83b358a389655f806ba79a8fc0e6a020d00fe290cd881d06f44c4459e6af3c01f550b3620404decbc9d68c4a7965090b010e85b35fe9d27a33bea3430b9c1c4ae949aa3109a1c38db1efb82cd3ab14383f22d067169dd27ede08cc64ce3ae290682e8e9d059484502b04c23b40937e1ce71dc3bd07c56162212dd6e342e6f9226bf7b0f9c51b3d77f14c0ffe59bd7f10fb2c9dd10407bc215dc702b07ee6625f9e5c0a2d9f96cb71a6f413d72aefc87fc5092a426d3176669d76da7e3ad2916ff8623db8f15e90874cccd93e4547e3dfa022e4b6a13e105c3a48b0d90762069a054ca8e519e9505649f99da9850936fdff2b688190af39f4437548662b88b11573378e1c3c64857a1401c60a8b1012ae670b045e157513d29cbc228764227e47836a353b35ea38d135e27b8da33b93c49b257c30444cc7b9fec564fc7a74c3cc184ffe5564707f24a9b587ed69fbbba94c2c036f388c438c3e36f382d5597df9500b18b42af8fbf19d8b57b49f4b133605117ecba8ab5400b5fed3a2aef81c4482f9235aab55549337dc0bbc8f53b7385a0f5b14991f9df5d40dcd1c2cf4cd9378601a07befa54270e57947de1f8d678001be454f9b008d4a19a67fec1e0ddb8bd0a74a6fed270b6f6592eb58aee17c0291884d97006f5be9a999575bc889a3b562c4f73f517f63dd135dd5b10c4240c3a295d4b8f19d85d73ba394c09a67a289b56def34d27a972bde05c3a48ada5d052';

        const result = await contractUtils.generateSolidityInputs(proof);
        expect(result).to.be.equal(expectedOut);
    });
});
