from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import threading
import time
from dataclasses import dataclass
from typing import Final

from pydantic import BaseModel, Field

DEFAULT_TTL_SECONDS: Final[int] = 24 * 60 * 60


class SignedUrlToken(BaseModel):
    tier: str = Field(default="", max_length=32)
    nonce: str = Field(..., min_length=16, max_length=64)
    expires_at: int = Field(..., gt=0)
    signature: str = Field(..., min_length=16)


@dataclass(frozen=True)
class _Issued:
    expires_at: int
    consumed: bool = False


class SignedUrlIssuer:
    def __init__(self, secret: str, ttl_seconds: int = DEFAULT_TTL_SECONDS) -> None:
        if not secret or secret == "changeme":
            raise ValueError("SignedUrlIssuer: DOWNLOAD_SECRET must be set to a non-default value")
        self._secret = secret.encode("utf-8")
        self._ttl = ttl_seconds
        self._lock = threading.Lock()
        self._issued: dict[str, _Issued] = {}

    def _sign(self, tier: str, nonce: str, expires_at: int) -> str:
        message = f"{tier}:{nonce}:{expires_at}".encode("utf-8")
        digest = hmac.new(self._secret, message, hashlib.sha256).digest()
        return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")

    def issue(self, tier: str) -> SignedUrlToken:
        nonce = secrets.token_urlsafe(24)
        expires_at = int(time.time()) + self._ttl
        signature = self._sign(tier, nonce, expires_at)
        with self._lock:
            self._issued[nonce] = _Issued(expires_at=expires_at, consumed=False)
            self._gc_locked()
        return SignedUrlToken(tier=tier, nonce=nonce, expires_at=expires_at, signature=signature)

    def encode(self, token: SignedUrlToken) -> str:
        raw = f"{token.nonce}.{token.expires_at}.{token.signature}".encode("utf-8")
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")

    def decode(self, encoded: str) -> SignedUrlToken | None:
        try:
            padding = "=" * (-len(encoded) % 4)
            raw = base64.urlsafe_b64decode(encoded + padding).decode("utf-8")
            nonce, expires_str, signature = raw.split(".", 2)
            return SignedUrlToken(
                nonce=nonce,
                expires_at=int(expires_str),
                signature=signature,
            )
        except (ValueError, UnicodeDecodeError, Exception):
            return None

    def verify(self, tier: str, encoded: str, *, consume: bool = True) -> bool:
        token = self.decode(encoded)
        if token is None:
            return False
        expected = self._sign(tier, token.nonce, token.expires_at)
        if not hmac.compare_digest(expected, token.signature):
            return False
        now = int(time.time())
        if token.expires_at <= now:
            return False
        with self._lock:
            record = self._issued.get(token.nonce)
            if record is None or record.consumed or record.expires_at <= now:
                return False
            if consume:
                self._issued[token.nonce] = _Issued(expires_at=record.expires_at, consumed=True)
            self._gc_locked()
        return True

    def _gc_locked(self) -> None:
        now = int(time.time())
        stale = [n for n, r in self._issued.items() if r.expires_at <= now]
        for n in stale:
            del self._issued[n]


__all__ = ["SignedUrlIssuer", "SignedUrlToken", "DEFAULT_TTL_SECONDS"]
