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

    var storage = lazy MinterStorage.load();
    val msg = lazy MinterInMsg.fromSlice(in.body);

    match (msg) {
        MsgInternalMintItem => {
            assert(storage.isMintEnabled) throw ERROR_MINT_DISABLED;

            val minterItemAddress = calculateMinterItemAddress(
                msg.ownerAddress,
                contract.getAddress(),
                storage.servicePublicKey,
                msg.price,
                msg.content,
                storage.minterItemCode
            );
            assert(in.senderAddress == minterItemAddress) throw ERROR_MINT_ITEM_ADDRESS_MISMATCH;

            sendMintItem(storage.collectionAddress, msg.ownerAddress, msg.content, msg.queryId);
        }
        MsgAdminClaim => {
            assert(in.senderAddress == storage.adminAddress) throw ERROR_NOT_ADMIN;
            val toSendAmount: int = contract.getOriginalBalance() - MIN_TONS_FOR_STORAGE;
            assert(toSendAmount > 0) throw ERROR_NOT_ENOUGH_BALANCE;

            sendTon(storage.adminAddress, toSendAmount);
        }
        MsgAdminToggleMint => {
            assert(in.senderAddress == storage.adminAddress) throw ERROR_NOT_ADMIN;
            storage.isMintEnabled = msg.enableMint;
            storage.save();
        }
        MsgAdminTransferCollectionOwnership => {
            assert(in.senderAddress == storage.adminAddress) throw ERROR_NOT_ADMIN;
            sendTransferCollectionOwnership(storage.collectionAddress, msg.newOwnerAddress, msg.queryId);
        }
    }
}

fun sendTon(to: address, amount: int) {
    val msg = createMessage({
        bounce: BounceMode.NoBounce,
        value: amount,
        dest: to
    });
    msg.send(SEND_MODE_IGNORE_ERRORS | SEND_MODE_PAY_FEES_SEPARATELY);
}

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

fun sendTransferCollectionOwnership(collectionAddress: address, newOwnerAddress: address, queryId: int) {
    val body = ChangeCollectionAdmin {
        queryId: queryId,
        newAdminAddress: newOwnerAddress
    };

    val msg = createMessage({
        bounce: BounceMode.Only256BitsOfBody,
        value: 0,
        dest: collectionAddress,
        body: body
    });
    msg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}