"""Settings, read from env or `.env`. Never log or print secret fields. (Frozen, owned by the lead.)"""

from __future__ import annotations

from pathlib import Path

from pydantic import AliasChoices, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]  # agents/


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(ROOT / ".env"), env_file_encoding="utf-8", extra="ignore")

    # Chain
    rpc_url: str = "http://127.0.0.1:8545"  # use the Anon-RPC endpoint in production
    chain_id: int = 31337
    deployments_file: Path = ROOT / "deployments" / "local.json"

    # Keys (never log these)
    offer_signer_private_key: SecretStr | None = None  # signs offers only; holds no funds
    risk_manager_private_key: SecretStr | None = None  # calls lowerLimits; small gas float
    relayer_private_key: SecretStr | None = None  # submits draws / claims / keeper txs; small gas float
    payer_hash_key: SecretStr = SecretStr("dev-only-change-me")  # HMAC key for payer addresses

    # Claude (key read from env or agents/.env; never logged)
    anthropic_api_key: SecretStr | None = None
    # Provider: "anthropic" (first-party API), "bedrock" (Claude in Amazon Bedrock, Mantle endpoint),
    # or "bedrock-converse" (other Bedrock models via the Converse API; see llm_bedrock.py).
    # Bedrock: model id gets the `anthropic.` prefix; server-side fallbacks are not supported there.
    llm_provider: str = "anthropic"
    bedrock_region: str = "ap-south-1"  # Mumbai; served via Bedrock's global routing
    bedrock_api_key: SecretStr | None = None  # Bedrock API key (bearer); never logged
    # bedrock-converse: non-Claude models, one family per role so the Critic is independent by construction
    bedrock_underwriter_model: str = "mistral.mistral-large-3-675b-instruct"
    bedrock_critic_model: str = "moonshotai.kimi-k2.5"
    bedrock_risk_model: str = "qwen.qwen3-235b-a22b-2507-v1:0"
    anthropic_model: str = "claude-opus-5-5"
    underwriter_effort: str = "medium"
    critic_effort: str = "high"
    risk_effort: str = "low"

    # Business rules (ours, stricter than the contract)
    cold_start_max_outstanding_usd: float = 1000
    cold_start_max_count_per_period: int = 10
    cold_start_period_seconds: int = 86400
    risk_min_pool_liquidity: int = 1
    max_days_to_repay: int = 60
    offer_ttl_seconds: int = 15 * 60
    risk_loop_seconds: int = 300

    # Browser origins allowed to call this API (comma-separated; "*" is ignored). apps/web + demo portal hosts.
    cors_allow_origins: str = ""

    # Storage
    db_path: Path = ROOT / "data" / "agents.sqlite"

    # Managed merchant agents + World (merchant_agents.py, world.py). Secrets: never log these.
    attester_private_key: SecretStr | None = None  # signs AgentPassAttestation; holds no funds
    agent_key_encryption_key: SecretStr | None = None  # AES-256-GCM key for agent keys + backups (hex/b64/pass)
    # Aliases: deploy/env/app.env.example names these WORLD_OIDC_CLIENT_ID / _SECRET / _ISSUER.
    world_agent_pass_client_id: str | None = Field(
        default=None, validation_alias=AliasChoices("world_agent_pass_client_id", "world_oidc_client_id"))
    world_agent_pass_client_secret: SecretStr | None = Field(
        default=None, validation_alias=AliasChoices("world_agent_pass_client_secret", "world_oidc_client_secret"))
    # OIDC issuer; discovery at /.well-known/openid-configuration. "World IdP" (auth.world.org); sandbox:
    # https://sandbox.auth.world.org. The legacy https://id.worldcoin.org is closed to apps created after 2025-09-29.
    world_agent_pass_issuer: str = Field(
        default="https://auth.world.org", validation_alias=AliasChoices("world_agent_pass_issuer", "world_oidc_issuer"))
    world_agent_pass_redirect_uri: str | None = None  # must equal a redirect registered for the OIDC client
    world_agent_pass_client_auth: str = "client_secret_post"  # or "client_secret_basic" (auth.world.org: both)
    world_agent_pass_acr: str | None = None  # optional comma list of required `acr` values (unset = not checked)
    world_app_id: str | None = None  # IDKit app_id ("app_..."), passed to IDKit.request({app_id})
    world_rp_id: str | None = None  # World ID 4.0 RP id ("rp_..."): verify URL /api/v4/verify/{rp_id} + rp_context
    # World ID 4.0 RP signing key (Developer Portal `signing_key`, shown once). Signs IDKit rp_context. Never logged.
    world_rp_signing_key: SecretStr | None = Field(
        default=None, validation_alias=AliasChoices("world_rp_signing_key", "rp_signing_key", "world_signing_key"))
    world_rp_signature_ttl_seconds: int = 300
    world_verify_base_url: str = "https://developer.world.org"
    world_environment: str = "production"  # IDKit result `environment` we accept ("staging" on testnets)
    world_recovery_action: str = "credential-recovery-v1"
    world_mock: bool = True  # WORLD_MOCK=1: Agent Pass + IDKit are mocked (approve/deny/expire)
    merchant_agent_interval_seconds: int = 60
    agent_pass_max_age_seconds: int = 600  # an Agent Pass login older than this is "expired"
    attestation_ttl_seconds: int = 3600  # registerMandate must land before the attestation expires
    recovery_token_ttl_seconds: int = 600
    mandate_sig_scheme: str = "eip712"  # "eip712" (MandateDraw typed data) or "eip191" (personal_sign)
    restock_drop_threshold: float = 0.30  # draw if 3-day avg revenue <= (1 - this) * 30-day avg
    restock_min_avg_daily_usd: float = 5.0  # ignore shops whose 30-day avg is below this ($/day)

    # Business Pass issuer (issuer.py). Secrets: never log these.
    issuer_private_key: SecretStr | None = None  # signs BusinessVerified; holds no funds
    business_pepper: SecretStr | None = None  # HMAC key: businessNullifier = HMAC(pepper, accountId)
    business_pass_ttl_seconds: int = 3600  # issue() must land before the attestation expires


def get_settings() -> Settings:
    return Settings()
