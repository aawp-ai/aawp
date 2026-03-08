#!/usr/bin/env node
/**
 * deploy-clanker.js — Deploy a token on Clanker V4 via your AAWP wallet
 *
 * Supported chains (Clanker V4):
 *   base (8453) · eth (1) · arb (42161) · unichain (130) · bera (143) · bsc (56)
 *
 * Usage:
 *   node deploy-clanker.js              # interactive prompts
 *   node deploy-clanker.js --dry-run    # preview config only, no broadcast
 *
 * Or fill in CONFIG below and run directly.
 */

import { createPublicClient, createWalletClient, http, encodeFunctionData, formatEther, parseEther } from 'viem';
import { base, mainnet, arbitrum, optimism, bsc, polygon } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { Clanker } from 'clanker-sdk/v4';
import { ClankerDeployments, POOL_POSITIONS, FEE_CONFIGS } from 'clanker-sdk';
import { execFileSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dir    = dirname(fileURLToPath(import.meta.url));
const SKILL    = resolve(__dir, '..');
const WM       = resolve(SKILL, 'scripts/wallet-manager.js');
const DRY_RUN  = process.argv.includes('--dry-run');

// ─────────────────────────────────────────────────────────────────────────────
// CHAIN CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const CHAINS = {
  base:      { id: 8453,  name: 'Base',      rpc: 'https://mainnet.base.org',        viemChain: base,     explorer: 'https://basescan.org' },
  eth:       { id: 1,     name: 'Ethereum',  rpc: 'https://eth.llamarpc.com',         viemChain: mainnet,  explorer: 'https://etherscan.io' },
  arb:       { id: 42161, name: 'Arbitrum',  rpc: 'https://arb1.arbitrum.io/rpc',    viemChain: arbitrum, explorer: 'https://arbiscan.io' },
  unichain:  { id: 130,   name: 'Unichain',  rpc: 'https://mainnet.unichain.org',    viemChain: base,     explorer: 'https://uniscan.xyz' },  // base viem chain used as fallback
  bera:      { id: 143,   name: 'Berachain', rpc: 'https://rpc.berachain.com',       viemChain: base,     explorer: 'https://berascan.com' },
  bsc:       { id: 56,    name: 'BSC',       rpc: 'https://bsc-dataseed1.binance.org', viemChain: bsc,    explorer: 'https://bscscan.com' },
};

// ─────────────────────────────────────────────────────────────────────────────
// ★ EDIT THIS SECTION TO CONFIGURE YOUR TOKEN ★
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {

  // ── Chain ──────────────────────────────────────────────────────────────────
  chain: 'base',           // base | eth | arb | unichain | bera | bsc

  // ── Token identity ─────────────────────────────────────────────────────────
  name:        'My Token',               // Token name
  symbol:      'MTK',                    // Ticker (all caps recommended)
  image:       'https://example.com/logo.png',  // Square image URL (1:1 ratio)
  description: 'A short description of what this token is about.',
  website:     '',                        // Optional: https://yoursite.com
  twitter:     '',                        // Optional: https://x.com/yourhandle

  // ── Pool / market cap ──────────────────────────────────────────────────────
  // initialMarketCap: ETH value at launch (min ~10 ETH ≈ $25K FDV at $2500/ETH)
  initialMarketCap: 10,                  // in ETH
  poolPositions: 'Standard',            // Standard | Project | TwentyETH
  feeConfig:    'StaticBasic',          // StaticBasic (1%) | DynamicBasic | Dynamic3

  // ── Dev buy ────────────────────────────────────────────────────────────────
  // ETH to spend buying tokens at launch. Set to 0 to skip.
  devBuyEth:    0.003,                   // in ETH

  // ── Vault (optional) ───────────────────────────────────────────────────────
  // Lock a portion of supply for team / treasury. Unlocks linearly after cliff.
  vault: {
    enabled:        false,             // set true to enable
    percentage:     20,                // % of total supply to lock (1–90)
    lockupDays:     7,                 // cliff before any unlock (min 7 days)
    vestingDays:    180,               // linear vesting duration after cliff (0 = instant after cliff)
    // recipient: defaults to tokenAdmin (your AAWP wallet)
  },

  // ── Admin & rewards ────────────────────────────────────────────────────────
  // tokenAdmin: who can update metadata/image. Defaults to AAWP wallet.
  // Set to a specific address to override.
  tokenAdmin:   null,                  // null = use AAWP wallet

  // LP fee rewards: 100% back to your AAWP wallet by default.
  // Advanced: set rewardRecipient to a different address.
  rewardRecipient: null,               // null = use AAWP wallet

};
// ─────────────────────────────────────────────────────────────────────────────

// ── Helpers ──────────────────────────────────────────────────────────────────
function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function bold(s)  { return `\x1b[1m${s}\x1b[0m`; }
function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function cyan(s)  { return `\x1b[36m${s}\x1b[0m`; }
function yellow(s){ return `\x1b[33m${s}\x1b[0m`; }
function red(s)   { return `\x1b[31m${s}\x1b[0m`; }

// ── Resolve AAWP wallet address ───────────────────────────────────────────────
function getAawpWallet() {
  // 1. AAWP_WALLET env
  if (process.env.AAWP_WALLET) return process.env.AAWP_WALLET;
  // 2. wallet-manager status (parse stdout)
  try {
    const out = execFileSync(process.execPath, [WM, '--chain', CONFIG.chain, 'status'], {
      encoding: 'utf8', timeout: 15_000,
      env: { ...process.env },
    });
    const m = out.match(/Wallet[:\s]+0x([0-9a-fA-F]{40})/);
    if (m) return '0x' + m[1];
  } catch {}
  throw new Error('Could not resolve AAWP wallet address. Run: node scripts/wallet-manager.js --chain base status');
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const chain = CHAINS[CONFIG.chain];
  if (!chain) {
    console.error(red(`Unknown chain "${CONFIG.chain}". Supported: ${Object.keys(CHAINS).join(', ')}`));
    process.exit(1);
  }

  const clankerDeps = ClankerDeployments[chain.id];
  if (!clankerDeps?.clanker_v4) {
    console.error(red(`Clanker V4 not deployed on chain "${CONFIG.chain}" (id: ${chain.id})`));
    process.exit(1);
  }
  const FACTORY = clankerDeps.clanker_v4.address;

  // Resolve admin address
  let walletAddr;
  try { walletAddr = getAawpWallet(); }
  catch (e) { console.error(red(e.message)); process.exit(1); }

  const tokenAdmin      = CONFIG.tokenAdmin      ?? walletAddr;
  const rewardRecipient = CONFIG.rewardRecipient ?? walletAddr;

  // ── Print config summary ───────────────────────────────────────────────────
  console.log('\n' + bold('═══════════════════════════════════════════════'));
  console.log(bold('  Clanker V4 Token Deploy'));
  console.log(bold('═══════════════════════════════════════════════'));
  console.log(`  Chain        : ${cyan(chain.name)} (${chain.id})`);
  console.log(`  Factory      : ${chain.explorer}/address/${FACTORY}`);
  console.log(`  Name         : ${bold(CONFIG.name)} (${CONFIG.symbol})`);
  console.log(`  Image        : ${CONFIG.image}`);
  console.log(`  Initial MCAP : ${CONFIG.initialMarketCap} ETH`);
  console.log(`  Dev buy      : ${CONFIG.devBuyEth} ETH`);
  console.log(`  Fee config   : ${CONFIG.feeConfig}`);
  console.log(`  Pool         : ${CONFIG.poolPositions}`);
  console.log(`  Token admin  : ${tokenAdmin}`);
  console.log(`  LP rewards   : ${rewardRecipient}`);
  if (CONFIG.vault.enabled) {
    console.log(`  Vault        : ${yellow(`${CONFIG.vault.percentage}% locked — cliff ${CONFIG.vault.lockupDays}d + vest ${CONFIG.vault.vestingDays}d`)}`);
  } else {
    console.log(`  Vault        : none`);
  }
  if (CONFIG.website) console.log(`  Website      : ${CONFIG.website}`);
  if (CONFIG.twitter) console.log(`  Twitter      : ${CONFIG.twitter}`);
  console.log('');

  if (DRY_RUN) {
    console.log(yellow('DRY RUN — no transaction will be sent.'));
    return;
  }

  // Interactive confirmation
  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ans = await ask(rl, `Deploy ${bold(CONFIG.symbol)} on ${chain.name}? (yes/no): `);
    rl.close();
    if (ans.trim().toLowerCase() !== 'yes') {
      console.log('Cancelled.');
      process.exit(0);
    }
  }

  // ── Build token config ─────────────────────────────────────────────────────
  const socialUrls = [];
  if (CONFIG.twitter) socialUrls.push({ platform: 'x',       url: CONFIG.twitter });
  if (CONFIG.website) socialUrls.push({ platform: 'website', url: CONFIG.website });

  const tokenConfig = {
    chainId: chain.id,
    name:    CONFIG.name,
    symbol:  CONFIG.symbol,
    image:   CONFIG.image,
    metadata: {
      description: CONFIG.description,
      ...(socialUrls.length ? { socialMediaUrls: socialUrls } : {}),
    },
    context: {
      interface: 'AAWP',
      platform:  'AAWP',
      messageId: `${CONFIG.symbol.toLowerCase()}-${Date.now()}`,
      id:        CONFIG.symbol,
    },
    tokenAdmin,
    pool: {
      pairedToken:      'WETH',
      initialMarketCap: CONFIG.initialMarketCap,
      positions:        POOL_POSITIONS[CONFIG.poolPositions],
    },
    fees: FEE_CONFIGS[CONFIG.feeConfig],
    rewards: {
      recipients: [{
        admin:     tokenAdmin,
        recipient: rewardRecipient,
        bps:       10000,
        token:     'Both',
      }],
    },
    ...(CONFIG.devBuyEth > 0 ? { devBuy: { ethAmount: CONFIG.devBuyEth } } : {}),
    ...(CONFIG.vault.enabled ? {
      vault: {
        percentage:      CONFIG.vault.percentage,
        lockupDuration:  CONFIG.vault.lockupDays  * 86400,
        vestingDuration: CONFIG.vault.vestingDays * 86400,
        recipient:       rewardRecipient,
      },
    } : {}),
  };

  // ── Get deploy transaction ─────────────────────────────────────────────────
  console.log('Building calldata via Clanker SDK...');
  const publicClient = createPublicClient({ chain: chain.viemChain, transport: http(chain.rpc) });
  const clanker      = new Clanker({ publicClient });

  const tx       = await clanker.getDeployTransaction(tokenConfig);
  const calldata = encodeFunctionData({ abi: tx.abi, functionName: tx.functionName, args: tx.args });
  const valueEth = formatEther(tx.value ?? 0n);

  console.log(`  Factory  : ${FACTORY}`);
  console.log(`  Calldata : ${calldata.length / 2 - 1} bytes`);
  console.log(`  Value    : ${valueEth} ETH\n`);

  // ── Send via AAWP wallet ───────────────────────────────────────────────────
  console.log(`Sending via AAWP wallet ${walletAddr}...`);
  const result = execFileSync(process.execPath, [
    WM,
    '--chain', CONFIG.chain,
    'call',
    '--value', String(CONFIG.devBuyEth > 0 ? CONFIG.devBuyEth : 0),
    '--gas-limit', '8000000',
    FACTORY,
    calldata,
  ], {
    encoding: 'utf8',
    timeout:  120_000,
    env: { ...process.env, AAWP_WALLET: walletAddr },
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  console.log(result);

  // ── Parse token address from output ───────────────────────────────────────
  const txMatch    = result.match(/TX:\s*https?:\/\/[^\s]+\/tx\/(0x[0-9a-fA-F]+)/i) ||
                     result.match(/TX:\s*(0x[0-9a-fA-F]{64})/i);
  const txHash     = txMatch?.[1];

  if (txHash) {
    // Fetch receipt to extract token address
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
      const tokenAddress = receipt.logs[0]?.address;
      console.log('\n' + green('═══════════════════════════════════'));
      console.log(green('  ✅ Token deployed successfully!'));
      console.log(green('═══════════════════════════════════'));
      if (tokenAddress) {
        console.log(`\n  Token    : ${bold(tokenAddress)}`);
        console.log(`  Explorer : ${chain.explorer}/address/${tokenAddress}`);
        console.log(`  Clanker  : https://clanker.world/clanker/${tokenAddress}`);
      }
      console.log(`  TX       : ${chain.explorer}/tx/${txHash}`);
      console.log('');
    } catch {}
  }
}

main().catch(e => {
  console.error(red('\nError: ' + (e.message || e)));
  if (e.stderr) console.error(e.stderr.toString());
  process.exit(1);
});
