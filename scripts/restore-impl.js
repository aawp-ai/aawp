'use strict';
// Standalone restore — no native addon, safe to run when shards are missing
const path = require('path');
const fs   = require('fs');
const { execSync } = require('child_process');

const C = process.env.AAWP_CONFIG || require('path').join(__dirname, '..', '.agent-config');
const S = process.env.AAWP_SKILL || require('path').resolve(__dirname, '..');

const backupPath = process.argv[3];
if (!backupPath) { console.log('Usage: wallet-manager restore <backup.tar.gz>'); process.exit(1); }
if (!fs.existsSync(backupPath)) { console.log('❌ Not found:', backupPath); process.exit(1); }

const tmpDir = `/tmp/aawp-restore-${Date.now()}`;
fs.mkdirSync(tmpDir, { recursive: true });
console.log('Extracting...');
execSync(`tar xzf "${backupPath}" -C "${tmpDir}"`, { stdio: 'inherit' });

const copyIfExists = (src, dst) => {
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    console.log('  ✅', dst);
  }
};

const stripRoot = (abs) => path.join(tmpDir, abs);

copyIfExists(stripRoot(path.join(C, 'seed.enc')),                path.join(C, 'seed.enc'));
copyIfExists(stripRoot(path.join(S, 'core/aawp-core.node')),    path.join(S, 'core/aawp-core.node'));
copyIfExists(stripRoot('/var/lib/aawp/.cache/fonts.idx'),        '/var/lib/aawp/.cache/fonts.idx');
copyIfExists(stripRoot('/etc/machine-id'),                       '/etc/machine-id');
copyIfExists(stripRoot('/var/lib/aawp/host.salt'),               '/var/lib/aawp/host.salt');
copyIfExists(stripRoot(path.join(S, 'config/guardian.json')),    path.join(S, 'config/guardian.json'));

const backupCfg = stripRoot(C);
if (fs.existsSync(backupCfg)) {
  execSync(`cp -r "${backupCfg}/." "${C}/"`, { stdio: 'inherit' });
  console.log('  ✅ .agent-config dir restored');
}

const corePath = path.join(S, 'core/aawp-core.node');
if (fs.existsSync(corePath)) {
  const hash = execSync(`sha256sum "${corePath}" | cut -d' ' -f1`).toString().trim();
  fs.writeFileSync(corePath + '.hash', hash);
  console.log(`  ✅ Hash regenerated: ${hash}`);
}

execSync(`rm -rf "${tmpDir}"`);
console.log('\n✅ Restore complete.');
console.log('\nRun the following to verify:');
console.log('  node wallet-manager.js status\n');
