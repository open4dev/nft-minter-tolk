import http from 'http';
import { toNano } from '@ton/core';
import { compile } from '@ton/blueprint';
import { createServer, ApiContext } from '../service/api';
import * as keysModule from '../service/keys';
import * as contracts from '../service/contracts';
import { Blockchain } from '@ton/sandbox';

// Helper to perform HTTP requests against a started server
function httpRequest(port: number, path: string, method: string = 'GET', body?: unknown): Promise<{ status: number; body: unknown }> {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : undefined;
        const headers: Record<string, string | number> = {
            'Content-Type': 'application/json',
        };

        if (data) {
            headers['Content-Length'] = Buffer.byteLength(data);
        }

        const req = http.request(
            {
                hostname: '127.0.0.1',
                port,
                path,
                method,
                headers,
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => {
                    const raw = Buffer.concat(chunks).toString('utf-8');
                    let parsed: unknown;
                    try {
                        parsed = JSON.parse(raw);
                    } catch {
                        parsed = raw;
                    }
                    resolve({ status: res.statusCode ?? 0, body: parsed });
                });
            }
        );

        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

describe('Service REST API', () => {
    let server: http.Server;
    let port: number;
    let blockchain: Blockchain;

    beforeAll(async () => {
        // Compile contract code required by API
        const minterItemCode = await compile('MinterItem');

        // Create a lightweight blockchain to obtain valid addresses
        blockchain = await Blockchain.create();
        const admin = await blockchain.treasury('admin');
        const user = await blockchain.treasury('user');

        // Generate ephemeral keys (do not persist to disk in tests)
        const keys = keysModule.generateKeyPair();

        // Create ApiContext
        const ctx: ApiContext = {
            keys,
            config: {
                network: 'testnet',
                toncenterApiKey: undefined,
                minterAddress: admin.address.toString(),
                collectionAddress: undefined,
                defaultPrice: toNano('1'),
                port: 0,
            },
            minterItemCode,
        };

        // Spy on isContractDeployed to avoid network calls
        jest.spyOn(contracts, 'isContractDeployed').mockImplementation(async () => true);

        server = createServer(ctx);
        await new Promise<void>((resolve) => {
            server.listen(0, () => {
                const addr = server.address();
                port = typeof addr === 'object' && addr ? addr.port : 0;
                resolve();
            });
        });
    });

    afterAll(async () => {
        jest.restoreAllMocks();
        if (server) {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });

    it('GET /health returns ok', async () => {
        const res = await httpRequest(port, '/health');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('status', 'ok');
        expect(res.body).toHaveProperty('timestamp');
    });

    it('GET /info returns service info', async () => {
        const res = await httpRequest(port, '/info');
        expect(res.status).toBe(200);
        const body = res.body as Record<string, unknown>;
        expect(body).toHaveProperty('publicKey');
        expect(body).toHaveProperty('network');
        expect(body.network).toBe('testnet');
    });

    it('POST /calculate-address returns deterministic address and price formatting', async () => {
        const owner = (await blockchain.treasury('owner')).address;
        const reqBody = {
            ownerAddress: owner.toString(),
            metadataUrl: 'https://example.com/nft.json',
            price: '1',
        };

        const res = await httpRequest(port, '/calculate-address', 'POST', reqBody);
        expect(res.status).toBe(200);
        const body = res.body as Record<string, unknown>;
        expect(body).toHaveProperty('minterItemAddress');
        expect(body).toHaveProperty('ownerAddress', owner.toString());
        expect(body).toHaveProperty('price');
        expect(body).toHaveProperty('priceFormatted');
        expect(body.priceFormatted).toMatch(/TON$/);
    });

    it('POST /sign returns mint data and signature', async () => {
        const owner = (await blockchain.treasury('owner2')).address;
        const reqBody = {
            ownerAddress: owner.toString(),
            metadataUrl: 'https://example.com/nft.json',
            price: '1',
        };

        const res = await httpRequest(port, '/sign', 'POST', reqBody);
        expect(res.status).toBe(200);
        const body = res.body as Record<string, unknown>;
        expect(body).toHaveProperty('success', true);
        expect(body).toHaveProperty('data');
        const data = body.data as Record<string, unknown>;
        expect(data).toHaveProperty('minterItemAddress');
        expect(data).toHaveProperty('stateInit');
        expect(data).toHaveProperty('messageBody');
        expect(data).toHaveProperty('signature');
        expect(data).toHaveProperty('content');
        expect(data).toHaveProperty('price');
    });

    it('POST /batch-sign signs multiple items', async () => {
        const ownerA = (await blockchain.treasury('ownerA')).address;
        const ownerB = (await blockchain.treasury('ownerB')).address;
        const reqBody = {
            items: [
                { ownerAddress: ownerA.toString(), metadataUrl: 'https://a.example/nft.json', price: '1' },
                { ownerAddress: ownerB.toString(), metadataUrl: 'https://b.example/nft.json', price: '2' },
            ],
        };

        const res = await httpRequest(port, '/batch-sign', 'POST', reqBody);
        expect(res.status).toBe(200);
        const body = res.body as Record<string, unknown>;
        expect(body).toHaveProperty('success', true);
        expect(body).toHaveProperty('count', 2);
        expect(body).toHaveProperty('items');
        expect(Array.isArray(body.items)).toBe(true);
        expect((body.items as unknown[]).length).toBe(2);
    });

    it('POST /verify-deployment returns deployed true (mocked)', async () => {
        const addr = (await blockchain.treasury('check')).address;
        const res = await httpRequest(port, '/verify-deployment', 'POST', { minterItemAddress: addr.toString() });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('address', addr.toString());
        expect(res.body).toHaveProperty('deployed', true);
    });

    // === Negative test cases ===

    it('GET /unknown returns 404', async () => {
        const res = await httpRequest(port, '/unknown-endpoint');
        expect(res.status).toBe(404);
        const body = res.body as Record<string, unknown>;
        expect(body).toHaveProperty('error', 'Not found');
        expect(body).toHaveProperty('path', '/unknown-endpoint');
    });

    it('POST /sign with missing ownerAddress returns 400', async () => {
        const res = await httpRequest(port, '/sign', 'POST', {
            metadataUrl: 'https://example.com/nft.json',
        });
        expect(res.status).toBe(400);
        const body = res.body as Record<string, unknown>;
        expect(body).toHaveProperty('error');
        expect(body.error).toMatch(/missing required fields/i);
    });

    it('POST /sign with missing metadataUrl returns 400', async () => {
        const owner = (await blockchain.treasury('neg1')).address;
        const res = await httpRequest(port, '/sign', 'POST', {
            ownerAddress: owner.toString(),
        });
        expect(res.status).toBe(400);
        const body = res.body as Record<string, unknown>;
        expect(body).toHaveProperty('error');
        expect(body.error).toMatch(/missing required fields/i);
    });

    it('POST /sign with invalid address format returns 400', async () => {
        const res = await httpRequest(port, '/sign', 'POST', {
            ownerAddress: 'not-a-valid-address',
            metadataUrl: 'https://example.com/nft.json',
        });
        expect(res.status).toBe(400);
        const body = res.body as Record<string, unknown>;
        expect(body).toHaveProperty('error');
    });

    it('POST /calculate-address with missing fields returns 400', async () => {
        const res = await httpRequest(port, '/calculate-address', 'POST', {});
        expect(res.status).toBe(400);
        const body = res.body as Record<string, unknown>;
        expect(body).toHaveProperty('error');
        expect(body.error).toMatch(/missing required fields/i);
    });

    it('POST /verify-deployment with missing minterItemAddress returns 400', async () => {
        const res = await httpRequest(port, '/verify-deployment', 'POST', {});
        expect(res.status).toBe(400);
        const body = res.body as Record<string, unknown>;
        expect(body).toHaveProperty('error');
        expect(body.error).toMatch(/missing required field/i);
    });

    it('POST /batch-sign with missing items returns 400', async () => {
        const res = await httpRequest(port, '/batch-sign', 'POST', {});
        expect(res.status).toBe(400);
        const body = res.body as Record<string, unknown>;
        expect(body).toHaveProperty('error');
        expect(body.error).toMatch(/missing required field.*items/i);
    });

    it('POST /batch-sign with non-array items returns 400', async () => {
        const res = await httpRequest(port, '/batch-sign', 'POST', { items: 'not-an-array' });
        expect(res.status).toBe(400);
        const body = res.body as Record<string, unknown>;
        expect(body).toHaveProperty('error');
        expect(body.error).toMatch(/items/i);
    });

    it('POST /batch-sign with invalid item address returns 400', async () => {
        const res = await httpRequest(port, '/batch-sign', 'POST', {
            items: [{ ownerAddress: 'invalid', metadataUrl: 'https://example.com/nft.json' }],
        });
        expect(res.status).toBe(400);
        const body = res.body as Record<string, unknown>;
        expect(body).toHaveProperty('error');
    });

    it('POST with invalid JSON returns 400', async () => {
        // Send raw malformed JSON
        const res = await new Promise<{ status: number; body: unknown }>((resolve, reject) => {
            const req = http.request(
                {
                    hostname: '127.0.0.1',
                    port,
                    path: '/sign',
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                },
                (response) => {
                    const chunks: Buffer[] = [];
                    response.on('data', (chunk) => chunks.push(chunk));
                    response.on('end', () => {
                        const raw = Buffer.concat(chunks).toString('utf-8');
                        let parsed: unknown;
                        try {
                            parsed = JSON.parse(raw);
                        } catch {
                            parsed = raw;
                        }
                        resolve({ status: response.statusCode ?? 0, body: parsed });
                    });
                }
            );
            req.on('error', reject);
            req.write('{ invalid json }');
            req.end();
        });

        expect(res.status).toBe(400);
        const body = res.body as Record<string, unknown>;
        expect(body).toHaveProperty('error', 'Invalid JSON');
    });
});
