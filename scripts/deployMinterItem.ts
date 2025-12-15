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

    // NFT metadata URL (change this for each NFT)
    const metadataUrl = process.env.METADATA_URL || 'https://example.com/nft/1.json';

    // Price in TON (default 1 TON)
    const priceInTon = process.env.PRICE ? parseFloat(process.env.PRICE) : 1;
    const price = toNano(priceInTon.toString());

    console.log('\nConfiguration:');
    console.log('  Owner:', ownerAddress.toString());
    console.log('  Minter:', minterAddress);
    console.log('  Metadata URL:', metadataUrl);
    console.log('  Price:', priceInTon, 'TON');

    // Generate signed NFT data (signs hash(content + price + ownerAddress))
    const signedData = generateSignedNftForUser(keys, metadataUrl, price, ownerAddress);
    console.log('\nSignature:', signedData.signatureHex);
    console.log('Data Hash:', signedData.dataHash.toString('hex'));

    const minterItemCode = await compile('MinterItem');

    const minterItem = provider.open(
        MinterItem.createFromConfig(
            {
                isMinted: false,
                price: price,
                minterAddress: Address.parse(minterAddress),
                ownerAddress: ownerAddress,
                servicePublicKey: publicKeyToBigInt(keys.publicKey),
                contentNftItem: signedData.content,
            },
            minterItemCode
        )
    );

    console.log('\nMinterItem Address:', minterItem.address.toString());

    // Deploy and mint (send price + gas buffer)
    const gasBuffer = toNano('0.15');
    const totalValue = price + gasBuffer;

    console.log(`\nSending ${(Number(totalValue) / 1e9).toFixed(2)} TON (${priceInTon} TON + gas)`);

    await minterItem.sendDeployWithMint(
        provider.sender(),
        totalValue,
        signedData.signature
    );

    await provider.waitForDeploy(minterItem.address);

    console.log('\n=== Mint Complete ===');
    console.log('MinterItem deployed at:', minterItem.address.toString());
}
