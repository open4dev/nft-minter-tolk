import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano, Address } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { Minter } from '../wrappers/Minter';
import { MinterItem, hashContentWithPrice } from '../wrappers/MinterItem';
import nacl from 'tweetnacl';
import { convertPublicKeyToBigInt, MINTER_MIN_RESERVE, MIN_TONS_FOR_STORAGE, NFT_DEPLOY_AMOUNT } from '../wrappers/utils';

const OP_INTERNAL_MINT_ITEM = 0x0505DC31;

describe('Integration: MinterItem -> Minter -> Collection', () => {
    let minterCode: Cell;
    let minterItemCode: Cell;

    beforeAll(async () => {
        minterCode = await compile('Minter');
        minterItemCode = await compile('MinterItem');
    });

    let blockchain: Blockchain;
    let admin: SandboxContract<TreasuryContract>;
    let collection: SandboxContract<TreasuryContract>;
    let user: SandboxContract<TreasuryContract>;
    let minter: SandboxContract<Minter>;
    let keys: nacl.SignKeyPair;
    let startTime: bigint;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        admin = await blockchain.treasury('admin');
        collection = await blockchain.treasury('collection');
        user = await blockchain.treasury('user');
        keys = nacl.sign.keyPair();
        startTime = BigInt(Math.floor(Date.now() / 1000));

        // Deploy Minter
        minter = blockchain.openContract(Minter.createFromConfig({
            adminAddress: admin.address,
            collectionAddress: collection.address,
            servicePublicKey: convertPublicKeyToBigInt(keys.publicKey),
            startTime: startTime,
            minterItemCode: minterItemCode,
        }, minterCode));

        const deployResult = await minter.sendDeploy(admin.getSender(), toNano('0.5'));

        expect(deployResult.transactions).toHaveTransaction({
            from: admin.address,
            to: minter.address,
            deploy: true,
            success: true,
        });
    });

    it('should complete full mint flow: MinterItem -> Minter -> Collection', async () => {
        const content = beginCell().storeStringTail('https://example.com/nft.json').endCell();
        const price = toNano('1');

        // Create MinterItem with the same parameters that Minter will compute
        const minterItem = blockchain.openContract(MinterItem.createFromConfig({
            isMinted: false,
            startTime: startTime,
            price: price,
            minterAddress: minter.address,
            ownerAddress: user.address,
            servicePublicKey: convertPublicKeyToBigInt(keys.publicKey),
            contentNftItem: content,
        }, minterItemCode));

        // Sign hash(content + price) with service key
        const dataHash = hashContentWithPrice(content, price);
        const signature = BigInt('0x' + Buffer.from(nacl.sign.detached(dataHash, keys.secretKey)).toString('hex'));

        // User deploys and mints via MinterItem
        const mintResult = await minterItem.sendDeployWithMint(user.getSender(), toNano('2'), signature);

        // 1. MinterItem should deploy successfully
        expect(mintResult.transactions).toHaveTransaction({
            from: user.address,
            to: minterItem.address,
            deploy: true,
            success: true,
            outMessagesCount: 1,
        });

        // 2. MinterItem should send message to Minter
        expect(mintResult.transactions).toHaveTransaction({
            from: minterItem.address,
            to: minter.address,
            success: true,
            outMessagesCount: 1,
        });

        // 3. Minter should send DeployNft to Collection
        expect(mintResult.transactions).toHaveTransaction({
            from: minter.address,
            to: collection.address,
            success: true,
        });
    });

    it('should reject mint from wrong address', async () => {
        const content = beginCell().storeStringTail('https://example.com/nft.json').endCell();
        const price = toNano('1');
        const attacker = await blockchain.treasury('attacker');

        // Create MinterItem for user
        const minterItem = blockchain.openContract(MinterItem.createFromConfig({
            isMinted: false,
            startTime: startTime,
            price: price,
            minterAddress: minter.address,
            ownerAddress: user.address,
            servicePublicKey: convertPublicKeyToBigInt(keys.publicKey),
            contentNftItem: content,
        }, minterItemCode));

        const dataHash = hashContentWithPrice(content, price);
        const signature = BigInt('0x' + Buffer.from(nacl.sign.detached(dataHash, keys.secretKey)).toString('hex'));

        // Attacker tries to mint (should fail with ERROR_NOT_OWNER_TRYING_TO_MINT = 202)
        const mintResult = await minterItem.sendDeployWithMint(attacker.getSender(), toNano('2'), signature);

        expect(mintResult.transactions).toHaveTransaction({
            from: attacker.address,
            to: minterItem.address,
            deploy: true,
            success: false,
            exitCode: 202,
        });
    });

    it('should reject mint with invalid signature', async () => {
        const content = beginCell().storeStringTail('https://example.com/nft.json').endCell();
        const price = toNano('1');

        const minterItem = blockchain.openContract(MinterItem.createFromConfig({
            isMinted: false,
            startTime: startTime,
            price: price,
            minterAddress: minter.address,
            ownerAddress: user.address,
            servicePublicKey: convertPublicKeyToBigInt(keys.publicKey),
            contentNftItem: content,
        }, minterItemCode));

        // Wrong signature (signing different content)
        const wrongContent = beginCell().storeStringTail('https://wrong.com/nft.json').endCell();
        const wrongDataHash = hashContentWithPrice(wrongContent, price);
        const wrongSignature = BigInt('0x' + Buffer.from(nacl.sign.detached(wrongDataHash, keys.secretKey)).toString('hex'));

        // User tries to mint with wrong signature (should fail with ERROR_SIGNATURE_INVALID = 205)
        const mintResult = await minterItem.sendDeployWithMint(user.getSender(), toNano('2'), wrongSignature);

        expect(mintResult.transactions).toHaveTransaction({
            from: user.address,
            to: minterItem.address,
            deploy: true,
            success: false,
            exitCode: 205,
        });
    });

    it('should reject double mint', async () => {
        const content = beginCell().storeStringTail('https://example.com/nft.json').endCell();
        const price = toNano('1');

        const minterItem = blockchain.openContract(MinterItem.createFromConfig({
            isMinted: false,
            startTime: startTime,
            price: price,
            minterAddress: minter.address,
            ownerAddress: user.address,
            servicePublicKey: convertPublicKeyToBigInt(keys.publicKey),
            contentNftItem: content,
        }, minterItemCode));

        const dataHash = hashContentWithPrice(content, price);
        const signature = BigInt('0x' + Buffer.from(nacl.sign.detached(dataHash, keys.secretKey)).toString('hex'));

        // First mint - should succeed
        await minterItem.sendDeployWithMint(user.getSender(), toNano('2'), signature);

        // Second mint - should fail with ERROR_MINTED_ALREADY = 204
        const secondMintResult = await minterItem.sendDeployWithMint(user.getSender(), toNano('2'), signature);

        expect(secondMintResult.transactions).toHaveTransaction({
            from: user.address,
            to: minterItem.address,
            success: false,
            exitCode: 204,
        });
    });

    it('should reject mint before start time', async () => {
        const content = beginCell().storeStringTail('https://example.com/nft.json').endCell();
        const price = toNano('1');
        const futureStartTime = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour in future

        // Create MinterItem with future start time
        const minterItem = blockchain.openContract(MinterItem.createFromConfig({
            isMinted: false,
            startTime: futureStartTime,
            price: price,
            minterAddress: minter.address,
            ownerAddress: user.address,
            servicePublicKey: convertPublicKeyToBigInt(keys.publicKey),
            contentNftItem: content,
        }, minterItemCode));

        const dataHash = hashContentWithPrice(content, price);
        const signature = BigInt('0x' + Buffer.from(nacl.sign.detached(dataHash, keys.secretKey)).toString('hex'));

        // Try to mint before start time (should fail with ERROR_MINT_NOT_ALLOWED = 201)
        const mintResult = await minterItem.sendDeployWithMint(user.getSender(), toNano('2'), signature);

        expect(mintResult.transactions).toHaveTransaction({
            from: user.address,
            to: minterItem.address,
            deploy: true,
            success: false,
            exitCode: 201,
        });
    });

    it('should reject mint with insufficient funds (ERROR_NOT_ENOUGH_FUNDS_TO_MINT)', async () => {
        const content = beginCell().storeStringTail('https://example.com/nft.json').endCell();
        const price = toNano('2'); // Price is 2 TON

        const minterItem = blockchain.openContract(MinterItem.createFromConfig({
            isMinted: false,
            startTime: startTime,
            price: price,
            minterAddress: minter.address,
            ownerAddress: user.address,
            servicePublicKey: convertPublicKeyToBigInt(keys.publicKey),
            contentNftItem: content,
        }, minterItemCode));

        const dataHash = hashContentWithPrice(content, price);
        const signature = BigInt('0x' + Buffer.from(nacl.sign.detached(dataHash, keys.secretKey)).toString('hex'));

        // User tries to mint with only 1 TON (should fail with ERROR_NOT_ENOUGH_FUNDS_TO_MINT = 203)
        const mintResult = await minterItem.sendDeployWithMint(user.getSender(), toNano('1'), signature);

        expect(mintResult.transactions).toHaveTransaction({
            from: user.address,
            to: minterItem.address,
            deploy: true,
            success: false,
            exitCode: 203,
        });
    });

    it('should reject MsgInternalMintItem from wrong address (ERROR_MINT_ITEM_ADDRESS_MISMATCH)', async () => {
        const attacker = await blockchain.treasury('attacker');
        const content = beginCell().storeStringTail('https://example.com/nft.json').endCell();
        const price = toNano('1');

        // Attacker sends fake MsgInternalMintItem directly to Minter
        const fakeBody = beginCell()
            .storeUint(OP_INTERNAL_MINT_ITEM, 32)
            .storeUint(0, 64) // queryId
            .storeCoins(price) // price
            .storeAddress(user.address) // ownerAddress
            .storeRef(content) // content
            .endCell();

        const result = await attacker.send({
            to: minter.address,
            value: toNano('1'),
            body: fakeBody,
        });

        expect(result.transactions).toHaveTransaction({
            from: attacker.address,
            to: minter.address,
            success: false,
            exitCode: 206, // ERROR_MINT_ITEM_ADDRESS_MISMATCH
        });
    });

    it('should allow admin to claim balance', async () => {
        // First, send some TON to minter to accumulate balance
        await user.send({
            to: minter.address,
            value: toNano('5'),
            body: beginCell().endCell(), // empty body - will just add to balance
        });

        const balanceBefore = await minter.getBalance();
        expect(balanceBefore).toBeGreaterThan(toNano('4'));

        // Admin claims the balance
        const claimResult = await minter.sendAdminClaim(admin.getSender(), toNano('0.05'));

        expect(claimResult.transactions).toHaveTransaction({
            from: admin.address,
            to: minter.address,
            success: true,
            outMessagesCount: 1,
        });

        // Admin should receive TON
        expect(claimResult.transactions).toHaveTransaction({
            from: minter.address,
            to: admin.address,
            success: true,
        });

        // Minter balance should be reduced (keeping MINTER_MIN_RESERVE)
        const balanceAfter = await minter.getBalance();
        expect(balanceAfter).toBeLessThan(MINTER_MIN_RESERVE * 2n);
    });

    it('should reject admin claim from non-admin (ERROR_NOT_ADMIN)', async () => {
        const attacker = await blockchain.treasury('attacker');

        // Send some TON to minter first
        await user.send({
            to: minter.address,
            value: toNano('5'),
            body: beginCell().endCell(),
        });

        // Attacker tries to claim
        const claimResult = await minter.sendAdminClaim(attacker.getSender(), toNano('0.05'));

        expect(claimResult.transactions).toHaveTransaction({
            from: attacker.address,
            to: minter.address,
            success: false,
            exitCode: 207, // ERROR_NOT_ADMIN
        });
    });

    it('should reject admin claim with insufficient balance (ERROR_NOT_ENOUGH_BALANCE)', async () => {
        // Create a NEW minter with different startTime to get a unique address
        const uniqueStartTime = startTime + 9999n;
        const minimalMinter = blockchain.openContract(Minter.createFromConfig({
            adminAddress: admin.address,
            collectionAddress: collection.address,
            servicePublicKey: convertPublicKeyToBigInt(keys.publicKey),
            startTime: uniqueStartTime, // Different startTime = different address
            minterItemCode: minterItemCode,
        }, minterCode));

        // Deploy with minimal TON - just enough for contract creation
        await minimalMinter.sendDeploy(admin.getSender(), MIN_TONS_FOR_STORAGE);

        // Try to claim when balance < MINTER_MIN_RESERVE
        // getOriginalBalance() includes incoming message value
        // Total balance will be less than MINTER_MIN_RESERVE
        const claimResult = await minimalMinter.sendAdminClaim(admin.getSender(), MIN_TONS_FOR_STORAGE);

        expect(claimResult.transactions).toHaveTransaction({
            from: admin.address,
            to: minimalMinter.address,
            success: false,
            exitCode: 208, // ERROR_NOT_ENOUGH_BALANCE
        });
    });
});

describe('Gas Usage Analysis', () => {
    let minterCode: Cell;
    let minterItemCode: Cell;

    beforeAll(async () => {
        minterCode = await compile('Minter');
        minterItemCode = await compile('MinterItem');
    });

    // Helper to format gas to TON
    const formatTon = (nanotons: bigint): string => {
        const ton = Number(nanotons) / 1e9;
        return `${ton.toFixed(6)} TON (${nanotons} nanoTON)`;
    };

    it('should calculate gas for full mint flow', async () => {
        const blockchain = await Blockchain.create();
        const admin = await blockchain.treasury('admin');
        const collection = await blockchain.treasury('collection');
        const user = await blockchain.treasury('user');
        const keys = nacl.sign.keyPair();
        const startTime = BigInt(Math.floor(Date.now() / 1000));

        // Deploy Minter
        const minter = blockchain.openContract(Minter.createFromConfig({
            adminAddress: admin.address,
            collectionAddress: collection.address,
            servicePublicKey: convertPublicKeyToBigInt(keys.publicKey),
            startTime: startTime,
            minterItemCode: minterItemCode,
        }, minterCode));

        const minterDeployResult = await minter.sendDeploy(admin.getSender(), toNano('0.5'));
        const minterDeployFee = minterDeployResult.transactions[1]?.totalFees?.coins ?? 0n;

        const content = beginCell().storeStringTail('https://example.com/nft.json').endCell();
        const price = toNano('1');

        const minterItem = blockchain.openContract(MinterItem.createFromConfig({
            isMinted: false,
            startTime: startTime,
            price: price,
            minterAddress: minter.address,
            ownerAddress: user.address,
            servicePublicKey: convertPublicKeyToBigInt(keys.publicKey),
            contentNftItem: content,
        }, minterItemCode));

        const dataHash = hashContentWithPrice(content, price);
        const signature = BigInt('0x' + Buffer.from(nacl.sign.detached(dataHash, keys.secretKey)).toString('hex'));
        const mintResult = await minterItem.sendDeployWithMint(user.getSender(), toNano('2'), signature);

        // Calculate fees for each step
        let totalGas = 0n;
        const gasBreakdown: { step: string; fee: bigint }[] = [];

        for (const tx of mintResult.transactions) {
            if (tx.totalFees?.coins) {
                totalGas += tx.totalFees.coins;
            }
        }

        // Find specific transactions
        const minterItemTx = mintResult.transactions.find(
            tx => tx.inMessage?.info.type === 'internal' &&
                  tx.inMessage.info.dest.equals(minterItem.address) &&
                  tx.description.type === 'generic'
        );
        const minterTx = mintResult.transactions.find(
            tx => tx.inMessage?.info.type === 'internal' &&
                  tx.inMessage.info.dest.equals(minter.address) &&
                  tx.description.type === 'generic'
        );
        const collectionTx = mintResult.transactions.find(
            tx => tx.inMessage?.info.type === 'internal' &&
                  tx.inMessage.info.dest.equals(collection.address) &&
                  tx.description.type === 'generic'
        );

        console.log('\n========== GAS USAGE REPORT ==========\n');
        console.log('1 gas unit = 400 nanoTON (BaseChain)\n');

        console.log('--- Minter Contract Deploy ---');
        console.log(`   Fee: ${formatTon(minterDeployFee)}`);

        console.log('\n--- Full Mint Flow ---');

        if (minterItemTx?.totalFees?.coins) {
            console.log(`   MinterItem Deploy + Mint: ${formatTon(minterItemTx.totalFees.coins)}`);
            gasBreakdown.push({ step: 'MinterItem Deploy + Mint', fee: minterItemTx.totalFees.coins });
        }

        if (minterTx?.totalFees?.coins) {
            console.log(`   Minter Process: ${formatTon(minterTx.totalFees.coins)}`);
            gasBreakdown.push({ step: 'Minter Process', fee: minterTx.totalFees.coins });
        }

        if (collectionTx?.totalFees?.coins) {
            console.log(`   Collection Receive: ${formatTon(collectionTx.totalFees.coins)}`);
            gasBreakdown.push({ step: 'Collection Receive', fee: collectionTx.totalFees.coins });
        }

        console.log('\n--- TOTAL ---');
        console.log(`   Minter Deploy: ${formatTon(minterDeployFee)}`);
        console.log(`   Full Mint Flow: ${formatTon(totalGas)}`);
        console.log(`   Combined Total: ${formatTon(minterDeployFee + totalGas)}`);

        console.log('\n--- Recommended Values ---');
        console.log(`   Min value for mint tx: ${formatTon(totalGas + MINTER_MIN_RESERVE + NFT_DEPLOY_AMOUNT)} (with reserves)`);
        console.log('\n=======================================\n');

        // Assertions to ensure gas is reasonable
        expect(totalGas).toBeLessThan(MINTER_MIN_RESERVE * 2n); // Total gas should be less than 2x reserve
        expect(minterDeployFee).toBeLessThan(MINTER_MIN_RESERVE); // Deploy should be less than reserve
    });

    it('should calculate gas for admin claim', async () => {
        const blockchain = await Blockchain.create();
        const admin = await blockchain.treasury('admin');
        const collection = await blockchain.treasury('collection');
        const user = await blockchain.treasury('user');
        const keys = nacl.sign.keyPair();
        const startTime = BigInt(Math.floor(Date.now() / 1000));

        const minter = blockchain.openContract(Minter.createFromConfig({
            adminAddress: admin.address,
            collectionAddress: collection.address,
            servicePublicKey: convertPublicKeyToBigInt(keys.publicKey),
            startTime: startTime,
            minterItemCode: minterItemCode,
        }, minterCode));

        await minter.sendDeploy(admin.getSender(), toNano('5'));

        const claimResult = await minter.sendAdminClaim(admin.getSender(), toNano('0.05'));

        let totalGas = 0n;
        for (const tx of claimResult.transactions) {
            if (tx.totalFees?.coins) {
                totalGas += tx.totalFees.coins;
            }
        }

        const formatTon = (nanotons: bigint): string => {
            const ton = Number(nanotons) / 1e9;
            return `${ton.toFixed(6)} TON (${nanotons} nanoTON)`;
        };

        console.log('\n========== ADMIN CLAIM GAS ==========\n');
        console.log(`   Total Fee: ${formatTon(totalGas)}`);
        console.log('\n======================================\n');

        expect(totalGas).toBeLessThan(MIN_TONS_FOR_STORAGE * 2n);
    });
});
