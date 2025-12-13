import { Address, toNano } from '@ton/core';
import { MinterItem } from '../wrappers/MinterItem';
import { compile, NetworkProvider } from '@ton/blueprint';
import { getOrCreateKeyPair, publicKeyToBigInt, displayKeyInfo } from '../service/keys';
import { generateSignedNftForUser } from '../service/signing';
import path from 'path';

export async function run(provider: NetworkProvider) {
    // Load service keys
    const keysPath = path.join(__dirname, '../service/.keys.json');
    const keys = getOrCreateKeyPair(keysPath);

    console.log('\n=== Deploy and Mint MinterItem ===');
    displayKeyInfo(keys);

    const ownerAddress = provider.sender().address;
    if (!ownerAddress) {
        throw new Error('Wallet address not found');
    }

    const minterAddress = process.env.MINTER_ADDRESS;
    if (!minterAddress) {
        throw new Error('MINTER_ADDRESS environment variable not set');
    }

    const startTime = process.env.START_TIME
        ? parseInt(process.env.START_TIME)
        : Math.floor(Date.now() / 1000);

    // NFT metadata URL (change this for each NFT)
    const metadataUrl = process.env.METADATA_URL || 'https://example.com/nft/1.json';

    console.log('\nConfiguration:');
    console.log('  Owner:', ownerAddress.toString());
    console.log('  Minter:', minterAddress);
    console.log('  Start Time:', new Date(startTime * 1000).toISOString());
    console.log('  Metadata URL:', metadataUrl);

    // Generate signed NFT data
    const signedData = generateSignedNftForUser(keys, metadataUrl);
    console.log('\nSignature:', signedData.signatureHex);
    console.log('Content Hash:', signedData.contentHash.toString('hex'));

    const minterItemCode = await compile('MinterItem');

    const minterItem = provider.open(
        MinterItem.createFromConfig(
            {
                isMinted: false,
                startTime: BigInt(startTime),
                minterAddress: Address.parse(minterAddress),
                ownerAddress: ownerAddress,
                servicePublicKey: publicKeyToBigInt(keys.publicKey),
                contentNftItem: signedData.content,
            },
            minterItemCode
        )
    );

    console.log('\nMinterItem Address:', minterItem.address.toString());

    // Calculate price based on time passed
    const now = Math.floor(Date.now() / 1000);
    const daysPassed = Math.floor((now - startTime) / 86400);
    const prices = [1, 2, 3, 5, 8, 10, 15, 20];
    const priceIndex = Math.min(daysPassed, 7);
    const price = prices[priceIndex];

    console.log(`\nDays since start: ${daysPassed}`);
    console.log(`Current price: ${price} TON`);

    // Deploy and mint
    await minterItem.sendDeployWithMint(
        provider.sender(),
        toNano(price.toString()),
        signedData.signature
    );

    await provider.waitForDeploy(minterItem.address);

    console.log('\n=== Mint Complete ===');
    console.log('MinterItem deployed at:', minterItem.address.toString());
}
