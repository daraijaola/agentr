/**
 * AGENTR Fine-Tune Dataset Generator
 *
 * Generates a high-quality JSONL training dataset by prompting Claude (via AIR)
 * with seed questions covering AGENTR, TON, Telegram, and AI agent development.
 *
 * Usage:
 *   node scripts/generate-dataset.mjs
 *
 * Env vars required (from .env or exported):
 *   AIR_BASE_URL   — your AIR gateway URL (e.g. https://air.agentr.online/api/v1)
 *   OPENAI_API_KEY — your AIR API key
 *
 * Output:
 *   dataset/agentr-dataset.jsonl   — final training file
 *   dataset/progress.json          — progress tracker (allows resuming)
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

// Load .env manually (no dotenv dep needed)
const envPath = path.join(ROOT, '.env')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const [k, ...vs] = line.split('=')
    if (k && vs.length && !k.startsWith('#')) {
      process.env[k.trim()] = vs.join('=').trim().replace(/^["']|["']$/g, '')
    }
  }
}

const AIR_BASE_URL = process.env.AIR_BASE_URL
const API_KEY = process.env.OPENAI_API_KEY
const MODEL = process.env.DATASET_MODEL ?? 'claude-sonnet-4-5'
const DATASET_DIR = path.join(ROOT, 'dataset')
const OUTPUT_FILE = path.join(DATASET_DIR, 'agentr-dataset.jsonl')
const PROGRESS_FILE = path.join(DATASET_DIR, 'progress.json')
const CONCURRENCY = 3       // parallel API calls
const DELAY_MS = 800        // ms between batches (rate limit safety)

if (!AIR_BASE_URL || !API_KEY) {
  console.error('ERROR: AIR_BASE_URL and OPENAI_API_KEY must be set in .env or environment')
  process.exit(1)
}

fs.mkdirSync(DATASET_DIR, { recursive: true })

// ─── SYSTEM PROMPT ──────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert developer specializing in:
- TON blockchain (FunC and Tact smart contracts, jettons, NFTs, wallets, DNS)
- Telegram (GramJS user-client automation, Bot API, Telegram Mini Apps / Web Apps)
- AI agent development (tool calling, agentic loops, system prompts, multi-agent swarms)
- AGENTR platform (building AI agents that act as real Telegram accounts using GramJS)
- TypeScript and Node.js backend development

When answering, always:
1. Give complete, working code examples (not pseudocode)
2. Use TypeScript where applicable
3. Explain the key concepts concisely before the code
4. Mention common pitfalls and how to avoid them
5. Keep answers practical and production-focused`

// ─── SEED PROMPTS ───────────────────────────────────────────────────────────
// Organized by category. Each will be sent to Claude to generate a response.

const SEED_PROMPTS = [

  // ── AGENTR TOOL BUILDING ──────────────────────────────────────────────────
  {
    category: 'agentr',
    prompt: 'How do I build a custom tool for an AGENTR AI agent? Show the complete TypeScript interface including name, description, parameters schema, and execute function.',
  },
  {
    category: 'agentr',
    prompt: 'Explain how AGENTR uses GramJS to operate a real Telegram account (not a bot). What makes this different from the Telegram Bot API and what can it do that bots cannot?',
  },
  {
    category: 'agentr',
    prompt: 'Write an AGENTR tool called "telegram_summarize_chat" that reads the last 50 messages from a chat and returns a summary. Include the full TypeScript tool definition with TypeBox schema.',
  },
  {
    category: 'agentr',
    prompt: 'How does an AGENTR agent tool call work end-to-end? Walk through the agentic loop from user message to tool execution to final response.',
  },
  {
    category: 'agentr',
    prompt: 'Build an AGENTR tool that monitors a Telegram group for new messages matching a keyword and sends a notification to the agent owner. Show the complete implementation.',
  },
  {
    category: 'agentr',
    prompt: 'How do you write an AGENTR tool that interacts with an external REST API? Show an example that fetches cryptocurrency prices and returns formatted data.',
  },
  {
    category: 'agentr',
    prompt: 'Explain the TypeBox schema system used for AGENTR tool parameters. How do you define optional parameters, enums, arrays, and nested objects?',
  },
  {
    category: 'agentr',
    prompt: 'Write an AGENTR swarm that parallelizes research: one sub-agent fetches news, another fetches prices, and the orchestrator combines both into a daily briefing.',
  },
  {
    category: 'agentr',
    prompt: 'How do you persist data between AGENTR agent conversations? Explain the MEMORY.md pattern and show how to use memory_write and memory_read tools correctly.',
  },
  {
    category: 'agentr',
    prompt: 'Create an AGENTR tool that reads a file from the agent workspace, processes its content (e.g. parses CSV), and returns structured data to the agent.',
  },

  // ── TON BLOCKCHAIN ────────────────────────────────────────────────────────
  {
    category: 'ton',
    prompt: 'Write a complete FunC smart contract for a simple TON jetton (token) with mint, burn, and transfer operations. Include the storage layout and all required get methods.',
  },
  {
    category: 'ton',
    prompt: 'Explain the TON blockchain cell structure. How are cells, slices, and builders used in FunC? Show examples of serializing and deserializing custom data.',
  },
  {
    category: 'ton',
    prompt: 'How do you send a TON transaction using the TonWeb or @ton/ton TypeScript library? Show a complete example that builds, signs, and broadcasts a transfer.',
  },
  {
    category: 'ton',
    prompt: 'Write a Tact smart contract for a simple decentralized voting system on TON. Include proposal creation, voting, and result tallying.',
  },
  {
    category: 'ton',
    prompt: 'How do TON DNS domains work? Explain the auction mechanism, how to bid, and how to link a domain to a TON smart contract address.',
  },
  {
    category: 'ton',
    prompt: 'Explain the difference between workchain 0 and workchain -1 (masterchain) in TON. When would a smart contract need to be deployed to the masterchain?',
  },
  {
    category: 'ton',
    prompt: 'How do you query the TON blockchain using the toncenter.com API? Show examples for getting account state, transaction history, and calling get methods on a contract.',
  },
  {
    category: 'ton',
    prompt: 'Write a TypeScript script that deploys a FunC smart contract to TON testnet. Show the compilation step, state init construction, and deployment transaction.',
  },
  {
    category: 'ton',
    prompt: 'How do TON NFTs work technically? Explain the NFT item and NFT collection contract architecture, and show how to mint an NFT using TypeScript.',
  },
  {
    category: 'ton',
    prompt: 'What are TON jetton wallets and how do they differ from regular wallets? Show how to send a jetton transfer message from a TypeScript application.',
  },
  {
    category: 'ton',
    prompt: 'Explain TON\'s message passing model. What is the difference between internal and external messages, and how do bounced messages work?',
  },
  {
    category: 'ton',
    prompt: 'Write a Tact contract for an escrow service on TON: buyer locks funds, seller confirms delivery, funds release. Include safety timeouts.',
  },
  {
    category: 'ton',
    prompt: 'How do you implement a TON wallet v4 contract interaction in TypeScript? Show how to create the wallet, get the address, and execute transfers.',
  },

  // ── TELEGRAM / GRAMJS ─────────────────────────────────────────────────────
  {
    category: 'telegram',
    prompt: 'How do you initialize and authenticate a GramJS TelegramClient as a real user account? Show the complete authentication flow including phone number, code, and 2FA handling.',
  },
  {
    category: 'telegram',
    prompt: 'Write a GramJS script that listens for new messages in a specific Telegram group and forwards any message containing a keyword to a private chat.',
  },
  {
    category: 'telegram',
    prompt: 'How do you send messages with media attachments (photos, videos, documents) using GramJS? Show examples for each media type.',
  },
  {
    category: 'telegram',
    prompt: 'Explain Telegram Mini Apps (Web Apps). How do you create one, register it with BotFather, and access user data from the Telegram.WebApp JavaScript SDK?',
  },
  {
    category: 'telegram',
    prompt: 'How do you create and manage a Telegram group or channel programmatically using GramJS? Show how to create, set permissions, invite users, and post messages.',
  },
  {
    category: 'telegram',
    prompt: 'Write a complete Telegram bot in Node.js using node-telegram-bot-api that handles /start, /help commands, inline keyboards, and callback queries.',
  },
  {
    category: 'telegram',
    prompt: 'How do you implement flood control and rate limiting when sending many Telegram messages with GramJS? What is FloodWaitError and how should you handle it?',
  },
  {
    category: 'telegram',
    prompt: 'Explain how Telegram sessions work in GramJS. How do you save and restore a session so users don\'t have to authenticate every time?',
  },
  {
    category: 'telegram',
    prompt: 'How do you scrape and export chat history from a Telegram group using GramJS? Show how to paginate through messages and export to JSON.',
  },
  {
    category: 'telegram',
    prompt: 'Write a Telegram bot that integrates with the TON blockchain: users send their wallet address, the bot checks their balance and NFT holdings and replies.',
  },
  {
    category: 'telegram',
    prompt: 'How do you use Telegram inline bots? Show how to implement an inline query handler that returns results when users type @yourbot in any chat.',
  },
  {
    category: 'telegram',
    prompt: 'How do you implement Telegram Stars payment in a bot? Show the complete flow from invoice creation to payment confirmation.',
  },

  // ── AI AGENT DEVELOPMENT ──────────────────────────────────────────────────
  {
    category: 'agents',
    prompt: 'Explain the agentic loop pattern for AI agents. How does tool calling work in the context of LLM APIs? Show a complete implementation in TypeScript.',
  },
  {
    category: 'agents',
    prompt: 'How do you design an effective system prompt for an AI agent that needs to use tools? What elements make a system prompt that reliably produces tool calls?',
  },
  {
    category: 'agents',
    prompt: 'Implement a multi-agent swarm in TypeScript where a coordinator agent decomposes a task and spawns specialized sub-agents that run in parallel.',
  },
  {
    category: 'agents',
    prompt: 'How do you implement tool calling with the Anthropic Claude API? Show the full request/response cycle including tool definitions, tool use blocks, and tool results.',
  },
  {
    category: 'agents',
    prompt: 'What are the best practices for AI agent memory management? Compare short-term (conversation history), working memory (context window), and long-term (file/DB) approaches.',
  },
  {
    category: 'agents',
    prompt: 'How do you handle tool call errors in an agentic loop? Show a robust TypeScript implementation that retries, escalates errors to the model, and prevents infinite loops.',
  },
  {
    category: 'agents',
    prompt: 'Explain prompt injection attacks on AI agents. How can a malicious message in a Telegram group trick the agent into taking unintended actions? How do you defend against this?',
  },
  {
    category: 'agents',
    prompt: 'How do you implement streaming responses from an AI agent to Telegram? Show how to send typing indicators and update messages as the LLM generates output.',
  },
  {
    category: 'agents',
    prompt: 'Design an AI agent that can autonomously deploy and manage Node.js microservices: it writes code, installs dependencies, starts processes, monitors logs, and self-heals on errors.',
  },
  {
    category: 'agents',
    prompt: 'How do you implement rate limiting and credit systems for a multi-tenant AI agent SaaS? Show a TypeScript implementation that tracks usage per tenant and enforces limits.',
  },
  {
    category: 'agents',
    prompt: 'Explain the difference between ReAct, Chain-of-Thought, and tool-use prompting strategies for AI agents. When should you use each?',
  },
  {
    category: 'agents',
    prompt: 'Build an AI agent that can search the web, extract relevant information, and synthesize a structured report. Show the tool definitions and agentic loop.',
  },

  // ── TYPESCRIPT / NODE.JS ──────────────────────────────────────────────────
  {
    category: 'typescript',
    prompt: 'Explain TypeBox schema validation in TypeScript. How do you define schemas, validate data at runtime, and use them for both type inference and JSON Schema generation?',
  },
  {
    category: 'typescript',
    prompt: 'How do you build a type-safe REST API with Hono.js in TypeScript? Show middleware, route definitions, request validation, and error handling.',
  },
  {
    category: 'typescript',
    prompt: 'What is a pnpm monorepo and how do you structure one with multiple packages (core, api, frontend)? Show workspace configuration and cross-package imports.',
  },
  {
    category: 'typescript',
    prompt: 'How do you implement a robust job queue in Node.js for processing background tasks? Show a TypeScript implementation with concurrency control and retry logic.',
  },
  {
    category: 'typescript',
    prompt: 'Explain PostgreSQL connection pooling with node-postgres (pg). How do you manage connections in a multi-tenant SaaS with per-tenant data isolation?',
  },
  {
    category: 'typescript',
    prompt: 'How do you implement WebSocket connections in a Node.js/Hono server for real-time features? Show a TypeScript implementation with reconnection handling on the client.',
  },
  {
    category: 'typescript',
    prompt: 'Write a TypeScript utility for parsing and sanitizing AI model responses that may contain raw JSON, XML tool call blocks, or code that should not reach end users.',
  },
  {
    category: 'typescript',
    prompt: 'How do you manage environment variables and secrets securely in a Node.js TypeScript project? What are the best practices for local dev, staging, and production?',
  },
  {
    category: 'typescript',
    prompt: 'Explain how to implement a debouncer and batch processor in TypeScript for high-frequency events like incoming Telegram messages.',
  },
  {
    category: 'typescript',
    prompt: 'How do you write a TypeScript module that wraps an external API with automatic retry, exponential backoff, circuit breaker, and request deduplication?',
  },

  // ── COMBINED / APPLIED SCENARIOS ─────────────────────────────────────────
  {
    category: 'applied',
    prompt: 'Build a complete AI trading signal bot: it monitors TON DEX prices via API, uses an LLM to analyze trends, and sends Telegram alerts when a trade signal is detected.',
  },
  {
    category: 'applied',
    prompt: 'How would you architect an AI agent SaaS on TON/Telegram where each user gets their own agent running as a real Telegram account? Cover authentication, isolation, and billing.',
  },
  {
    category: 'applied',
    prompt: 'Build a Telegram Mini App that lets users connect their TON wallet (using TON Connect), view their NFT collection, and transfer NFTs to friends — all within Telegram.',
  },
  {
    category: 'applied',
    prompt: 'Design a multi-agent system where a manager agent receives tasks from Telegram, decomposes them, assigns sub-agents, and reports completion back. Show the full TypeScript implementation.',
  },
  {
    category: 'applied',
    prompt: 'How do you build a Telegram group management bot that auto-bans spam, welcomes new members, enforces rules using AI content moderation, and generates daily activity reports?',
  },
  {
    category: 'applied',
    prompt: 'Create a Web3 social agent on TON: it posts to a Telegram channel, mints NFTs for popular posts, and uses TON DNS to point a .ton domain to the content. Show the full flow.',
  },
  {
    category: 'applied',
    prompt: 'How would you implement a TON-based subscription system where users pay in TON to unlock premium AI agent features, with on-chain verification and automatic access grant via Telegram?',
  },
  {
    category: 'applied',
    prompt: 'Build an AI code review agent: it listens for GitHub webhook events via Telegram, fetches the PR diff, asks an LLM to review it, and posts the review as a Telegram message.',
  },
  {
    category: 'applied',
    prompt: 'Design a Telegram-based AI secretary agent that reads your emails (via IMAP), summarizes them, drafts replies, manages your calendar, and sends daily briefings to your Telegram.',
  },
  {
    category: 'applied',
    prompt: 'How do you build a production-ready deployment pipeline where an AI agent can write code, test it in a sandbox, deploy to a server via SSH, and rollback on failure?',
  },

  // ── FINE-TUNING & ML ──────────────────────────────────────────────────────
  {
    category: 'ml',
    prompt: 'How do you fine-tune Qwen2.5-Coder using Unsloth on a single GPU? Show the complete training script including dataset loading, LoRA config, and training loop.',
  },
  {
    category: 'ml',
    prompt: 'What format should a fine-tuning dataset be in for instruction following? Show ChatML and Alpaca formats and explain when to use each.',
  },
  {
    category: 'ml',
    prompt: 'How do you generate a high-quality synthetic dataset for fine-tuning a coding AI? What prompts, topics, and quality filters should you use?',
  },
  {
    category: 'ml',
    prompt: 'How do you evaluate a fine-tuned coding model? What benchmarks and metrics are most relevant for a model specialized in TON/Telegram development?',
  },
  {
    category: 'ml',
    prompt: 'How do you deploy a fine-tuned LLM with llama.cpp as an OpenAI-compatible API server? Show the setup, quantization, and configuration for production use.',
  },
  {
    category: 'ml',
    prompt: 'Explain LoRA and QLoRA for LLM fine-tuning. What rank, alpha, and target modules should you use for a 3B coding model?',
  },
]

// ─── VARIATION GENERATOR ────────────────────────────────────────────────────
// For each seed, generate paraphrased versions to increase dataset diversity
const VARIATION_PREFIXES = [
  'Explain in detail: ',
  'Give me a step-by-step guide on how to ',
  'Show me a complete working example of ',
  'What are the best practices for ',
  'I\'m a developer new to TON. How do I ',
  'Compare the approaches for ',
  'Debug this: I\'m trying to ',
  'Write production-ready code that ',
]

function buildVariationPrompt(original) {
  // Pick a random prefix variation to create a paraphrased version
  const prefix = VARIATION_PREFIXES[Math.floor(Math.random() * VARIATION_PREFIXES.length)]
  // Lowercase first char of original and prepend prefix (simple variation)
  const lower = original.charAt(0).toLowerCase() + original.slice(1)
  return prefix + lower
}

// ─── API CALL ───────────────────────────────────────────────────────────────
async function generateResponse(prompt, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(`${AIR_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4096,
          temperature: 0.7,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
        }),
      })

      if (!res.ok) {
        const err = await res.text()
        if (res.status === 429) {
          console.log(`  Rate limited, waiting 30s...`)
          await sleep(30_000)
          continue
        }
        throw new Error(`API error ${res.status}: ${err.slice(0, 200)}`)
      }

      const data = await res.json()
      const content = data.choices?.[0]?.message?.content ?? ''
      if (!content) throw new Error('Empty response from API')
      return content
    } catch (err) {
      if (attempt === retries - 1) throw err
      console.log(`  Attempt ${attempt + 1} failed: ${err.message} — retrying...`)
      await sleep(2000 * (attempt + 1))
    }
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function loadProgress() {
  if (!fs.existsSync(PROGRESS_FILE)) return new Set()
  try {
    const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'))
    return new Set(data.completed ?? [])
  } catch { return new Set() }
}

function saveProgress(completed) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ completed: [...completed], updatedAt: new Date().toISOString() }, null, 2))
}

function appendRecord(record) {
  fs.appendFileSync(OUTPUT_FILE, JSON.stringify(record) + '\n', 'utf-8')
}

function formatRecord(prompt, response, category) {
  return {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
      { role: 'assistant', content: response },
    ],
    metadata: { category, generated_at: new Date().toISOString(), model: MODEL },
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════╗')
  console.log('║       AGENTR Fine-Tune Dataset Generator             ║')
  console.log('╚══════════════════════════════════════════════════════╝')
  console.log(`  Model:   ${MODEL}`)
  console.log(`  AIR URL: ${AIR_BASE_URL}`)
  console.log(`  Output:  ${OUTPUT_FILE}`)
  console.log()

  // Build full prompt list: seed + one variation per seed
  const allPrompts = []
  for (const seed of SEED_PROMPTS) {
    allPrompts.push({ id: `seed:${seed.category}:${seed.prompt.slice(0, 60)}`, category: seed.category, prompt: seed.prompt })
    allPrompts.push({ id: `var:${seed.category}:${seed.prompt.slice(0, 60)}`, category: seed.category, prompt: buildVariationPrompt(seed.prompt) })
  }

  const completed = loadProgress()
  const pending = allPrompts.filter(p => !completed.has(p.id))

  console.log(`  Total prompts:    ${allPrompts.length}`)
  console.log(`  Already done:     ${completed.size}`)
  console.log(`  Remaining:        ${pending.length}`)
  console.log()

  if (pending.length === 0) {
    console.log('✅ All prompts already completed! Dataset is at:', OUTPUT_FILE)
    const lines = fs.readFileSync(OUTPUT_FILE, 'utf-8').trim().split('\n').filter(Boolean)
    console.log(`   Total records: ${lines.length}`)
    return
  }

  let done = 0
  const total = pending.length
  const byCategory = {}

  // Process in batches of CONCURRENCY
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY)

    const results = await Promise.allSettled(
      batch.map(async (item) => {
        try {
          const response = await generateResponse(item.prompt)
          const record = formatRecord(item.prompt, response, item.category)
          appendRecord(record)
          completed.add(item.id)
          byCategory[item.category] = (byCategory[item.category] ?? 0) + 1
          done++
          const pct = Math.round((done / total) * 100)
          console.log(`  [${done}/${total} ${pct}%] ✓ ${item.category} — ${item.prompt.slice(0, 55)}...`)
          return true
        } catch (err) {
          console.error(`  [FAILED] ${item.prompt.slice(0, 55)}... — ${err.message}`)
          return false
        }
      })
    )

    saveProgress(completed)

    const allFailed = results.every(r => r.status === 'fulfilled' && r.value === false)
    if (allFailed) {
      console.error('\n⚠️  All items in batch failed — pausing 60s before continuing...')
      await sleep(60_000)
    } else {
      await sleep(DELAY_MS)
    }
  }

  // Summary
  console.log()
  console.log('╔══════════════════════════════════════════════════════╗')
  console.log('║                  Dataset Complete!                   ║')
  console.log('╚══════════════════════════════════════════════════════╝')
  const lines = fs.existsSync(OUTPUT_FILE)
    ? fs.readFileSync(OUTPUT_FILE, 'utf-8').trim().split('\n').filter(Boolean).length
    : 0
  console.log(`  Total records:   ${lines}`)
  console.log(`  Output file:     ${OUTPUT_FILE}`)
  console.log()
  console.log('  Records by category:')
  for (const [cat, count] of Object.entries(byCategory)) {
    console.log(`    ${cat.padEnd(12)} ${count}`)
  }
  console.log()
  console.log('  Next steps:')
  console.log('  1. Copy dataset/agentr-dataset.jsonl to your GPU server (RunPod/Vast.ai)')
  console.log('  2. Run fine-tuning with Unsloth on Qwen2.5-Coder-3B')
  console.log('  3. Use scripts/finetune-config.yaml for the training config')
  console.log()
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
