const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

  // TODO: replace with real IPFS URIs for your donor tier NFTs
  const bronzeURI = "ipfs://QmBronzeExampleHash";
  const silverURI = "ipfs://QmSilverExampleHash";
  const goldURI = "ipfs://QmGoldExampleHash";

  const CrowdfundingPlatform = await hre.ethers.getContractFactory("CrowdfundingPlatform");
  const platform = await CrowdfundingPlatform.deploy(bronzeURI, silverURI, goldURI);

  await platform.waitForDeployment();

  const address = await platform.getAddress();
  console.log("CrowdfundingPlatform deployed to:", address);

  // Persist address for frontend
  const outDir = path.join(__dirname, "..", "frontend-artifacts");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }

  fs.writeFileSync(
    path.join(outDir, "CrowdfundingPlatform-address.json"),
    JSON.stringify({ address }, null, 2)
  );

  console.log("Saved deployed address to frontend-artifacts/CrowdfundingPlatform-address.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

