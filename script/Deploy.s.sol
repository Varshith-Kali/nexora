// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {NexoraRegistry} from "../contracts/NexoraRegistry.sol";
import {NexoraEscrow} from "../contracts/NexoraEscrow.sol";

/// @title Nexora deployment script
/// @notice Deploys NexoraRegistry then NexoraEscrow and persists the addresses
///         to `config/deployment.json`, which the verifier service, the bot
///         simulators and the frontend dashboard all read automatically.
///
/// @dev  Local anvil demo chain:
///  forge script script/Deploy.s.sol --rpc-url http://localhost:8545 \
///       --private-key $PRIVATE_KEY --broadcast -vv
///
/// @dev  Monad Testnet:
///  forge script script/Deploy.s.sol \
///       --rpc-url https://testnet-rpc.monad.xyz \
///       --private-key $PRIVATE_KEY \
///       --verifier-address $VERIFIER_ADDRESS \
///       --broadcast -vv
///
/// Env vars:
///   PRIVATE_KEY      (required) funded deployer key
///   VERIFIER_ADDRESS (optional) wallet of the AI verifier service;
///                    defaults to the deployer itself
contract Deploy is Script {
    function run() external returns (NexoraRegistry registry, NexoraEscrow escrow) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address verifier = vm.envOr("VERIFIER_ADDRESS", deployer);

        vm.startBroadcast(deployerKey);

        registry = new NexoraRegistry();
        escrow = new NexoraEscrow(address(registry), verifier);

        vm.stopBroadcast();

        console2.log("=== Nexora deployment ===");
        console2.log("Chain ID:       ", block.chainid);
        console2.log("NexoraRegistry:  ", address(registry));
        console2.log("NexoraEscrow:    ", address(escrow));
        console2.log("Verifier:       ", verifier);
        console2.log("Deployer:       ", deployer);

        // ---- persist deployment record for off-chain services + frontend ----
        string memory json = string.concat(
            "{\n",
            '  "chainId": ', vm.toString(block.chainid), ",\n",
            '  "registry": "', vm.toString(address(registry)), '",\n',
            '  "escrow": "', vm.toString(address(escrow)), '",\n',
            '  "verifier": "', vm.toString(verifier), '",\n',
            '  "deployer": "', vm.toString(deployer), '",\n',
            '  "deployedAt": ', vm.toString(block.timestamp), ",\n",
            '  "blockNumber": ', vm.toString(block.number), "\n",
            "}"
        );
        vm.writeFile("config/deployment.json", json);
        console2.log("Deployment record written to config/deployment.json");
    }
}
