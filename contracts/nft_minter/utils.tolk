import "storage"

// Calculate deployed MinterItem address using storage struct
fun calcDeployedMinterItem(
    ownerAddress: address,
    minterAddress: address,
    publicKey: int,
    startTime: int,
    price: int,
    content: cell,
    minterItemCode: cell
): AutoDeployAddress {
    val emptyMinterItemStorage: MinterItemStorage = {
        isMinted: false,
        startTime: startTime as uint32,
        price: price as coins,
        minterAddress,
        ownerAddress,
        servicePublicKey: publicKey as uint256,
        contentNftItem: content,
    };

    return {
        stateInit: {
            code: minterItemCode,
            data: emptyMinterItemStorage.toCell()
        }
    }
}

@inline
fun calculateMinterItemAddress(
    ownerAddress: address,
    minterAddress: address,
    publicKey: int,
    startTime: int,
    price: int,
    content: cell,
    minterItemCode: cell
): address {
    val deployed = calcDeployedMinterItem(ownerAddress, minterAddress, publicKey, startTime, price, content, minterItemCode);
    return deployed.calculateAddress();
}

// Hash content + price for signature verification
@inline
fun hashContentWithPrice(content: cell, price: int): int {
    return beginCell()
        .storeRef(content)
        .storeCoins(price)
        .endCell()
        .hash();
}
