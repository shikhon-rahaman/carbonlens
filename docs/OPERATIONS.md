# Testnet deployment and operations

CarbonLens contracts are for testnet demonstrations only. The Hardhat config and deployment script refuse the listed known mainnet chain IDs and also check the chain ID reported by the RPC before deploying.

## Environment values

Set these in the current PowerShell process before deployment:

| Variable | Purpose |
| --- | --- |
| `RPC_URL` | RPC endpoint for the selected testnet. Treat provider URLs containing API tokens as secrets. |
| `CHAIN_ID` | Numeric testnet chain ID. Sepolia (`11155111`) is the documented default. |
| `DEPLOYER_PRIVATE_KEY` | Dedicated, low-balance burner account used once to deploy and configure roles. |
| `VERIFIER_PRIVATE_KEY` | Separate burner account key used by deployment only to derive its address; the API host must retain this key for verifier transactions. |
| `EXPLORER_API_KEY` | Etherscan API V2 key required by verification for supported Etherscan-compatible testnet explorers. |
| `DEPLOYER_ADDRESS` | Public deployer/admin address printed by the deployment script; set this before verification. |

Do not put values in source files, command arguments, logs, or committed `.env` files. The root `.env.example` contains empty placeholders for the environment-backed secrets. Prompt for sensitive values without echoing them:

```powershell
function Set-SecretEnvironmentVariable([string]$Name) {
    $secureValue = Read-Host $Name -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
    try {
        [Environment]::SetEnvironmentVariable(
            $Name,
            [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer),
            "Process"
        )
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        $secureValue.Dispose()
    }
}

Set-SecretEnvironmentVariable "RPC_URL"
$env:CHAIN_ID = "11155111"
Set-SecretEnvironmentVariable "DEPLOYER_PRIVATE_KEY"
Set-SecretEnvironmentVariable "VERIFIER_PRIVATE_KEY"
Set-SecretEnvironmentVariable "EXPLORER_API_KEY"
```

`VERIFIER_PRIVATE_KEY` is needed in the deploy process only to derive the verifier address. It is not printed, written to disk, or retained in the child process environment after derivation. Keep its persistent copy only in the API host's secret environment; remove the temporary local process variable immediately after deployment.

## Compile, deploy, and verify (PowerShell)

Run from the repository root after setting the variables above:

```powershell
Set-Location C:\Users\SHIKHON\Desktop\carbonlens\contracts
npm ci
npm run compile
npm run deploy:testnet
```

The deploy script writes `shared/contract.json` with exactly `address`, `abi`, `chainId`, and `deployedAt`. It grants `VERIFIER_ROLE` to the verifier address, removes the deployer's verifier role, and ensures the deployer retains `PAUSER_ROLE` and default-admin authority.

Remove deploy-only secrets from the local PowerShell process after deploying:

```powershell
Remove-Item Env:DEPLOYER_PRIVATE_KEY
Remove-Item Env:VERIFIER_PRIVATE_KEY
```

Set the public deployer/admin address printed by the deployment script, then verify:

```powershell
$env:DEPLOYER_ADDRESS = Read-Host "Public deployer/admin address"
Set-Location C:\Users\SHIKHON\Desktop\carbonlens\contracts
npm run verify:testnet
```

The verify script checks that the RPC chain matches the metadata and verifies the constructor values used at deployment. The Explorer API key is never written to deployment metadata.

## Run the API (PowerShell)

From the repository root, install the pinned API/verifier dependencies and start the
FastAPI service:

```powershell
Set-Location C:\Users\SHIKHON\Desktop\carbonlens
.\ai-verifier\.venv\Scripts\python.exe -m pip install -r api\requirements.txt
$env:ENV = "development"
$env:ALLOWED_ORIGINS = "http://localhost:3000"
$env:DATABASE_URL = "sqlite:///./carbonlens.db"
$env:PORT = "8000"
.\ai-verifier\.venv\Scripts\python.exe -m uvicorn main:app --app-dir api --host 127.0.0.1 --port $env:PORT
```

For the optional Render hosted service, use the start command in the
[optional hosted deployment guide](./DEPLOYMENT.md).

For a local run without Turnstile credentials, set `TURNSTILE_DEV_BYPASS=true` only
while `ENV=development`. Never enable the bypass in another environment. The API
otherwise requires a valid server-side Turnstile response. Before production use,
configure the testnet `RPC_URL`, `CHAIN_ID`, `CONTRACT_ADDRESS`,
`VERIFIER_PRIVATE_KEY`, `TURNSTILE_SECRET`, and a non-wildcard `ALLOWED_ORIGINS`.
The API verifies the configured address and chain against deployment metadata in
`shared/contract.json`; deploy the registry before enabling on-chain registration.
SQLite is the local default; set production `DATABASE_URL` to a
`postgresql://` SQLAlchemy URL for Render Postgres. The API selects its installed
Psycopg 3 driver and creates tables on first startup. Pinata failures use the
local ignored `api/data/evidence/` store.

Run the verifier and API tests, lint, security scan, and dependency audit from the
repository root:

```powershell
Set-Location C:\Users\SHIKHON\Desktop\carbonlens\ai-verifier
.\.venv\Scripts\python.exe -m pytest -q tests ..\api\tests
Set-Location C:\Users\SHIKHON\Desktop\carbonlens
.\ai-verifier\.venv\Scripts\ruff.exe check ai-verifier api
.\ai-verifier\.venv\Scripts\bandit.exe -r api -x api\tests
.\ai-verifier\.venv\Scripts\python.exe -m pip_audit -r api\requirements.txt
.\ai-verifier\.venv\Scripts\python.exe -m pip_audit -r ai-verifier\requirements.txt
```

## Key management

- Use two separate burner wallets on the testnet: one deployer/admin/pauser and one API verifier. Do not reuse personal wallets or any mainnet keys.
- Use the deployer key locally for deployment and remove it from the process environment afterward. Keep an encrypted offline backup of the deployer/admin key for emergency administration; load it into the process only for a specific privileged operation, then remove it again. Keep the API verifier key only in the API host's environment for normal operation.
- Fund the deployer with only the testnet faucet tokens needed for deployment and role transactions. Never send real funds.
- Fund the verifier with a minimal testnet gas balance sufficient for expected registration transactions. Monitor it and top up only from a testnet faucet as needed.
- Use the faucet linked by the chosen testnet's official documentation. Confirm the faucet domain and selected chain before connecting a wallet; do not pay for faucet access.

## Verifier key rotation

From a trusted admin wallet, revoke the compromised or retired verifier and grant the replacement. Update the API host's `VERIFIER_PRIVATE_KEY` secret to the replacement key only after both role transactions succeed, then restart/reload the API service and check a test registration on testnet. Securely load the backed-up deployer key only for this operation:

```powershell
Set-SecretEnvironmentVariable "DEPLOYER_PRIVATE_KEY"
npx hardhat console --network carbonlensTestnet
```

At the Hardhat console, run the following with the deployed address and verifier public addresses:

```javascript
const metadata = require("../shared/contract.json");
const [admin] = await ethers.getSigners();
const registry = await ethers.getContractAt("CarbonRegistry", metadata.address, admin);
const verifierRole = await registry.VERIFIER_ROLE();
await (await registry.revokeRole(verifierRole, "0xOLD_VERIFIER_ADDRESS")).wait();
await (await registry.grantRole(verifierRole, "0xNEW_VERIFIER_ADDRESS")).wait();
```

Confirm the `RoleRevoked` and `RoleGranted` events and that the old address no longer has the role. Keep the old key revoked and remove it from every environment where it was temporarily present. Do not use or log private keys in console history. Exit the console and remove the temporary `DEPLOYER_PRIVATE_KEY` environment variable.

## Incident pause

The deployer retains `PAUSER_ROLE`. Securely load the backed-up deployer key with `Set-SecretEnvironmentVariable "DEPLOYER_PRIVATE_KEY"`, then open `npx hardhat console --network carbonlensTestnet`. At the console, use `const metadata = require("../shared/contract.json"); const [admin] = await ethers.getSigners(); const registry = await ethers.getContractAt("CarbonRegistry", metadata.address, admin); await (await registry.pause()).wait();`. Registration stops while paused. Investigate and rotate/revoke compromised verifier access before calling `await (await registry.unpause()).wait();`. Exit the console and remove the temporary key environment variable. Record the incident, transaction hashes, affected addresses, and remediation without recording secrets.

## Testnet safety

The deployment config refuses chain IDs `1`, `137`, `56`, `10`, `42161`, `8453`, and `43114`, and deployment checks both the configured and RPC-reported chain IDs. Use a testnet RPC and verify the chain ID before entering keys. This guard is defense in depth, not a substitute for verifying the target network and wallet before signing.
