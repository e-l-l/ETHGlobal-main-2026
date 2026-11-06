#!/usr/bin/env bash
# Copy KEY=value lines from one env file into another (replacing any existing KEY line), never printing values.
# Use it on your laptop after agents/scripts/secret_from_clipboard.py has put secrets into agents/.env:
#
#   deploy/merge-secrets.sh agents/.env deploy/env/agents.env \
#     BEDROCK_API_KEY OFFER_SIGNER_PRIVATE_KEY RISK_MANAGER_PRIVATE_KEY RELAYER_PRIVATE_KEY PAYER_HASH_KEY
set -euo pipefail
[[ $# -ge 3 ]] || { sed -n '2,6p' "$0"; exit 2; }
src="$1" dest="$2"; shift 2
[[ -f "$src" ]] || { echo "no such file: $src" >&2; exit 1; }
umask 077
[[ -f "$dest" ]] || : > "$dest"
for key in "$@"; do
  [[ "$key" =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo "bad key name: $key" >&2; exit 2; }
  line="$(grep -E "^${key}=" "$src" | tail -n 1 || true)"
  if [[ -z "$line" || "$line" == "${key}=" ]]; then echo "skip $key: empty or missing in $src" >&2; continue; fi
  tmp="$(mktemp "${dest}.XXXXXX")"
  awk -v k="${key}=" 'index($0, k) != 1' "$dest" > "$tmp"
  printf '%s\n' "$line" >> "$tmp"
  mv "$tmp" "$dest"
  echo "$key -> $dest ($(( ${#line} - ${#key} - 1 )) chars)"
done
chmod 600 "$dest"
