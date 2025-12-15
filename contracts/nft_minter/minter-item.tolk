import "@stdlib/common"
import "errors"
import "storage"
import "messages"
import "utils"
import "fees-management"

fun onInternalMessage(in: InMessage) {
    var storage = lazy MinterItemStorage.fromCell(contract.getData());
    val msg = lazy MinterItemInMsg.fromSlice(in.body);

    match (msg) {
        MsgMintItem => {
            assert(storage.isMinted == false) throw ERROR_MINTED_ALREADY;
            assert(in.senderAddress == storage.ownerAddress) throw ERROR_NOT_OWNER_TRYING_TO_MINT;
            assert(contract.getOriginalBalance() >= storage.price) throw ERROR_NOT_ENOUGH_FUNDS_TO_MINT;

            val content = storage.contentNftItem;
            assert(content != null) throw ERROR_CONTENT_NOT_FOUND;

            val dataHash = hashMintData(content!!, storage.price, storage.ownerAddress);
            assert(isSignatureValid(dataHash, msg.signature as slice, storage.servicePublicKey)) throw ERROR_SIGNATURE_INVALID;

            storage.mintItem(msg.queryId, content!!);
            storage.isMinted = true;
            storage.save();
        }
    }
}

fun onBouncedMessage(in: InMessageBounced) {
    in.bouncedBody.skipBouncedPrefix();
    val msg = lazy MinterItemBouncedMsg.fromSlice(in.bouncedBody);

    match (msg) {
        BouncedMsgInternalMint => {
            var storage = MinterItemStorage.load();
            storage.isMinted = false;
            storage.save();

            val toReturn = contract.getOriginalBalance() - MIN_TONS_FOR_STORAGE;
            if (toReturn > 0) {
                val refundMsg = createMessage({
                    bounce: BounceMode.NoBounce,
                    value: toReturn,
                    dest: storage.ownerAddress
                });
                refundMsg.send(SEND_MODE_IGNORE_ERRORS);
            }
        }
    }
}

fun MinterItemStorage.mintItem(self, queryId: int, content: cell) {
    val body = OutMsgInternalMint {
        queryId: queryId,
        price: self.price,
        ownerAddress: self.ownerAddress,
        content: content
    };

    val msg = createMessage({
        bounce: BounceMode.Only256BitsOfBody,
        value: 0,
        dest: self.minterAddress,
        body: body
    });
    msg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}
