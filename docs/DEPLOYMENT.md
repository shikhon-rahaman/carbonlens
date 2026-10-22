# Free-tier deployment guide

This guide deploys the **testnet demo** using Vercel for the web app, a Render
free web service for the API, Render Postgres, and Cloudflare Turnstile. It does
not deploy or alter the Sepolia contract. Configure only burner testnet
credentials; never use a deployer key for the running API.

## 1. Render Postgres

1. Create a PostgreSQL database in Render.
2. Copy its **internal** connection string from the Render dashboard directly
   into the API service's secret `DATABASE_URL` environment setting. Do not put
   the connection string in source control, build output, or this guide.
3. Use the `postgresql://` URL form. The API selects its installed Psycopg 3
   driver and creates tables on first startup.
4. Keep the database and API in the same region when possible. Free database
   availability, storage, and retention are subject to Render's current plan.

## 2. Render API web service

Create a web service from the repository:

- **Root directory:** repository root.
- **Runtime:** Python.
- **Python version:** set `PYTHON_VERSION` to `3.11.9` (or another supported
  Python 3.11 patch release).
- **Build command:**
  ```text
  python -m pip install --upgrade pip && python -m pip install -r ai-verifier/requirements.txt -r api/requirements.txt
  ```
- **Start command:**
  ```text
  python -m uvicorn main:app --app-dir api --host 0.0.0.0 --port $PORT
  ```
- **Health check path:** `/health`.

Render supplies `PORT`. Set the environment variables below in the Render
service dashboard, not in a committed file.

### API environment variables

“Required” means required for the production API or for the stated optional
feature. Secret values belong only in the Render server environment. Do not use
`DEPLOYER_PRIVATE_KEY` on the API service.

| Variable | Classification | Required / purpose |
| --- | --- | --- |
| `PYTHON_VERSION` | Non-secret | Render runtime selection: `3.11.9` (or a supported Python 3.11 patch release). |
| `ENV` | Non-secret | Required: set to `production`. |
| `PORT` | Non-secret, platform-managed | Render supplies this; do not hard-code a port in the start command. |
| `ALLOWED_ORIGINS` | Non-secret | Required: exact Vercel site origin, without a path or wildcard. |
| `DATABASE_URL` | Secret | Required: Render Postgres connection string in `postgresql://` form. |
| `RPC_URL` | Secret | Required: Sepolia RPC endpoint; add it directly in Render's secret environment configuration. |
| `CHAIN_ID` | Non-secret | Required: `11155111` for Sepolia. |
| `CONTRACT_ADDRESS` | Non-secret | Required: deployed registry address from `shared/contract.json`. |
| `VERIFIER_PRIVATE_KEY` | Secret | Required: dedicated low-balance verifier burner key for the testnet API. |
| `TURNSTILE_SECRET` | Secret | Required: Cloudflare Turnstile server-side secret. |
| `TURNSTILE_DEV_BYPASS` | Non-secret boolean | Required: `false`. Production refuses to start if enabled. |
| `CACHED_DEMO_MODE` | Non-secret boolean | Optional: `true` enables the reviewed cached sample scenarios, while Turnstile, rate limits, and daily registration caps remain active. |
| `SCORE_THRESHOLD` | Non-secret number | Optional: API scoring threshold; defaults to `70`. |
| `DAILY_REGISTRATION_CAP` | Non-secret number | Optional: daily cap; defaults to `20`. |
| `MAX_CONCURRENT_VERIFICATIONS` | Non-secret number | Optional: concurrent verification limit; defaults to `2`. |
| `MAX_GAS_LIMIT` | Non-secret number | Optional: registration transaction gas ceiling; defaults to `1000000`. |
| `REGISTRATION_RECEIPT_TIMEOUT_SECONDS` | Non-secret number | Optional: transaction receipt timeout; defaults to `60`. |
| `PINATA_JWT` | Secret | Optional: evidence pinning credentials. If omitted or unavailable, local evidence fallback behavior applies and may not be durable on an ephemeral free service. |
| `LLM_PROVIDER` | Non-secret | Optional: `none` (default), `gemini`, or `groq`. Leave `none` to disable LLM explanations. |
| `LLM_API_KEY` | Secret | Optional: provider key only when enabling an LLM. |
| `LLM_MODEL` | Non-secret | Optional: model name when using an LLM provider. |
| `SENTRY_DSN` | Sensitive configuration | Optional: error-reporting DSN, if used. |
| `CHAIN_NAME` | Non-secret | Optional display/deployment metadata. |
| `DEPLOYER_PRIVATE_KEY` | Secret | **Do not set on Render.** Deployment is separate; the running API uses only the verifier burner key. |
| `EXPLORER_API_KEY` | Secret | Optional deployment verification credential; not needed by the running API. Keep out of Render unless a separate verification workflow explicitly requires it. |
| `EXPLORER_BASE_URL` | Non-secret | Optional explorer configuration for deployment tooling. |
| `DEPLOYER_ADDRESS` | Non-secret | Optional public deployment/admin address for deployment tooling; not required by the API. |

## 3. Cloudflare Turnstile

1. Create a Turnstile widget for the exact Vercel production hostname and any
   preview hostname you intentionally support.
2. Add the widget's **site key** to Vercel as
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
3. Add the corresponding **secret key** to Render as `TURNSTILE_SECRET`.
4. Do not configure the development bypass in production. The API verifies
   tokens server-side and fails closed if verification is unavailable.

## 4. Vercel web app

Import the GitHub repository into Vercel:

- **Root directory:** `web`.
- **Framework preset:** Next.js.
- **Build command:** `npm run build`.
- **Install command:** `npm ci`.
- Add the public variables below for Production (and explicitly selected Preview
  environments if needed).

| Variable | Classification | Value / purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Public | Render API origin, with no path suffix. |
| `NEXT_PUBLIC_SITE_URL` | Public | Exact Vercel production site origin. |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | Public | Deployed Sepolia contract address. |
| `NEXT_PUBLIC_CHAIN_ID` | Public | `11155111`. |
| `NEXT_PUBLIC_EXPLORER_BASE_URL` | Public | Sepolia explorer base URL. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Public | Cloudflare Turnstile widget site key. |
| `NEXT_PUBLIC_CACHED_DEMO_MODE` | Public boolean | `true` to display the cached sample flows; does not bypass Turnstile. |
| `NEXT_PUBLIC_GITHUB_URL` | Public | Repository link. |

Only `NEXT_PUBLIC_*` values belong in the Vercel web build. They are visible to
visitors and must never contain server secrets. The Content Security Policy
derives its API `connect-src` origin from `NEXT_PUBLIC_API_BASE_URL`.

After obtaining the Vercel production URL:

1. Set `NEXT_PUBLIC_SITE_URL` to that exact origin in Vercel.
2. Set Render `ALLOWED_ORIGINS` to that exact origin, with no trailing path or
   wildcard.
3. Add the Vercel hostname to the Turnstile widget's allowed hostnames.
4. Set Vercel `NEXT_PUBLIC_API_BASE_URL` to the Render API origin.
5. Redeploy both services after configuration changes.

## Free-tier sleep behavior

Render's free web service may sleep after inactivity. The first API request
after sleeping can take about a minute while the service wakes. A permitted
external uptime monitor can periodically request `/health` to observe
availability and may reduce idle periods, but it does not guarantee that a
free service will stay awake. Check the current Render free-tier policy and
limits; do not promise continuous availability.

## Post-deployment verification

- [ ] `GET` the `/health` route on your Render API origin; it returns
  `{"ok":true}` and no secrets.
- [ ] Web pages render over HTTPS with expected security headers and a nonce CSP.
- [ ] Production `script-src` does not include `unsafe-eval`; styles render
  without browser `style-src` violations.
- [ ] Browser network requests use the configured API origin and Cloudflare
  Turnstile; Turnstile succeeds with the production hostname.
- [ ] API CORS accepts the exact Vercel origin and rejects an unrelated origin.
- [ ] Rate limits and the daily registration cap remain active.
- [ ] A test request with invalid/missing Turnstile proof is rejected.
- [ ] Browser bundles and static assets contain no server secrets, private keys,
  credential-bearing RPC endpoints, database URLs, or provider API keys.
- [ ] Test healthy, deforested, and overlapping sample behavior and inspect the
  returned data-source label and Sepolia transaction outcome.
- [ ] Confirm all observed contract links resolve to the existing Sepolia
  deployment; do not deploy or change the contract as part of web/API hosting.
