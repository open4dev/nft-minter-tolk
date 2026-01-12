import { beginCell, Cell, toNano } from '@ton/core';

// Gas fee constants (must match contracts/nft_minter/fees-management.tolk)
export const MIN_TONS_FOR_STORAGE = toNano('0.02');
export const NFT_DEPLOY_AMOUNT = toNano('0.05');

export const convertPublicKeyToBigInt = (publicKey: Uint8Array): bigint => {
    const hex = Buffer.from(publicKey).toString('hex');
    return BigInt('0x' + hex);
}

export interface NftCollectionContent {
    collectionMetadataUri: string;  // URL to collection metadata JSON
    commonContentBase: string;       // Base URL prefix for NFT items (can be empty)
}

export function nftContentToCell(content: NftCollectionContent): Cell {
    // CollectionContent structure:
    // - collectionMetadata: cell (0x01 + collection JSON URL)
    // - commonContent: Cell<SnakeString> (base URL for NFT items)
    return beginCell()
        .storeRef(
            beginCell()
                .storeUint(0x01, 8) // Off-chain content type
                .storeStringTail(content.collectionMetadataUri)
                .endCell()
        )
        .storeRef(
            beginCell()
                .storeStringTail(content.commonContentBase)
                .endCell()
        )
        .endCell();
}
