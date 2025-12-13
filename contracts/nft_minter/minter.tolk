import "@stdlib/common"
import "errors"
import "storage"
import "messages"
import "utils"
import "fees-management"
import "../02_nft/storage"
import "../02_nft/messages"

fun onInternalMessage(in: InMessage) {
    if (in.body.isEmpty()) {
        return;
    }

    val msg = lazy MinterInMsg.fromSlice(in.body);

    match (msg) {
        MsgInternalMintItem => {
            val storage = MinterStorage.load();
            val minterItemAddress = calculateMinterItemAddress(
                msg.ownerAddress,
                contract.getAddress(),
                storage.servicePublicKey,
                storage.startTime,
                msg.price,
                msg.content,
                storage.minterItemCode
            );
            assert(in.senderAddress == minterItemAddress) throw ERROR_MINT_ITEM_ADDRESS_MISMATCH;

            sendMintItem(storage.collectionAddress, msg.ownerAddress, msg.content, msg.queryId);
        }
        MsgAdminClaim => {
            val storage = MinterStorage.load();
            assert(in.senderAddress == storage.adminAddress) throw ERROR_NOT_ADMIN;
            val toSendAmount: int = contract.getOriginalBalance() - MINTER_MIN_RESERVE;
            assert(toSendAmount > 0) throw ERROR_NOT_ENOUGH_BALANCE;

            sendTon(storage.adminAddress, toSendAmount);
        }
    }
}

@inline
fun sendTon(to: address, amount: int) {
    val msg = createMessage({
        bounce: BounceMode.NoBounce,
        value: amount,
        dest: to
    });
    msg.send(SEND_MODE_IGNORE_ERRORS | SEND_MODE_PAY_FEES_SEPARATELY);
}

@inline
fun sendMintItem(collectionAddress: address, toUser: address, content: cell, queryId: int) {
    val initParams = NftItemInitAtDeployment {
        ownerAddress: toUser,
        content: content as Cell<SnakeString>
    };

    val body = DeployNextNft {
        queryId: queryId,
        attachTonAmount: NFT_DEPLOY_AMOUNT,
        initParams: initParams.toCell()
    };

    val msg = createMessage({
        bounce: BounceMode.Only256BitsOfBody,
        value: 0,
        dest: collectionAddress,
        body: body
    });
    msg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}