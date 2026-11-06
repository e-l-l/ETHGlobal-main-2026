"""At-rest encryption for managed-agent keys and recovery backups.

AES-256-GCM (pycryptodome, already installed via eth-keyfile; `cryptography` is not a dependency here).
Every ciphertext is bound to a caller-chosen `aad` (e.g. the agent id), so a row's ciphertext cannot be
swapped into another row. Format: "v1:" + base64(nonce[12] || ciphertext || tag[16]).

The master key comes from AGENT_KEY_ENCRYPTION_KEY: 64 hex chars, or base64 of 32 bytes, or (dev only) any
passphrase, stretched with scrypt. Subkeys for other purposes (token MACs, row ids) are derived with HMAC,
never reused directly.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import secrets

from Crypto.Cipher import AES

_PREFIX = "v1:"
_SALT = b"mra-agents/secretbox/v1"


class DecryptError(ValueError):
    pass


def parse_master_key(raw: str) -> bytes:
    raw = raw.strip()
    if not raw:
        raise ValueError("encryption key is empty")
    hex_part = raw.removeprefix("0x")
    if len(hex_part) == 64:
        try:
            return bytes.fromhex(hex_part)
        except ValueError:
            pass
    try:
        b = base64.b64decode(raw, validate=True)
        if len(b) == 32:
            return b
    except (binascii.Error, ValueError):
        pass
    return hashlib.scrypt(raw.encode(), salt=_SALT, n=2**14, r=8, p=1, dklen=32)


class SecretBox:
    def __init__(self, master_key: bytes):
        if len(master_key) != 32:
            raise ValueError("master key must be 32 bytes")
        self._enc = self._derive(master_key, b"enc")
        self._mac = self._derive(master_key, b"mac")

    @staticmethod
    def _derive(key: bytes, label: bytes) -> bytes:
        return hmac.new(key, b"mra-agents:" + label, hashlib.sha256).digest()

    @classmethod
    def from_setting(cls, raw: str) -> SecretBox:
        return cls(parse_master_key(raw))

    def encrypt(self, plaintext: bytes, aad: bytes) -> str:
        nonce = secrets.token_bytes(12)
        cipher = AES.new(self._enc, AES.MODE_GCM, nonce=nonce)
        cipher.update(aad)
        ct, tag = cipher.encrypt_and_digest(plaintext)
        return _PREFIX + base64.b64encode(nonce + ct + tag).decode()

    def decrypt(self, token: str, aad: bytes) -> bytes:
        if not isinstance(token, str) or not token.startswith(_PREFIX):
            raise DecryptError("bad ciphertext format")
        try:
            raw = base64.b64decode(token[len(_PREFIX):], validate=True)
        except (binascii.Error, ValueError):
            raise DecryptError("bad ciphertext encoding") from None
        if len(raw) < 28:
            raise DecryptError("ciphertext too short")
        nonce, ct, tag = raw[:12], raw[12:-16], raw[-16:]
        cipher = AES.new(self._enc, AES.MODE_GCM, nonce=nonce)
        cipher.update(aad)
        try:
            return cipher.decrypt_and_verify(ct, tag)
        except ValueError:
            raise DecryptError("ciphertext failed authentication") from None

    def mac(self, label: bytes, data: bytes) -> bytes:
        """Keyed hash for derived identifiers and token MACs (domain-separated by `label`)."""
        return hmac.new(self._mac, label + b"\x00" + data, hashlib.sha256).digest()
