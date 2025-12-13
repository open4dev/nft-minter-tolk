import nacl from 'tweetnacl';
import fs from 'fs';
import path from 'path';

export interface KeyPair {
    publicKey: Uint8Array;
    secretKey: Uint8Array;
}

const KEYS_FILE = path.join(__dirname, '.keys.json');

/**
 * Generate a new Ed25519 keypair
 */
export function generateKeyPair(): KeyPair {
    return nacl.sign.keyPair();
}

/**
 * Convert public key to BigInt (for contract storage)
 */
export function publicKeyToBigInt(publicKey: Uint8Array): bigint {
    const hex = Buffer.from(publicKey).toString('hex');
    return BigInt('0x' + hex);
}

/**
 * Convert BigInt back to public key bytes
 */
export function bigIntToPublicKey(pubKeyBigInt: bigint): Uint8Array {
    const hex = pubKeyBigInt.toString(16).padStart(64, '0');
    return new Uint8Array(Buffer.from(hex, 'hex'));
}

/**
 * Save keypair to file (for persistence)
 */
export function saveKeyPair(keys: KeyPair, filepath: string = KEYS_FILE): void {
    const data = {
        publicKey: Buffer.from(keys.publicKey).toString('hex'),
        secretKey: Buffer.from(keys.secretKey).toString('hex'),
    };
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`Keys saved to ${filepath}`);
}

/**
 * Load keypair from file
 */
export function loadKeyPair(filepath: string = KEYS_FILE): KeyPair | null {
    if (!fs.existsSync(filepath)) {
        return null;
    }
    const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    return {
        publicKey: new Uint8Array(Buffer.from(data.publicKey, 'hex')),
        secretKey: new Uint8Array(Buffer.from(data.secretKey, 'hex')),
    };
}

/**
 * Get or create keypair
 */
export function getOrCreateKeyPair(filepath: string = KEYS_FILE): KeyPair {
    let keys = loadKeyPair(filepath);
    if (!keys) {
        console.log('No existing keys found, generating new keypair...');
        keys = generateKeyPair();
        saveKeyPair(keys, filepath);
    }
    return keys;
}

/**
 * Display key info (safe to show public key)
 */
export function displayKeyInfo(keys: KeyPair): void {
    console.log('=== Service Key Info ===');
    console.log('Public Key (hex):', Buffer.from(keys.publicKey).toString('hex'));
    console.log('Public Key (BigInt):', publicKeyToBigInt(keys.publicKey).toString());
    console.log('========================');
}
