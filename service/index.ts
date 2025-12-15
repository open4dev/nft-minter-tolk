import { Cell, toNano } from '@ton/core';
import { getOrCreateKeyPair, displayKeyInfo, publicKeyToBigInt } from './keys';
import { defaultConfig, ServiceConfig, parsePrice } from './config';
import { startServer, ApiContext } from './api';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Load .env file from service directory
dotenv.config({ path: path.join(__dirname, '.env') });

/**
 * Load pre-compiled contract from build folder
 */
function loadCompiledContract(name: string): Cell {
    const buildPath = path.join(__dirname, '..', 'build', `${name}.compiled.json`);

    if (!fs.existsSync(buildPath)) {
        throw new Error(
            `Compiled contract not found: ${buildPath}\n` +
            `Run 'npx blueprint build ${name}' from the project root first.`
        );
    }

    const compiled = JSON.parse(fs.readFileSync(buildPath, 'utf-8'));
    return Cell.fromBoc(Buffer.from(compiled.hex, 'hex'))[0];
}

async function main() {
    console.log('=== NFT Minter Service ===\n');

    // Parse CLI arguments
    const args = process.argv.slice(2);
    const command = args[0] || 'serve';

    // Load or create keys
    const keysPath = path.join(__dirname, '.keys.json');
    const keys = getOrCreateKeyPair(keysPath);

    // Load config from environment
    const config: ServiceConfig = {
        ...defaultConfig,
        network: (process.env.NETWORK as 'mainnet' | 'testnet') || 'mainnet',
        toncenterApiKey: process.env.TONCENTER_API_KEY,
        minterAddress: process.env.MINTER_ADDRESS,
        collectionAddress: process.env.COLLECTION_ADDRESS,
        defaultPrice: toNano(process.env.DEFAULT_PRICE || '1'),
        port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
    };

    switch (command) {
        case 'keys':
            // Just display key info
            displayKeyInfo(keys);
            console.log('\nUse this public key when deploying the Minter contract.');
            break;

        case 'serve':
            // Start API server
            console.log('Loading MinterItem contract...');
            const minterItemCode = loadCompiledContract('MinterItem');
            console.log('Contract loaded successfully.\n');

            const ctx: ApiContext = { keys, config, minterItemCode };
            startServer(ctx);
            break;

        case 'sign':
            // CLI signing mode
            const ownerAddress = args[1];
            const metadataUrl = args[2];
            const priceArg = args[3]; // optional price in TON

            if (!ownerAddress || !metadataUrl) {
                console.log('Usage: ts-node index.ts sign <ownerAddress> <metadataUrl> [price]');
                console.log('  price: optional, in TON (default: 1)');
                process.exit(1);
            }

            console.log('Loading MinterItem contract...');
            const code = loadCompiledContract('MinterItem');

            const { generateSignedNftForUser } = await import('./signing');
            const { prepareMintDataForUser } = await import('./contracts');
            const { Address } = await import('@ton/ton');

            if (!config.minterAddress) {
                console.error('Error: MINTER_ADDRESS environment variable not set');
                process.exit(1);
            }

            const price = parsePrice(priceArg, config.defaultPrice);
            const parsedOwnerAddress = Address.parse(ownerAddress);
            const signedData = generateSignedNftForUser(keys, metadataUrl, price, parsedOwnerAddress);
            const mintData = prepareMintDataForUser(
                parsedOwnerAddress,
                Address.parse(config.minterAddress),
                publicKeyToBigInt(keys.publicKey),
                price,
                signedData.content,
                signedData.signature,
                code
            );

            console.log('\n=== Mint Data ===');
            console.log(JSON.stringify(mintData, null, 2));
            break;

        default:
            console.log('Available commands:');
            console.log('  serve  - Start API server (default)');
            console.log('  keys   - Display service public key');
            console.log('  sign   - Sign a single NFT (ts-node index.ts sign <owner> <url> [price])');
            break;
    }
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
