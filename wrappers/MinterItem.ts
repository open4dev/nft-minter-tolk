import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type MinterItemConfig = {
    isMinted: boolean;
    price: bigint;
    minterAddress: Address;
    ownerAddress: Address;
    servicePublicKey: bigint;
    contentNftItem: Cell | null;
};

export function minterItemConfigToCell(config: MinterItemConfig): Cell {
    return beginCell()
        .storeBit(config.isMinted)
        .storeCoins(config.price)
        .storeAddress(config.minterAddress)
        .storeAddress(config.ownerAddress)
        .storeUint(config.servicePublicKey, 256)
        .storeMaybeRef(config.contentNftItem)
        .endCell();
}

export class MinterItem implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new MinterItem(address);
    }

    static createFromConfig(config: MinterItemConfig, code: Cell, workchain = 0) {
        const data = minterItemConfigToCell(config);
        const init = { code, data };
        return new MinterItem(contractAddress(workchain, init), init);
    }

    async sendDeployWithMint(provider: ContractProvider, via: Sender, value: bigint, signature: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x90231E2C, 32)
                .storeUint(0, 64)
                .storeUint(signature, 512)
                .endCell(),
        });
    }

    async sendMint(provider: ContractProvider, via: Sender, value: bigint, signature: bigint, queryId: bigint = 0n) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x90231E2C, 32)
                .storeUint(queryId, 64)
                .storeUint(signature, 512)
                .endCell(),
        });
    }
}

// Helper to hash content + price + ownerAddress (must match contract's hashMintData)
// Including ownerAddress prevents signature replay attacks
export function hashMintData(content: Cell, price: bigint, ownerAddress: Address): Buffer {
    const cell = beginCell()
        .storeRef(content)
        .storeCoins(price)
        .storeAddress(ownerAddress)
        .endCell();
    return cell.hash();
}
