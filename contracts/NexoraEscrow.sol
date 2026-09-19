// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {NexoraRegistry} from "./NexoraRegistry.sol";

/// @title NexoraEscrow — trustless per-unit-of-work payments between AI agents
/// @notice Funds for a job are locked on-chain when the buyer opens it.
///         The seller submits a keccak256 hash of its work; only after the
///         off-chain AI quality verifier calls `settle(jobId, approved)` do
///         the funds move — to the seller when approved, back to the buyer
///         when the output is empty, off-topic or malicious (prompt injection).
/// @dev The verifier address is the MVP trust root: it is set once by the
///      deployer in the constructor and can be rotated by the owner. A
///      production version would replace it with a committee / signature
///      quorum / optimistic challenge window. All fund movement follows
///      checks-effects-interactions and is protected by a reentrancy guard.
contract NexoraEscrow {
    /// @notice Lifecycle of a job. Open → Submitted → (Released | Refunded).
    enum JobStatus {
        Open,      ///< funds locked, waiting for the seller
        Submitted, ///< seller delivered an output hash, waiting for verdict
        Released,  ///< verifier approved — seller paid
        Refunded   ///< verifier rejected — buyer refunded
    }

    /// @notice A single escrowed job.
    struct Job {
        address buyer;     ///< who locked the funds
        address seller;    ///< who must deliver the work
        uint256 amount;    ///< escrowed amount in wei
        bytes32 outputHash;///< keccak256 of the off-chain output text
        JobStatus status;  ///< current lifecycle stage
        uint256 createdAt; ///< block timestamp when the job was opened
    }

    /// @notice Directory of known agents; jobs can only target active sellers.
    NexoraRegistry public immutable registry;

    /// @notice The off-chain AI quality verifier — sole authority to settle.
    address public verifier;

    /// @notice Deployer; may rotate the verifier address.
    address public owner;

    /// @dev jobId => Job. Job ids start at 1 (jobId 0 is never valid).
    mapping(uint256 => Job) public jobs;

    /// @notice Highest issued job id (== total jobs ever opened).
    uint256 public jobIdCounter;

    event JobOpened(uint256 indexed jobId, address indexed buyer, address indexed seller, uint256 amount);
    event WorkSubmitted(uint256 indexed jobId, bytes32 outputHash);
    event JobSettled(uint256 indexed jobId, bool approved);
    event VerifierUpdated(address indexed oldVerifier, address indexed newVerifier);

    error NotVerifier();
    error NotOwner();
    error NotSeller();
    error ZeroAmount();
    error ZeroAddress();
    error JobNotFound();
    error JobNotOpen();
    error JobNotSubmitted();
    error SellerNotActive();
    error TransferFailed();
    error ReentrantCall();

    // ---------------------------------------------------------------------
    // Minimal reentrancy guard (self-contained, no external dependencies).
    // Combined with checks-effects-interactions in `settle`.
    // ---------------------------------------------------------------------
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _guard = _NOT_ENTERED;

    modifier nonReentrant() {
        if (_guard == _ENTERED) revert ReentrantCall();
        _guard = _ENTERED;
        _;
        _guard = _NOT_ENTERED;
    }

    modifier onlyVerifier() {
        if (msg.sender != verifier) revert NotVerifier();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @param _registry Address of the deployed NexoraRegistry.
    /// @param _verifier Address of the off-chain AI quality verifier service.
    constructor(address _registry, address _verifier) {
        if (_registry == address(0) || _verifier == address(0)) revert ZeroAddress();
        registry = NexoraRegistry(_registry);
        verifier = _verifier;
        owner = msg.sender;
    }

    /// @notice Lock `msg.value` MON against a registered, active seller and open a job.
    /// @param seller Wallet of the agent that will perform the work.
    /// @return jobId Id of the newly created job (starts at 1).
    /// @dev Emits `JobOpened`. Funds are held by this contract until settlement.
    function openJob(address seller) external payable nonReentrant returns (uint256 jobId) {
        if (msg.value == 0) revert ZeroAmount();

        NexoraRegistry.Agent memory target = registry.getAgent(seller);
        if (target.wallet == address(0) || !target.active) revert SellerNotActive();

        jobId = ++jobIdCounter;
        jobs[jobId] = Job({
            buyer: msg.sender,
            seller: seller,
            amount: msg.value,
            outputHash: bytes32(0),
            status: JobStatus.Open,
            createdAt: block.timestamp
        });

        emit JobOpened(jobId, msg.sender, seller, msg.value);
    }

    /// @notice Seller delivers the keccak256 hash of its output. Does NOT move funds.
    /// @param jobId Id of the job to submit work for.
    /// @param outputHash keccak256 of the full output text (stored off-chain).
    /// @dev Only the job's seller may call this, and only while the job is Open.
    ///      The clear-text output never touches the chain — only its hash —
    ///      which is what the verifier compares against the off-chain payload.
    function submitWork(uint256 jobId, bytes32 outputHash) external {
        Job storage job = jobs[jobId];
        if (job.buyer == address(0)) revert JobNotFound();
        if (msg.sender != job.seller) revert NotSeller();
        if (job.status != JobStatus.Open) revert JobNotOpen();

        job.outputHash = outputHash;
        job.status = JobStatus.Submitted;

        emit WorkSubmitted(jobId, outputHash);
    }

    /// @notice Settle a submitted job: pay the seller or refund the buyer.
    /// @param jobId Id of the job to settle.
    /// @param approved True → release funds to the seller; false → refund the buyer.
    /// @dev Restricted to `verifier`. Effects (status + event) are applied
    ///      *before* the ETH transfer (checks-effects-interactions) and the
    ///      whole call is guarded against reentrancy, so a malicious receiver
    ///      cannot double-drain or replay.
    function settle(uint256 jobId, bool approved) external nonReentrant onlyVerifier {
        Job storage job = jobs[jobId];
        if (job.buyer == address(0)) revert JobNotFound();
        if (job.status != JobStatus.Submitted) revert JobNotSubmitted();

        job.status = approved ? JobStatus.Released : JobStatus.Refunded;
        emit JobSettled(jobId, approved);

        address payable recipient = approved ? payable(job.seller) : payable(job.buyer);
        (bool success,) = recipient.call{value: job.amount}("");
        if (!success) revert TransferFailed();
    }

    /// @notice Rotate the verifier address (owner only).
    /// @param newVerifier Address of the new verifier service wallet.
    function setVerifier(address newVerifier) external onlyOwner {
        if (newVerifier == address(0)) revert ZeroAddress();
        address old = verifier;
        verifier = newVerifier;
        emit VerifierUpdated(old, newVerifier);
    }

    /// @notice Fetch a full job record.
    function getJob(uint256 jobId) external view returns (Job memory) {
        return jobs[jobId];
    }

    /// @notice Total jobs ever opened (== highest issued job id).
    function totalJobs() external view returns (uint256) {
        return jobIdCounter;
    }

    /// @notice Native balance currently locked in this escrow.
    function escrowBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
