require("@nomicfoundation/hardhat-toolbox");
require("solidity-coverage");

const MAINNET_CHAIN_IDS = new Set([1, 137, 56, 10, 42161, 8453, 43114]);
const rpcUrl = process.env.RPC_URL;
const chainIdValue = process.env.CHAIN_ID;
const networks = {};

if (chainIdValue) {
  if (!/^\d+$/.test(chainIdValue)) {
    throw new Error("CHAIN_ID must be a positive integer.");
  }

  const chainId = Number(chainIdValue);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error("CHAIN_ID must be a positive safe integer.");
  }
  if (MAINNET_CHAIN_IDS.has(chainId)) {
    throw new Error(`Refusing to configure a known mainnet (CHAIN_ID=${chainId}).`);
  }
  if (!rpcUrl) {
    throw new Error("RPC_URL is required when CHAIN_ID is set.");
  }

  networks.carbonlensTestnet = {
    url: rpcUrl,
    chainId,
    accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : []
  };
} else if (rpcUrl) {
  throw new Error("CHAIN_ID is required when RPC_URL is set.");
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true
    }
  },
  networks: {
    ...networks,
    localhost: {
      url: process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545",
      chainId: 31337
    }
  },
  etherscan: {
    apiKey: process.env.EXPLORER_API_KEY || ""
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  mocha: { timeout: 30000 }
};
