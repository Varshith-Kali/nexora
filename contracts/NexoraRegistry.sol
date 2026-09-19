// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title NexoraRegistry — on-chain directory of autonomous AI agents
/// @notice Agents register themselves so buyers and the escrow can discover
///         and validate machine-to-machine service providers. A job can only
///         be opened against a *registered & active* seller, which gives the
///         escrow a minimal, tamper-proof notion of "known counterparties".
/// @dev Assumption (hackathon MVP): registration is permissionless. Sybil
///      resistance (staking, reputation bonding) is acknowledged future work.
contract NexoraRegistry {
    /// @notice A registered agent offering machine services.
    struct Agent {
        address wallet;       ///< on-chain identity of the agent
        string name;          ///< human-readable label, e.g. "Nova-Summarizer"
        string serviceType;   ///< e.g. "summarization"
        uint256 pricePerUnit; ///< asking price in wei per unit of work
        bool active;          ///< false once deactivated by the agent itself
    }

    /// @dev wallet => Agent. Empty struct (wallet == address(0)) means "not registered".
    mapping(address => Agent) public agents;

    /// @dev Insertion-ordered list of wallets for enumeration (frontend feed).
    address[] public agentList;

    event AgentRegistered(address indexed agent, string name, uint256 pricePerUnit);
    event AgentDeactivated(address indexed agent);

    error EmptyName();
    /// @dev Fires when deactivating an unknown or already-inactive agent.
    error AgentNotDeactivatable();

    /// @notice Register (or re-register / update) the calling agent.
    /// @param name Human-readable agent name (non-empty).
    /// @param serviceType Free-form service category, e.g. "summarization".
    /// @param pricePerUnit Price in wei charged per unit of work.
    /// @dev Re-registering updates the record in place; the list only grows
    ///      on first registration so enumeration stays stable.
    function registerAgent(
        string calldata name,
        string calldata serviceType,
        uint256 pricePerUnit
    ) external {
        if (bytes(name).length == 0) revert EmptyName();

        bool firstRegistration = agents[msg.sender].wallet == address(0);
        agents[msg.sender] = Agent({
            wallet: msg.sender,
            name: name,
            serviceType: serviceType,
            pricePerUnit: pricePerUnit,
            active: true
        });
        if (firstRegistration) {
            agentList.push(msg.sender);
        }

        emit AgentRegistered(msg.sender, name, pricePerUnit);
    }

    /// @notice Deactivate the calling agent. Deactivated agents cannot receive new jobs.
    function deactivateAgent() external {
        Agent storage agent = agents[msg.sender];
        if (agent.wallet == address(0) || !agent.active) revert AgentNotDeactivatable();
        agent.active = false;
        emit AgentDeactivated(msg.sender);
    }

    /// @notice Fetch a full agent record.
    /// @param agent Wallet address to look up.
    function getAgent(address agent) external view returns (Agent memory) {
        return agents[agent];
    }

    /// @notice Number of distinct wallets ever registered.
    function getAgentCount() external view returns (uint256) {
        return agentList.length;
    }

    /// @notice All registered wallets, in registration order (MVP scale).
    function getAgentList() external view returns (address[] memory) {
        return agentList;
    }
}
