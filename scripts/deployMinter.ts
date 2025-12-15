import { Address, toNano } from '@ton/core';
import { Minter } from '../wrappers/Minter';
import { compile, NetworkProvider } from '@ton/blueprint';
import { getOrCreateKeyPair, publicKeyToBigInt, displayKeyInfo } from '../service/keys';
import path from 'path';

export async function run(provider: NetworkProvider) {
    // Load service keys
    const keysPath = path.join(__dirname, '../service/.keys.json');
    const keys = getOrCreateKeyPair(keysPath);

    console.log('\n=== Deploying Minter Contract ===');
    displayKeyInfo(keys);

    const adminAddress = provider.sender().address;
    if (!adminAddress) {
        throw new Error('Wallet address not found');
    }

    // Set COLLECTION_ADDRESS before running
    const collectionAddress = process.env.COLLECTION_ADDRESS;
    if (!collectionAddress) {
        throw new Error('COLLECTION_ADDRESS environment variable not set. Deploy NFTCollection first.');
    }

    // Start with minting enabled by default, can be toggled by admin later
    const isMintEnabled = process.env.MINT_ENABLED !== 'false';

    console.log('\nConfiguration:');
    console.log('  Admin:', adminAddress.toString());
    console.log('  Collection:', collectionAddress);
    console.log('  Mint Enabled:', isMintEnabled);
    console.log('  Service Public Key:', publicKeyToBigInt(keys.publicKey).toString());

    const minterCode = await compile('Minter');
    const minterItemCode = await compile('MinterItem');

    const minter = provider.open(
        Minter.createFromConfig(
            {
                adminAddress: adminAddress,
                collectionAddress: Address.parse(collectionAddress),
                servicePublicKey: publicKeyToBigInt(keys.publicKey),
                isMintEnabled: isMintEnabled,
                minterItemCode: minterItemCode,
            },
            minterCode
        )
    );

    console.log('\nMinter Address:', minter.address.toString());

    await minter.sendDeploy(provider.sender(), toNano('0.1'));
    await provider.waitForDeploy(minter.address);

    console.log('\n=== Deployment Complete ===');
    console.log('Minter deployed at:', minter.address.toString());
    console.log('\nSet these environment variables for service:');
    console.log(`  export MINTER_ADDRESS="${minter.address.toString()}"`);
    console.log(`  export COLLECTION_ADDRESS="${collectionAddress}"`);
}
