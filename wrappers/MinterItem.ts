import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type MinterItemConfig = {
    isMinted: boolean;
    startTime: bigint;
    price: bigint;
    minterAddress: Address;
    ownerAddress: Address;
    servicePublicKey: bigint;
    contentNftItem: Cell;
};

export function minterItemConfigToCell(config: MinterItemConfig): Cell {
    return beginCell()
        .storeBit(config.isMinted)
        .storeUint(config.startTime, 32)
        .storeCoins(config.price)
        .storeAddress(config.minterAddress)
        .storeAddress(config.ownerAddress)
        .storeUint(config.servicePublicKey, 256)
        .storeRef(config.contentNftItem)
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
}

// Helper to hash content + price (must match contract's hashContentWithPrice)
export function hashContentWithPrice(content: Cell, price: bigint): Buffer {
    const cell = beginCell()
        .storeRef(content)
        .storeCoins(price)
        .endCell();
    return cell.hash();
}
