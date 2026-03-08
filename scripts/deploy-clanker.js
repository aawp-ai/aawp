#!/usr/bin/env node
/**
 * AAWP × Clanker V4 Token Deployer
 * Deploys a token on Clanker V4 (Base) using the AAWP smart contract wallet.
 * The AAWP wallet is both the token admin AND the LP fee reward recipient.
 *
 * Usage:
 *   node scripts/deploy-clanker.js [--dry-run] [--mcap <ETH>] [--dev-buy <ETH>]
 *
 * Options:
 *   --dry-run        Build calldata and print config, do not broadcast
 *   --mcap <ETH>     Initial market cap in ETH (default: 10 = ~$25K FDV)
 *   --dev-buy <ETH>  ETH to spend on dev buy at launch (default: 0.01)
 *   --name <str>     Token name (default: AAWP)
 *   --symbol <str>   Token symbol (default: AAWP)
 *   --image <url>    Token image URL
 *   --description    Short description
 *   --context        Context string for Clanker page
 */

'use strict';
const path   = require('path');
const fs     = require('fs');
const { execSync, spawnSync } = require('child_process');

// ── Parse args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const get  = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i+1] : def; };
const has  = (flag) => args.includes(flag);

const DRY_RUN     = has('--dry-run');
const MCAP_ETH    = parseFloat(get('--mcap', '10'));       // ETH units
const DEV_BUY_ETH = parseFloat(get('--dev-buy', '0.01')); // ETH
const TOKEN_NAME  = get('--name',        'AAWP');
const TOKEN_SYMBOL= get('--symbol',      'AAWP');
const TOKEN_IMAGE = get('--image',       'https://aawp.ai/logo.png');
const TOKEN_DESC  = get('--description', 'AI Agent Wallet Protocol — the only crypto wallet protocol built exclusively for AI Agents. Not for humans.');
const TOKEN_CTX   = get('--context',     'AAWP is the first crypto wallet protocol built exclusively for AI Agents. Install in one command: npx aawp-ai');

const SKILL_ROOT  = path.resolve(__dirname, '..');
const SNIPER_DURATION_SECS = parseInt(get('--sniper-secs', '60')); // 60s decay

// ── Load AAWP wallet address ──────────────────────────────────────────────────
async function getWalletAddress() {
  const result = spawnSync('node', [path.join(SKILL_ROOT, 'scripts/wallet-manager.js'), 'status'], {
    encoding: 'utf8', timeout: 15000,
  });
  const match = result.stdout?.match(/Wallet\s*:\s*(0x[0-9a-fA-F]{40})/);
  if (!match) throw new Error('Could not read AAWP wallet address. Is the daemon running?');
  return match[1];
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Dynamic import ESM modules
  const { createPublicClient, http, encodeFunctionData, parseEther } = await import('viem');
  const { base } = await import('viem/chains');
  const { Clanker } = await import('clanker-sdk/v4');
  const { ClankerDeployments, POOL_POSITIONS, FEE_CONFIGS, getTickFromMarketCap } = await import('clanker-sdk');

  const WETH = '0x4200000000000000000000000000000000000006';

  const publicClient = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });
  const clankerCfg   = ClankerDeployments[8453].clanker_v4;

  // Get AAWP wallet address
  const AAWP_WALLET = await getWalletAddress();
  console.log('AAWP Wallet:', AAWP_WALLET);

  // Build token config using SDK's high-level format
  const tokenConfig = {
    chainId:  8453,
    name:     TOKEN_NAME,
    symbol:   TOKEN_SYMBOL,
    image:    TOKEN_IMAGE,
    metadata: {
      description:    TOKEN_DESC,
      socialMediaUrls: [
        { platform: 'x',       url: 'https://x.com/aawp_ai' },
        { platform: 'website', url: 'https://aawp.ai' },
        { platform: 'github',  url: 'https://github.com/aawp-ai/aawp' },
      ],
    },
    context: {
      interface:  'AAWP Skill',
      platform:   'AAWP',
      messageId:  `deploy-${Date.now()}`,
      id:         TOKEN_SYMBOL,
    },
    tokenAdmin: AAWP_WALLET,
    pool: {
      pairedToken:      'WETH',
      initialMarketCap: MCAP_ETH,   // ETH units
      positions:        POOL_POSITIONS.Standard,
    },
    fees: FEE_CONFIGS.StaticBasic,   // 1% fee
    sniperFees: {
      startingFee:    800000,        // 80% (unibps)
      endingFee:      50000,         // 5%  (unibps)
      secondsToDecay: SNIPER_DURATION_SECS,
    },
    rewards: {
      recipients: [{
        admin:     AAWP_WALLET,
        recipient: AAWP_WALLET,
        bps:       10000,            // 100% of creator share → AAWP wallet
        token:     'Both',
      }],
    },
    // devBuy: omit if 0 (SDK validation rejects 0)
    ...(DEV_BUY_ETH > 0 ? { devBuy: { ethAmount: DEV_BUY_ETH } } : {}),
  };

  // NOTE: We use the Guardian EOA (not AAWP smart wallet) to send the deploy tx,
  // because Clanker V4 factory is not compatible with smart-contract callers via
  // the Uniswap V4 unlock() callback chain. AAWP wallet is set as tokenAdmin instead.
  const guardianCfg = JSON.parse(fs.readFileSync(path.join(SKILL_ROOT, 'config/guardian.json'), 'utf8'));
  const GUARDIAN_KEY = guardianCfg.privateKey || guardianCfg.key || guardianCfg.pk;
  if (!GUARDIAN_KEY) throw new Error('Guardian key not found in config/guardian.json');

  // Get the ABI-typed transaction from SDK (for display/dry-run)
  const clanker = new Clanker({ publicClient });
  const tx = await clanker.getDeployTransaction(tokenConfig);

  const calldata = encodeFunctionData({ abi: tx.abi, functionName: tx.functionName, args: tx.args });
  const value    = tx.value ?? parseEther(String(DEV_BUY_ETH));

  // Compute tick for display
  const { tickIfToken0IsClanker } = getTickFromMarketCap(MCAP_ETH);

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  AAWP × Clanker V4 — Token Deploy Config             ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Name         : ${TOKEN_NAME.padEnd(36)}║`);
  console.log(`║  Symbol       : ${TOKEN_SYMBOL.padEnd(36)}║`);
  console.log(`║  Token Admin  : ${AAWP_WALLET.slice(0,18)}...${AAWP_WALLET.slice(-4).padEnd(14)}║`);
  console.log(`║  Starting mcap: ${MCAP_ETH} ETH (~$${(MCAP_ETH*2500/1000).toFixed(1)}K FDV @ $2500/ETH)`.padEnd(53)+'║');
  console.log(`║  Starting tick: ${String(tickIfToken0IsClanker).padEnd(36)}║`);
  console.log(`║  Dev buy      : ${DEV_BUY_ETH} ETH`.padEnd(53)+'║');
  console.log(`║  Creator fee  : 80% of LP fees → AAWP wallet         ║`);
  console.log(`║  Sniper decay : 80% → 5% over ${SNIPER_DURATION_SECS}s`.padEnd(53)+'║');
  console.log(`║  Factory      : ${clankerCfg.address.slice(0,18)}...`.padEnd(53)+'║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Calldata size: ${(calldata.length/2-1)} bytes`.padEnd(53)+'║');
  console.log(`║  msg.value    : ${value} wei`.padEnd(53)+'║');
  console.log('╚══════════════════════════════════════════════════════╝');

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Transaction not broadcast.');
    console.log('  To  :', clankerCfg.address);
    console.log('  Data:', calldata.slice(0, 80) + '...');
    console.log('  Value (wei):', value.toString());
    console.log('\nRe-run without --dry-run to deploy.');
    return;
  }

  // Confirm
  const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  const confirm  = await new Promise(r => readline.question('\n  Deploy? Type YES to confirm: ', r));
  readline.close();

  if (confirm.trim().toUpperCase() !== 'YES') {
    console.log('Aborted.');
    return;
  }

  // Deploy via Guardian EOA using Clanker SDK CLI
  console.log('\n  Broadcasting via Guardian EOA (AAWP wallet = tokenAdmin)...');
  const cliArgs = [
    path.join(SKILL_ROOT, 'node_modules/clanker-sdk/dist/cli/cli.js'),
    'deploy',
    '--private-key', GUARDIAN_KEY,
    '--name',        TOKEN_NAME,
    '--symbol',      TOKEN_SYMBOL,
    '--image',       TOKEN_IMAGE,
    '--token-admin', AAWP_WALLET,
    '--starting-market-cap', String(MCAP_ETH),
    '--pool-positions', 'Standard',
    '--fee-config', 'Static',
    '--description', TOKEN_DESC,
    '--website', 'https://aawp.ai',
  ];
  if (DEV_BUY_ETH > 0) cliArgs.push('--dev-buy-eth', String(DEV_BUY_ETH));

  const result = spawnSync('node', cliArgs, { encoding: 'utf8', timeout: 120000, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error('\n❌ Deployment failed. Check logs above.');
    process.exit(1);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
