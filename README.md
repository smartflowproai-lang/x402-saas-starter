# x402 SaaS Starter (Python / FastAPI)

Ship a paid downloadable artifact behind x402 micropayments on Base. No Stripe, no Lemon Squeezy — buyers pay USDC and receive a 24h signed download URL.

Three tiers ship pre-wired:

| tier | price | endpoint |
|---|---|---|
| intro | $49 USDC | `GET /buy/intro` |
| std | $99 USDC | `GET /buy/std` |
| pro | $199 USDC | `GET /buy/pro` |

Payments settle to a single EVM wallet on Base (default: `0xd779cE46567d21b9918F24f0640cA5Ad6058C893`).

---

## Quick deploy

### Local

```bash
git clone https://github.com/smartflowproai-lang/x402-saas-starter.git
cd x402-saas-starter

python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# edit .env — set DOWNLOAD_SECRET to a long random string, CDP_API_KEY,
# RECIPIENT_WALLET (defaults to Tom's pseudonym wallet)

mkdir -p assets
# drop your paid artifacts as assets/intro.zip, assets/std.zip, assets/pro.zip

uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

### Docker

```bash
docker build -t x402-saas-starter .
docker run --rm -p 8000:8000 \
  -e DOWNLOAD_SECRET="$(openssl rand -hex 32)" \
  -e CDP_API_KEY="your-cdp-key" \
  -e RECIPIENT_WALLET=0xd779cE46567d21b9918F24f0640cA5Ad6058C893 \
  -e PUBLIC_BASE_URL="https://your.domain" \
  -v "$PWD/assets:/app/assets:ro" \
  x402-saas-starter
```

---

## Environment

| var | required | notes |
|---|---|---|
| `DOWNLOAD_SECRET` | yes | HMAC-SHA256 secret for signed URLs. Must NOT be `changeme`. |
| `CDP_API_KEY` | for CDP mode | Bearer token sent to facilitator. Leave unset for self-hosted facilitator. |
| `RECIPIENT_WALLET` | yes | EVM address that receives USDC. 42 chars, `0x`-prefixed. |
| `FACILITATOR_URL` | no | Defaults to `https://api.cdp.coinbase.com`. |
| `USDC_ASSET_ADDRESS` | no | Defaults to Base USDC (`0x8335…2913`). |
| `NETWORK` | no | Defaults to `base`. |
| `ASSETS_DIR` | no | Defaults to `./assets`. Expects `<tier>.zip` per tier. |
| `PUBLIC_BASE_URL` | no | Used in `resource` field of x402 challenge + returned download URL. |

---

## Manual smoke test

### 1 — Fetch the 402 challenge

```bash
curl -i http://localhost:8000/buy/intro
```

Expected (truncated):

```
HTTP/1.1 402 Payment Required
content-type: application/json
payment-required: eyJ4NDAyVmVyc2lvbiI6MSwi...

{
  "x402Version": 1,
  "error": "Payment required",
  "accepts": [{
    "scheme": "exact",
    "network": "base",
    "maxAmountRequired": "49000000",
    "resource": "http://localhost:8000/buy/intro",
    "description": "x402 SaaS Starter — Intro tier",
    "mimeType": "",
    "payTo": "0xd779cE46567d21b9918F24f0640cA5Ad6058C893",
    "maxTimeoutSeconds": 300,
    "asset": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    "extra": {"name": "USD Coin", "version": "2", "symbol": "USDC", "decimals": 6}
  }]
}
```

The 6-decimal USDC amount: intro = `49000000`, std = `99000000`, pro = `199000000`.

### 2 — POST a payment

Construct an x402 PAYMENT payload (EIP-3009 `transferWithAuthorization` signed by the buyer wallet), base64-encode the JSON, and POST:

```bash
PAYMENT_JSON='{"x402Version":1,"scheme":"exact","network":"base","payload":{"signature":"0x...","authorization":{"from":"0xBUYER","to":"0xd779cE46567d21b9918F24f0640cA5Ad6058C893","value":"49000000","validAfter":"0","validBefore":"9999999999","nonce":"0x..."}}}'
PAYMENT=$(printf '%s' "$PAYMENT_JSON" | base64)

curl -s -X POST http://localhost:8000/download/intro \
  -H "X-PAYMENT: $PAYMENT" | jq
```

On verify success, response:

```json
{
  "tier": "intro",
  "download_url": "http://localhost:8000/download/file/intro/<token>",
  "expires_at": 1746979200
}
```

### 3 — Fetch the artifact

```bash
curl -O -J http://localhost:8000/download/file/intro/<token>
```

Token is single-use. A second GET returns `403 invalid or expired download token`.

---

## Architecture

```
GET  /                  HTML landing (3 tier cards)
GET  /buy/{tier}        → 402 + x402 v0.5 challenge (accepts[])
POST /download/{tier}   x-payment header → CDP /verify → signed URL
GET  /download/file/.../{token}  HMAC verify + consume + serve zip
```

- `x402_middleware.py` — pydantic models for the challenge shape, base64 header codec, async CDP facilitator client (verify + settle).
- `signed_url.py` — HMAC-SHA256 24h tokens, in-memory single-use nonce tracking (swap for Redis in prod).
- `server.py` — FastAPI app, three tier routes, env validation, asset directory provisioning.

---

## Tests

```bash
pip install -r requirements.txt
DOWNLOAD_SECRET=$(openssl rand -hex 16) \
RECIPIENT_WALLET=0xd779cE46567d21b9918F24f0640cA5Ad6058C893 \
pytest -q
```

---

## License

MIT. Built by Tom Smart — [@tomsmart_ai](https://twitter.com/tomsmart_ai).
