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

type MinterInMsg = MsgInternalMintItem | MsgAdminClaim

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
