---
name: aawp
version: 1.0.1
description: >
  AAWP (AI Agent Wallet Protocol) — self-custodial wallet infrastructure for
  autonomous AI agents on EVM-compatible blockchains. Supports wallet lifecycle
  management, token transfers, DEX swaps, cross-chain bridging, arbitrary
  contract interactions, DCA automation, and price alerts.
environment:
  - name: AAWP_GUARDIAN_KEY
    description: "Private key for the Guardian gas-relay wallet (auto-generated in config/guardian.json if not set)"
    required: false
  - name: AAWP_GAS_KEY
    description: "Alias for AAWP_GUARDIAN_KEY"
    required: false
  - name: AAWP_WALLET
    description: "Pinned wallet address to operate on (prevents accidental operations on wrong wallet)"
    required: false
  - name: AAWP_CONFIG
    description: "Override path to config directory (default: ./config)"
    required: false
  - name: AAWP_CORE
    description: "Override path to core native addon directory (default: ./core)"
    required: false
  - name: AAWP_SKILL
    description: "Override path to skill root directory"
    required: false
  - name: AAWP_AI_TOKEN
    description: "Daemon authentication token (auto-generated at daemon startup)"
    required: false
credentials:
  - name: "Guardian Key"
    description: "ECDSA private key for the gas-relay wallet. Auto-generated and stored in config/guardian.json on first provision. Used ONLY for paying gas fees — never holds user assets."
  - name: "Seed (seed.enc)"
    description: "Encrypted agent signing seed, generated during provisioning. Stored in .agent-config/seed.enc. This is the agent's signing authority."
persistence:
  - type: daemon
    description: "A local signing daemon runs as a background process, listening on a Unix socket (/tmp/.aawp-daemon.*). It holds the decrypted signing key in memory for transaction signing. Managed via ensure-daemon.sh / restart-daemon.sh."
  - type: files
    description: "Writes config/guardian.json (guardian wallet), .agent-config/seed.enc (encrypted seed), and /tmp/.aawp-daemon.lock (daemon PID lock)."
  - type: cron
    description: "DCA strategies and price alerts can register OpenClaw cron jobs for autonomous scheduled execution."
native_binary:
  file: core/aawp-core.node
  hash_file: core/aawp-core.node.hash
  description: >
    Precompiled Node.js native addon (N-API) for cryptographic operations:
    seed derivation, ECDSA signing, AES-256-GCM encryption/decryption, and
    HMAC authentication. Built from Rust source via napi-rs. The binary hash
    is recorded in aawp-core.node.hash for integrity verification.
  source: "https://github.com/aawp-ai/aawp (Rust source not published — binary is verified by on-chain factory approveBinary() check)"
  architecture: linux-x64
  runtime: "Node.js N-API (ABI stable)"
risk_disclosure: >
  This skill operates a persistent signing daemon and can autonomously sign
  and submit on-chain transactions (transfers, swaps, bridges). It manages
  private key material (encrypted seed + guardian key). The native binary
  executes cryptographic operations outside the JS sandbox. DCA and price
  alert features can register cron jobs for autonomous execution. Only install
  if you trust the publisher and have reviewed the guardian architecture.
  The on-chain factory contract enforces binary approval — only whitelisted
  daemon builds can create or operate wallets.
---

# AAWP — AI Agent Wallet Protocol

> **Self-custodial wallet infrastructure purpose-built for autonomous AI agents.**

AAWP enables AI agents to independently manage on-chain assets across multiple EVM networks through a secure guardian-based architecture. Agents sign transactions locally via a sharded key daemon — no human approval required per transaction, while maintaining full recovery and freeze capabilities for asset owners.

**Supported Networks:** Ethereum · Base · BNB Chain · Polygon · Optimism · Arbitrum

---

## Table of Contents

- [When to Use](#when-to-use)
- [Quick Start](#quick-start)
- [Wallet Manager CLI](#wallet-manager-cli)
- [DCA Automation](#dca-automation)
- [Price Alerts](#price-alerts)
- [Daemon Management](#daemon-management)
- [Deployment Reference](#deployment-reference)
- [Security Guidelines](#security-guidelines)
- [Troubleshooting](#troubleshooting)
- [File Structure](#file-structure)

---

## When to Use

| Task | Command |
|------|---------|
| Create or deploy a new AI wallet | `wallet-manager.js create` |
| Check wallet status or balances | `wallet-manager.js status / balance / portfolio` |
| Send native tokens or ERC-20s | `wallet-manager.js send / send-token` |
| Swap tokens via DEX aggregation | `wallet-manager.js quote / swap` |
| Bridge assets cross-chain | `wallet-manager.js bridge` |
| Interact with any smart contract | `wallet-manager.js call / read / batch` |
| Manage token approvals | `wallet-manager.js approve / allowance / revoke` |
| Set up recurring purchases | `dca.js add` |
| Configure price-triggered actions | `price-alert.js add` |
| Backup or restore wallet state | `wallet-manager.js backup / restore` |

---

## Quick Start

### Prerequisites

For first-time setup details, see [`WALLET_SETUP.md`](./WALLET_SETUP.md).

### Provisioning

First run is **fully automatic** — `ensure-daemon.sh` detects a missing `seed.enc` and runs provisioning automatically. No manual steps required for new installs.

```bash
# Manual provisioning (if needed)
cd /root/clawd/skills/aawp
bash scripts/provision.sh            # One-click initialization
bash scripts/provision.sh --reset    # Full reset (⚠️ DESTROYS existing wallet)
```

### Recommended Onboarding Flow

```
1. Provision          →  bash scripts/provision.sh
2. Verify Status      →  wallet-manager.js --chain base status
3. Create Wallet      →  wallet-manager.js --chain base create
4. Pin Wallet Address  →  export AAWP_WALLET=0x...
5. Fund Wallet        →  Send a small amount of native token to the wallet address
6. Confirm Balance    →  wallet-manager.js --chain base balance
7. Test Quote         →  wallet-manager.js --chain base quote ETH USDC 0.01
8. Test Swap          →  wallet-manager.js --chain base swap ETH USDC 0.001
9. Backup             →  wallet-manager.js backup ./aawp-backup.tar.gz
```

> **Important:** After fresh provisioning, verify that the daemon binary hash is approved on the factory contract. If not, the factory owner must call `approveBinary(binaryHash)` before wallet creation.

---

## Wallet Manager CLI

**Entry point:** `scripts/wallet-manager.js`

All commands accept `--chain <network>` to target a specific chain (e.g., `base`, `bsc`, `polygon`, `optimism`, `arbitrum`, `ethereum`).

### Wallet Operations

```bash
# Status & balance
node scripts/wallet-manager.js --chain base status
node scripts/wallet-manager.js --chain base balance
node scripts/wallet-manager.js --chain base portfolio

# Wallet lifecycle
node scripts/wallet-manager.js --chain base create
node scripts/wallet-manager.js compute-address
node scripts/wallet-manager.js --chain base upgrade-signer
node scripts/wallet-manager.js --chain base guardian-chains
node scripts/wallet-manager.js --chain base history
```

### Token Transfers

```bash
# Native token
node scripts/wallet-manager.js --chain base send <recipient> <amount>

# ERC-20 token
node scripts/wallet-manager.js --chain base send-token <symbol> <recipient> <amount>
```

### Trading

```bash
# Get a quote before swapping (recommended)
node scripts/wallet-manager.js --chain base quote <fromToken> <toToken> <amount>

# Execute swap
node scripts/wallet-manager.js --chain base swap <fromToken> <toToken> <amount>

# Cross-chain bridge
node scripts/wallet-manager.js --chain base bridge <token> <destChain> <amount>
```

### Token Approvals

```bash
node scripts/wallet-manager.js --chain base approve <token> <spender> <amount>
node scripts/wallet-manager.js --chain base allowance <token> <spender>
node scripts/wallet-manager.js --chain base revoke <token> <spender>
```

### Arbitrary Contract Interaction

```bash
# Write (sends transaction)
node scripts/wallet-manager.js --chain base call <contract> "<signature>" [args...]

# Read (free, no gas)
node scripts/wallet-manager.js --chain base read <contract> "<signature> returns (<type>)" [args...]

# Batch multiple calls atomically
node scripts/wallet-manager.js --chain base batch ./calls.json
```

**Batch file format** (`calls.json`):
```json
[
  { "to": "0xContract", "sig": "approve(address,uint256)", "args": ["0xSpender", "1000000"] },
  { "to": "0xContract", "sig": "transfer(address,uint256)", "args": ["0xRecipient", "500000"] }
]
```

### RPC Configuration

```bash
node scripts/wallet-manager.js get-rpc
node scripts/wallet-manager.js --chain base set-rpc <url>
node scripts/wallet-manager.js --chain base set-rpc default
```

### Address Book

```bash
node scripts/wallet-manager.js addr add <label> <address>
node scripts/wallet-manager.js addr list
node scripts/wallet-manager.js addr get <label>
node scripts/wallet-manager.js addr remove <label>
```

### Backup & Restore

```bash
node scripts/wallet-manager.js backup ./aawp-backup.tar.gz
node scripts/wallet-manager.js restore ./aawp-backup.tar.gz
```

---

## DCA Automation

**Entry point:** `scripts/dca.js`

Set up recurring dollar-cost-averaging strategies with cron-based scheduling.

```bash
# Create a DCA strategy
node scripts/dca.js add \
  --chain base \
  --from ETH --to USDC \
  --amount 0.01 \
  --cron "0 9 * * *" \
  --name "Daily ETH→USDC"

# Manage strategies
node scripts/dca.js list
node scripts/dca.js run <id>
node scripts/dca.js history <id>
node scripts/dca.js remove <id>
```

---

## Price Alerts

**Entry point:** `scripts/price-alert.js`

Monitor token prices and optionally trigger automatic swaps when thresholds are hit.

```bash
# Notification-only alert
node scripts/price-alert.js add \
  --chain base --from ETH --to USDC \
  --above 2600 --notify

# Auto-swap on price drop
node scripts/price-alert.js add \
  --chain base --from ETH --to USDC \
  --below 2200 --notify --auto-swap 0.01

# Manage alerts
node scripts/price-alert.js list
node scripts/price-alert.js check
node scripts/price-alert.js remove <id>
```

---

## Daemon Management

The AAWP daemon handles local key management and transaction signing. Use these scripts to maintain daemon health:

| Script | Purpose |
|--------|---------|
| `bash scripts/doctor.sh` | Full diagnostic check |
| `bash scripts/ensure-daemon.sh` | Start daemon if not running (auto-provisions if needed) |
| `bash scripts/restart-daemon.sh` | Force restart the daemon |

> **Best practice:** Run `doctor.sh` before sensitive operations or when signing behavior seems incorrect.

---

## Deployment Reference

### AAWP V3 — Unified Cross-Chain Deployment

All contracts share identical addresses across all supported networks via CREATE2 vanity deployment.

| Contract | Address |
|----------|---------|
| **Factory Proxy** | `0xAAAA3Df87F112c743BbC57c4de1700C72eB7aaAA` |
| **Identity Proxy** | `0xAAAafBf6F88367C75A9B701fFb4684Df6bCA1D1d` |

**Networks:** Ethereum · Base · BNB Chain · Polygon · Optimism · Arbitrum

All contracts are verified and open-sourced on their respective chain explorers.

---

## Security Guidelines

| Rule | Details |
|------|---------|
| **Fund the wallet, not the guardian** | The wallet address is where your operating balance should be |
| **Pin deployed wallets** | Set `AAWP_WALLET=0x...` to avoid accidental operations on wrong addresses |
| **Quote before swap** | Always run `quote` to preview rates and slippage before executing `swap` |
| **Start small** | Test with minimal amounts on any new chain or operation type |
| **Never expose secrets** | Seeds, private keys, shards, and recovery material must never appear in logs or chat |
| **Verify binary approval** | After provisioning or daemon rebuild, confirm the binary hash is approved on factory |

---

## Troubleshooting

| Error | Cause | Resolution |
|-------|-------|------------|
| `E_AI_GATE` | Token invalid, expired, or locked | Restart daemon: `bash scripts/restart-daemon.sh` |
| `hmac_mismatch` | Client/daemon state desync | Restart daemon: `bash scripts/restart-daemon.sh` |
| `InvalidSignature` | Signer, binary, or factory mismatch | Verify signer alignment and binary approval |
| `Call failed` | Insufficient balance, gas, deadline, or routing issue | Check balance and transaction parameters |
| `E40` / `E41` | Duplicate daemon initialization | Kill existing daemon process, then restart |
| `BinaryNotApproved` | Daemon binary hash not whitelisted | Factory owner must call `approveBinary(hash)` |

---

## File Structure

```
skills/aawp/
├── SKILL.md                 # This document
├── WALLET_SETUP.md          # First-time setup guide
├── config/
│   ├── chains.json          # Network configuration
│   └── guardian.json         # Guardian metadata
├── scripts/
│   ├── wallet-manager.js    # Primary wallet CLI
│   ├── dca.js               # DCA automation
│   ├── price-alert.js       # Price alert system
│   ├── provision.sh         # Initial provisioning
│   ├── doctor.sh            # Diagnostic checks
│   ├── ensure-daemon.sh     # Daemon lifecycle
│   └── restart-daemon.sh    # Force restart
├── core/                    # Native addon artifacts
└── daemon/                  # Daemon implementation
```
