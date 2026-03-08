export function formatTransactions(txs: unknown[]): string {
  if (!txs?.length) return 'No transactions found.'
  return txs.map((tx: unknown, i) => {
    const t = tx as Record<string, unknown>
    return `${i + 1}. ${JSON.stringify(t)}`
  }).join('\n')
}
