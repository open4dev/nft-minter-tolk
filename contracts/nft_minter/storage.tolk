// Minter storage
struct MinterStorage {
    adminAddress: address;
    collectionAddress: address;
    servicePublicKey: uint256;
    startTime: uint32;
    minterItemCode: cell;
}

fun MinterStorage.load(): MinterStorage {
    return MinterStorage.fromCell(contract.getData());
}

// MinterItem storage
struct MinterItemStorage {
    isMinted: bool;
    startTime: uint32;
    price: coins;
    minterAddress: address;
    ownerAddress: address;
    servicePublicKey: uint256;
    contentNftItem: cell;
}

fun MinterItemStorage.load(): MinterItemStorage {
    return MinterItemStorage.fromCell(contract.getData());
}

fun MinterItemStorage.save(self) {
    contract.setData(self.toCell());
}
