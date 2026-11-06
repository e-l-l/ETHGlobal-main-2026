from mra_agents import config, interfaces, models


def test_shared_modules_import():
    s = config.Settings()
    assert s.anthropic_model == "claude-opus-5-5"
    assert models.ALLOWED_AMOUNTS == (50_000_000, 100_000_000, 250_000_000, 500_000_000)
    assert hasattr(interfaces, "Judge")


def test_secret_not_in_repr():
    s = config.Settings(relayer_private_key="0x" + "11" * 32)
    assert "1111" not in repr(s)
