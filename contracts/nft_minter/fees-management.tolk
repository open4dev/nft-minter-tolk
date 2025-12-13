// Gas fee constants based on gas analysis
// 1 gas unit = 400 nanoTON (BaseChain)

// Minimum balance to keep in MinterItem for storage
const MIN_TONS_FOR_STORAGE: int = ton("0.02");

// Minimum balance to keep in Minter after admin claim
const MINTER_MIN_RESERVE: int = ton("0.05");

// Amount to attach for NFT deployment in collection
const NFT_DEPLOY_AMOUNT: int = ton("0.05");
