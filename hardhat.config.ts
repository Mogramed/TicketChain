import fs from "node:fs";
import path from "node:path";

import { defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";

function loadDotEnv(filePath = ".env"): void {
  const absolutePath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absolutePath)) {
    return;
  }

  const contents = fs.readFileSync(absolutePath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

const amoyRpcUrl =
  process.env.AMOY_RPC_URL ?? "https://rpc-amoy.polygon.technology";
const privateKeyRaw = (process.env.PRIVATE_KEY ?? "").trim();
const privateKey = /^0x[0-9a-fA-F]{64}$/.test(privateKeyRaw)
  ? privateKeyRaw
  : "";

if (privateKeyRaw && !privateKey) {
  console.warn(
    "Ignoring invalid PRIVATE_KEY format in .env. Expected 0x + 64 hex characters.",
  );
}

const config = defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  solidity: "0.8.28",
  networks: {
    amoy: {
      type: "http",
      chainType: "l1",
      url: amoyRpcUrl,
      chainId: 80002,
      accounts: privateKey ? [privateKey] : [],
    },
  },
});

export default config;
