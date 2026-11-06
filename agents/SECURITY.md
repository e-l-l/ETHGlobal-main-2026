# Key roles and incident response

This testnet prototype is not ready for real lender funds. Use separate accounts for each role, restrict service access, keep gas balances small, and monitor privileged transactions and faucet spending.

- **Offer signer:** can bypass underwriting, critic and clamps. Contract credential, tier and exposure checks still apply.
- **Relayer:** can spend its gas balance and censor service; draw proofs bind the recipient and offer, limiting redirection.
- **Issuer:** can attest fake businesses. Rotation does not revoke already issued credentials.
- **Attester:** can forge approvals; mandate registration still requires shop-owner consent and a credential.
- **Risk manager:** can repeatedly lower limits to their floors and deny credit, but cannot raise them.
- **Owner:** can replace privileged keys and raise limits; compromise affects the entire deployment.

## Rotation runbook

1. Stop affected services and disable the faucet. Preserve audit records without exposing secrets; identify compromised roles and outstanding offers and attestations.
2. Generate separate replacement keys securely. Use the owner-authorized contract role update functions to revoke and replace affected authorities, verify transactions, and read back configured addresses. If the owner is compromised, use its established recovery mechanism if available; otherwise replace the deployment.
3. Update service secrets via secret management, restart after verifying configuration, and exercise a small test transaction. Revoke old provider credentials and recover remaining gas where possible.
4. Review existing credentials, mandates and unexpired signed offers. Issuer rotation alone does not revoke existing credentials; assess them individually and disable affected flows or redeploy if they cannot be safely revoked. Monitor exposure and inform operators.
