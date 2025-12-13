import "@stdlib/common"
import "errors"
import "storage"
import "messages"
import "utils"

fun onInternalMessage(in: InMessage) {
    val msg = lazy MinterItemInMsg.fromSlice(in.body);

    match (msg) {
        MsgMintItem => {
            var storage = MinterItemStorage.load();

            assert(storage.isMinted == false) throw ERROR_MINTED_ALREADY;
            assert(in.senderAddress == storage.ownerAddress) throw ERROR_NOT_OWNER_TRYING_TO_MINT;
            assert(isMintAllowed(storage)) throw ERROR_MINT_NOT_ALLOWED;
            assert(contract.getOriginalBalance() >= storage.price) throw ERROR_NOT_ENOUGH_FUNDS_TO_MINT;

            // Signature is over hash(content + price)
            val dataHash = hashContentWithPrice(storage.contentNftItem, storage.price);
            assert(isSignatureValid(dataHash, msg.signature as slice, storage.servicePublicKey)) throw ERROR_SIGNATURE_INVALID;

            storage.isMinted = true;
            storage.save();
            mintItem(storage, msg.queryId);
        }
    }
}

@inline
fun mintItem(storage: MinterItemStorage, queryId: int) {
    val body = OutMsgInternalMint {
        queryId: queryId,
        price: storage.price,
        ownerAddress: storage.ownerAddress,
        content: storage.contentNftItem
    };

    val msg = createMessage({
        bounce: BounceMode.Only256BitsOfBody,
        value: 0,
        dest: storage.minterAddress,
        body: body
    });
    msg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

@inline
fun isMintAllowed(storage: MinterItemStorage): bool {
    if (blockchain.now() < storage.startTime) {
        return false;
    }
    return true;
}