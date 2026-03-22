export function formatTransactions(txs: unknown[]): string { return JSON.stringify(txs, null, 2) }
export function formatTransaction(tx: unknown): string { return JSON.stringify(tx, null, 2) }
export function formatAmount(amount: bigint, decimals = 9): string {
  return (Number(amount) / 10 ** decimals).toFixed(4)
}
