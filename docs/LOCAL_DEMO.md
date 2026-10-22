# Local end-to-end demo

Run from PowerShell at the repository root:

```powershell
.\scripts\e2e_demo.ps1
python .\scripts\abuse_tests.py
```

The end-to-end script starts a temporary Hardhat chain, deploys
`CarbonRegistry` to chain ID `31337`, starts the API and production web app,
enables the development-only cached demo, and runs Playwright desktop/mobile
smoke tests. It then checks healthy registration and receipt confirmation,
deforested rejection, exact and shifted overlap rejection, and idempotent
resubmission. For duplicate/rejected submissions it compares the verifier
account's chain nonce and balance before and after the request. Services stop,
temporary files are removed, and any prior `shared/contract.json` is restored
when the script exits.

The API's `CACHED_DEMO_MODE=true` switch bypasses satellite-provider calls and
selects only the reviewed packaged `healthy_forest` or `deforested` NDVI series.
It may be enabled in production for those sample scenarios, but never bypasses
server-side Turnstile validation, rate limits, or the daily registration cap. The frontend
`NEXT_PUBLIC_CACHED_DEMO_MODE=true` switch makes the local-only flow explicit
and labels the cached data; it does not skip Turnstile. Only a development build
without a site key displays the development bypass notice. API-side
`TURNSTILE_DEV_BYPASS=true` is also required. Registrations still submit a
real transaction to the local Hardhat chain—no simulated transaction hashes
are returned. Keep `TURNSTILE_DEV_BYPASS=false` in deployed environments and
configure both the public Turnstile site key and server-side secret.

`scripts/abuse_tests.py` runs against an isolated in-memory SQLite database and
does not contact third-party services. It exercises request-body and geometry
bounds, project-name handling, fail-closed Turnstile behavior, Origin checks,
rate limits, and generic error responses.

The local Hardhat node uses its standard publicly known development accounts;
the verifier key is confined to the temporary API process environment and must
never be reused for a public testnet or mainnet deployment.
