import { Address, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { NFTCollection } from '../wrappers/02_nft/NFTCollection';

export async function run(provider: NetworkProvider) {
    const collectionAddress = process.env.COLLECTION_ADDRESS;
    const minterAddress = process.env.MINTER_ADDRESS;

    if (!collectionAddress) {
        console.error('Error: COLLECTION_ADDRESS environment variable is required');
        console.log('\nUsage:');
        console.log('  COLLECTION_ADDRESS=EQxxx MINTER_ADDRESS=EQyyy npx blueprint run transferCollectionOwnership --testnet');
        process.exit(1);
    }

    if (!minterAddress) {
        console.error('Error: MINTER_ADDRESS environment variable is required');
        console.log('\nUsage:');
        console.log('  COLLECTION_ADDRESS=EQxxx MINTER_ADDRESS=EQyyy npx blueprint run transferCollectionOwnership --testnet');
        process.exit(1);
    }

    const collection = provider.open(NFTCollection.createFromAddress(Address.parse(collectionAddress)));
    const newOwner = Address.parse(minterAddress);

    // Get current collection data
    console.log('\n=== Collection Ownership Transfer ===\n');
    console.log('Collection address:', collectionAddress);
    console.log('New owner (Minter):', minterAddress);

    try {
        const collectionData = await collection.getCollectionData();
        console.log('\nCurrent owner:', collectionData.ownerAddress.toString());
        console.log('Next item index:', collectionData.nextItemIndex);

        if (collectionData.ownerAddress.equals(newOwner)) {
            console.log('\nCollection is already owned by the Minter!');
            return;
        }
    } catch (e) {
        console.log('\nWarning: Could not fetch collection data (contract may not be deployed yet)');
    }

    console.log('\nSending ownership transfer transaction...');

    await collection.sendChangeOwner(provider.sender(), {
        value: toNano('0.05'),
        newOwner: newOwner,
    });

    console.log('\nTransaction sent! Waiting for confirmation...');

    // Wait a bit and check new owner
    await new Promise(resolve => setTimeout(resolve, 10000));

    try {
        const newCollectionData = await collection.getCollectionData();
        if (newCollectionData.ownerAddress.equals(newOwner)) {
            console.log('\nOwnership transferred successfully!');
            console.log('New owner:', newCollectionData.ownerAddress.toString());
        } else {
            console.log('\nOwnership transfer may still be pending. Current owner:', newCollectionData.ownerAddress.toString());
        }
    } catch (e) {
        console.log('\nCould not verify ownership transfer. Please check the transaction on explorer.');
    }
}
