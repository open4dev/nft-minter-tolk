import { Address, Cell, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';

const SERVICE_URL = process.env.SERVICE_URL || 'http://localhost:3000';
const NFT_COUNT = parseInt(process.env.NFT_COUNT || '4');
const BASE_METADATA_URL = process.env.BASE_METADATA_URL || 'https://example.com/nft/';
const PRICE = process.env.PRICE || '1';

interface MintData {
    minterItemAddress: string;
    stateInit: string;
    messageBody: string;
    signature: string;
    content: string;
    price: string;
    priceFormatted: string;
    metadataUrl: string;
    ownerAddress: string;
    dataHash: string;
}

interface BatchSignResponse {
    success: boolean;
    count: number;
    items: MintData[];
}

async function batchSign(
    ownerAddress: string,
    items: Array<{ metadataUrl: string; price: string }>
): Promise<MintData[]> {
    console.log(`\nRequesting batch signature for ${items.length} NFTs...`);

    const response = await fetch(`${SERVICE_URL}/batch-sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            items: items.map((item) => ({
                ownerAddress,
                metadataUrl: item.metadataUrl,
                price: item.price,
            })),
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Service error: ${error}`);
    }

    const result: BatchSignResponse = await response.json();
    return result.items;
}

async function waitForDeployment(address: string, maxAttempts = 30): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));

        try {
            const response = await fetch(`${SERVICE_URL}/verify-deployment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ minterItemAddress: address }),
            });
            const result = await response.json();

            if (result.deployed) {
                return true;
            }
            process.stdout.write('.');
        } catch (e) {
            process.stdout.write('?');
        }
    }
    return false;
}

export async function run(provider: NetworkProvider) {
    const sender = provider.sender();
    if (!sender.address) {
        console.error('Error: No wallet connected');
        process.exit(1);
    }

    const ownerAddress = sender.address.toString();

    console.log('=== Batch Mint Test ===\n');
    console.log('Service URL:', SERVICE_URL);
    console.log('Owner address:', ownerAddress);
    console.log('NFT count:', NFT_COUNT);
    console.log('Base metadata URL:', BASE_METADATA_URL);
    console.log('Price per NFT:', PRICE, 'TON');

    // Check service health
    try {
        const healthResponse = await fetch(`${SERVICE_URL}/health`);
        if (!healthResponse.ok) {
            throw new Error('Service not responding');
        }
        console.log('\nService is healthy.');
    } catch (e) {
        console.error('\nError: Cannot connect to service at', SERVICE_URL);
        console.log('Make sure the service is running:');
        console.log('  cd service && npx ts-node index.ts serve');
        process.exit(1);
    }

    // Prepare NFT items
    const items = Array.from({ length: NFT_COUNT }, (_, i) => ({
        metadataUrl: `${BASE_METADATA_URL}${i + 1}.json`,
        price: PRICE,
    }));

    console.log('\nNFTs to mint:');
    items.forEach((item, i) => {
        console.log(`  ${i + 1}. ${item.metadataUrl} - ${item.price} TON`);
    });

    // Get batch signatures
    const mintDataList = await batchSign(ownerAddress, items);

    console.log('\nReceived mint data for', mintDataList.length, 'NFTs');
    mintDataList.forEach((data, i) => {
        console.log(`  ${i + 1}. MinterItem: ${data.minterItemAddress}`);
    });

    // Calculate total cost
    const pricePerNft = BigInt(mintDataList[0].price);
    const gasBuffer = toNano('0.15');
    const valuePerTx = pricePerNft + gasBuffer;
    const totalCost = valuePerTx * BigInt(NFT_COUNT);

    console.log('\n--- Cost Summary ---');
    console.log(`  Price per NFT: ${(Number(pricePerNft) / 1e9).toFixed(2)} TON`);
    console.log(`  Gas buffer: ${(Number(gasBuffer) / 1e9).toFixed(2)} TON`);
    console.log(`  Value per tx: ${(Number(valuePerTx) / 1e9).toFixed(2)} TON`);
    console.log(`  Total cost: ${(Number(totalCost) / 1e9).toFixed(2)} TON`);

    // Send transactions sequentially
    console.log('\n--- Sending Transactions ---\n');

    const results: { index: number; address: string; success: boolean }[] = [];

    for (let i = 0; i < mintDataList.length; i++) {
        const mintData = mintDataList[i];
        console.log(`[${i + 1}/${NFT_COUNT}] Minting NFT...`);
        console.log(`  Metadata: ${mintData.metadataUrl}`);
        console.log(`  MinterItem: ${mintData.minterItemAddress}`);

        try {
            const stateInit = Cell.fromBoc(Buffer.from(mintData.stateInit, 'base64'))[0];
            const messageBody = Cell.fromBoc(Buffer.from(mintData.messageBody, 'base64'))[0];

            await sender.send({
                to: Address.parse(mintData.minterItemAddress),
                value: valuePerTx,
                init: {
                    code: stateInit.refs[0],
                    data: stateInit.refs[1],
                },
                body: messageBody,
            });

            console.log('  Transaction sent!');

            // Wait a bit between transactions to avoid nonce issues
            if (i < mintDataList.length - 1) {
                console.log('  Waiting 3s before next transaction...');
                await new Promise((resolve) => setTimeout(resolve, 3000));
            }

            results.push({ index: i + 1, address: mintData.minterItemAddress, success: true });
        } catch (e: any) {
            console.error(`  Error: ${e.message}`);
            results.push({ index: i + 1, address: mintData.minterItemAddress, success: false });
        }
    }

    // Wait for deployments
    console.log('\n--- Waiting for Deployments ---\n');

    for (const result of results) {
        if (!result.success) {
            console.log(`[${result.index}] Skipped (transaction failed)`);
            continue;
        }

        process.stdout.write(`[${result.index}] ${result.address} `);
        const deployed = await waitForDeployment(result.address, 20);
        if (deployed) {
            console.log(' DEPLOYED');
        } else {
            console.log(' TIMEOUT');
        }
    }

    // Summary
    console.log('\n=== Summary ===\n');
    const successful = results.filter((r) => r.success).length;
    console.log(`Transactions sent: ${successful}/${NFT_COUNT}`);
    console.log('\nMinterItem addresses:');
    results.forEach((r) => {
        const status = r.success ? '✓' : '✗';
        console.log(`  ${status} ${r.address}`);
    });

    console.log('\n=== Done ===');
}
