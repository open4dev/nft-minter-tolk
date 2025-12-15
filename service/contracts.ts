import {
    Address,
    Cell,
    beginCell,
    contractAddress,
    toNano,
    TonClient,
    WalletContractV4,
    internal,
    external,
    storeMessage,
} from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { compile } from '@ton/blueprint';
import { getEndpoint } from './config';

/**
 * Pack MinterItem data (matches contract storage format)
 */
export function packMinterItemData(
    ownerAddress: Address,
    minterAddress: Address,
    publicKey: bigint,
    price: bigint,
    content: Cell
): Cell {
    return beginCell()
        .storeBit(false) // isMinted = false
        .storeCoins(price)
        .storeAddress(minterAddress)
        .storeAddress(ownerAddress)
        .storeUint(publicKey, 256)
        .storeMaybeRef(content) // optional, cleared after mint
        .endCell();
}

/**
 * Calculate MinterItem state init
 */
export function calculateMinterItemStateInit(
    ownerAddress: Address,
    minterAddress: Address,
    publicKey: bigint,
    price: bigint,
    content: Cell,
    minterItemCode: Cell
): { code: Cell; data: Cell } {
    const data = packMinterItemData(ownerAddress, minterAddress, publicKey, price, content);
    return { code: minterItemCode, data };
}

/**
 * Calculate MinterItem address (deterministic)
 */
export function calculateMinterItemAddress(
    ownerAddress: Address,
    minterAddress: Address,
    publicKey: bigint,
    price: bigint,
    content: Cell,
    minterItemCode: Cell,
    workchain: number = 0
): Address {
    const init = calculateMinterItemStateInit(
        ownerAddress,
        minterAddress,
        publicKey,
        price,
        content,
        minterItemCode
    );
    return contractAddress(workchain, init);
}

/**
 * Create mint message body
 */
export function createMintMessageBody(signature: bigint, queryId: bigint = 0n): Cell {
    return beginCell()
        .storeUint(0x90231e2c, 32) // opMintItem
        .storeUint(queryId, 64)
        .storeUint(signature, 512)
        .endCell();
}

/**
 * Create TON client
 */
export function createTonClient(network: 'mainnet' | 'testnet', apiKey?: string): TonClient {
    return new TonClient({
        endpoint: getEndpoint(network),
        apiKey,
    });
}

/**
 * Get wallet from mnemonic
 */
export async function getWalletFromMnemonic(
    client: TonClient,
    mnemonic: string[]
): Promise<{ wallet: WalletContractV4; keyPair: { publicKey: Buffer; secretKey: Buffer } }> {
    const keyPair = await mnemonicToPrivateKey(mnemonic);
    const wallet = WalletContractV4.create({
        workchain: 0,
        publicKey: keyPair.publicKey,
    });
    return { wallet, keyPair };
}

/**
 * Send transaction to deploy and mint MinterItem
 */
export async function sendDeployWithMint(
    client: TonClient,
    wallet: WalletContractV4,
    keyPair: { publicKey: Buffer; secretKey: Buffer },
    minterItemAddress: Address,
    stateInit: { code: Cell; data: Cell },
    signature: bigint,
    value: bigint = toNano('2')
): Promise<void> {
    const walletContract = client.open(wallet);
    const seqno = await walletContract.getSeqno();

    const messageBody = createMintMessageBody(signature);

    await walletContract.sendTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [
            internal({
                to: minterItemAddress,
                value,
                init: stateInit,
                body: messageBody,
            }),
        ],
    });
}

/**
 * Check if contract is deployed
 */
export async function isContractDeployed(client: TonClient, address: Address): Promise<boolean> {
    const state = await client.getContractState(address);
    return state.state === 'active';
}

/**
 * Get contract balance
 */
export async function getContractBalance(client: TonClient, address: Address): Promise<bigint> {
    const state = await client.getContractState(address);
    return BigInt(state.balance);
}

/**
 * Prepare full mint data for user (everything they need)
 */
export interface MintData {
    minterItemAddress: string;
    stateInit: string; // base64 encoded
    messageBody: string; // base64 encoded
    signature: string;
    content: string; // base64 encoded
    price: string; // price in nanoTON
    priceFormatted: string; // price in TON
}

export function prepareMintDataForUser(
    ownerAddress: Address,
    minterAddress: Address,
    publicKey: bigint,
    price: bigint,
    content: Cell,
    signature: bigint,
    minterItemCode: Cell
): MintData {
    const init = calculateMinterItemStateInit(
        ownerAddress,
        minterAddress,
        publicKey,
        price,
        content,
        minterItemCode
    );

    const address = contractAddress(0, init);
    const messageBody = createMintMessageBody(signature);

    // Create state init cell
    const stateInitCell = beginCell()
        .storeUint(0, 2) // split_depth and special
        .storeMaybeRef(init.code)
        .storeMaybeRef(init.data)
        .storeUint(0, 1) // library
        .endCell();

    // Format price
    const priceInTon = Number(price) / 1e9;

    return {
        minterItemAddress: address.toString(),
        stateInit: stateInitCell.toBoc().toString('base64'),
        messageBody: messageBody.toBoc().toString('base64'),
        signature: signature.toString(16),
        content: content.toBoc().toString('base64'),
        price: price.toString(),
        priceFormatted: priceInTon.toFixed(2) + ' TON',
    };
}
