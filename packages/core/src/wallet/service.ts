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

  async getBalance(address: string): Promise<bigint> {
    try {
      const apiKey = process.env['TONAPI_KEY'] ?? ''
      const endpoint = process.env['TON_ENDPOINT'] ?? 'https://toncenter.com/api/v2/jsonRPC'
      const url = `https://toncenter.com/api/v2/getAddressBalance?address=${encodeURIComponent(address)}`
      const res = await fetch(url, {
        headers: apiKey ? { 'X-API-Key': apiKey } : {}
      })
      if (!res.ok) return 0n
      const data = await res.json() as { ok: boolean; result: string }
      if (!data.ok) return 0n
      return BigInt(data.result)
    } catch {
      return 0n
    }
  }

  async getIncomingTransactions(address: string, sinceHash?: string): Promise<{hash: string; amount: bigint; from: string; timestamp: number}[]> {
    try {
      const apiKey = process.env['TONAPI_KEY'] ?? ''
      const url = `https://toncenter.com/api/v2/getTransactions?address=${encodeURIComponent(address)}&limit=20`
      const res = await fetch(url, {
        headers: apiKey ? { 'X-API-Key': apiKey } : {}
      })
      if (!res.ok) return []
      const data = await res.json() as { ok: boolean; result: any[] }
      if (!data.ok) return []
      return data.result
        .filter((tx: any) => tx.in_msg?.value && tx.in_msg.value !== '0')
        .map((tx: any) => ({
          hash: tx.transaction_id?.hash ?? '',
          amount: BigInt(tx.in_msg.value),
          from: tx.in_msg.source ?? '',
          timestamp: tx.utime,
        }))
    } catch {
      return []
    }
  }
}
