import "storage"

// Calculate deployed MinterItem address using storage struct
fun calcDeployedMinterItem(
    ownerAddress: address,
    minterAddress: address,
    publicKey: int,
    price: int,
    content: cell,
    minterItemCode: cell
): AutoDeployAddress {
    val emptyMinterItemStorage: MinterItemStorage = {
        isMinted: false,
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

fun calculateMinterItemAddress(
    ownerAddress: address,
    minterAddress: address,
    publicKey: int,
    price: int,
    content: cell,
    minterItemCode: cell
): address {
    val deployed = calcDeployedMinterItem(ownerAddress, minterAddress, publicKey, price, content, minterItemCode);
    return deployed.calculateAddress();
}

// Hash content + price + ownerAddress for signature verification
// Including ownerAddress prevents signature replay attacks
fun hashMintData(content: cell, price: int, ownerAddress: address): int {
    return beginCell()
        .storeRef(content)
        .storeCoins(price)
        .storeAddress(ownerAddress)
        .endCell()
        .hash();
}
