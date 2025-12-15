import { Address, Cell, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';

const SERVICE_URL = process.env.SERVICE_URL || 'http://localhost:3000';

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

async function requestSignedNft(
    ownerAddress: string,
    metadataUrl: string,
    price?: string
): Promise<MintData> {
    console.log(`\nRequesting signature from service: ${SERVICE_URL}/sign`);

    const response = await fetch(`${SERVICE_URL}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerAddress, metadataUrl, price }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Service error: ${error}`);
    }

    const result = await response.json();
    return result.data;
}

export async function run(provider: NetworkProvider) {
    const metadataUrl = process.env.METADATA_URL || 'https://example.com/nft/test.json';
    const price = process.env.PRICE || '1'; // 1 TON default

    const sender = provider.sender();
    if (!sender.address) {
        console.error('Error: No wallet connected');
        process.exit(1);
    }

    const ownerAddress = sender.address.toString();

    console.log('=== Test Mint via Service ===\n');
    console.log('Service URL:', SERVICE_URL);
    console.log('Owner address:', ownerAddress);
    console.log('Metadata URL:', metadataUrl);
    console.log('Price:', price, 'TON');

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

    // Get service info
    const infoResponse = await fetch(`${SERVICE_URL}/info`);
    const info = await infoResponse.json();
    console.log('\nService info:');
    console.log('  Minter address:', info.minterAddress || '(not configured)');
    console.log('  Default price:', info.defaultPriceFormatted);

    if (!info.minterAddress) {
        console.error('\nError: Service MINTER_ADDRESS not configured');
        console.log('Set MINTER_ADDRESS in service/.env and restart the service');
        process.exit(1);
    }

    // Request signed NFT data
    const mintData = await requestSignedNft(ownerAddress, metadataUrl, price);

    console.log('\nReceived mint data:');
    console.log('  MinterItem address:', mintData.minterItemAddress);
    console.log('  Price:', mintData.priceFormatted);
    console.log('  Data hash:', mintData.dataHash);

    // Parse cells from service response
    const stateInit = Cell.fromBoc(Buffer.from(mintData.stateInit, 'base64'))[0];
    const messageBody = Cell.fromBoc(Buffer.from(mintData.messageBody, 'base64'))[0];

    // Calculate value: price + gas buffer
    const nftPrice = BigInt(mintData.price);
    const gasBuffer = toNano('0.15');
    const value = nftPrice + gasBuffer;

    console.log('\nSending mint transaction...');
    console.log('  Value:', (Number(value) / 1e9).toFixed(4), 'TON');

    // Send transaction
    await provider.sender().send({
        to: Address.parse(mintData.minterItemAddress),
        value: value,
        init: {
            code: stateInit.refs[0],
            data: stateInit.refs[1],
        },
        body: messageBody,
    });

    console.log('\nTransaction sent!');
    console.log('MinterItem address:', mintData.minterItemAddress);

    // Wait for deployment
    console.log('\nWaiting for deployment...');
    let deployed = false;
    for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
            const verifyResponse = await fetch(`${SERVICE_URL}/verify-deployment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ minterItemAddress: mintData.minterItemAddress }),
            });
            const verifyResult = await verifyResponse.json();

            if (verifyResult.deployed) {
                deployed = true;
                console.log('\nMinterItem deployed successfully!');
                break;
            }
            process.stdout.write('.');
        } catch (e) {
            process.stdout.write('?');
        }
    }

    if (!deployed) {
        console.log('\n\nDeployment verification timed out.');
        console.log('Check the transaction on explorer:');
    }

    console.log('\n=== Done ===');
    console.log('MinterItem:', mintData.minterItemAddress);
    console.log('Check explorer for NFT minting result.');
}
