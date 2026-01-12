import { beginCell, toNano } from '@ton/core';
import { compile, NetworkProvider } from '@ton/blueprint';
import { NFTCollection } from '../wrappers/02_nft/NFTCollection';
import { nftContentToCell } from '../wrappers/utils';

// ========== CONFIGURE THESE ==========
const COLLECTION_METADATA_URI = 'https://raw.githubusercontent.com/open4dev/open4dev-bot/main/public/collection.json';
const COMMON_CONTENT_BASE = ''; // Empty = NFT stores full URL, or set base like 'https://example.com/nfts/'
// =====================================

export async function run(provider: NetworkProvider) {
    const collection = provider.open(NFTCollection.createFromConfig(
        {
            ownerAddress: provider.sender().address!!,
            nextItemIndex: 0,
            nftItemCode: await compile('NftItem'),
            royaltyParams: beginCell().endCell(),
            content: nftContentToCell({
                collectionMetadataUri: COLLECTION_METADATA_URI,
                commonContentBase: COMMON_CONTENT_BASE,
            })
    }, await compile('NftCollection')));

    await collection.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(collection.address);

    console.log('Collection deployed at:', collection.address.toString());
}
