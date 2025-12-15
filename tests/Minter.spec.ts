import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import { Minter } from '../wrappers/Minter';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('Minter', () => {
    let code: Cell;
    let minterItemCode: Cell;

    beforeAll(async () => {
        code = await compile('Minter');
        minterItemCode = await compile('MinterItem');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let collection: SandboxContract<TreasuryContract>;
    let minter: SandboxContract<Minter>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        collection = await blockchain.treasury('collection');

        minter = blockchain.openContract(Minter.createFromConfig({
            adminAddress: deployer.address,
            collectionAddress: collection.address,
            servicePublicKey: BigInt('0x' + '00'.repeat(32)),
            isMintEnabled: true,
            minterItemCode: minterItemCode,
        }, code));

        const deployResult = await minter.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: minter.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {

    });
});
