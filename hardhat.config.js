require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

const { SEPOLIA_RPC_URL, POLYGON_RPC_URL, PRIVATE_KEY, ETHERSCAN_API_KEY, POLYGONSCAN_API_KEY } =
  process.env;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    // Use a compiler + EVM compatible with OpenZeppelin ^0.8.24 (mcopy built-in)
    version: "0.8.26",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {},
    localhost: {
      url: "http://127.0.0.1:8545"
    },
    sepolia: {
      url: SEPOLIA_RPC_URL || "",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : []
    },
    polygon: {
      // Polygon Amoy or Mumbai RPC URL
      url: POLYGON_RPC_URL || "",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : []
    }
  },
  etherscan: {
    apiKey: {
      sepolia: ETHERSCAN_API_KEY || "",
      polygon: POLYGONSCAN_API_KEY || ""
    }
  }
};

