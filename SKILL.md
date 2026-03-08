---
name: aawp
version: 1.2.0
description: >
  AAWP (AI Agent Wallet Protocol) — the only crypto wallet protocol built exclusively
  for AI Agents on EVM-compatible blockchains. Not for humans. The signer is the AI Agent
  itself, cryptographically bound at wallet creation. Supports wallet lifecycle management,
  token transfers, DEX swaps, cross-chain bridging, arbitrary contract interactions,
  DCA automation, and price alerts.
environment:
  - name: AAWP_GUARDIAN_KEY
    description: "Private key for the Guardian gas-relay wallet (auto-generated in config/guardian.json if not set)"
    required: false
  - name: AAWP_GAS_KEY
    description: "Alias for AAWP_GUARDIAN_KEY"
    required: false
  - name: AAWP_WALLET
    description: "Pinned wallet address — prevents accidental operations on wrong wallet"
    required: false
  - name: AAWP_CONFIG
    description: "Override config directory path (default: ./config)"
    required: false
  - name: AAWP_CORE
    description: "Override native addon directory path (default: ./core)"
    required: false
  - name: AAWP_SKILL
    description: "Override skill root directory path"
    required: false
  - name: AAWP_AI_TOKEN
    description: "Daemon auth token (auto-generated at startup, not user-supplied)"
    required: false
credentials:
  - name: "Guardian Key"
    description: "ECDSA private key for the gas-relay wallet. Auto-generated on first provision and stored in config/guardian.json. Used ONLY to pay gas fees — never holds user assets."
  - name: "Encrypted Seed"
    description: "Agent signing seed, AES-256-GCM encrypted at rest. Generated during provisioning, stored in .agent-config/seed.enc. This is the agent's on-chain signing authority."
persistence:
  - type: daemon
    description: "Local signing daemon (background process) listens on a Unix socket at /tmp/.aawp-daemon.*. Holds the decrypted signing key in memory. Managed via ensure-daemon.sh / restart-daemon.sh."
  - type: files
    description: "Writes: config/guardian.json, .agent-config/seed.enc, /tmp/.aawp-daemon.lock (PID lock)."
  - type: cron
    description: "DCA strategies and price alerts register OpenClaw cron jobs for autonomous scheduled execution."
native_binary:
  file: core/aawp-core.node
  hash_file: core/aawp-core.node.hash
  description: >
    Precompiled Node.js N-API addon (linux-x64) for cryptographic operations:
    seed derivation, ECDSA signing, AES-256-GCM enc/dec, HMAC auth.
    Built from Rust via napi-rs. Hash recorded in aawp-core.node.hash.
  source: "https://github.com/aawp-ai/aawp"
  verification: "On-chain factory approveBinary(hash) — only whitelisted builds can operate wallets"
  architecture: linux-x64
  runtime: "Node.js N-API (ABI stable)"
risk_disclosure: >
  This skill runs a persistent signing daemon and can autonomously submit
  on-chain transactions as the AI Agent. It manages encrypted private key material
  and a precompiled native binary. DCA/price-alert features register cron jobs.
  The on-chain factory enforces both binary approval and AI-exclusive ownership —
  only whitelisted AI Agent daemon builds can create or operate wallets. Humans
  cannot be the signer. Review the guardian architecture and verify binary
  provenance before installing.
---

# AAWP — AI Agent Wallet Protocol

The only crypto wallet protocol built exclusively for AI Agents. Not for humans.

AAWP enforces a single invariant: the signer is the AI Agent itself — locked in at wallet creation, immutable, verifiable on-chain. AI Agents manage their own on-chain assets across EVM networks through a guardian-based architecture. Transactions are signed locally via a sharded-key daemon — no human approval per tx, with full recovery and freeze capabilities for the human guardian.

**Networks:** Ethereum · Base · BNB Chain · Polygon · Optimism · Arbitrum

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│  AI Agent (OpenClaw)                            │
│  ┌───────────────┐    ┌──────────────────────┐  │
│  │ wallet-manager│───▶│  Signing Daemon       │  │
│  │ dca / alerts  │    │  (Unix socket)        │  │
│  └───────────────┘    │  ┌──────────────────┐ │  │
│                       │  │ aawp-core.node   │ │  │
│                       │  │ (Rust N-API)     │ │  │
│                       │  └──────────────────┘ │  │
│                       └──────────┬───────────┘  │
│                                  │ sign          │
│  ┌───────────────┐               ▼              │
│  │ Guardian Key  │──▶ Pay gas ──▶ EVM Chain     │
│  │ (gas only)    │               │              │
│  └───────────────┘    ┌──────────▼───────────┐  │
│                       │ Smart Contract Wallet │  │
│                       │ (holds assets)        │  │
│                       └──────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**Key separation:** Guardian pays gas → Wallet holds assets → Daemon signs transactions.

---

## Quick Reference

| Task | Command |
|------|---------|
| Create wallet | `wallet-manager.js --chain base create` |
| Check balance | `wallet-manager.js --chain base balance` |
| Send ETH | `wallet-manager.js --chain base send <to> <amount>` |
| Send ERC-20 | `wallet-manager.js --chain base send-token USDC <to> <amount>` |
| Get swap quote | `wallet-manager.js --chain base quote ETH USDC 0.01` |
| Execute swap | `wallet-manager.js --chain base swap ETH USDC 0.01` |
| Bridge cross-chain | `wallet-manager.js --chain base bridge ETH optimism 0.1` |
| Contract call | `wallet-manager.js --chain base call <addr> "fn(args)" ...` |
| Contract read | `wallet-manager.js --chain base read <addr> "fn() returns (uint)" ...` |
| DCA strategy | `dca.js add --chain base --from ETH --to USDC --amount 0.01 --cron "0 9 * * *"` |
| Price alert | `price-alert.js add --chain base --from ETH --to USDC --above 2600 --notify` |
| Diagnostics | `bash scripts/doctor.sh` |
| Backup | `wallet-manager.js backup ./backup.tar.gz` |

All commands: `node scripts/wallet-manager.js --help`

---

## Getting Started

### 1. Provision

First run is automatic — `ensure-daemon.sh` detects a missing seed and provisions.

```bash
bash scripts/provision.sh            # Initialize
bash scripts/provision.sh --reset    # Full reset (⚠️ destroys existing wallet)
```

### 2. Create Wallet

```bash
node scripts/wallet-manager.js --chain base create
```

If the Guardian needs gas, you'll see a funding guide with the Guardian address and private key.

### 3. Pin & Fund

```bash
export AAWP_WALLET=0x...            # Pin your wallet address
# Send a small amount of native token to the wallet address
node scripts/wallet-manager.js --chain base balance
```

### 4. Test

```bash
node scripts/wallet-manager.js --chain base quote ETH USDC 0.001
node scripts/wallet-manager.js --chain base swap ETH USDC 0.001
```

> After fresh provisioning, verify the daemon binary hash is approved on the factory contract. If not, the factory owner must call `approveBinary(hash)`.

---

## Wallet Manager CLI

**Entry point:** `node scripts/wallet-manager.js`
**Chain flag:** `--chain <base|bsc|polygon|optimism|arbitrum|ethereum>`

### Wallet Lifecycle

```bash
wallet-manager.js --chain base status          # Status overview
wallet-manager.js --chain base balance         # Native + token balances
wallet-manager.js --chain base portfolio       # Full portfolio view
wallet-manager.js compute-address              # Predict wallet address
wallet-manager.js --chain base history         # Transaction history
wallet-manager.js --chain base upgrade-signer  # Rotate signer key
wallet-manager.js --chain base guardian-chains  # Guardian chain info
```

### Transfers

```bash
wallet-manager.js --chain base send <recipient> <amount>
wallet-manager.js --chain base send-token <symbol> <recipient> <amount>
```

### Trading

```bash
wallet-manager.js --chain base quote <from> <to> <amount>    # Preview (no gas)
wallet-manager.js --chain base swap <from> <to> <amount>     # Execute
wallet-manager.js --chain base bridge <token> <dest> <amount> # Cross-chain
```

### Approvals

```bash
wallet-manager.js --chain base approve <token> <spender> <amount>
wallet-manager.js --chain base allowance <token> <spender>
wallet-manager.js --chain base revoke <token> <spender>
```

### Contract Interaction

```bash
# Write (sends tx)
wallet-manager.js --chain base call <contract> "transfer(address,uint256)" 0xTo 1000

# Read (free)
wallet-manager.js --chain base read <contract> "balanceOf(address) returns (uint256)" 0xAddr

# Batch (atomic)
wallet-manager.js --chain base batch ./calls.json
```

Batch format:
```json
[
  { "to": "0x...", "sig": "approve(address,uint256)", "args": ["0x...", "1000000"] },
  { "to": "0x...", "sig": "transfer(address,uint256)", "args": ["0x...", "500000"] }
]
```

### Address Book

```bash
wallet-manager.js addr add <label> <address>
wallet-manager.js addr list
wallet-manager.js addr get <label>
wallet-manager.js addr remove <label>
```

### RPC & Backup

```bash
wallet-manager.js get-rpc
wallet-manager.js --chain base set-rpc <url|default>
wallet-manager.js backup ./backup.tar.gz
wallet-manager.js restore ./backup.tar.gz
```

---

## DCA Automation

**Entry point:** `node scripts/dca.js`

```bash
dca.js add --chain base --from ETH --to USDC --amount 0.01 --cron "0 9 * * *" --name "Daily ETH→USDC"
dca.js list
dca.js run <id>
dca.js history <id>
dca.js remove <id>
```

Registers an OpenClaw cron job that executes swaps on schedule.

---

## Price Alerts

**Entry point:** `node scripts/price-alert.js`

```bash
# Notification only
price-alert.js add --chain base --from ETH --to USDC --above 2600 --notify

# Auto-swap on trigger
price-alert.js add --chain base --from ETH --to USDC --below 2200 --notify --auto-swap 0.01

price-alert.js list
price-alert.js check
price-alert.js remove <id>
```

---

## Daemon Management

| Script | Purpose |
|--------|---------|
| `scripts/doctor.sh` | Full diagnostic check |
| `scripts/ensure-daemon.sh` | Start daemon if not running (auto-provisions on first run) |
| `scripts/restart-daemon.sh` | Force restart |

Run `doctor.sh` before sensitive operations or when signing seems off.

---

## Deployment Reference

AAWP contracts share identical addresses across all chains via CREATE2 vanity deployment:

| Contract | Address |
|----------|---------|
| **Factory Proxy** | `0xAAAA3Df87F112c743BbC57c4de1700C72eB7aaAA` |
| **Identity Proxy** | `0xAAAafBf6F88367C75A9B701fFb4684Df6bCA1D1d` |

Verified on: Etherscan · BaseScan · BscScan · PolygonScan · Optimistic Etherscan · Arbiscan

---

## Security

| Rule | Why |
|------|-----|
| **Fund the wallet, not the guardian** | Guardian only pays gas — your assets live in the wallet contract |
| **Pin wallet address** | `export AAWP_WALLET=0x...` prevents operating on wrong address |
| **Quote before swap** | Preview rates and slippage before executing |
| **Start small** | Test with minimal amounts on new chains or operations |
| **Never expose secrets** | Seeds, keys, shards must never appear in logs or chat |
| **Verify binary approval** | Confirm daemon hash is approved on factory after provisioning |

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `E_AI_GATE` / `hmac_mismatch` | Restart daemon: `bash scripts/restart-daemon.sh` |
| `InvalidSignature` | Verify signer alignment and binary approval on factory |
| `Call failed` | Check balance, gas, and transaction parameters |
| `E40` / `E41` | Kill duplicate daemon process, then restart |
| `BinaryNotApproved` | Factory owner must call `approveBinary(hash)` on all 6 chains |
| TX reverts with ~1M gas used | Add `--gas-limit 8000000` — Clanker V4 / Uniswap V4 ops need up to 6M |

---

## File Structure

```
aawp/
├── SKILL.md                    # This document
├── WALLET_SETUP.md             # First-time setup guide
├── config/
│   ├── chains.json             # Network RPC & contract addresses
│   └── guardian.json           # Guardian wallet (auto-generated, gitignored)
├── scripts/
│   ├── wallet-manager.js       # Primary CLI
│   ├── dca.js                  # DCA automation
│   ├── price-alert.js          # Price alert system
│   ├── provision.sh            # Initial provisioning
│   ├── doctor.sh               # Diagnostics
│   ├── ensure-daemon.sh        # Daemon lifecycle
│   └── restart-daemon.sh       # Force restart
├── core/
│   ├── aawp-core.node          # Native signing addon (linux-x64)
│   ├── aawp-core.node.hash     # Binary integrity hash
│   ├── loader.js               # Addon loader
│   └── index.d.ts              # TypeScript declarations
└── daemon/                     # Daemon implementation
```
