import { Address, toNano } from '@ton/core';

export interface ServiceConfig {
    // Network
    network: 'mainnet' | 'testnet';
    toncenterApiKey?: string;

    // Contract addresses (set after deployment)
    minterAddress?: string;
    collectionAddress?: string;

    // Pricing
    defaultPrice: bigint; // Default NFT price in nanoTON

    // Server
    port: number;
}

export const defaultConfig: ServiceConfig = {
    network: 'mainnet',
    toncenterApiKey: process.env.TONCENTER_API_KEY,
    minterAddress: process.env.MINTER_ADDRESS,
    collectionAddress: process.env.COLLECTION_ADDRESS,
    defaultPrice: toNano(process.env.DEFAULT_PRICE || '1'), // Default 1 TON
    port: parseInt(process.env.PORT || '3000'),
};

export function getEndpoint(network: 'mainnet' | 'testnet'): string {
    return network === 'mainnet'
        ? 'https://toncenter.com/api/v2/jsonRPC'
        : 'https://testnet.toncenter.com/api/v2/jsonRPC';
}

export function validateAddress(address: string): Address {
    return Address.parse(address);
}

export function parsePrice(priceStr: string | undefined, defaultPrice: bigint): bigint {
    if (!priceStr) return defaultPrice;
    // Support both nanoTON (large number) and TON (decimal)
    const num = parseFloat(priceStr);
    if (num < 1000) {
        // Assume it's in TON
        return toNano(priceStr);
    }
    // Assume it's in nanoTON
    return BigInt(priceStr);
}
