const fs = require("node:fs");
const path = require("node:path");
const hre = require("hardhat");

const MAINNET_CHAIN_IDS = new Set([1n, 137n, 56n, 10n, 42161n, 8453n, 43114n]);
const SCORE_THRESHOLD = 70;
const TOKEN_URI = "";
const secretsForRedaction = new Set();

function requiredEnvironmentVariable(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set in the process environment.`);
  }
  if (name.includes("PRIVATE_KEY") || name === "RPC_URL" || name === "EXPLORER_API_KEY") {
    secretsForRedaction.add(value);
  }
  return value;
}

function redactedErrorMessage(error) {
  let message = error instanceof Error ? error.message : "Unknown error";
  for (const secret of secretsForRedaction) {
    message = message.split(secret).join("[REDACTED]");
  }
  return message;
}

async function main() {
  if (process.env.RPC_URL) {
    secretsForRedaction.add(process.env.RPC_URL);
  }
  const rpcChainId = BigInt(requiredEnvironmentVariable("CHAIN_ID"));
  if (MAINNET_CHAIN_IDS.has(rpcChainId)) {
    throw new Error(`Refusing deployment to known mainnet chain ID ${rpcChainId}.`);
  }
  if (hre.network.name !== "carbonlensTestnet") {
    throw new Error("Select the configured carbonlensTestnet network.");
  }

  const providerChainId = (await hre.ethers.provider.getNetwork()).chainId;
  if (providerChainId !== rpcChainId) {
    throw new Error(
      `RPC chain ID mismatch: configured ${rpcChainId}, provider reported ${providerChainId}.`
    );
  }
  if (MAINNET_CHAIN_IDS.has(providerChainId)) {
    throw new Error(`Refusing deployment to known mainnet chain ID ${providerChainId}.`);
  }

  const deployerPrivateKey = requiredEnvironmentVariable("DEPLOYER_PRIVATE_KEY");
  const verifierPrivateKey = requiredEnvironmentVariable("VERIFIER_PRIVATE_KEY");
  const deployer = new hre.ethers.Wallet(deployerPrivateKey, hre.ethers.provider);
  const verifierAddress = new hre.ethers.Wallet(verifierPrivateKey).address;

  if (deployer.address.toLowerCase() === verifierAddress.toLowerCase()) {
    throw new Error("Deployer and verifier must use separate burner wallets.");
  }

  // Do not retain either private key in the child process environment after deriving signers.
  delete process.env.DEPLOYER_PRIVATE_KEY;
  delete process.env.VERIFIER_PRIVATE_KEY;

  const factory = await hre.ethers.getContractFactory("CarbonRegistry", deployer);
  const registry = await factory.deploy(deployer.address, SCORE_THRESHOLD, TOKEN_URI);
  await registry.waitForDeployment();

  const verifierRole = await registry.VERIFIER_ROLE();
  const pauserRole = await registry.PAUSER_ROLE();

  const grantVerifierTx = await registry.grantRole(verifierRole, verifierAddress);
  await grantVerifierTx.wait();

  if (await registry.hasRole(verifierRole, deployer.address)) {
    const revokeDeployerVerifierTx = await registry.revokeRole(verifierRole, deployer.address);
    await revokeDeployerVerifierTx.wait();
  }
  if (!(await registry.hasRole(pauserRole, deployer.address))) {
    const grantPauserTx = await registry.grantRole(pauserRole, deployer.address);
    await grantPauserTx.wait();
  }
  if (!(await registry.hasRole(verifierRole, verifierAddress))) {
    throw new Error("Verifier role grant was not confirmed on chain.");
  }
  if (await registry.hasRole(verifierRole, deployer.address)) {
    throw new Error("Deployer still has VERIFIER_ROLE after role setup.");
  }
  if (!(await registry.hasRole(pauserRole, deployer.address))) {
    throw new Error("Deployer PAUSER_ROLE grant was not confirmed on chain.");
  }

  const artifact = await hre.artifacts.readArtifact("CarbonRegistry");
  const contractAddress = await registry.getAddress();
  const rootDirectory = path.resolve(__dirname, "..", "..");
  const sharedDirectory = path.join(rootDirectory, "shared");
  const contractMetadataPath = path.join(sharedDirectory, "contract.json");
  const metadata = {
    address: contractAddress,
    abi: artifact.abi,
    chainId: Number(providerChainId),
    deployedAt: new Date().toISOString()
  };

  fs.mkdirSync(sharedDirectory, { recursive: true });
  fs.writeFileSync(contractMetadataPath, `${JSON.stringify(metadata, null, 2)}\n`, {
    encoding: "utf8",
    flag: "w"
  });

  console.log(`CarbonRegistry deployed: ${contractAddress}`);
  console.log(`Deployer/admin/pauser address: ${deployer.address}`);
  console.log(`Verifier address granted VERIFIER_ROLE: ${verifierAddress}`);
  console.log(`Chain ID: ${providerChainId}`);
  console.log(`Deployment metadata written to: ${contractMetadataPath}`);
}

main().catch((error) => {
  console.error(`Deployment failed: ${redactedErrorMessage(error)}`);
  process.exitCode = 1;
});
