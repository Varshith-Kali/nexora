// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NexoraRegistry} from "../contracts/NexoraRegistry.sol";

/// @title NexoraRegistry test suite
contract NexoraRegistryTest is Test {
    NexoraRegistry internal registry;
    address internal seller = makeAddr("seller");
    address internal buyer = makeAddr("buyer");

    function setUp() public {
        registry = new NexoraRegistry();
    }

    function test_RegisterAgent_StoresRecordAndEmits() public {
        vm.expectEmit(true, true, true, true);
        emit AgentRegistered(seller, "Nova-Summarizer", 0.05 ether);
        vm.prank(seller);
        registry.registerAgent("Nova-Summarizer", "summarization", 0.05 ether);

        NexoraRegistry.Agent memory agent = registry.getAgent(seller);
        assertEq(agent.wallet, seller);
        assertEq(agent.name, "Nova-Summarizer");
        assertEq(agent.serviceType, "summarization");
        assertEq(agent.pricePerUnit, 0.05 ether);
        assertTrue(agent.active);
        assertEq(registry.getAgentCount(), 1);
    }

    function test_RegisterAgent_RevertWhen_NameEmpty() public {
        vm.prank(seller);
        vm.expectRevert(NexoraRegistry.EmptyName.selector);
        registry.registerAgent("", "summarization", 1 ether);
    }

    function test_ReRegister_UpdatesWithoutDuplicating() public {
        vm.startPrank(seller);
        registry.registerAgent("Nova-Summarizer", "summarization", 0.05 ether);
        registry.registerAgent("Nova-Summarizer-v2", "summarization", 0.08 ether);
        vm.stopPrank();

        NexoraRegistry.Agent memory agent = registry.getAgent(seller);
        assertEq(agent.name, "Nova-Summarizer-v2");
        assertEq(agent.pricePerUnit, 0.08 ether);
        assertEq(registry.getAgentCount(), 1, "no duplicate list entry");
    }

    function test_DeactivateAgent_TogglesFlag() public {
        vm.prank(seller);
        registry.registerAgent("Nova-Summarizer", "summarization", 0.05 ether);

        vm.expectEmit(true, true, true, true);
        emit AgentDeactivated(seller);
        vm.prank(seller);
        registry.deactivateAgent();

        assertFalse(registry.getAgent(seller).active);
    }

    function test_DeactivateAgent_RevertWhen_UnknownOrInactive() public {
        vm.prank(buyer);
        vm.expectRevert(NexoraRegistry.AgentNotDeactivatable.selector);
        registry.deactivateAgent(); // never registered

        vm.prank(seller);
        registry.registerAgent("Nova-Summarizer", "summarization", 0.05 ether);
        vm.prank(seller);
        registry.deactivateAgent();
        vm.prank(seller);
        vm.expectRevert(NexoraRegistry.AgentNotDeactivatable.selector);
        registry.deactivateAgent(); // already inactive
    }

    function test_GetAgentList_ReturnsRegistrationOrder() public {
        vm.prank(seller);
        registry.registerAgent("Nova-Summarizer", "summarization", 0.05 ether);
        vm.prank(buyer);
        registry.registerAgent("Atlas-Orchestrator", "orchestration", 0);

        address[] memory list = registry.getAgentList();
        assertEq(list.length, 2);
        assertEq(list[0], seller);
        assertEq(list[1], buyer);
    }

    event AgentRegistered(address indexed agent, string name, uint256 pricePerUnit);
    event AgentDeactivated(address indexed agent);
}
