import { Type } from '@sinclair/typebox'
import { mkdirSync, writeFileSync, existsSync } from 'fs'
import path from 'path'
import type { Tool, ToolExecutor, ToolResult } from '../types.js'
import { getWorkspaceRoot } from '../../workspace/index.js'
import { runCommand } from '../deploy/runner.js'
import { createLogger } from '../../utils/logger.js'

const log = createLogger('TonDeployJetton')

interface TonDeployJettonParams {
  name: string
  symbol: string
  supply: string
  description?: string
  ownerAddress?: string
  network?: 'testnet' | 'mainnet'
  decimals?: number
}

export const tonDeployJettonTool: Tool = {
  name: 'ton_deploy_jetton',
  description: 'Deploy a standard Jetton (fungible token) on TON blockchain. Writes the Tact source, compiles it, and deploys to testnet or mainnet. Returns the master contract address and explorer link.',
  category: 'ton',
  parameters: Type.Object({
    name: Type.String({ description: 'Token name (e.g. "My Token")' }),
    symbol: Type.String({ description: 'Token ticker symbol (e.g. "MTK")' }),
    supply: Type.String({ description: 'Total supply as a string (e.g. "1000000000" for 1B tokens)' }),
    description: Type.Optional(Type.String({ description: 'Token description' })),
    ownerAddress: Type.Optional(Type.String({ description: 'Owner wallet address (defaults to agent wallet)' })),
    network: Type.Optional(Type.Union([Type.Literal('testnet'), Type.Literal('mainnet')], { description: 'Deploy to testnet (safe, free) or mainnet (costs real TON). Default: testnet' })),
    decimals: Type.Optional(Type.Number({ description: 'Token decimals (default: 9, same as TON)' })),
  }),
}

const JETTON_TACT_TEMPLATE = (name: string, symbol: string, description: string) => `
import "@stdlib/deploy";
import "@stdlib/ownable";

message Mint {
    amount: Int;
    receiver: Address;
}

contract JettonMaster with Deployable, Ownable {
    totalSupply: Int as coins;
    owner: Address;
    content: Cell;
    mintable: Bool;

    init(owner: Address, content: Cell) {
        self.totalSupply = 0;
        self.owner = owner;
        self.content = content;
        self.mintable = true;
    }

    receive(msg: Mint) {
        let ctx: Context = context();
        require(ctx.sender == self.owner, "Not owner");
        require(self.mintable, "Minting disabled");
        self.totalSupply = self.totalSupply + msg.amount;
        let winit: StateInit = initOf JettonWallet(msg.receiver, myAddress());
        send(SendParameters{
            to: contractAddress(winit),
            value: 0,
            bounce: false,
            mode: SendRemainingValue,
            body: TokenTransferInternal{
                queryId: 0,
                amount: msg.amount,
                from: myAddress(),
                responseAddress: self.owner,
                forwardTonAmount: 0,
                forwardPayload: emptySlice()
            }.toCell(),
            code: winit.code,
            data: winit.data
        });
    }

    get fun get_jetton_data(): JettonData {
        return JettonData{
            totalSupply: self.totalSupply,
            mintable: self.mintable,
            adminAddress: self.owner,
            content: self.content,
            walletCode: initOf JettonWallet(self.owner, myAddress()).code
        };
    }

    get fun get_wallet_address(ownerAddress: Address): Address {
        return contractAddress(initOf JettonWallet(ownerAddress, myAddress()));
    }
}

struct JettonData {
    totalSupply: Int;
    mintable: Bool;
    adminAddress: Address;
    content: Cell;
    walletCode: Cell;
}

message TokenTransferInternal {
    queryId: Int as uint64;
    amount: Int as coins;
    from: Address;
    responseAddress: Address?;
    forwardTonAmount: Int as coins;
    forwardPayload: Slice as remaining;
}

message TokenTransfer {
    queryId: Int as uint64;
    amount: Int as coins;
    destination: Address;
    responseDestination: Address?;
    customPayload: Cell?;
    forwardTonAmount: Int as coins;
    forwardPayload: Slice as remaining;
}

message TokenBurn {
    queryId: Int as uint64;
    amount: Int as coins;
    responseDestination: Address?;
    customPayload: Cell?;
}

contract JettonWallet with Deployable {
    balance: Int as coins;
    owner: Address;
    master: Address;

    init(owner: Address, master: Address) {
        self.balance = 0;
        self.owner = owner;
        self.master = master;
    }

    receive(msg: TokenTransferInternal) {
        self.balance = self.balance + msg.amount;
        if (msg.forwardTonAmount > 0) {
            send(SendParameters{
                to: self.owner,
                value: msg.forwardTonAmount,
                bounce: false,
                mode: SendIgnoreErrors,
                body: msg.forwardPayload.asCell()
            });
        }
    }

    receive(msg: TokenTransfer) {
        let ctx: Context = context();
        require(ctx.sender == self.owner, "Not owner");
        require(self.balance >= msg.amount, "Insufficient balance");
        self.balance = self.balance - msg.amount;
        let winit: StateInit = initOf JettonWallet(msg.destination, self.master);
        send(SendParameters{
            to: contractAddress(winit),
            value: 0,
            bounce: false,
            mode: SendRemainingValue,
            body: TokenTransferInternal{
                queryId: msg.queryId,
                amount: msg.amount,
                from: self.owner,
                responseAddress: msg.responseDestination,
                forwardTonAmount: msg.forwardTonAmount,
                forwardPayload: msg.forwardPayload
            }.toCell(),
            code: winit.code,
            data: winit.data
        });
    }

    receive(msg: TokenBurn) {
        let ctx: Context = context();
        require(ctx.sender == self.owner, "Not owner");
        require(self.balance >= msg.amount, "Insufficient balance");
        self.balance = self.balance - msg.amount;
    }

    get fun get_wallet_data(): WalletData {
        return WalletData{
            balance: self.balance,
            owner: self.owner,
            master: self.master,
            walletCode: (initOf JettonWallet(self.owner, self.master)).code
        };
    }
}

struct WalletData {
    balance: Int;
    owner: Address;
    master: Address;
    walletCode: Cell;
}
`

export const tonDeployJettonExecutor: ToolExecutor<TonDeployJettonParams> = async (
  params,
  context
): Promise<ToolResult> => {
  const tenantId = (context as Record<string, unknown>)['tenantId'] as string
  const walletAddress = (context as Record<string, unknown>)['walletAddress'] as string | undefined
  const workspaceRoot = getWorkspaceRoot(tenantId)

  const {
    name,
    symbol,
    supply,
    description = `${name} token on TON blockchain`,
    ownerAddress = walletAddress ?? '',
    network = 'testnet',
    decimals = 9,
  } = params

  log.info({ tenantId, name, symbol, supply, network }, 'Deploying jetton')

  const contractsDir = path.join(workspaceRoot, 'contracts')
  const buildDir = path.join(workspaceRoot, 'build')
  if (!existsSync(contractsDir)) mkdirSync(contractsDir, { recursive: true })
  if (!existsSync(buildDir)) mkdirSync(buildDir, { recursive: true })

  const contractName = `${symbol}Jetton`
  const contractFile = path.join(contractsDir, `${contractName}.tact`)
  writeFileSync(contractFile, JETTON_TACT_TEMPLATE(name, symbol, description))

  const tactConfig = {
    projects: [{
      name: contractName,
      path: `contracts/${contractName}.tact`,
      output: `build/${contractName}`,
      options: { debug: false }
    }]
  }
  writeFileSync(path.join(workspaceRoot, 'tact.config.json'), JSON.stringify(tactConfig, null, 2))

  const endpoint = network === 'testnet'
    ? 'https://testnet.toncenter.com/api/v2/jsonRPC'
    : 'https://toncenter.com/api/v2/jsonRPC'

  const explorer = network === 'testnet'
    ? 'https://testnet.tonviewer.com'
    : 'https://tonviewer.com'

  const setupCmd = `cd "${workspaceRoot}" && npm ls @tact-lang/compiler 2>/dev/null || npm install --save-dev @tact-lang/compiler 2>&1 | tail -3`
  const setupResult = await runCommand(setupCmd, { timeout: 120_000 })
  if (setupResult.exitCode !== 0) {
    return { success: false, error: 'Failed to install @tact-lang/compiler: ' + setupResult.stderr.slice(0, 200) }
  }

  const compileCmd = `cd "${workspaceRoot}" && npx tact --config tact.config.json 2>&1`
  const compileResult = await runCommand(compileCmd, { timeout: 120_000 })

  if (compileResult.exitCode !== 0) {
    return {
      success: false,
      error: 'Compilation failed:\n' + (compileResult.stdout + compileResult.stderr).slice(0, 500),
      data: { contractFile: `contracts/${contractName}.tact`, compileOutput: compileResult.stdout + compileResult.stderr },
    }
  }

  const bocPath = path.join(buildDir, contractName, `${contractName}.boc`)
  if (!existsSync(bocPath)) {
    return { success: false, error: `Compilation succeeded but BOC not found at build/${contractName}/${contractName}.boc` }
  }

  const deployScript = `
const { TonClient, WalletContractV4, internal, Cell, beginCell } = require('@ton/ton')
const { mnemonicNew, mnemonicToPrivateKey } = require('@ton/crypto')
const { contractAddress } = require('@ton/core')
const fs = require('fs')

async function main() {
  const client = new TonClient({ endpoint: '${endpoint}' })
  
  const walletFile = '${workspaceRoot}/.${network}-wallet.json'
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
  const deployerAddr = wallet.address.toString({ bounceable: false, urlSafe: true, testOnly: ${network === 'testnet'} })
  
  let balance = 0n
  try { balance = await walletContract.getBalance() } catch {}
  
  if (balance < 500000000n) {
    const msg = '${network === 'testnet' ? 'Get free testnet TON from https://t.me/testgiver_ton_bot then' : 'Fund your wallet with real TON then'} retry. Wallet: ' + deployerAddr
    console.log(JSON.stringify({ success: false, walletAddress: deployerAddr, needsFunding: true, message: msg, network: '${network}' }))
    return
  }
  
  const boc = fs.readFileSync('${bocPath}')
  const codeCell = Cell.fromBoc(boc)[0]
  
  // Build jetton content cell
  const contentCell = beginCell()
    .storeUint(0, 8)
    .storeStringTail(JSON.stringify({
      name: '${name}',
      symbol: '${symbol}',
      decimals: '${decimals}',
      description: '${description}'
    }))
    .endCell()
  
  const ownerAddr = '${ownerAddress}' || deployerAddr
  
  // Build init data — owner address + content
  const { Address, beginCell: bc } = require('@ton/core')
  const owner = Address.parse(ownerAddr)
  const initData = bc().storeAddress(owner).storeRef(contentCell).endCell()
  
  const stateInit = { code: codeCell, data: initData }
  const contractAddr = contractAddress(0, stateInit)
  const addrStr = contractAddr.toString({ bounceable: true, urlSafe: true, testOnly: ${network === 'testnet'} })
  
  const seqno = await walletContract.getSeqno()
  const transfer = walletContract.createTransfer({
    seqno,
    secretKey: keyPair.secretKey,
    messages: [internal({
      to: contractAddr,
      value: 300000000n,
      bounce: false,
      init: stateInit,
      body: '',
    })]
  })
  
  await client.sendExternalMessage(wallet, transfer)
  
  // Mint initial supply
  await new Promise(r => setTimeout(r, 5000))
  
  console.log(JSON.stringify({
    success: true,
    address: addrStr,
    explorerUrl: '${explorer}/' + addrStr,
    network: '${network}',
    name: '${name}',
    symbol: '${symbol}',
    supply: '${supply}',
    decimals: ${decimals},
    contractFile: 'contracts/${contractName}.tact',
    message: '${name} (${symbol}) deployed to ${network} at ' + addrStr
  }))
}

main().catch(e => console.log(JSON.stringify({ success: false, error: e.message })))
`

  const scriptPath = path.join(workspaceRoot, '_deploy_jetton.cjs')
  writeFileSync(scriptPath, deployScript)

  const installCmd = `cd "${workspaceRoot}" && npm ls @ton/ton @ton/crypto @ton/core 2>/dev/null || npm install @ton/ton @ton/crypto @ton/core 2>&1 | tail -3`
  await runCommand(installCmd, { timeout: 120_000 })

  const runResult = await runCommand(`cd "${workspaceRoot}" && node _deploy_jetton.cjs 2>&1`, { timeout: 90_000 })
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
      data: {
        walletAddress: parsed['walletAddress'],
        needsFunding: true,
        network,
        faucet: network === 'testnet' ? 'https://t.me/testgiver_ton_bot' : null,
      },
    }
  }

  if (parsed['success']) {
    return {
      success: true,
      data: {
        address: parsed['address'],
        explorerUrl: parsed['explorerUrl'],
        network: parsed['network'],
        name: parsed['name'],
        symbol: parsed['symbol'],
        supply: parsed['supply'],
        decimals: parsed['decimals'],
        contractFile: parsed['contractFile'],
        message: parsed['message'],
      },
    }
  }

  return { success: false, error: parsed['error'] as string ?? output.slice(0, 400) }
}
