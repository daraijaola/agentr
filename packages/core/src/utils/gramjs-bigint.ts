// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toLong(value: any): any {
  return value
}

export function randomLong(): bigint {
  const hi = BigInt(Math.floor(Math.random() * 0x7fffffff))
  const lo = BigInt(Math.floor(Math.random() * 0xffffffff))
  return (hi << 32n) | lo
}
