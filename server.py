from __future__ import annotations

import os
from pathlib import Path
from typing import Final, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from pydantic import BaseModel

from signed_url import SignedUrlIssuer
from x402_middleware import (
    PaymentRequirement,
    X402Facilitator,
    build_402_response,
    build_requirement,
    facilitator_from_env,
    require_x402_payment,
)

load_dotenv()

Tier = Literal["preorder", "intro", "std", "pro"]

TIER_PRICING: Final[dict[Tier, dict[str, float | str]]] = {
    "preorder": {"usd": 20.0, "label": "Pre-order", "description": "x402 SaaS Starter — Pre-order (10 slots, Wt 26.05 only)"},
    "intro": {"usd": 49.0, "label": "Intro", "description": "x402 SaaS Starter — Intro tier"},
    "std":   {"usd": 99.0, "label": "Standard", "description": "x402 SaaS Starter — Standard tier"},
    "pro":   {"usd": 199.0, "label": "Pro", "description": "x402 SaaS Starter — Pro tier"},
}


class AppConfig(BaseModel):
    recipient_wallet: str
    download_secret: str
    facilitator_url: str
    cdp_api_key: str | None
    network: str
    asset: str
    assets_dir: Path
    public_base_url: str

    @classmethod
    def from_env(cls) -> "AppConfig":
        recipient = os.getenv("RECIPIENT_WALLET", "").strip()
        if not recipient.startswith("0x") or len(recipient) != 42:
            raise RuntimeError("RECIPIENT_WALLET must be a 42-char 0x-prefixed EVM address")
        secret = os.getenv("DOWNLOAD_SECRET", "").strip()
        if not secret or secret == "changeme":
            raise RuntimeError("DOWNLOAD_SECRET must be set to a non-default value")
        return cls(
            recipient_wallet=recipient,
            download_secret=secret,
            facilitator_url=os.getenv("FACILITATOR_URL", "https://api.cdp.coinbase.com"),
            cdp_api_key=os.getenv("CDP_API_KEY") or None,
            network=os.getenv("NETWORK", "base"),
            asset=os.getenv("USDC_ASSET_ADDRESS", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"),
            assets_dir=Path(os.getenv("ASSETS_DIR", "./assets")).resolve(),
            public_base_url=os.getenv("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/"),
        )


def _build_app(config: AppConfig | None = None) -> FastAPI:
    cfg = config or AppConfig.from_env()
    cfg.assets_dir.mkdir(parents=True, exist_ok=True)

    app = FastAPI(title="x402 SaaS Starter", version="0.1.0")
    app.state.config = cfg
    app.state.issuer = SignedUrlIssuer(cfg.download_secret)
    app.state.facilitator = X402Facilitator(
        facilitator_url=cfg.facilitator_url,
        cdp_api_key=cfg.cdp_api_key,
    )

    def _requirement_for(tier: Tier, request: Request) -> PaymentRequirement:
        pricing = TIER_PRICING[tier]
        resource_url = f"{cfg.public_base_url}/buy/{tier}"
        return build_requirement(
            usd_price=float(pricing["usd"]),
            resource_url=resource_url,
            description=str(pricing["description"]),
            pay_to=cfg.recipient_wallet,
            network=cfg.network,
            asset=cfg.asset,
        )

    @app.get("/", response_class=HTMLResponse)
    async def landing() -> HTMLResponse:
        rows = "".join(
            f"""
            <div class="tier">
              <h2>{p['label']}</h2>
              <p class="price">${p['usd']:.0f} USDC</p>
              <p class="desc">{p['description']}</p>
              <a class="buy" href="/buy/{tier}">Buy {p['label']} (x402)</a>
            </div>
            """
            for tier, p in TIER_PRICING.items() if tier != "preorder"
        )
        html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>x402 SaaS Starter</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body {{ font-family: ui-sans-serif, system-ui, sans-serif; max-width: 760px; margin: 40px auto; padding: 0 16px; color: #0a0a0a; }}
  h1 {{ font-size: 28px; margin-bottom: 8px; }}
  .sub {{ color: #555; margin-bottom: 32px; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }}
  .tier {{ border: 1px solid #e5e5e5; border-radius: 10px; padding: 20px; }}
  .tier h2 {{ margin: 0 0 8px; }}
  .price {{ font-size: 22px; font-weight: 600; margin: 0 0 8px; }}
  .desc {{ color: #555; min-height: 48px; }}
  .buy {{ display: inline-block; margin-top: 8px; padding: 8px 14px; background: #0a0a0a; color: #fff; text-decoration: none; border-radius: 6px; }}
  code {{ background: #f5f5f5; padding: 2px 6px; border-radius: 4px; }}
</style>
</head>
<body>
  <h1>x402 SaaS Starter</h1>
  <p class="sub">Pay-per-download via x402 micropayments on Base. USDC settles to <code>{cfg.recipient_wallet}</code>.</p>
  <div class="grid">{rows}</div>
  <p style="margin-top:32px;color:#777;font-size:13px">Each <code>/buy/&lt;tier&gt;</code> returns HTTP 402 with an x402 v0.5 challenge. POST <code>/download/&lt;tier&gt;</code> with an <code>X-PAYMENT</code> header to receive a 24h signed download URL.</p>
</body>
</html>"""
        return HTMLResponse(html)

    @app.get("/preorder", response_class=HTMLResponse)
    async def preorder_landing() -> HTMLResponse:
        landing_path = Path(__file__).parent / "landing-preorder.html"
        if landing_path.is_file():
            return HTMLResponse(landing_path.read_text())
        raise HTTPException(status_code=404, detail="preorder landing not provisioned")

    @app.get("/buy/{tier}")
    async def buy(tier: Tier, request: Request) -> JSONResponse:
        if tier not in TIER_PRICING:
            raise HTTPException(status_code=404, detail=f"unknown tier '{tier}'")
        requirement = _requirement_for(tier, request)
        return build_402_response(requirement)

    @app.post("/download/{tier}")
    async def download(tier: Tier, request: Request) -> JSONResponse:
        if tier not in TIER_PRICING:
            raise HTTPException(status_code=404, detail=f"unknown tier '{tier}'")
        requirement = _requirement_for(tier, request)
        await require_x402_payment(
            request,
            requirement=requirement,
            facilitator=app.state.facilitator,
        )
        token = app.state.issuer.issue(tier)
        encoded = app.state.issuer.encode(token)
        url = f"{cfg.public_base_url}/download/file/{tier}/{encoded}"
        return JSONResponse(
            {
                "tier": tier,
                "download_url": url,
                "expires_at": token.expires_at,
            }
        )

    @app.get("/download/file/{tier}/{token}")
    async def download_file(tier: Tier, token: str) -> FileResponse:
        if tier not in TIER_PRICING:
            raise HTTPException(status_code=404, detail=f"unknown tier '{tier}'")
        if not app.state.issuer.verify(tier, token, consume=True):
            raise HTTPException(status_code=403, detail="invalid or expired download token")
        path = cfg.assets_dir / f"{tier}.zip"
        if not path.is_file():
            raise HTTPException(status_code=404, detail=f"asset for tier '{tier}' not provisioned")
        return FileResponse(
            path,
            media_type="application/zip",
            filename=f"x402-saas-starter-{tier}.zip",
        )

    return app


def create_app() -> FastAPI:
    return _build_app()


app = create_app() if os.getenv("X402_SKIP_AUTOSTART") != "1" else None


__all__ = ["app", "create_app", "AppConfig", "TIER_PRICING"]
