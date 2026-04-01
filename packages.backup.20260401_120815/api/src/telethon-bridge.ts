import { spawn } from 'child_process'

function callPython(data: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', ['/root/agentr/auth_helper.py'], {
      env: process.env,
    })
    let out = ''
    let err = ''
    proc.stdout.on('data', (d) => { out += d })
    proc.stderr.on('data', (d) => { err += d })
    proc.stdin.write(JSON.stringify(data))
    proc.stdin.end()
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(err || 'Python auth failed'))
      try { resolve(JSON.parse(out)) } catch { reject(new Error('Bad JSON: ' + out)) }
    })
  })
}

export async function telethonRequestOtp(tenantId: string, phone: string): Promise<{ phoneCodeHash: string }> {
  const r = await callPython({ cmd: 'request_otp', tenantId, phone })
  if (!r.success) throw new Error(r.error)
  return { phoneCodeHash: r.phone_code_hash }
}

export async function telethonVerifyOtp(tenantId: string, phone: string, phoneCodeHash: string, code: string): Promise<boolean> {
  const r = await callPython({ cmd: 'verify_otp', tenantId, phone, phoneCodeHash, code })
  if (r.error === '2FA_REQUIRED') throw new Error('2FA_REQUIRED')
  if (r.error === 'PHONE_CODE_INVALID') return false
  if (!r.success) throw new Error(r.error)
  return true
}

export async function telethonVerify2FA(tenantId: string, password: string): Promise<boolean> {
  const r = await callPython({ cmd: 'verify_2fa', tenantId, password })
  if (!r.success) throw new Error(r.error)
  return true
}
