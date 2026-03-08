#!/usr/bin/env bash
# Compute the canonical binary hash (with .ocx_entropy zeroed out).
# This hash is identical for all users regardless of shard_B injection.
# Usage: bash scripts/binary-hash.sh [path/to/aawp-core.node]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_FILE="${1:-$SCRIPT_DIR/../core/aawp-core.node}"

[ -f "$NODE_FILE" ] || { echo "ERROR: $NODE_FILE not found" >&2; exit 1; }

# Create temp copy, zero out .ocx_entropy, hash it
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
cp "$NODE_FILE" "$TMP"

# Zero fill the .ocx_entropy section (16 bytes of 0x00)
if objdump -h "$TMP" 2>/dev/null | grep -q '\.ocx_entropy'; then
  dd if=/dev/zero bs=1 count=16 of=/tmp/.zero_shard 2>/dev/null
  objcopy --update-section .ocx_entropy=/tmp/.zero_shard "$TMP" 2>/dev/null
  rm -f /tmp/.zero_shard
fi

sha256sum "$TMP" | awk '{print $1}'
