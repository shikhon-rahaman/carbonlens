const fs = require("node:fs");
const path = require("node:path");
const hre = require("hardhat");

async function main() {
  if (hre.network.name !== "localhost") {
    throw new Error("Local demo deployment requires the localhost network.");
  }

  const network = await hre.ethers.provider.getNetwork();
  if (network.chainId !== 31337n) {
    throw new Error("Local demo deployment requires chain ID 31337.");
  }

  const [admin] = await hre.ethers.getSigners();
  if (!admin) {
    throw new Error("The local development node has no unlocked admin account.");
  }

  const factory = await hre.ethers.getContractFactory("CarbonRegistry", admin);
  const registry = await factory.deploy(admin.address, 70, "");
  await registry.waitForDeployment();

  const artifact = await hre.artifacts.readArtifact("CarbonRegistry");
  const rootDirectory = path.resolve(__dirname, "..", "..");
  const sharedDirectory = path.join(rootDirectory, "shared");
  const contractMetadataPath = path.join(sharedDirectory, "contract.json");
  fs.mkdirSync(sharedDirectory, { recursive: true });
  fs.writeFileSync(
    contractMetadataPath,
    `${JSON.stringify({
      address: await registry.getAddress(),
      abi: artifact.abi,
      chainId: Number(network.chainId),
      deployedAt: new Date().toISOString()
    }, null, 2)}\n`,
    "utf8"
  );

  console.log(`Local CarbonRegistry deployed: ${await registry.getAddress()}`);
  console.log(`Local verifier/admin account: ${admin.address}`);
}

main().catch((error) => {
  console.error(`Local deployment failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  process.exitCode = 1;
});
