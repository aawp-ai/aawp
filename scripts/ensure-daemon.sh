#!/usr/bin/env bash
set -euo pipefail

ROOT="/root/clawd/skills/aawp"
LOCK="/tmp/.aawp-daemon.lock"
OUT="/tmp/aawp-ensure.out"

cd "$ROOT"

# Auto-provision on first run
if [ ! -f "$ROOT/.agent-config/seed.enc" ]; then
  echo "[AAWP] Not provisioned — running first-time setup..."
  bash "$ROOT/scripts/provision.sh"
  exit $?
fi

healthcheck() {
  node - <<'NODE'
const fs = require('fs');
const net = require('net');
const addon = require('/root/clawd/skills/aawp/core/aawp-core.node');
const lockPath = '/tmp/.aawp-daemon.lock';
const C = process.env.AAWP_CONFIG || '/root/clawd/skills/aawp/.agent-config';
const S = process.env.AAWP_SKILL || '/root/clawd/skills/aawp';

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function query(sock, payload, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const ts = Math.floor(Date.now() / 1000);
    const hmac = addon._h0(ts);
    const req = JSON.stringify({ ...payload, ts, hmac });
    const c = net.createConnection(sock, () => c.end(req));
    let data = '';
    const timer = setTimeout(() => {
      c.destroy();
      reject(new Error('timeout'));
    }, timeoutMs);
    c.on('data', chunk => { data += chunk; });
    c.on('end', () => {
      clearTimeout(timer);
      try { resolve(JSON.parse(data)); }
      catch (_) { reject(new Error('invalid json')); }
    });
    c.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

(async () => {
  let lock;
  try {
    lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch (_) {
    fail('no lock');
  }
  if (!lock.sock || !fs.existsSync(lock.sock)) fail('missing socket');

  addon._i0(C, S);
  const res = await query(lock.sock, { cmd: 'address' });
  if (!res || !res.address) fail('bad healthcheck response');
  console.log(res.address);
})().catch(err => fail(err && err.message ? err.message : String(err)));
NODE
}

if healthcheck > "$OUT" 2>&1; then
  echo "[AAWP] daemon healthy"
  cat "$OUT"
  exit 0
fi

echo "[AAWP] daemon unhealthy — restarting"
/root/clawd/skills/aawp/scripts/restart-daemon.sh
