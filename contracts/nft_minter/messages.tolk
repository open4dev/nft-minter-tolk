// ============================================
// Incoming messages for Minter contract
// ============================================

struct (0x0505DC31) MsgInternalMintItem {
    queryId: uint64;
    price: coins;
    ownerAddress: address;
    content: cell;
}

struct (0x1B9403D8) MsgAdminClaim {
    queryId: uint64;
}

struct (0x2A7B8C1F) MsgAdminToggleMint {
    queryId: uint64;
    enableMint: bool;
}

struct (0x3C5F7E9A) MsgAdminTransferCollectionOwnership {
    queryId: uint64;
    newOwnerAddress: address;
}

type MinterInMsg = MsgInternalMintItem | MsgAdminClaim | MsgAdminToggleMint | MsgAdminTransferCollectionOwnership

// ============================================
// Incoming messages for MinterItem contract
// ============================================

struct (0x90231E2C) MsgMintItem {
    queryId: uint64;
    signature: bits512;
}

type MinterItemInMsg = MsgMintItem


// ============================================
// Outgoing messages
// ============================================

// Message body for internal mint (MinterItem -> Minter)
// Field order must match MsgInternalMintItem
struct (0x0505DC31) OutMsgInternalMint {
    queryId: uint64;
    price: coins;
    ownerAddress: address;
    content: cell;
}

// ============================================
// Bounced messages (first 256 bits of body)
// ============================================

// Bounced MsgInternalMintItem (only op + queryId due to BounceMode.Only256BitsOfBody)
struct (0x0505DC31) BouncedMsgInternalMint {
    queryId: uint64;
}

type MinterItemBouncedMsg = BouncedMsgInternalMint
