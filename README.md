<p align="center">
  <img src="https://aawp.ai/logo.jpg" alt="AAWP" width="80">
</p>

<h1 align="center">AAWP</h1>
<p align="center"><strong>AI Agent Wallet Protocol</strong></p>

<p align="center">
  Self-custodial wallets where the private key only exists inside an AI agent's runtime.<br>
  No human ever sees it. No mnemonic. Derived on demand, used briefly, then destroyed.
</p>

<p align="center">
  <a href="https://aawp.ai">Website</a> •
  <a href="https://basescan.org/address/0xAAAA3Df87F112c743BbC57c4de1700C72eB7aaAA">Contracts</a> •
  <a href="LICENSE">BUSL-1.1</a>
</p>

<p align="center">
  <a href="https://basescan.org/address/0xAAAA3Df87F112c743BbC57c4de1700C72eB7aaAA"><img src="https://img.shields.io/badge/Live-6_EVM_Chains-0052FF?style=flat-square" alt="6 Chains"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-BUSL--1.1-1a1a2e?style=flat-square" alt="License"></a>
  <img src="https://img.shields.io/badge/Solidity-^0.8.24-363636?style=flat-square&logo=solidity" alt="Solidity">
  <img src="https://img.shields.io/badge/Runtime-Rust_N--API-dea584?style=flat-square&logo=rust" alt="Rust">
</p>

---

## What is AAWP?

AAWP gives AI agents their own on-chain wallets — wallets that **only the agent can sign for**. The signing core is a native Rust addon with hardware-bound key derivation. A human guardian can freeze or recover the wallet, but can never move funds or produce signatures.

Each wallet receives a **Soulbound Identity NFT** — verifiable proof that an address is agent-controlled:

```solidity
identity.isOfficialWallet(addr) → bool
```

## Design principles

- **Agent-exclusive signing** — keys never exist outside the agent's runtime
- **Hardware-bound seed** — non-extractable, non-replicable across hosts
- **Guardian oversight** — humans can freeze and recover, but never sign
- **Front-run resistant deployment** — commit-reveal wallet creation
- **Zero protocol fee**

## Supported chains

Same contract addresses on all chains via **CREATE2 vanity deployment**:

| Contract | Address |
|----------|---------|
| Factory (UUPS Proxy) | [`0xAAAA3Df87F112c743BbC57c4de1700C72eB7aaAA`](https://basescan.org/address/0xAAAA3Df87F112c743BbC57c4de1700C72eB7aaAA) |
| Identity (UUPS Proxy) | [`0xAAAafBf6F88367C75A9B701fFb4684Df6bCA1D1d`](https://basescan.org/address/0xAAAafBf6F88367C75A9B701fFb4684Df6bCA1D1d) |

**Chains:** Base · Ethereum · Arbitrum · Optimism · BSC · Polygon

All contracts verified and open-sourced.

## Quick start

```bash
# Install via ClawHub
clawhub install aawp

# First-time setup
bash scripts/provision.sh

# Verify
node scripts/wallet-manager.js --chain base status

# Deploy a wallet
node scripts/wallet-manager.js --chain base create
```

## Usage

### Wallet operations

```bash
# Balance
node scripts/wallet-manager.js --chain base balance

# Portfolio (all chains)
node scripts/wallet-manager.js portfolio

# Send native token
node scripts/wallet-manager.js --chain base send 0xRecipient 0.01

# Send ERC-20
node scripts/wallet-manager.js --chain base send-token USDC 0xRecipient 10
```

### Swap & Bridge

```bash
# Quote before swap
node scripts/wallet-manager.js --chain base quote ETH USDC 0.01

# Execute swap
node scripts/wallet-manager.js --chain base swap ETH USDC 0.01

# Cross-chain bridge
node scripts/wallet-manager.js bridge base arb ETH ETH 0.05
```

### Token approvals

```bash
node scripts/wallet-manager.js --chain base approve USDC 0xSpender 100
node scripts/wallet-manager.js --chain base allowance USDC 0xSpender
node scripts/wallet-manager.js --chain base revoke USDC 0xSpender
```

### Contract interactions

```bash
# Write call
node scripts/wallet-manager.js --chain base call 0xTarget "transfer(address,uint256)" 0xTo 1000000

# Read call
node scripts/wallet-manager.js --chain base read 0xTarget "balanceOf(address) returns (uint256)" 0xWallet

# Batch
node scripts/wallet-manager.js --chain base batch ./calls.json
```

### DCA automation

```bash
node scripts/dca.js add --chain base --from ETH --to USDC --amount 0.01 \
  --cron "0 9 * * *" --name "Daily ETH→USDC"
node scripts/dca.js list
node scripts/dca.js run <id>
node scripts/dca.js remove <id>
```

### Price alerts

```bash
node scripts/price-alert.js add --chain base --from ETH --to USDC --above 2600 --notify
node scripts/price-alert.js add --chain base --from ETH --to USDC --below 2200 --auto-swap 0.01
node scripts/price-alert.js list
node scripts/price-alert.js check
```

### Backup & Restore

```bash
node scripts/wallet-manager.js backup ./aawp-backup.tar.gz
node scripts/wallet-manager.js restore ./aawp-backup.tar.gz
```

## On-chain interface

```solidity
// Query
factory.computeAddress(aiSigner, binaryHash, guardian) → address
identity.isOfficialWallet(address) → bool

// Agent operations (EIP-712 signed)
wallet.execute(to, value, data, deadline, sig) → bytes

// Guardian operations
wallet.freeze()
wallet.unfreeze()
wallet.emergencyWithdraw(token, to, amount)
```

## License

[Business Source License 1.1](LICENSE)
