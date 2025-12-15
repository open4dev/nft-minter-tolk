import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type MinterConfig = {
    adminAddress: Address;
    collectionAddress: Address;
    servicePublicKey: bigint;
    isMintEnabled: boolean;
    minterItemCode: Cell;
};

export function minterConfigToCell(config: MinterConfig): Cell {
    return beginCell()
        .storeAddress(config.adminAddress)
        .storeAddress(config.collectionAddress)
        .storeUint(config.servicePublicKey, 256)
        .storeBit(config.isMintEnabled)
        .storeRef(config.minterItemCode)
    .endCell();
}

export class Minter implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new Minter(address);
    }

    static createFromConfig(config: MinterConfig, code: Cell, workchain = 0) {
        const data = minterConfigToCell(config);
        const init = { code, data };
        return new Minter(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendAdminClaim(provider: ContractProvider, via: Sender, value: bigint, queryId: bigint = 0n) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x1B9403D8, 32)
                .storeUint(queryId, 64)
                .endCell(),
        });
    }

    async sendAdminToggleMint(provider: ContractProvider, via: Sender, value: bigint, enableMint: boolean, queryId: bigint = 0n) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x2A7B8C1F, 32)
                .storeUint(queryId, 64)
                .storeBit(enableMint)
                .endCell(),
        });
    }

    async sendAdminTransferCollectionOwnership(provider: ContractProvider, via: Sender, value: bigint, newOwnerAddress: Address, queryId: bigint = 0n) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x3C5F7E9A, 32)
                .storeUint(queryId, 64)
                .storeAddress(newOwnerAddress)
                .endCell(),
        });
    }

    async getBalance(provider: ContractProvider): Promise<bigint> {
        const state = await provider.getState();
        return state.balance;
    }
}
