from __future__ import annotations

import base64
import json
import os
from typing import Final, Literal

import httpx
from fastapi import HTTPException, Request, Response
from pydantic import BaseModel, Field

X402_VERSION: Final[int] = 1
DEFAULT_NETWORK: Final[str] = "base"
DEFAULT_ASSET: Final[str] = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
DEFAULT_MAX_TIMEOUT: Final[int] = 300
USDC_DECIMALS: Final[int] = 6


class AssetExtra(BaseModel):
    name: str = "USD Coin"
    version: str = "2"
    symbol: str = "USDC"
    decimals: int = USDC_DECIMALS


class PaymentRequirement(BaseModel):
    scheme: Literal["exact"] = "exact"
    network: str = DEFAULT_NETWORK
    maxAmountRequired: str
    resource: str
    description: str = ""
    mimeType: str = ""
    payTo: str
    maxTimeoutSeconds: int = DEFAULT_MAX_TIMEOUT
    asset: str = DEFAULT_ASSET
    outputSchema: dict | None = None
    extra: AssetExtra = Field(default_factory=AssetExtra)


class PaymentRequiredResponse(BaseModel):
    x402Version: int = X402_VERSION
    error: str = "Payment required"
    accepts: list[PaymentRequirement]


class VerifyResult(BaseModel):
    isValid: bool
    invalidReason: str | None = None
    payer: str | None = None


def usd_to_micro(usd_amount: float) -> str:
    if usd_amount <= 0:
        raise ValueError(f"usd_amount must be positive, got {usd_amount}")
    return str(int(round(usd_amount * 10**USDC_DECIMALS)))


def build_requirement(
    *,
    usd_price: float,
    resource_url: str,
    description: str,
    pay_to: str,
    network: str = DEFAULT_NETWORK,
    asset: str = DEFAULT_ASSET,
) -> PaymentRequirement:
    return PaymentRequirement(
        maxAmountRequired=usd_to_micro(usd_price),
        resource=resource_url,
        description=description,
        payTo=pay_to,
        network=network,
        asset=asset,
    )


def build_402_response(requirement: PaymentRequirement) -> Response:
    body = PaymentRequiredResponse(accepts=[requirement])
    payload = body.model_dump(exclude_none=True)
    header_value = base64.b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")
    return Response(
        content=json.dumps(payload),
        status_code=402,
        media_type="application/json",
        headers={"payment-required": header_value},
    )


def decode_payment_header(header_value: str) -> dict:
    try:
        padding = "=" * (-len(header_value) % 4)
        raw = base64.b64decode(header_value + padding).decode("utf-8")
        payload = json.loads(raw)
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=402, detail=f"invalid X-PAYMENT header: {exc}") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=402, detail="X-PAYMENT payload must be a JSON object")
    return payload


class X402Facilitator:
    def __init__(
        self,
        *,
        facilitator_url: str,
        cdp_api_key: str | None = None,
        verify_path: str = "/platform/v2/x402/verify",
        settle_path: str = "/platform/v2/x402/settle",
        timeout: float = 10.0,
    ) -> None:
        self._url = facilitator_url.rstrip("/")
        self._cdp_api_key = cdp_api_key
        self._verify_path = verify_path
        self._settle_path = settle_path
        self._timeout = timeout

    def _headers(self) -> dict[str, str]:
        headers = {"content-type": "application/json"}
        if self._cdp_api_key:
            headers["Authorization"] = f"Bearer {self._cdp_api_key}"
        return headers

    async def verify(
        self, *, payment_payload: dict, requirement: PaymentRequirement
    ) -> VerifyResult:
        body = {
            "x402Version": X402_VERSION,
            "paymentPayload": payment_payload,
            "paymentRequirements": requirement.model_dump(exclude_none=True),
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(
                    f"{self._url}{self._verify_path}",
                    json=body,
                    headers=self._headers(),
                )
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"facilitator unreachable: {exc}") from exc

        if resp.status_code >= 500:
            raise HTTPException(status_code=502, detail=f"facilitator {resp.status_code}")

        try:
            data = resp.json()
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=502, detail="facilitator returned non-JSON") from exc

        return VerifyResult(
            isValid=bool(data.get("isValid", False)),
            invalidReason=data.get("invalidReason"),
            payer=data.get("payer"),
        )

    async def settle(
        self, *, payment_payload: dict, requirement: PaymentRequirement
    ) -> dict:
        body = {
            "x402Version": X402_VERSION,
            "paymentPayload": payment_payload,
            "paymentRequirements": requirement.model_dump(exclude_none=True),
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(
                    f"{self._url}{self._settle_path}",
                    json=body,
                    headers=self._headers(),
                )
            return resp.json() if resp.content else {}
        except (httpx.HTTPError, json.JSONDecodeError):
            return {}


async def require_x402_payment(
    request: Request,
    *,
    requirement: PaymentRequirement,
    facilitator: X402Facilitator,
) -> dict:
    header_value = request.headers.get("x-payment") or request.headers.get("payment")
    if not header_value:
        raise HTTPException(
            status_code=402,
            detail="Payment required",
            headers={
                "payment-required": base64.b64encode(
                    json.dumps(
                        PaymentRequiredResponse(accepts=[requirement]).model_dump(exclude_none=True)
                    ).encode("utf-8")
                ).decode("ascii")
            },
        )
    payment_payload = decode_payment_header(header_value)
    result = await facilitator.verify(
        payment_payload=payment_payload, requirement=requirement
    )
    if not result.isValid:
        raise HTTPException(
            status_code=402,
            detail=result.invalidReason or "Payment verification failed",
        )
    return payment_payload


def facilitator_from_env() -> X402Facilitator:
    url = os.getenv("FACILITATOR_URL", "https://api.cdp.coinbase.com")
    api_key = os.getenv("CDP_API_KEY")
    return X402Facilitator(facilitator_url=url, cdp_api_key=api_key or None)


__all__ = [
    "X402_VERSION",
    "DEFAULT_NETWORK",
    "DEFAULT_ASSET",
    "USDC_DECIMALS",
    "AssetExtra",
    "PaymentRequirement",
    "PaymentRequiredResponse",
    "VerifyResult",
    "X402Facilitator",
    "build_requirement",
    "build_402_response",
    "decode_payment_header",
    "require_x402_payment",
    "facilitator_from_env",
    "usd_to_micro",
]
