"""Move a secret from the macOS clipboard into agents/.env without ever printing it.

    uv run python scripts/secret_from_clipboard.py BEDROCK_API_KEY

Replaces the variable if present, keeps .env at 0600, then clears the clipboard.
Prints only the variable name and the secret's length.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

ENV = Path(__file__).resolve().parents[1] / ".env"


def main() -> int:
    if len(sys.argv) != 2 or not re.fullmatch(r"[A-Z][A-Z0-9_]*", sys.argv[1]):
        print("usage: secret_from_clipboard.py VAR_NAME", file=sys.stderr)
        return 2
    name = sys.argv[1]
    secret = subprocess.run(["pbpaste"], capture_output=True, text=True, check=True).stdout.strip()
    if len(secret) < 20 or any(c.isspace() for c in secret) or "\n" in secret:
        print(f"clipboard does not look like a key (len={len(secret)}); nothing written", file=sys.stderr)
        return 1
    lines = ENV.read_text().splitlines() if ENV.exists() else ["# Secrets. Git-ignored. Never commit or share."]
    lines = [ln for ln in lines if not ln.startswith(f"{name}=")] + [f"{name}={secret}"]
    fd = os.open(ENV, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write("\n".join(lines) + "\n")
    os.chmod(ENV, 0o600)
    subprocess.run(["pbcopy"], input="", text=True, check=True)  # clear clipboard
    print(f"{name} saved to {ENV} ({len(secret)} chars); clipboard cleared")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
