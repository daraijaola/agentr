export function bigIntToBuffer(value: bigint): Buffer {
  const hex = value.toString(16).padStart(2, '0')
  return Buffer.from(hex.length % 2 ? '0' + hex : hex, 'hex')
}
export function bufferToBigInt(buffer: Buffer): bigint {
  return BigInt('0x' + buffer.toString('hex'))
}
