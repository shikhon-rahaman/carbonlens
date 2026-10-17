const fs = require("node:fs");
const path = require("node:path");
const hre = require("hardhat");

function redactedErrorMessage(error) {
  let message = error instanceof Error ? error.message : "Unknown error";
  for (const name of ["RPC_URL", "EXPLORER_API_KEY"]) {
    const secret = process.env[name];
    if (secret) {
      message = message.split(secret).join("[REDACTED]");
    }
  }
  return message;
}

async function main() {
  if (!process.env.EXPLORER_API_KEY) {
    throw new Error("EXPLORER_API_KEY must be set before verification.");
  }
  if (hre.network.name !== "carbonlensTestnet") {
    throw new Error("Select the configured carbonlensTestnet network.");
  }

  const rootDirectory = path.resolve(__dirname, "..", "..");
  const contractMetadataPath = path.join(rootDirectory, "shared", "contract.json");
  if (!fs.existsSync(contractMetadataPath)) {
    throw new Error("shared/contract.json is missing; deploy the contract first.");
  }

  const metadata = JSON.parse(fs.readFileSync(contractMetadataPath, "utf8"));
  const chainId = Number((await hre.ethers.provider.getNetwork()).chainId);
  if (metadata.chainId !== chainId) {
    throw new Error(
      `Deployment metadata chain ID ${metadata.chainId} does not match RPC chain ID ${chainId}.`
    );
  }

  const deployerAddress = process.env.DEPLOYER_ADDRESS;
  if (!hre.ethers.isAddress(deployerAddress || "")) {
    throw new Error("DEPLOYER_ADDRESS must be set to the public deployer/admin address.");
  }

  await hre.run("verify:verify", {
    address: metadata.address,
    constructorArguments: [deployerAddress, 70, ""]
  });
}

main().catch((error) => {
  console.error(`Verification failed: ${redactedErrorMessage(error)}`);
  process.exitCode = 1;
});
