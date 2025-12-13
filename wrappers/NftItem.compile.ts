import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'tolk',
    entrypoint: 'contracts/02_nft/nft-item-contract.tolk',
    withSrcLineComments: true,
    withStackComments: true,
};
