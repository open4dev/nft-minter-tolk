import { beginCell, Cell, toNano } from '@ton/core';

// Gas fee constants (must match contracts/nft_minter/fees-management.tolk)
export const MIN_TONS_FOR_STORAGE = toNano('0.02');
export const NFT_DEPLOY_AMOUNT = toNano('0.05');

export const convertPublicKeyToBigInt = (publicKey: Uint8Array): bigint => {
    const hex = Buffer.from(publicKey).toString('hex');
    return BigInt('0x' + hex);
}

export interface NftCollectionContent {
    uri: string
}

export function nftContentToCell(content: NftCollectionContent): Cell {
    return beginCell()
        .storeRef(
            beginCell()
                .storeUint(0x01, 8) // Content type (off-chain)
                .storeStringTail(content.uri)
                .endCell()
        )
        .endCell();
}
