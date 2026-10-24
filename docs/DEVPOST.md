# CarbonLens — IEEE ClimateChain Global Hackathon 2026

**Track:** Carbon Markets & Emissions Transparency

## Inspiration

Carbon-market claims depend on evidence that can be difficult for outsiders to
inspect or compare. We wanted to explore how satellite-derived vegetation
indicators and a public registry could make one part of that evidence trail
more reviewable—without suggesting that NDVI alone establishes carbon storage.

## What it does

CarbonLens accepts a project polygon and claimed area, evaluates an NDVI
time-series with vegetation, stability, and area-consistency components, and
records eligible attestations on a Sepolia ERC-1155 testnet registry. It
surfaces evidence identifiers, data-source labels, flags, and transaction
links.

The included scenarios are deliberately explicit: a healthy cached sample is
verified, a deforested cached sample is rejected after a sharp NDVI decline,
and an overlapping sample is marked duplicate without a second registration.
These are demonstrations of the workflow, not independent environmental
verification.

## How we built it

The web experience uses Next.js, React, and TypeScript. A FastAPI service
validates bounded GeoJSON requests, checks Turnstile, retrieves Sentinel-2
observations through Microsoft Planetary Computer when available, scores the
time-series, and stores public project results. SQLite supports local work;
Postgres is available for hosting. Solidity contracts use an ERC-1155 registry
on Sepolia.

Live imagery retrieval and reviewed packaged cached NDVI samples are both
supported. Demo scenarios use cached data and are labeled “Cached satellite
data”; live requests can use a cached fallback if the provider is unavailable.

## Challenges

- Communicating the difference between a vegetation-health score and a carbon
  measurement.
- Handling live satellite retrieval failures while keeping the demo
  reproducible and clearly labeling cached data.
- Checking overlapping geographic claims across off-chain geometry and
  on-chain geohash-cell representations.
- Preparing optional free-tier hosting instructions while protecting verifier
  credentials and retaining Turnstile and rate controls.

## Accomplishments

- Connected polygon submission, time-series scoring, evidence output, and
  testnet registration in one reviewable flow.
- Added explicit healthy, deforested, and overlap scenarios with distinct
  verified, rejected, and duplicate outcomes.
- Published the registry transaction that minted 38 ERC-1155 testnet credits
  for a 40 ha healthy sample at score 95.
- Added API, browser, accessibility, contract, and security checks plus public
  threat-model and responsible-AI documentation.

## What we learned

Satellite vegetation indicators are useful context but do not measure carbon
storage, permanence, ownership, or additionality. A score needs provenance,
uncertainty, and human review. We also learned that on-chain transparency does
not remove the need to trust the verifier, and geometry-based duplicate
controls have thresholds and evasion limits.

## What's next

- Multi-signature verifier administration.
- Decentralized oracles and more independent data sources.
- Additional biomes and region-aware evaluation.
- Zero-knowledge proofs for selective evidence and attestation checks.
- Further dependency remediation and independent security review.

## Built with

Next.js, React, TypeScript, Tailwind CSS, FastAPI, Pydantic, SQLAlchemy,
PostgreSQL, SQLite, Python, Shapely, Rasterio, PyProj, Sentinel-2 STAC,
Microsoft Planetary Computer, Solidity, OpenZeppelin ERC-1155, Hardhat,
Sepolia, Cloudflare Turnstile, Playwright, Ruff, Bandit, pip-audit, npm audit,
Slither, Solhint, and Gitleaks. Vercel and Render are optional hosting platforms
documented for future use; the submission was not deployed there.

## Track alignment

CarbonLens is aligned with Carbon Markets & Emissions Transparency through
inspectable vegetation evidence, explicit scoring components, source labels,
duplicate outcomes, and public testnet attestations. It is a testnet demo and
does not certify carbon credits or prove carbon storage.

## Judging-criteria mapping

| Criterion | Demonstration |
| --- | --- |
| Climate Impact | A transparent vegetation-evidence workflow with limitations on what NDVI can say about carbon. |
| Innovation & Creativity | Geospatial overlap checks and environmental scoring connected to a public ERC-1155 testnet registry. |
| Technical Execution | Full-stack web/API/verifier/contract integration, live retrieval path with cached fallback, validation, persistence, and CI tests. |
| Practical Usefulness | Score components, flags, evidence identifiers, data-source labels, and verified/rejected/duplicate outcomes. |
| Presentation & Communication | Readable project documentation, security and responsible-AI boundaries, and an explicit live/demo distinction. |

## Links

- Repository: https://github.com/shikhon-rahaman/carbonlens
- Sepolia contract: https://sepolia.etherscan.io/address/0x92ba65bF082Ed142A32037ad8cBb21a82E2776A8
- Example Sepolia registrations (each mints 38 testnet ERC-1155 credits for a
  40 ha sample):
  - Original: https://sepolia.etherscan.io/tx/0x9634b36e29dac9e3a71ec882179bba055c6533f65e268854865a3c42b6135b1e
  - Additional: https://sepolia.etherscan.io/tx/0xf96b759e2f805769425562cd20e0b1dc79c565c9c63433c66669c3c127208e41
- Demo: watch the video linked on our Devpost submission, or run it locally (instructions below).
