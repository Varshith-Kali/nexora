// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NexoraRegistry} from "../contracts/NexoraRegistry.sol";
import {NexoraEscrow} from "../contracts/NexoraEscrow.sol";

/// @title NexoraEscrow test suite
/// @notice Covers the full job lifecycle: open → submit → settle (approve /
///         reject), plus every authorization and state-machine revert, and
///         the reentrancy guard on fund transfers.
contract NexoraEscrowTest is Test {
    NexoraRegistry internal registry;
    NexoraEscrow internal escrow;

    address internal buyer = makeAddr("buyer");
    address internal seller = makeAddr("seller");
    address internal verifier = makeAddr("verifier");
    address internal attacker = makeAddr("attacker");

    uint256 internal constant JOB_AMOUNT = 0.05 ether;
    bytes32 internal constant OUTPUT_HASH = keccak256("A genuinely useful summary of the document.");

    function setUp() public {
        registry = new NexoraRegistry();
        escrow = new NexoraEscrow(address(registry), verifier);

        vm.prank(seller);
        registry.registerAgent("Nova-Summarizer", "summarization", 0.05 ether);

        vm.deal(buyer, 100 ether);
        vm.deal(attacker, 100 ether);
        vm.deal(seller, 100 ether); // so balances only move by escrow payouts
    }

    // ------------------------------------------------------------------
    // openJob
    // ------------------------------------------------------------------

    function test_OpenJob_LocksFundsAndEmits() public {
        uint256 buyerBefore = buyer.balance;

        vm.prank(buyer);
        vm.expectEmit(true, true, true, true);
        emit JobOpened(1, buyer, seller, JOB_AMOUNT);
        uint256 jobId = escrow.openJob{value: JOB_AMOUNT}(seller);

        assertEq(jobId, 1, "first job id must be 1");
        assertEq(escrow.jobIdCounter(), 1);
        assertEq(escrow.escrowBalance(), JOB_AMOUNT, "escrow must hold the locked funds");
        assertEq(buyer.balance, buyerBefore - JOB_AMOUNT, "buyer must have paid");

        NexoraEscrow.Job memory job = escrow.getJob(1);
        assertEq(job.buyer, buyer);
        assertEq(job.seller, seller);
        assertEq(job.amount, JOB_AMOUNT);
        assertEq(uint8(job.status), uint8(NexoraEscrow.JobStatus.Open));
        assertEq(job.outputHash, bytes32(0));
        assertGt(job.createdAt, 0);
    }

    function test_OpenJob_RevertWhen_ZeroAmount() public {
        vm.prank(buyer);
        vm.expectRevert(NexoraEscrow.ZeroAmount.selector);
        escrow.openJob(seller);
    }

    function test_OpenJob_RevertWhen_SellerNotRegistered() public {
        address unknown = makeAddr("unknown-agent");
        vm.prank(buyer);
        vm.expectRevert(NexoraEscrow.SellerNotActive.selector);
        escrow.openJob{value: JOB_AMOUNT}(unknown);
    }

    function test_OpenJob_RevertWhen_SellerDeactivated() public {
        vm.prank(seller);
        registry.deactivateAgent();

        vm.prank(buyer);
        vm.expectRevert(NexoraEscrow.SellerNotActive.selector);
        escrow.openJob{value: JOB_AMOUNT}(seller);
    }

    // ------------------------------------------------------------------
    // submitWork
    // ------------------------------------------------------------------

    function _openJob() internal returns (uint256 jobId) {
        vm.prank(buyer);
        jobId = escrow.openJob{value: JOB_AMOUNT}(seller);
    }

    function test_SubmitWork_StoresHashAndMovesToSubmitted() public {
        uint256 jobId = _openJob();

        vm.prank(seller);
        vm.expectEmit(true, false, true, true);
        emit WorkSubmitted(jobId, OUTPUT_HASH);
        escrow.submitWork(jobId, OUTPUT_HASH);

        NexoraEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(job.outputHash, OUTPUT_HASH);
        assertEq(uint8(job.status), uint8(NexoraEscrow.JobStatus.Submitted));
    }

    function test_SubmitWork_RevertWhen_NotSeller() public {
        uint256 jobId = _openJob();
        vm.prank(attacker);
        vm.expectRevert(NexoraEscrow.NotSeller.selector);
        escrow.submitWork(jobId, OUTPUT_HASH);
    }

    function test_SubmitWork_RevertWhen_JobNotOpen() public {
        uint256 jobId = _openJob();
        vm.startPrank(seller);
        escrow.submitWork(jobId, OUTPUT_HASH);
        vm.expectRevert(NexoraEscrow.JobNotOpen.selector);
        escrow.submitWork(jobId, OUTPUT_HASH); // double submit
        vm.stopPrank();
    }

    function test_SubmitWork_RevertWhen_JobNotFound() public {
        vm.prank(seller);
        vm.expectRevert(NexoraEscrow.JobNotFound.selector);
        escrow.submitWork(999, OUTPUT_HASH);
    }

    // ------------------------------------------------------------------
    // settle — approval path
    // ------------------------------------------------------------------

    function test_Settle_Approved_PaysSeller() public {
        uint256 jobId = _openJob();
        vm.prank(seller);
        escrow.submitWork(jobId, OUTPUT_HASH);

        uint256 sellerBefore = seller.balance;
        uint256 buyerBefore = buyer.balance;

        vm.prank(verifier);
        vm.expectEmit(true, false, true, true);
        emit JobSettled(jobId, true);
        escrow.settle(jobId, true);

        assertEq(uint8(escrow.getJob(jobId).status), uint8(NexoraEscrow.JobStatus.Released));
        assertEq(seller.balance, sellerBefore + JOB_AMOUNT, "seller must be paid in full");
        assertEq(buyer.balance, buyerBefore, "buyer gets nothing back on approval");
        assertEq(escrow.escrowBalance(), 0, "escrow must be drained");
    }

    // ------------------------------------------------------------------
    // settle — rejection path
    // ------------------------------------------------------------------

    function test_Settle_Rejected_RefundsBuyer() public {
        uint256 jobId = _openJob();
        vm.prank(seller);
        escrow.submitWork(jobId, OUTPUT_HASH);

        uint256 sellerBefore = seller.balance;
        uint256 buyerBefore = buyer.balance;

        vm.prank(verifier);
        vm.expectEmit(true, false, true, true);
        emit JobSettled(jobId, false);
        escrow.settle(jobId, false);

        assertEq(uint8(escrow.getJob(jobId).status), uint8(NexoraEscrow.JobStatus.Refunded));
        assertEq(buyer.balance, buyerBefore + JOB_AMOUNT, "buyer must be refunded in full");
        assertEq(seller.balance, sellerBefore, "seller gets nothing when rejected");
        assertEq(escrow.escrowBalance(), 0, "escrow must be drained");
    }

    // ------------------------------------------------------------------
    // settle — authorization & state machine
    // ------------------------------------------------------------------

    function test_Settle_RevertWhen_CallerNotVerifier() public {
        uint256 jobId = _openJob();
        vm.prank(seller);
        escrow.submitWork(jobId, OUTPUT_HASH);

        vm.prank(buyer);
        vm.expectRevert(NexoraEscrow.NotVerifier.selector);
        escrow.settle(jobId, true);

        vm.prank(attacker);
        vm.expectRevert(NexoraEscrow.NotVerifier.selector);
        escrow.settle(jobId, true);
    }

    function test_Settle_RevertWhen_JobNotSubmitted() public {
        uint256 jobId = _openJob(); // still Open
        vm.prank(verifier);
        vm.expectRevert(NexoraEscrow.JobNotSubmitted.selector);
        escrow.settle(jobId, true);
    }

    function test_Settle_RevertWhen_DoubleSettle() public {
        uint256 jobId = _openJob();
        vm.startPrank(seller);
        escrow.submitWork(jobId, OUTPUT_HASH);
        vm.stopPrank();

        vm.startPrank(verifier);
        escrow.settle(jobId, true);
        vm.expectRevert(NexoraEscrow.JobNotSubmitted.selector);
        escrow.settle(jobId, true); // replay attempt
        vm.stopPrank();
    }

    function test_Settle_RevertWhen_JobNotFound() public {
        vm.prank(verifier);
        vm.expectRevert(NexoraEscrow.JobNotFound.selector);
        escrow.settle(4242, true);
    }

    // ------------------------------------------------------------------
    // reentrancy guard
    // ------------------------------------------------------------------

    /// @dev A malicious seller whose receive() re-enters the escrow's
    ///      `nonReentrant` payment path (openJob) mid-payout. The guard must
    ///      make the inner call revert while the outer settlement completes
    ///      and the payout happens exactly once.
    function test_Reentrancy_GuardBlocksReentryDuringSettle() public {
        ReentrantSeller evil = new ReentrantSeller(escrow);
        evil.registerMe();

        vm.prank(buyer);
        uint256 jobId = escrow.openJob{value: JOB_AMOUNT}(address(evil));

        bytes32 hash = keccak256("evil output");
        evil.submit(jobId, hash);

        vm.prank(verifier);
        escrow.settle(jobId, true);

        assertEq(uint8(escrow.getJob(jobId).status), uint8(NexoraEscrow.JobStatus.Released));
        assertEq(address(evil).balance, JOB_AMOUNT, "evil seller paid exactly once");
        assertEq(escrow.escrowBalance(), 0);
        assertEq(escrow.jobIdCounter(), 1, "reentrant openJob must have been blocked");
    }

    // ------------------------------------------------------------------
    // verifier rotation
    // ------------------------------------------------------------------

    function test_SetVerifier_OnlyOwnerCanRotate() public {
        address newVerifier = makeAddr("verifier-v2");

        vm.prank(attacker);
        vm.expectRevert(NexoraEscrow.NotOwner.selector);
        escrow.setVerifier(newVerifier);

        address deployer = escrow.owner();
        vm.prank(deployer);
        vm.expectEmit(true, true, true, true);
        emit VerifierUpdated(verifier, newVerifier);
        escrow.setVerifier(newVerifier);
        assertEq(escrow.verifier(), newVerifier);
    }

    // ------------------------------------------------------------------
    // events mirrored locally for expectEmit
    // ------------------------------------------------------------------
    event JobOpened(uint256 indexed jobId, address indexed buyer, address indexed seller, uint256 amount);
    event WorkSubmitted(uint256 indexed jobId, bytes32 outputHash);
    event JobSettled(uint256 indexed jobId, bool approved);
    event VerifierUpdated(address indexed oldVerifier, address indexed newVerifier);
}

/// @dev Malicious seller that attempts reentrancy while receiving its payout.
contract ReentrantSeller {
    NexoraEscrow public immutable escrow;

    constructor(NexoraEscrow _escrow) payable {
        escrow = _escrow;
    }

    function registerMe() external {
        NexoraRegistry(address(escrow.registry())).registerAgent("ReentrantSeller", "evil", 0.05 ether);
    }

    function submit(uint256 jobId, bytes32 hash) external {
        escrow.submitWork(jobId, hash);
    }

    /// @dev Triggered by the payout — attempts to re-enter the escrow's
    ///      guarded (nonReentrant) payable path while the outer settle()
    ///      transfer is still in flight.
    receive() external payable {
        try escrow.openJob{value: msg.value}(address(this)) {
            // if this succeeds the reentrancy guard is broken
        } catch {
            // expected: ReentrantCall — re-entry blocked mid-payout
        }
    }
}
