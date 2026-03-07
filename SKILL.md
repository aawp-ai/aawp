---
name: aawp
version: 1.0.0
description: >
  AAWP (AI Agent Wallet Protocol) — self-custodial wallet for autonomous AI agents on EVM chains.
  Use when: creating or deploying an AI wallet, sending native/ERC20 tokens,
  swapping or bridging assets, calling arbitrary contracts, checking balances,
  backup/restore, or setting up DCA and price alerts.
---

# AAWP

Self-custodial EVM wallet stack for AI agents.

For first-time setup, read:
- `WALLET_SETUP.md`

## Use this skill when
- creating a new AAWP wallet
- sending native tokens or ERC20s
- quoting, swapping, or bridging
- checking balances, status, or portfolio
- calling contracts or batching calls
- backing up or restoring wallet state
- setting up DCA or price alerts

## Main entrypoints

### `scripts/wallet-manager.js`
Primary operator CLI.

Capabilities:
- `status`
- `balance`
- `send`
- `send-token`
- `create`
- `compute-address`
- `upgrade-signer`
- `swap`
- `bridge`
- `quote`
- `guardian-chains`
- `approve` / `allowance` / `revoke`
- `history`
- `batch`
- `portfolio`
- `call`
- `read`
- `addr add|list|remove|get`
- `get-rpc` / `set-rpc`

Examples:

```bash
node scripts/wallet-manager.js --chain base status
node scripts/wallet-manager.js --chain base balance
node scripts/wallet-manager.js --chain base create
node scripts/wallet-manager.js compute-address

node scripts/wallet-manager.js --chain base send 0xRecipient 0.001
node scripts/wallet-manager.js --chain base send-token USDC 0xRecipient 1

node scripts/wallet-manager.js --chain base quote ETH USDC 0.01
node scripts/wallet-manager.js --chain base swap ETH USDC 0.01


node scripts/wallet-manager.js --chain base approve USDC 0xSpender 100
node scripts/wallet-manager.js --chain base allowance USDC 0xSpender
node scripts/wallet-manager.js --chain base revoke USDC 0xSpender

node scripts/wallet-manager.js --chain base call 0xTarget "transfer(address,uint256)" 0xRecipient 1000000
node scripts/wallet-manager.js --chain base read 0xTarget "balanceOf(address) returns (uint256)" 0xWallet
node scripts/wallet-manager.js --chain base batch ./calls.json

node scripts/wallet-manager.js get-rpc
node scripts/wallet-manager.js --chain base set-rpc https://your-rpc
node scripts/wallet-manager.js --chain base set-rpc default

node scripts/wallet-manager.js backup ./aawp-backup.tar.gz
node scripts/wallet-manager.js restore ./aawp-backup.tar.gz
```

### `scripts/dca.js`
Recurring DCA automation.

Capabilities:
- `add`
- `list`
- `remove`
- `run`
- `history`

Examples:

```bash
node scripts/dca.js add --chain base --from ETH --to USDC --amount 0.01 --cron "0 9 * * *" --name "Daily ETH→USDC"
node scripts/dca.js list
node scripts/dca.js run <id>
node scripts/dca.js history <id>
node scripts/dca.js remove <id>
```

### `scripts/price-alert.js`
Price monitoring and optional auto-action.

Capabilities:
- `add`
- `list`
- `remove`
- `check`

Options:
- `--notify`
- `--auto-swap <amount>`

Examples:

```bash
node scripts/price-alert.js add --chain base --from ETH --to USDC --above 2600 --notify
node scripts/price-alert.js add --chain base --from ETH --to USDC --below 2200 --notify --auto-swap 0.01
node scripts/price-alert.js list
node scripts/price-alert.js check
node scripts/price-alert.js remove <id>
```

### First-time setup / provision

First run is **automatic**: `ensure-daemon.sh` detects missing `seed.enc` and
runs `provision.sh` automatically. No manual steps needed for new installs.

Manual commands (if needed):

```bash
cd /root/clawd/skills/aawp
bash scripts/provision.sh          # first-time init (one-click)
bash scripts/provision.sh --reset  # wipe + re-init (DESTROYS wallet!)
```

This handles everything: seed generation, shard injection, binary hash update,
config validation, and daemon startup.

### Daemon health scripts
Use these before sensitive operations or when signing state looks wrong.

- `bash scripts/doctor.sh`
- `bash scripts/ensure-daemon.sh`
- `bash scripts/restart-daemon.sh`

## Recommended operating flow

1. Run `bash scripts/provision.sh` (first time only)
2. Verify binary approval: `node scripts/wallet-manager.js --chain base status` — check that daemon binary hash is approved on factory. If not, factory owner must call `approveBinary(binaryHash)` on the factory contract before proceeding.
3. Create wallet with `wallet-manager.js create`
4. Pin deployed wallet with `AAWP_WALLET=0x...`
5. Fund the wallet with a small amount of native token
6. Run `status` and `balance`
7. Run `quote`
8. Run a very small `swap`
9. Run `backup`

## Critical rules
- Fund the **wallet**, not the guardian
- Pin real deployed wallets with `AAWP_WALLET`
- Prefer `quote` before `swap`
- Use small test sizes first
- If you see `E_AI_GATE` or `hmac_mismatch`, restart the daemon
- Never expose seeds, private keys, tokens, shards, or recovery material
- After fresh provision or daemon rebuild, verify binary hash is approved on factory before `create`

## Current deployment notes

**AAWP V3 Vanity — Same address on all 6 chains** (deployed 2026-03-07):

| Contract | Address |
|---|---|
| Factory Proxy | `0xAAAA3Df87F112c743BbC57c4de1700C72eB7aaAA` |
| Identity Proxy | `0xAAAafBf6F88367C75A9B701fFb4684Df6bCA1D1d` |

Chains: Base, BSC, Polygon, Optimism, Arbitrum, Ethereum
All contracts verified & open-sourced on each chain's explorer.

## Error hints
- `E_AI_GATE`: token invalid / expired / locked → restart daemon
- `hmac_mismatch`: client/daemon desync → restart daemon
- `InvalidSignature`: signer / binary / factory mismatch
- `Call failed`: usually balance, gas, deadline, or route issue
- `E40` / `E41`: daemon duplicate init / existing daemon instance
- `BinaryNotApproved`: daemon binary hash not whitelisted on factory — factory owner must call `approveBinary(hash)`

## Files
- `WALLET_SETUP.md` — first-time setup guide
- `config/chains.json` — chain config
- `config/guardian.json` — guardian metadata
- `scripts/` — operator scripts
- `core/` — native addon artifacts
- `daemon/` — daemon implementation
