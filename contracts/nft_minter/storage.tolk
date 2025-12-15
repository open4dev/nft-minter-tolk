struct MinterStorage {
    adminAddress: address;
    collectionAddress: address;
    servicePublicKey: uint256;
    isMintEnabled: bool;
    minterItemCode: cell;
}

fun MinterStorage.load(): MinterStorage {
    return MinterStorage.fromCell(contract.getData());
}

fun MinterStorage.save(self) {
    contract.setData(self.toCell());
}

struct MinterItemStorage {
    isMinted: bool;
    price: coins;
    minterAddress: address;
    ownerAddress: address;
    servicePublicKey: uint256;
    contentNftItem: cell?;
}

fun MinterItemStorage.load(): MinterItemStorage {
    return MinterItemStorage.fromCell(contract.getData());
}

fun MinterItemStorage.save(self) {
    contract.setData(self.toCell());
}
