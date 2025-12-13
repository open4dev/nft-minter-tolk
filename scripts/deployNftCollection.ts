import { beginCell, toNano } from '@ton/core';
import { compile, NetworkProvider } from '@ton/blueprint';
import { NFTCollection } from '../wrappers/02_nft/NFTCollection';
import { nftContentToCell } from '../wrappers/utils';

export async function run(provider: NetworkProvider) {
    const minter = provider.open(NFTCollection.createFromConfig(
        {
            ownerAddress: provider.sender().address!!,
            nextItemIndex: 0,
            nftItemCode: await compile('NftItem'),
            royaltyParams: beginCell().endCell(),
            content: nftContentToCell({
                uri: 'https://example.com/nft-collection'
            })
    }, await compile('NftCollection')));

    await minter.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(minter.address);

    // run methods on `NtfColletion`
}
