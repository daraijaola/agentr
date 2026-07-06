import { toNano, internal, SendMode } from '@ton/ton'
import { Address } from '@ton/core'
import { loadWallet } from './wallet-service.js'

export async function sendTon(params: {
  mnemonic: string[]
  to: string
  amount: number
  comment?: string
}): Promise<string> {
  const { wallet, contract, keyPair } = await loadWallet(params.mnemonic)
  const seqno = await contract.getSeqno()
  await contract.sendTransfer({
    seqno,
    secretKey: keyPair.secretKey,
    messages: [internal({
      to: Address.parse(params.to),
      value: toNano(params.amount.toString()),
      body: params.comment ?? '',
      bounce: false,
    })],
    sendMode: SendMode.PAY_GAS_SEPARATELY,
  })
  return `sent:${params.amount}:${params.to}`
}
