import { TonClient } from '@ton/ton'
import { WalletContractV5R1 } from '@ton/ton'
import { mnemonicToPrivateKey } from '@ton/crypto'

let _client: TonClient | null = null

export function getCachedTonClient(): TonClient {
  if (!_client) {
    _client = new TonClient({
      endpoint: process.env['TON_ENDPOINT'] ?? 'https://toncenter.com/api/v2/jsonRPC',
      apiKey: process.env['TON_API_KEY'],
    })
  }
  return _client
}

export async function getKeyPair(mnemonic: string[]) {
  return mnemonicToPrivateKey(mnemonic)
}

export async function loadWallet(mnemonic: string[]) {
  const keyPair = await mnemonicToPrivateKey(mnemonic)
  const wallet = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 })
  const client = getCachedTonClient()
  const contract = client.open(wallet)
  return { wallet, contract, keyPair }
}

export async function getWalletAddress(mnemonic: string[]): Promise<string> {
  const keyPair = await mnemonicToPrivateKey(mnemonic)
  const wallet = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 })
  return wallet.address.toString({ bounceable: false })
}

export async function getWalletBalance(address: string): Promise<bigint> {
  try {
    const client = getCachedTonClient()
    return await client.getBalance({ address } as never)
  } catch {
    return 0n
  }
}

export async function getTonPrice(): Promise<number> {
  try {
    const res = await fetch('https://tonapi.io/v2/rates?tokens=ton&currencies=usd')
    const data = await res.json() as { rates: { TON: { prices: { USD: number } } } }
    return data.rates.TON.prices.USD
  } catch {
    return 0
  }
}
