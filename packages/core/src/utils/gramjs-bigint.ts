// GramJS BigInteger bridge utilities
// GramJS internally handles bigint conversion — we just pass strings or numbers

export function bigIntToBuffer(value: bigint): Buffer {
  const hex = value.toString(16).padStart(2, "0")
  return Buffer.from(hex.length % 2 ? "0" + hex : hex, "hex")
}

export function bufferToBigInt(buffer: Buffer): bigint {
  return BigInt("0x" + buffer.toString("hex"))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function randomLong(): any {
  const arr = new Uint8Array(8)
  for (let i = 0; i < 8; i++) arr[i] = Math.floor(Math.random() * 256)
  let result = 0n
  for (const byte of arr) result = (result << 8n) | BigInt(byte)
  return result
}

// toLong: gramjs accepts string peer IDs
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toLong(value: bigint | number): any {
  return value.toString()
}
