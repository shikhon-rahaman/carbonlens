# Contract Security Review Notes

## Scope

`contracts/contracts/CarbonRegistry.sol` is a testnet-only registry and ERC-1155 credit demonstrator. This note records automated-analysis status and design decisions; it is not an audit or a production-security guarantee.

## Automated checks

- Solidity compilation: `npm test` compiled the contracts successfully with the Hardhat-configured Solidity 0.8.24 compiler and passed all 17 tests.
- Solhint: `npm run lint` completed without findings. The configuration targets Solidity `^0.8.24` and the Solhint recommended rules.
- Coverage: `npm run coverage` passed all 17 tests. Overall coverage is 100% statements, 96.30% branches, 100% functions, and 98.21% lines. `CarbonRegistry.sol` specifically is 100% statements, 98.08% branches, 100% functions, and 100% lines.
- Randomized testing: seeded pseudo-random valid registrations and overlapping-registration attempts run deterministically with fixed seeds, so failures are reproducible.
- Slither: not installed or available on PATH in the Windows environment; therefore no Slither result is claimed. Install and run it using the Windows commands below, then add each emitted finding and its resolution to this document.

## Findings and resolutions

| Source | Severity | Finding | Resolution or rationale |
| --- | --- | --- | --- |
| Manual design review | High | ERC-1155 receiver callbacks can re-enter during `_mint`. | `registerProject` uses `nonReentrant`, and all project/cell state is committed before `_mint`. A malicious receiver regression test verifies the nested registration fails. |
| Manual design review | High | Duplicate land claims can use shifted or partially overlapping cell sets. | Every supplied deterministic cell is checked before registration; occupied cells revert with `DuplicateRegion`, and duplicate cells in one request revert with `DuplicateCell`. Geospatial cell generation remains a verifier responsibility. |
| Manual design review | Medium | An unrestricted default admin is a concentrated privilege. | `AccessControlDefaultAdminRules` enforces delayed two-step default-admin transfer. Future work should use multisignature administration. |
| Manual design review | Medium | Large arrays and metadata can cause gas or processing denial of service. | Name, URI, credit amount, and cell count are bounded; empty values and zero owner/evidence hash are rejected. |
| Manual design review | Informational | ERC-1155 credits are transferable. | This is an intentional demo choice, documented in the contract. Transferability does not assert market, regulatory, or credit validity. |
| Threat-model review | High | The centralized verifier can submit a fresh registration for a different region without an on-chain signed attestation, nonce, or expiry binding the evidence to a chain and contract. | This contract deliberately trusts accounts with `VERIFIER_ROLE`, as required by the testnet demo interface. Protect and monitor that role; signed, replay-protected attestations and independent verification remain production requirements and are not claimed as implemented. |
| Threat-model review | High | Cell-overlap protection only detects equal `bytes32` cell identifiers and cannot determine whether the submitted cell set accurately or conservatively covers a polygon. | Polygon normalization and deterministic, conservative cell derivation are verifier/API responsibilities. The contract prevents exact cell reuse, not geometric overlap when clients derive inconsistent cells. |

## Windows Slither setup and run

```powershell
py -m pip install --user pipx
py -m pipx ensurepath
# Open a new PowerShell window so the updated PATH is loaded.
pipx install slither-analyzer
Set-Location C:\Users\SHIKHON\Desktop\carbonlens\contracts
slither . --filter-paths "node_modules|test"
```

Review and document each Slither finding before deployment. Do not suppress a finding without recording its severity and rationale here.
