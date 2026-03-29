import { Type } from '@sinclair/typebox'
import { existsSync, writeFileSync, readFileSync } from 'fs'
import path from 'path'
import type { Tool, ToolExecutor, ToolResult } from '../types.js'
import { getWorkspaceRoot } from '../../workspace/index.js'
import { runCommand } from '../deploy/runner.js'
import { createLogger } from '../../utils/logger.js'

const log = createLogger('TonDeployTestnet')

const TESTNET_ENDPOINT = 'https://testnet.toncenter.com/api/v2/jsonRPC'
const TESTNET_EXPLORER = 'https://testnet.tonviewer.com'

interface TonDeployTestnetParams {
  contractName: string
  initMessage?: string
  value?: string
}

export const tonDeployTestnetTool: Tool = {
  name: 'ton_deploy_testnet',
  description: 'Deploy a compiled Tact/FunC contract to TON testnet. Requires ton_compile to be run first. Automatically generates a testnet wallet and returns the deployed contract address with an explorer link.',
  category: 'ton',
  parameters: Type.Object({
    contractName: Type.String({ description: 'Contract name (same as used in ton_compile)' }),
    initMessage: Type.Optional(Type.String({ description: 'Optional init message body as hex or comment string' })),
    value: Type.Optional(Type.String({ description: 'TON to send with deployment in nanotons (default: 100000000 = 0.1 TON)' })),
  }),
}

export const tonDeployTestnetExecutor: ToolExecutor<TonDeployTestnetParams> = async (
  params,
  context
): Promise<ToolResult> => {
  const tenantId = (context as Record<string, unknown>)['tenantId'] as string
  const workspaceRoot = getWorkspaceRoot(tenantId)
  const { contractName, value = '100000000' } = params

  const bocPath = path.join(workspaceRoot, 'build', contractName, `${contractName}.boc`)
  const altBocPath = path.join(workspaceRoot, 'build', `${contractName}.boc`)

  const resolvedBoc = existsSync(bocPath) ? bocPath : existsSync(altBocPath) ? altBocPath : null
  if (!resolvedBoc) {
    return {
      success: false,
      error: `BOC not found for ${contractName}. Run ton_compile first. Expected at build/${contractName}/${contractName}.boc`,
    }
  }

  log.info({ tenantId, contractName, resolvedBoc }, 'Deploying to testnet')

  const deployScript = `
const { TonClient, WalletContractV4, internal, toNano, Cell } = require('@ton/ton')
const { mnemonicNew, mnemonicToPrivateKey } = require('@ton/crypto')
const fs = require('fs')

async function deploy() {
  const client = new TonClient({ endpoint: '${TESTNET_ENDPOINT}' })
  
  // Generate a fresh deployment wallet (or load saved one)
  const walletFile = '${workspaceRoot}/.testnet-wallet.json'
  let mnemonic
  if (fs.existsSync(walletFile)) {
    mnemonic = JSON.parse(fs.readFileSync(walletFile, 'utf8')).mnemonic
  } else {
    mnemonic = await mnemonicNew()
    fs.writeFileSync(walletFile, JSON.stringify({ mnemonic }))
  }
  
  const keyPair = await mnemonicToPrivateKey(mnemonic)
  const wallet = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 })
  const walletContract = client.open(wallet)
  const walletAddress = wallet.address.toString({ bounceable: false, urlSafe: true })
  
  // Check balance
  let balance = 0n
  try { balance = await walletContract.getBalance() } catch {}
  
  if (balance < 200000000n) {
    console.log(JSON.stringify({
      success: false,
      walletAddress,
      needsFunding: true,
      message: 'Testnet wallet needs funding. Send at least 0.2 testnet TON to: ' + walletAddress + '\\nGet free testnet TON: https://t.me/testgiver_ton_bot'
    }))
    return
  }
  
  const boc = fs.readFileSync('${resolvedBoc}')
  const codeCell = Cell.fromBoc(boc)[0]
  
  const stateInit = { code: codeCell, data: new Cell() }
  
  const seqno = await walletContract.getSeqno()
  const transfer = walletContract.createTransfer({
    seqno,
    secretKey: keyPair.secretKey,
    messages: [internal({
      to: wallet.address,
      value: BigInt('${value}'),
      bounce: false,
      init: stateInit,
      body: '',
    })]
  })
  
  await client.sendExternalMessage(wallet, transfer)
  
  // Compute contract address from stateInit
  const { Address, contractAddress } = require('@ton/core')
  const addr = contractAddress(0, stateInit)
  const addrStr = addr.toString({ bounceable: true, urlSafe: true, testOnly: true })
  
  console.log(JSON.stringify({
    success: true,
    address: addrStr,
    walletAddress,
    explorerUrl: '${TESTNET_EXPLORER}/' + addrStr,
    network: 'testnet',
    message: 'Contract deployed to testnet at ' + addrStr
  }))
}

deploy().catch(e => console.log(JSON.stringify({ success: false, error: e.message })))
`

  const scriptPath = path.join(workspaceRoot, '_deploy_testnet.cjs')
  writeFileSync(scriptPath, deployScript)

  const setupCmd = `cd "${workspaceRoot}" && npm ls @ton/ton 2>/dev/null || npm install @ton/ton @ton/crypto @ton/core 2>&1 | tail -3`
  await runCommand(setupCmd, { timeout: 120_000 })

  const runResult = await runCommand(`cd "${workspaceRoot}" && node _deploy_testnet.cjs 2>&1`, { timeout: 60_000 })
  const output = (runResult.stdout + runResult.stderr).trim()

  let parsed: Record<string, unknown> = {}
  try {
    const jsonLine = output.split('\n').find(l => l.trim().startsWith('{'))
    if (jsonLine) parsed = JSON.parse(jsonLine)
  } catch {}

  if (parsed['needsFunding']) {
    return {
      success: false,
      error: parsed['message'] as string,
      data: { walletAddress: parsed['walletAddress'], needsFunding: true, faucet: 'https://t.me/testgiver_ton_bot' },
    }
  }

  if (parsed['success']) {
    return {
      success: true,
      data: {
        address: parsed['address'],
        explorerUrl: parsed['explorerUrl'],
        network: 'testnet',
        walletAddress: parsed['walletAddress'],
        message: parsed['message'],
      },
    }
  }

  return { success: false, error: parsed['error'] as string ?? output }
}
