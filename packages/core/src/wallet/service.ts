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

  async getIncomingTransactions(address: string): Promise<{ hash: string; amount: bigint; from: string; timestamp: number }[]> {
    try {
      const apiKey = process.env['TONAPI_KEY'] ?? ''
      const url = `https://toncenter.com/api/v2/getTransactions?address=${encodeURIComponent(address)}&limit=20`
      const res = await fetch(url, {
        headers: apiKey ? { 'X-API-Key': apiKey } : {}
      })
      if (!res.ok) return []
      const data = await res.json() as { ok: boolean; result: unknown[] }
      if (!data.ok) return []
      return (data.result as Record<string, unknown>[])
        .filter((tx) => {
          const inMsg = tx['in_msg'] as Record<string, unknown> | undefined
          return inMsg?.['value'] && inMsg['value'] !== '0'
        })
        .map((tx) => {
          const inMsg = tx['in_msg'] as Record<string, unknown>
          const txId = tx['transaction_id'] as Record<string, unknown> | undefined
          return {
            hash: (txId?.['hash'] as string) ?? '',
            amount: BigInt((inMsg['value'] as string)),
            from: (inMsg['source'] as string) ?? '',
            timestamp: tx['utime'] as number,
          }
        })
    } catch {
      return []
    }
  }
}
