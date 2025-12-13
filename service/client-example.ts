/**
 * Example client code showing how to use the NFT Minter Service API
 *
 * This demonstrates the complete flow:
 * 1. Request signed NFT data from service (with price)
 * 2. Use the data to deploy and mint via wallet
 */

import { TonClient, WalletContractV4, internal, Cell, toNano } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';

const SERVICE_URL = 'http://localhost:3000';

interface MintData {
    minterItemAddress: string;
    stateInit: string;
    messageBody: string;
    signature: string;
    content: string;
    price: string; // nanoTON
    priceFormatted: string;
    metadataUrl: string;
    ownerAddress: string;
    dataHash: string;
}

/**
 * Request signed NFT data from the service
 * Price is optional - if not provided, uses service default
 */
async function requestSignedNft(
    ownerAddress: string,
    metadataUrl: string,
    price?: string // in TON, e.g. "1.5"
): Promise<MintData> {
    const response = await fetch(`${SERVICE_URL}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerAddress, metadataUrl, price }),
    });

    if (!response.ok) {
        throw new Error(`Service error: ${await response.text()}`);
    }

    const result = await response.json();
    return result.data;
}

/**
 * Execute mint transaction using wallet
 */
async function executeMint(
    client: TonClient,
    wallet: WalletContractV4,
    secretKey: Buffer,
    mintData: MintData
): Promise<void> {
    const walletContract = client.open(wallet);
    const seqno = await walletContract.getSeqno();

    // Parse the base64 encoded cells from service response
    const stateInit = Cell.fromBoc(Buffer.from(mintData.stateInit, 'base64'))[0];
    const messageBody = Cell.fromBoc(Buffer.from(mintData.messageBody, 'base64'))[0];

    // Use price from response (already in nanoTON) + gas buffer
    const price = BigInt(mintData.price);
    const gasBuffer = toNano('0.15'); // Extra for gas fees
    const value = price + gasBuffer;

    await walletContract.sendTransfer({
        seqno,
        secretKey,
        messages: [
            internal({
                to: mintData.minterItemAddress,
                value,
                init: {
                    code: stateInit.refs[0],
                    data: stateInit.refs[1],
                },
                body: messageBody,
            }),
        ],
    });

    console.log('Transaction sent!');
    console.log('MinterItem address:', mintData.minterItemAddress);
    console.log('Price:', mintData.priceFormatted);
}

/**
 * Complete example flow
 */
async function main() {
    // 1. Setup client (mainnet)
    const client = new TonClient({
        endpoint: 'https://toncenter.com/api/v2/jsonRPC',
        apiKey: process.env.TONCENTER_API_KEY,
    });

    // 2. Load wallet from mnemonic
    const mnemonic = process.env.WALLET_MNEMONIC?.split(' ') || [];
    if (mnemonic.length !== 24) {
        console.error('Set WALLET_MNEMONIC environment variable (24 words)');
        process.exit(1);
    }

    const keyPair = await mnemonicToPrivateKey(mnemonic);
    const wallet = WalletContractV4.create({
        workchain: 0,
        publicKey: keyPair.publicKey,
    });

    const walletAddress = wallet.address.toString();
    console.log('Wallet address:', walletAddress);

    // 3. Request signed NFT from service
    const metadataUrl = 'https://your-server.com/nft/metadata/1.json';
    const price = '1'; // 1 TON (optional - uses service default if not provided)

    console.log('\nRequesting signed NFT for:', metadataUrl);
    console.log('Price:', price, 'TON');

    const mintData = await requestSignedNft(walletAddress, metadataUrl, price);
    console.log('\nReceived mint data:');
    console.log('  MinterItem address:', mintData.minterItemAddress);
    console.log('  Price:', mintData.priceFormatted);
    console.log('  Data hash:', mintData.dataHash);

    // 4. Execute the mint transaction
    console.log('\nSending mint transaction...');
    await executeMint(client, wallet, keyPair.secretKey, mintData);

    console.log('\nDone! Check the transaction on explorer.');
}

// Run if executed directly
if (require.main === module) {
    main().catch(console.error);
}

export { requestSignedNft, executeMint };
