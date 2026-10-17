# CarbonLens Threat Model

## Scope and methodology

This threat model applies the STRIDE method to CarbonLens, a testnet demonstration for vegetation-health evidence and carbon-credit registration. It identifies practical risks and planned mitigations; it does not claim that the system is fully secure.

## System overview and data flow

1. A user submits a project name, claimed hectares, GeoJSON polygon, and bot-protection token in the web application.
2. The web application sends that request to the API over HTTPS.
3. The API validates and bounds the request, checks rate limits and bot protection, and passes normalized geometry to the verifier.
4. The verifier obtains Sentinel-2 metadata and imagery through approved satellite services, computes structured NDVI results, and falls back to reviewed cached data when external data is unavailable.
5. The API creates evidence, pins approved non-sensitive evidence to IPFS, optionally requests a constrained explanation from an LLM, and persists public project records in the database.
6. A privileged verifier account submits an attestation to the testnet contract. The contract checks region-cell registry rules and score threshold before recording the region and minting credits.
7. The API returns the verification result, evidence URI, and testnet transaction hash to the web application for public display.

Data-flow summary: **user → web → API → satellite/IPFS/LLM/RPC → contract → DB**. The web only receives public configuration and public verification results; server credentials remain on the server.

## Trust boundaries

| Boundary | What crosses it | Security expectation |
| --- | --- | --- |
| Browser ↔ web application | User-controlled form fields and rendered public project data | Treat all input and stored fields as untrusted; authenticate browser requests only through designed public controls. |
| Web application ↔ API | Verification requests and public project responses | HTTPS, explicit CORS allow-list, schema validation, rate limits, generic errors. |
| API ↔ satellite provider | Server-generated, bounded spatial/time queries and imagery | No user-supplied URLs; timeouts, retries, provenance checks, cached fallback. |
| API ↔ IPFS pinning provider | Sanitized evidence payloads and content identifiers | Assume published content is public and immutable; prevent sensitive or invalid content from being pinned. |
| API ↔ LLM provider | Structured scores and sanitized, length-limited name | LLM output is untrusted explanatory text and never an authorization or scoring input. |
| API/verifier ↔ RPC ↔ contract | Signed testnet transactions and public chain state | Restrict signing key, validate chain ID and contract address, tolerate outages and replays. |
| API ↔ database | Validated project metadata and verification state | Least-privilege access, parameterized queries, constrained reads and writes. |
| CI/dependencies ↔ build and deployment | Source, lockfiles, packages, actions, artifacts | Pin versions, scan dependencies and secrets, protect the default branch. |

## Assets

| Asset | Why it matters |
| --- | --- |
| Verifier private key | Authorizes attestations and potential credit minting on the testnet contract. |
| API quota | Free-tier capacity must remain available for legitimate demo traffic. |
| Testnet gas balance | Spam can exhaust funds needed to demonstrate transactions. |
| Evidence integrity | Public evidence must accurately correspond to a specific verification result. |
| Registry integrity | Registered region cells must resist overlapping or duplicate claims under the defined model. |
| Availability | The demo should remain usable despite provider failures and cold starts. |
| Database records | Public project state must remain consistent with evidence and on-chain references. |
| Dependency and CI integrity | Compromised build inputs could alter the application or expose secrets. |

## Actors

| Actor | Motivation and capability |
| --- | --- |
| Anonymous user | Uses the public submission flow without prior trust. |
| Bot or abuser | Automates requests to exhaust quotas, gas, or processing capacity. |
| Malicious project owner | Attempts duplicate claims, manipulated inputs, or misleading evidence. |
| Compromised dependency | Introduces malicious behavior into build, CI, or runtime through the software supply chain. |
| Curious judge | Inspects public data, evidence, transactions, and the codebase without malicious intent. |
| External provider | May be unavailable, misconfigured, compromised, or return incorrect data. |
| Project administrator | Holds privileged access and can make mistakes or lose credentials. |

## Threat register

Status is **planned** unless implementation evidence is available in the owning chunk.

| STRIDE | Threat description | Likelihood | Impact | Mitigation | Owning chunk | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Spoofing | An attacker submits requests from scripted or synthetic clients to masquerade as many users. | High | Medium | Turnstile validation, per-IP and per-identifier rate limits, daily caps, and server-side enforcement. | 5 | Planned |
| Spoofing | A stolen verifier key signs unauthorized attestations. | Medium | High | Store key only in server secrets, use a dedicated low-balance testnet account, limit role authority, rotate/revoke roles, and monitor transactions. | 3 | Planned |
| Spoofing | A malicious RPC endpoint impersonates the configured testnet or returns misleading chain state. | Low | High | Validate configured chain ID and contract code, use approved RPC endpoints, and fail closed on mismatch. | 3 | Planned |
| Tampering | A claimant shifts, rotates, or slightly reshapes a polygon to evade duplicate-region detection. | High | High | Normalize geometry, derive deterministic covering cells with conservative overlap rules, and reject intersecting registered cells. | 3 | Planned |
| Tampering | Malformed, self-intersecting, out-of-range, or non-polygon GeoJSON alters processing behavior. | High | High | Strict schema, coordinate/ring/count/area bounds, geometry validity checks, reprojection safeguards, and rejection of unsupported types. | 4 | Planned |
| Tampering | A replayed or modified verifier attestation mints credits again. | Medium | High | Bind signed data to chain ID, contract, project ID, region commitment, score, nonce, expiry, and consumed-attestation state. | 3 | Planned |
| Tampering | Evidence is changed or mis-associated after verification. | Medium | High | Canonicalize evidence, hash it before storage/pinning, bind its hash to project and attestation records, and verify content identifiers before display. | 6 | Planned |
| Tampering | An attacker alters client-side configuration to target another API or contract. | Medium | Medium | Treat browser configuration as untrusted; validate all authoritative values server-side and render a fixed testnet notice. | 8 | Planned |
| Repudiation | A project owner disputes a submitted polygon, score, or registration. | Medium | Medium | Persist timestamped canonical request digest, data source, evidence hash, verification version, and testnet transaction hash. | 6 | Planned |
| Repudiation | An administrator cannot explain why a credit was minted or rejected. | Medium | High | Create audit events for verification and mint decisions without logging secrets or raw sensitive data. | 6 | Planned |
| Information disclosure | Private keys, provider tokens, or database URLs are committed or exposed in client bundles. | Medium | High | Empty `.env.example`, secret scanning and push protection, server-only environment validation, and only non-secret `NEXT_PUBLIC_*` values. | 1 | Implemented |
| Information disclosure | Verbose errors reveal stack traces, database details, provider responses, or internal topology. | Medium | Medium | Central exception handling, generic client error shape, redacted structured server logs, and no debug mode in deployment. | 5 | Planned |
| Information disclosure | Project names or polygons contain personal or sensitive data that becomes public through IPFS. | Medium | High | Warn users before submission, minimize stored data, validate names, prohibit sensitive submissions, and require review before pinning. | 6 | Planned |
| Information disclosure | Overly broad CORS permits a hostile origin to use or read API responses in a victim browser. | Medium | Medium | Explicit origin allow-list, no wildcard with credentials, preflight restrictions, and environment validation. | 5 | Planned |
| Denial of service | High-complexity polygons consume excessive CPU, memory, satellite queries, or geometry operations. | High | High | Enforce byte, coordinate, ring, feature, area, and processing-time limits before expensive work; use request timeouts and quotas. | 4 | Planned |
| Denial of service | Spam verification attempts exhaust API quota or testnet gas. | High | High | Rate limits, Turnstile, daily registration caps, idempotency keys, queued processing, and a per-period gas budget. | 5 | Planned |
| Denial of service | Satellite, IPFS, LLM, RPC, or database free tiers cold-start or become unavailable. | High | Medium | Short timeouts, bounded retries, circuit breakers, cached evidence/data fallback, and useful degraded-status responses. | 4 | Planned |
| Denial of service | Large responses or unbounded pagination overload the API or browser. | Medium | Medium | Bound page limits, response fields, evidence sizes, query ranges, and payload sizes. | 5 | Planned |
| Elevation of privilege | An API user accesses admin or verifier functions. | Medium | High | Separate public and privileged routes, server-side authorization, least-privilege database roles, and no browser-held signing authority. | 5 | Planned |
| Elevation of privilege | A contract role grants minting or pausing authority to an unauthorized account. | Medium | High | OpenZeppelin role controls, explicit role-admin design, constructor validation, event logging, and role tests. | 3 | Planned |
| Elevation of privilege | SQL injection changes database queries or records. | Medium | High | SQLAlchemy parameterized queries, typed models, no dynamic SQL from user input, and least-privilege database credentials. | 6 | Planned |
| Elevation of privilege | Server-side request forgery reaches internal services through a user-supplied URL. | Medium | High | Never fetch user-supplied URLs; construct provider requests from validated identifiers and fixed hosts only. | 4 | Planned |
| Tampering | Prompt injection in the project name manipulates an optional LLM explanation. | High | Low | Sanitize and length-limit the name, send structured numeric data only, isolate system instructions, cap output, and never use output for decisions. | 7 | Planned |
| Tampering | Stored names, flags, or LLM explanations execute script in the public dashboard. | Medium | High | Escape text by default, prohibit `dangerouslySetInnerHTML`, validate stored fields, use a strict CSP, and test rendered untrusted content. | 8 | Planned |
| Tampering | A compromised package, GitHub Action, or build artifact modifies code or steals secrets. | Medium | High | Lockfiles, dependency review, CodeQL, secret scanning, pinned trusted actions, minimal workflow permissions, protected branches, and audit updates. | 1 | Implemented |
| Tampering | Invalid or harmful data is pinned to IPFS and cannot be removed from public availability. | Medium | High | Validate and review data before pinning, pin only necessary structured evidence, never pin secrets or personal data, and document immutability. | 6 | Planned |
| Tampering | Cloud cover, seasonal change, or spoofed/incorrect satellite metadata produces a misleading score. | Medium | High | Check acquisition metadata and quality flags, apply cloud filtering, report confidence flags and source dates, compare time series, and require human review. | 4 | Planned |
| Repudiation | A compromised or negligent verifier produces incorrect scores or attestations because it is centralized. | Medium | High | Publish methodology and evidence, separate duties where possible, log decisions, constrain role power, and label this as a trusted-attestor limitation. | 7 | Planned |
| Denial of service | Loss of the admin key prevents role recovery, pausing, or contract administration. | Low | High | Document secure backup and rotation procedures, use a separate admin account, and design future governance for multi-signature control. | 3 | Planned |
| Denial of service | RPC outage prevents transaction submission or confirmation. | Medium | Medium | Bound retries, detect chain/network mismatch, display pending/degraded state, and reconcile later from chain events. | 6 | Planned |
| Information disclosure | A curious judge or third party correlates public polygon and transaction data with a real-world project owner. | Medium | Medium | Avoid accounts and personal fields, clearly disclose public visibility, and minimize public metadata. | 8 | Planned |

## Known limitations and future work

CarbonLens uses a centralized verifier as a trusted attestor. Its server decides the score and submits the on-chain attestation, so the contract cannot independently prove that satellite analysis was correct. The system is a testnet demonstration, not a regulated carbon registry, and its vegetation-health score is not a carbon-credit valuation or field audit.

Satellite-derived NDVI is constrained by resolution, cloud cover, seasonality, data availability, classification error, and biome differences. IPFS content is public and immutable once pinned; prevention before publication is more realistic than removal afterward. Free-tier service limits can also reduce availability despite caching and graceful fallback.

Future work includes multi-signature administration, key-management hardware or managed signing, independent and decentralized verifier sets, reproducible evidence pipelines, stronger geospatial overlap models, oracle networks or zero-knowledge proofs for attestations, third-party security review, monitoring and incident response, and formal governance before any production or mainnet consideration.
