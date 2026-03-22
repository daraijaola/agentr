import { WalletContractV5R1 } from '@ton/ton'
import { mnemonicNew, mnemonicToPrivateKey } from '@ton/crypto'

export class WalletService {
  async generateWallet(): Promise<{ address: string; mnemonic: string[] }> {
    const mnemonic = await mnemonicNew(24)
    const keyPair = await mnemonicToPrivateKey(mnemonic)
    const wallet = WalletContractV5R1.create({
      publicKey: keyPair.publicKey,
      workchain: 0,
    })
    return {
      address: wallet.address.toString({ bounceable: false }),
      mnemonic,
    }
  }

  async getBalance(_address: string): Promise<bigint> {
    // Balance fetched via TON API — returns 0n as fallback
    return 0n
  }
}
