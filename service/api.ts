import http from 'http';
import { URL } from 'url';
import { Address, Cell, toNano } from '@ton/ton';
import { KeyPair, publicKeyToBigInt, displayKeyInfo } from './keys';
import { generateSignedNftForUser, createNftContent } from './signing';
import {
    prepareMintDataForUser,
    calculateMinterItemAddress,
    calculateMinterItemStateInit,
    createTonClient,
    isContractDeployed,
} from './contracts';
import { ServiceConfig, parsePrice } from './config';

export interface ApiContext {
    keys: KeyPair;
    config: ServiceConfig;
    minterItemCode: Cell;
}

type RequestHandler = (
    ctx: ApiContext,
    req: http.IncomingMessage,
    body: any
) => Promise<any>;

const routes: Record<string, RequestHandler> = {};

// Register route handler
function route(path: string, handler: RequestHandler) {
    routes[path] = handler;
}

// Parse JSON body
async function parseBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => (data += chunk));
        req.on('end', () => {
            try {
                resolve(data ? JSON.parse(data) : {});
            } catch (e) {
                reject(new Error('Invalid JSON'));
            }
        });
        req.on('error', reject);
    });
}

// === API Routes ===

// GET /health - Health check
route('/health', async () => ({ status: 'ok', timestamp: Date.now() }));

// GET /info - Service info
route('/info', async (ctx) => ({
    publicKey: Buffer.from(ctx.keys.publicKey).toString('hex'),
    publicKeyBigInt: publicKeyToBigInt(ctx.keys.publicKey).toString(),
    network: ctx.config.network,
    minterAddress: ctx.config.minterAddress,
    collectionAddress: ctx.config.collectionAddress,
    startTime: ctx.config.startTime,
    defaultPrice: ctx.config.defaultPrice.toString(),
    defaultPriceFormatted: (Number(ctx.config.defaultPrice) / 1e9).toFixed(2) + ' TON',
}));

// POST /sign - Sign NFT content and return mint data
route('/sign', async (ctx, req, body) => {
    const { ownerAddress, metadataUrl, price: priceStr } = body;

    if (!ownerAddress || !metadataUrl) {
        throw new Error('Missing required fields: ownerAddress, metadataUrl');
    }

    if (!ctx.config.minterAddress) {
        throw new Error('Minter address not configured');
    }

    const owner = Address.parse(ownerAddress);
    const minter = Address.parse(ctx.config.minterAddress);
    const publicKey = publicKeyToBigInt(ctx.keys.publicKey);
    const price = parsePrice(priceStr, ctx.config.defaultPrice);

    // Generate signed NFT data (signs hash(content + price))
    const signedData = generateSignedNftForUser(ctx.keys, metadataUrl, price);

    // Prepare full mint data for user
    const mintData = prepareMintDataForUser(
        owner,
        minter,
        publicKey,
        ctx.config.startTime,
        price,
        signedData.content,
        signedData.signature,
        ctx.minterItemCode
    );

    return {
        success: true,
        data: {
            ...mintData,
            metadataUrl,
            ownerAddress: owner.toString(),
            dataHash: signedData.dataHash.toString('hex'),
        },
    };
});

// POST /calculate-address - Calculate MinterItem address without signing
route('/calculate-address', async (ctx, req, body) => {
    const { ownerAddress, metadataUrl, price: priceStr } = body;

    if (!ownerAddress || !metadataUrl) {
        throw new Error('Missing required fields: ownerAddress, metadataUrl');
    }

    if (!ctx.config.minterAddress) {
        throw new Error('Minter address not configured');
    }

    const owner = Address.parse(ownerAddress);
    const minter = Address.parse(ctx.config.minterAddress);
    const publicKey = publicKeyToBigInt(ctx.keys.publicKey);
    const price = parsePrice(priceStr, ctx.config.defaultPrice);
    const content = createNftContent(metadataUrl);

    const address = calculateMinterItemAddress(
        owner,
        minter,
        publicKey,
        ctx.config.startTime,
        price,
        content,
        ctx.minterItemCode
    );

    return {
        minterItemAddress: address.toString(),
        ownerAddress: owner.toString(),
        metadataUrl,
        price: price.toString(),
        priceFormatted: (Number(price) / 1e9).toFixed(2) + ' TON',
    };
});

// POST /verify-deployment - Check if MinterItem is deployed
route('/verify-deployment', async (ctx, req, body) => {
    const { minterItemAddress } = body;

    if (!minterItemAddress) {
        throw new Error('Missing required field: minterItemAddress');
    }

    const client = createTonClient(ctx.config.network, ctx.config.toncenterApiKey);
    const address = Address.parse(minterItemAddress);
    const deployed = await isContractDeployed(client, address);

    return {
        address: minterItemAddress,
        deployed,
    };
});

// POST /batch-sign - Sign multiple NFTs
route('/batch-sign', async (ctx, req, body) => {
    const { items } = body;

    if (!items || !Array.isArray(items)) {
        throw new Error('Missing required field: items (array of {ownerAddress, metadataUrl, price?})');
    }

    if (!ctx.config.minterAddress) {
        throw new Error('Minter address not configured');
    }

    const minter = Address.parse(ctx.config.minterAddress);
    const publicKey = publicKeyToBigInt(ctx.keys.publicKey);

    const results = items.map((item: { ownerAddress: string; metadataUrl: string; price?: string }) => {
        const owner = Address.parse(item.ownerAddress);
        const price = parsePrice(item.price, ctx.config.defaultPrice);
        const signedData = generateSignedNftForUser(ctx.keys, item.metadataUrl, price);

        const mintData = prepareMintDataForUser(
            owner,
            minter,
            publicKey,
            ctx.config.startTime,
            price,
            signedData.content,
            signedData.signature,
            ctx.minterItemCode
        );

        return {
            ...mintData,
            metadataUrl: item.metadataUrl,
            ownerAddress: owner.toString(),
        };
    });

    return { success: true, count: results.length, items: results };
});

// Create HTTP server
export function createServer(ctx: ApiContext): http.Server {
    const server = http.createServer(async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        try {
            const url = new URL(req.url || '/', `http://${req.headers.host}`);
            const path = url.pathname;
            const handler = routes[path];

            if (!handler) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Not found', path }));
                return;
            }

            const body = req.method === 'POST' ? await parseBody(req) : {};
            const result = await handler(ctx, req, body);

            res.writeHead(200);
            res.end(JSON.stringify(result, null, 2));
        } catch (error: any) {
            console.error('API Error:', error.message);
            res.writeHead(400);
            res.end(JSON.stringify({ error: error.message }));
        }
    });

    return server;
}

// Start server
export function startServer(ctx: ApiContext): void {
    const server = createServer(ctx);
    server.listen(ctx.config.port, () => {
        console.log(`\nNFT Minter Service running on http://localhost:${ctx.config.port}`);
        console.log('\nAvailable endpoints:');
        console.log('  GET  /health           - Health check');
        console.log('  GET  /info             - Service info');
        console.log('  POST /sign             - Sign NFT and get mint data');
        console.log('  POST /calculate-address - Calculate MinterItem address');
        console.log('  POST /verify-deployment - Check if contract is deployed');
        console.log('  POST /batch-sign       - Sign multiple NFTs');
        console.log(`\nDefault price: ${(Number(ctx.config.defaultPrice) / 1e9).toFixed(2)} TON`);
        displayKeyInfo(ctx.keys);
    });
}
