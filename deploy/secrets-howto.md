# Getting secrets onto the box

Rules:

- Real env files live only in `deploy/env/*.env`, on your laptop and on the EC2 box. `deploy/env/.gitignore` ignores them. Only the `*.env.example` templates are committed.
- Never paste a secret into chat, an issue, a commit, a screenshot or a shell command line. Shell history would keep it.
- Never `cat` an env file in front of the projector. To check that a key is set, use `grep -c '^KEY=.' deploy/env/agents.env`.
- Write one `KEY=value` per line with no inline comments. Docker Compose keeps `# ...` after a value as part of the value.
- An empty `KEY=` is passed to the container as an empty string, not as "unset". Leave unused optional keys commented out.

| File | Secrets in it | Notes |
|---|---|---|
| `compose.env` | **none** | Public build values (`NEXT_PUBLIC_*`) and `HOST_SUFFIX`. Safe to edit on the box. |
| `agents.env` | LLM key, 3 private keys, `PAYER_HASH_KEY` | Testnet keys with small gas floats only. |
| `app.env` | `RECOVERY_PEPPER`, World/Reclaim secrets, optional `DEMO_CUSTOMER_PK` | |
| `demo-portal.env` | `SESSION_SECRET` | `deploy.sh` generates it on the box if the file is missing. |
| `issuer.env` | issuer keys | Fill this in from issuer/'s own README once that service exists. |

## Option A (preferred): build the files on your laptop, then `scp`

1. Put each secret into `agents/.env` with the clipboard helper. It never prints the value and it clears the clipboard afterwards.

   ```bash
   cd agents
   # copy the secret to the clipboard, then:
   uv run python scripts/secret_from_clipboard.py BEDROCK_API_KEY
   uv run python scripts/secret_from_clipboard.py OFFER_SIGNER_PRIVATE_KEY
   uv run python scripts/secret_from_clipboard.py RISK_MANAGER_PRIVATE_KEY
   uv run python scripts/secret_from_clipboard.py RELAYER_PRIVATE_KEY
   uv run python scripts/secret_from_clipboard.py PAYER_HASH_KEY
   cd ..
   ```

   The helper writes only to `agents/.env`. For app or issuer secrets, run it the same way and then merge the key into the right file (step 3).

2. Create the deploy env files from the templates. Then fill in the **non-secret** values (`RPC_URL`, `CHAIN_ID=11155111`, `LLM_PROVIDER`, and the `NEXT_PUBLIC_*` values in `compose.env`) in your editor.

   ```bash
   for f in compose agents app demo-portal issuer; do
     [ -f deploy/env/$f.env ] || cp deploy/env/$f.env.example deploy/env/$f.env
   done
   chmod 600 deploy/env/*.env
   ```

3. Merge the secrets from `agents/.env` into the deploy file. Values are never printed, only their lengths.

   ```bash
   deploy/merge-secrets.sh agents/.env deploy/env/agents.env \
     BEDROCK_API_KEY OFFER_SIGNER_PRIVATE_KEY RISK_MANAGER_PRIVATE_KEY RELAYER_PRIVATE_KEY PAYER_HASH_KEY
   # app secrets, if you put them in agents/.env with the helper:
   deploy/merge-secrets.sh agents/.env deploy/env/app.env RECOVERY_PEPPER RP_SIGNING_KEY WORLD_OIDC_CLIENT_SECRET
   ```

   Then delete any app-only keys from `agents/.env` that the agents service doesn't need. If your laptop's `agents/.env` holds anvil values (`RPC_URL=http://127.0.0.1:8545`), **don't** merge `RPC_URL` or `CHAIN_ID`. Type the Sepolia ones into `deploy/env/agents.env` yourself.

4. Copy the files to the box. They go over SSH, so they are encrypted in transit.

   ```bash
   scp -i ~/.ssh/mra-demo.pem deploy/env/{compose,agents,app,demo-portal,issuer}.env \
     ec2-user@<elastic-ip>:~/ethglobal-mumbai/deploy/env/
   ssh -i ~/.ssh/mra-demo.pem ec2-user@<elastic-ip> 'chmod 600 ~/ethglobal-mumbai/deploy/env/*.env'
   ```

   (Use `ubuntu@` instead of `ec2-user@` on Ubuntu.)

## Option B: paste into `nano` on the box

```bash
ssh -i ~/.ssh/mra-demo.pem ec2-user@<elastic-ip>
cd ~/ethglobal-mumbai/deploy/env
cp -n agents.env.example agents.env
chmod 600 agents.env
nano agents.env      # paste after "KEY=", Ctrl+O to save, Ctrl+X to exit
```

Generate random values on the box. They go straight into the file and never appear on screen:

```bash
printf 'PAYER_HASH_KEY=%s\n' "$(openssl rand -hex 32)" >> agents.env        # then delete the empty PAYER_HASH_KEY= line
printf 'RECOVERY_PEPPER=%s\n' "$(openssl rand -base64 48 | tr -d '\n')" >> app.env
```

When the same key appears twice, the last line wins. Still, delete the empty line so nobody gets confused.

## After any env change

```bash
./deploy/deploy.sh --no-pull --no-build   # recreates only the containers whose env changed
```

There is one exception. `NEXT_PUBLIC_*` values in `compose.env` are baked into the app at build time, so after changing one run `./deploy/deploy.sh --no-pull`, which rebuilds.

## Rotating and cleaning up

- Leaked or shown on screen? Rotate it at the source (a new Bedrock key, new wallets with funds moved over, a new `SESSION_SECRET`), update the file, and redeploy.
- After the hackathon, terminate the instance. That destroys the EBS volume and every env file on it. Also revoke the Bedrock/Anthropic keys and drain the testnet wallets.
- Don't bake secrets into images. The Dockerfiles delete `.env*` before building, `agents/Dockerfile` copies only `src/`, `abi/` and `scripts/`, and secrets reach the containers at runtime only, through `env_file`.
