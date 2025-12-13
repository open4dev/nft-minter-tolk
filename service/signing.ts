import nacl from 'tweetnacl';
import { Cell, beginCell } from '@ton/core';
import { KeyPair } from './keys';

export interface SignedNFTData {
    content: Cell;
    price: bigint;
    dataHash: Buffer;
    signature: bigint;
    signatureHex: string;
}

/**
 * Create NFT content cell from metadata URL
 */
export function createNftContent(metadataUrl: string): Cell {
    return beginCell()
        .storeUint(0x01, 8) // off-chain content prefix
        .storeStringTail(metadataUrl)
        .endCell();
}

/**
 * Create NFT content cell with on-chain metadata
 */
export function createOnChainNftContent(metadata: {
    name?: string;
    description?: string;
    image?: string;
    attributes?: Record<string, string>;
}): Cell {
    // Simple on-chain content (prefix 0x00)
    const contentBuilder = beginCell().storeUint(0x00, 8);

    // For full on-chain, you'd build a dictionary
    // This is a simplified version storing JSON as string
    const jsonStr = JSON.stringify(metadata);
    contentBuilder.storeStringTail(jsonStr);

    return contentBuilder.endCell();
}

/**
 * Hash content + price (must match contract's hashContentWithPrice)
 */
export function hashContentWithPrice(content: Cell, price: bigint): Buffer {
    const cell = beginCell()
        .storeRef(content)
        .storeCoins(price)
        .endCell();
    return cell.hash();
}

/**
 * Sign NFT content + price with service private key
 * Returns signature as BigInt (512 bits)
 */
export function signContentWithPrice(content: Cell, price: bigint, secretKey: Uint8Array): SignedNFTData {
    const dataHash = hashContentWithPrice(content, price);
    const signatureBytes = nacl.sign.detached(dataHash, secretKey);
    const signatureHex = Buffer.from(signatureBytes).toString('hex');
    const signature = BigInt('0x' + signatureHex);

    return {
        content,
        price,
        dataHash,
        signature,
        signatureHex,
    };
}

/**
 * Verify signature (for testing purposes)
 */
export function verifySignature(
    content: Cell,
    price: bigint,
    signature: bigint,
    publicKey: Uint8Array
): boolean {
    const dataHash = hashContentWithPrice(content, price);
    const signatureHex = signature.toString(16).padStart(128, '0');
    const signatureBytes = new Uint8Array(Buffer.from(signatureHex, 'hex'));
    return nacl.sign.detached.verify(dataHash, signatureBytes, publicKey);
}

/**
 * Generate signed NFT data for a user
 */
export function generateSignedNftForUser(
    keys: KeyPair,
    metadataUrl: string,
    price: bigint
): SignedNFTData {
    const content = createNftContent(metadataUrl);
    return signContentWithPrice(content, price, keys.secretKey);
}

/**
 * Batch sign multiple NFTs
 */
export function batchSignNfts(
    keys: KeyPair,
    items: Array<{ metadataUrl: string; price: bigint }>
): SignedNFTData[] {
    return items.map((item) => generateSignedNftForUser(keys, item.metadataUrl, item.price));
}
