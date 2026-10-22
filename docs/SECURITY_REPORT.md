# CarbonLens security review

## Scope and outcome

This review covers the web application, API, verifier, dependencies, GitHub
Actions workflows, and deployed testnet-contract source against the threat model.
It is a source-level and automated review, not a formal assurance assessment.
The deployed contract and `shared/contract.json` were not changed.

| ID | Severity | Location | Status |
| --- | --- | --- | --- |
| SR-01 | High | `web/package-lock.json` — Tailwind 3 / Next ESLint transitive dependencies | Open: `npm audit` reports 7 high and 2 moderate advisories. The Next ESLint `fast-glob` dependency was updated within major version 3, but the remaining advisory chain is not cleared. The available Tailwind remediation requires Tailwind 4 and the selector-parser advisory requires version 7, both prohibited major upgrades; `npm audit fix --dry-run` offers no safe in-range change. The audit gate remains enabled. |
| SR-02 | Medium | `web/middleware.ts` — `style-src-attr` | Accepted, scoped trade-off: `'unsafe-inline'` is limited to style attributes needed by runtime-rendered map/animation elements. `script-src` remains nonce-based and strict; no `unsafe-eval` is allowed in production. |
| SR-03 | Medium | `api/main.py`, verifier role in `shared/contract.json` | Accepted architectural risk: the verifier is a trusted attestor with privileged signing authority. |
| SR-04 | Medium | API duplicate checks and the deployed contract's geohash-cell checks | Accepted limitation: on-chain geohash cells are combined with an off-chain polygon-overlap check, but shifting a polygon beyond their thresholds can evade duplicate detection. |
| SR-05 | Low | `data/` cached NDVI scenarios | Accepted limitation: demo scenarios use reviewed cached sample NDVI series and do not represent a live satellite assessment. |
| SR-06 | Medium | Project assurance | Accepted limitation: no third-party security audit has been performed. Testnet burner keys only; do not use these credentials or this system for production value or mainnet issuance. |

## Work completed

- Production cached sample scenarios remain available when enabled, while API
  Turnstile verification, rate limits, and the daily registration cap remain
  active. Production startup rejects `TURNSTILE_DEV_BYPASS=true`.
- Frontend cached-demo mode no longer bypasses Turnstile. The development
  placeholder is available only in development when no public site key is set.
- Moved the three sample polygons to a new location while preserving the
  intentional overlap between the healthy and overlapping samples; refreshed
  their consumers and tests. No contract artifacts were changed.
- Normalized `postgresql://` SQLAlchemy URLs to the installed Psycopg 3 driver.
  SQLite remains the local default, and application startup creates tables.
- Documented the Render `0.0.0.0`/`PORT` start command, production variables,
  database URL, and cached-demo behavior.
- Added a per-request CSP style nonce while keeping production scripts
  nonce-based with `strict-dynamic` and without `unsafe-eval`. The web build and
  browser tests exercise CSP headers and check for style-policy console errors.
- Enabled the ESLint security recommended rules. The remaining object-injection
  diagnostics are warnings on typed key lookups; they do not fail lint.
- Updated the Next ESLint `fast-glob` transitive dependency to 3.3.3 within
  major version 3; this does not clear the remaining Web audit findings.
- Confirmed GitHub Actions use `ubuntu-24.04` and read-only contents permissions
  where applicable. The Scorecard action is pinned to a full commit SHA with a
  release comment.

## Scanner and test results

| Check | Result |
| --- | --- |
| Web `npm ci`, lint, typecheck, build, Playwright | Passed; 7 browser tests passed. |
| Web `npm audit --audit-level=high` | Failed as reported in SR-01; 7 high and 2 moderate findings. Not disabled or made non-blocking. |
| Python Ruff and Bandit (`ai-verifier`, `api`) | Passed; Bandit reported no issues. |
| Python `pip-audit` (`ai-verifier`, `api`) | Passed; no known vulnerabilities. |
| Python pytest (`ai-verifier`, `api`) | Passed: 34 and 24 tests. |
| Contract compile, tests, Solhint, Slither | Passed; Slither reported zero findings. |
| Gitleaks | Passed on changed working-tree files and 10 repository commits, with dotenv paths excluded; no leaks found. |

## Security alignment checklist

- [x] Reviewed and aligned with applicable OWASP Top 10 areas, including
  injection, security misconfiguration, vulnerable components, software
  integrity, logging, and SSRF. Dependency risk SR-01 remains open.
- [x] Reviewed and aligned with applicable OWASP API Security Top 10 areas:
  bounded and typed input, explicit CORS origins, rate limits, server-side
  Turnstile, parameterized SQLAlchemy queries, generic client errors, and
  constrained privileged operations.
- [x] Reviewed and aligned with ASVS Level 1 themes for validation, configuration,
  error handling, access boundaries, and security headers. This checklist is not
  a claim of full requirements verification.
- [x] Reviewed and aligned with OWASP LLM Top 10 themes: the LLM integration is
  optional and disabled by default; its output is untrusted explanatory content,
  not an input to scoring or authorization. Prompt injection and misleading
  output remain relevant limitations when an operator enables a provider.
- [x] Reviewed and aligned with relevant SWC Registry categories using Solidity
  tests, Solhint, and Slither. Automated analysis is not a proof of correctness
  or a substitute for independent contract review.

## Accepted operational limitations

- The verifier is a trusted attestor; its key and role require strict custody.
- Duplicate detection combines on-chain geohash cells with an off-chain overlap
  check, but shifting a claim beyond their thresholds can evade both checks.
- Demo sites use cached sample NDVI series.
- Only burner testnet keys are used; the application is not approved for mainnet
  or real-value issuance.
- No third-party audit has been performed.
- Dependabot version updates are intentionally not enabled. Vulnerability
  detection relies on `pip-audit`, `npm audit`, dependency review, and GitHub
  security alerts. The current Web audit findings remain open as described above.
