import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { network } from "hardhat";
import { parseEther, type Address } from "viem";
import BlackCheckModule from "../ignition/modules/BlackCheck.js";
import { CHECKS_ADDRESS, EIGHTY_CHECKS, SINGLE_CHECKS } from "./fixtures.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("Black Check", async function () {
  const { viem, ignition } = await network.connect("hardhatMainnet");
  const testClient = await viem.getTestClient();

  let contract: Awaited<ReturnType<typeof viem.getContractAt<"BlackCheck">>>;
  let checksContract: Awaited<ReturnType<typeof viem.getContractAt<"IChecks">>>;
  let snapshotId: `0x${string}`;

  beforeEach(async () => {
    // Take a snapshot of the blockchain state to restore after each test
    snapshotId = await testClient.snapshot();

    // Deploy the BlackCheck contract using Ignition
    const { blackCheck } = await ignition.deploy(BlackCheckModule);

    // Get viem contract instances
    contract = await viem.getContractAt("BlackCheck", blackCheck.address);
    checksContract = await viem.getContractAt("IChecks", CHECKS_ADDRESS);
  });

  afterEach(async () => {
    // Revert to the snapshot to restore NFT state for next test
    await testClient.revert({ id: snapshotId });
  });

  describe("Token Metadata", () => {
    it("should return the correct token name", async () => {
      const name = await contract.read.name();
      assert.equal(name, "Black Check");
    });

    it("should return the correct token symbol", async () => {
      const symbol = await contract.read.symbol();
      assert.equal(symbol, "$BLKCHK");
    });

    it("should have 18 decimals", async () => {
      const decimals = await contract.read.decimals();
      assert.equal(decimals, 18);
    });
  });

  describe("Constants", () => {
    it("should have the correct CHECKS contract address", async () => {
      const checksAddr = await contract.read.CHECKS();
      assert.equal(checksAddr, CHECKS_ADDRESS);
    });

    it("should have MAX_SUPPLY of 1 * 10^18", async () => {
      const maxSupply = await contract.read.MAX_SUPPLY();
      assert.equal(maxSupply, parseEther("1"));
    });
  });

  describe("ETH Rejection", () => {
    it("should revert when sending ETH via receive()", async () => {
      const [deployer] = await viem.getWalletClients();
      const publicClient = await viem.getPublicClient();

      await assert.rejects(
        async () => {
          await deployer.sendTransaction({
            to: contract.address,
            value: parseEther("1"),
          });
        },
        (error: Error) => {
          return error.message.includes("NoEthAccepted");
        },
      );
    });

    it("should revert when sending ETH via fallback()", async () => {
      const [deployer] = await viem.getWalletClients();

      await assert.rejects(
        async () => {
          await deployer.sendTransaction({
            to: contract.address,
            value: parseEther("1"),
            data: "0x12345678", // Random data to trigger fallback
          });
        },
        (error: Error) => {
          return error.message.includes("NoEthAccepted");
        },
      );
    });
  });

  describe("Deposits (onERC721Received)", () => {
    it("should accept a single check and mint correct tokens", async () => {
      // Use check #1 (single check)
      const checkId = SINGLE_CHECKS[0];
      const checkOwner = await checksContract.read.ownerOf([checkId]);

      // Fund the check owner with ETH for gas
      await testClient.setBalance({
        address: checkOwner,
        value: parseEther("10"),
      });

      // Impersonate the check owner
      await testClient.impersonateAccount({ address: checkOwner });
      const ownerClient = await viem.getWalletClient(checkOwner);

      // Get divisorIndex to calculate expected mint amount
      const checkData = await checksContract.read.getCheck([checkId]);
      const expectedAmount =
        ((1n << BigInt(checkData.stored.divisorIndex)) * parseEther("1")) /
        4096n;

      // Transfer check to BlackCheck contract
      await checksContract.write.safeTransferFrom(
        [checkOwner, contract.address, checkId],
        { account: checkOwner, client: ownerClient },
      );

      // Check balance
      const balance = await contract.read.balanceOf([checkOwner]);
      assert.equal(balance, expectedAmount);

      // Check total supply
      const totalSupply = await contract.read.totalSupply();
      assert.equal(totalSupply, expectedAmount);

      await testClient.stopImpersonatingAccount({ address: checkOwner });
    });

    it("should revert if not sent from CHECKS contract", async () => {
      const [deployer] = await viem.getWalletClients();

      // Try to call onERC721Received directly (not from CHECKS contract)
      await assert.rejects(
        async () => {
          await contract.write.onERC721Received(
            [deployer.account.address, deployer.account.address, 1n, "0x"],
            { account: deployer.account },
          );
        },
        (error: Error) => {
          return error.message.includes("OnlyChecksContract");
        },
      );
    });
  });

  describe("Minting (approval flow)", () => {
    it("should mint tokens when check is approved and mint is called", async () => {
      // Use check #2 (single check)
      const checkId = SINGLE_CHECKS[1];
      const checkOwner = await checksContract.read.ownerOf([checkId]);

      // Fund the check owner with ETH for gas
      await testClient.setBalance({
        address: checkOwner,
        value: parseEther("10"),
      });

      // Impersonate the check owner
      await testClient.impersonateAccount({ address: checkOwner });
      const ownerClient = await viem.getWalletClient(checkOwner);

      // Get divisorIndex to calculate expected mint amount
      const checkData = await checksContract.read.getCheck([checkId]);
      const expectedAmount =
        ((1n << BigInt(checkData.stored.divisorIndex)) * parseEther("1")) /
        4096n;

      // Approve the BlackCheck contract to transfer the check
      await checksContract.write.approve([contract.address, checkId], {
        account: checkOwner,
        client: ownerClient,
      });

      // Call mint to transfer in the check
      await contract.write.mint([[checkId]], {
        account: checkOwner,
        client: ownerClient,
      });

      // Check balance
      const balance = await contract.read.balanceOf([checkOwner]);
      assert.equal(balance, expectedAmount);

      // Check total supply
      const totalSupply = await contract.read.totalSupply();
      assert.equal(totalSupply, expectedAmount);

      // Check that the contract now owns the NFT
      const newOwner = await checksContract.read.ownerOf([checkId]);
      assert.equal(newOwner, contract.address);

      await testClient.stopImpersonatingAccount({ address: checkOwner });
    });

    it("should revert when minting without approval", async () => {
      const checkId = SINGLE_CHECKS[2];
      const checkOwner = await checksContract.read.ownerOf([checkId]);

      // Fund the check owner with ETH for gas
      await testClient.setBalance({
        address: checkOwner,
        value: parseEther("10"),
      });

      // Impersonate the check owner
      await testClient.impersonateAccount({ address: checkOwner });
      const ownerClient = await viem.getWalletClient(checkOwner);

      // Try to mint without approving first
      await assert.rejects(
        async () => {
          await contract.write.mint([[checkId]], {
            account: checkOwner,
            client: ownerClient,
          });
        },
        (error: Error) => {
          return (
            error.message.includes("ERC721InsufficientApproval") ||
            error.message.includes("reverted")
          );
        },
      );

      await testClient.stopImpersonatingAccount({ address: checkOwner });
    });

    it("should allow anyone to call mint but tokens go to NFT owner (security test)", async () => {
      // Use checks 1001 and 5050 which are both owned by onezerozeroone.eth
      const checkIds = [1001n, 5050n];
      const checkOwner = await checksContract.read.ownerOf([checkIds[0]]);

      // Verify both checks are owned by the same person
      const checkOwner2 = await checksContract.read.ownerOf([checkIds[1]]);
      assert.equal(checkOwner, checkOwner2);

      // Fund the check owner with ETH for gas
      await testClient.setBalance({
        address: checkOwner,
        value: parseEther("10"),
      });

      // Impersonate the check owner and approve the BlackCheck contract
      await testClient.impersonateAccount({ address: checkOwner });
      const ownerClient = await viem.getWalletClient(checkOwner);

      // Approve both checks to the BlackCheck contract
      for (const checkId of checkIds) {
        await checksContract.write.approve([contract.address, checkId], {
          account: checkOwner,
          client: ownerClient,
        });
      }

      await testClient.stopImpersonatingAccount({ address: checkOwner });

      // Calculate expected mint amount
      let totalExpectedAmount = 0n;
      for (const checkId of checkIds) {
        const checkData = await checksContract.read.getCheck([checkId]);
        const expectedAmount =
          ((1n << BigInt(checkData.stored.divisorIndex)) * parseEther("1")) /
          4096n;
        totalExpectedAmount += expectedAmount;
      }

      // Anyone can call mint (using attacker address)
      const [attacker] = await viem.getWalletClients();
      await contract.write.mint([checkIds], {
        account: attacker.account,
      });

      // Verify tokens were minted to the OWNER, not the attacker
      const ownerBalance = await contract.read.balanceOf([checkOwner]);
      assert.equal(ownerBalance, totalExpectedAmount);

      const attackerBalance = await contract.read.balanceOf([
        attacker.account.address,
      ]);
      assert.equal(attackerBalance, 0n);

      // Verify the contract now owns the checks
      for (const checkId of checkIds) {
        const currentOwner = await checksContract.read.ownerOf([checkId]);
        assert.equal(currentOwner, contract.address);
      }
    });

    it("should allow anyone to call mint when check is approved to BlackCheck", async () => {
      // Use check #5
      const checkId = SINGLE_CHECKS[4];
      const checkOwner = await checksContract.read.ownerOf([checkId]);

      // Fund the check owner with ETH for gas
      await testClient.setBalance({
        address: checkOwner,
        value: parseEther("10"),
      });

      // Get a third party caller (not the owner)
      const [thirdParty] = await viem.getWalletClients();

      // Impersonate the check owner and approve BlackCheck contract
      await testClient.impersonateAccount({ address: checkOwner });
      const ownerClient = await viem.getWalletClient(checkOwner);

      // Approve the BlackCheck contract for this specific check
      await checksContract.write.approve([contract.address, checkId], {
        account: checkOwner,
        client: ownerClient,
      });

      await testClient.stopImpersonatingAccount({ address: checkOwner });

      // Calculate expected mint amount
      const checkData = await checksContract.read.getCheck([checkId]);
      const expectedAmount =
        ((1n << BigInt(checkData.stored.divisorIndex)) * parseEther("1")) /
        4096n;

      // Third party calls mint (anyone can call it)
      await contract.write.mint([[checkId]], {
        account: thirdParty.account,
      });

      // Verify tokens were minted to the OWNER, not the third party
      const ownerBalance = await contract.read.balanceOf([checkOwner]);
      assert.equal(ownerBalance, expectedAmount);

      const thirdPartyBalance = await contract.read.balanceOf([
        thirdParty.account.address,
      ]);
      assert.equal(thirdPartyBalance, 0n);

      // Verify the contract now owns the check
      const newOwner = await checksContract.read.ownerOf([checkId]);
      assert.equal(newOwner, contract.address);
    });

    it("should allow anyone to call mint when owner has setApprovedForAll for BlackCheck", async () => {
      // Use check #6
      const checkId = SINGLE_CHECKS[5];
      const checkOwner = await checksContract.read.ownerOf([checkId]);

      // Fund the check owner with ETH for gas
      await testClient.setBalance({
        address: checkOwner,
        value: parseEther("10"),
      });

      // Get a third party caller (not the owner)
      const [thirdParty] = await viem.getWalletClients();

      // Impersonate the check owner and set approval for all
      await testClient.impersonateAccount({ address: checkOwner });
      const ownerClient = await viem.getWalletClient(checkOwner);

      // Set approval for all for the BlackCheck contract
      await checksContract.write.setApprovalForAll([contract.address, true], {
        account: checkOwner,
        client: ownerClient,
      });

      await testClient.stopImpersonatingAccount({ address: checkOwner });

      // Calculate expected mint amount
      const checkData = await checksContract.read.getCheck([checkId]);
      const expectedAmount =
        ((1n << BigInt(checkData.stored.divisorIndex)) * parseEther("1")) /
        4096n;

      // Third party calls mint using setApprovedForAll
      await contract.write.mint([[checkId]], {
        account: thirdParty.account,
      });

      // Verify tokens were minted to the OWNER, not the third party
      const ownerBalance = await contract.read.balanceOf([checkOwner]);
      assert.equal(ownerBalance, expectedAmount);

      const thirdPartyBalance = await contract.read.balanceOf([
        thirdParty.account.address,
      ]);
      assert.equal(thirdPartyBalance, 0n);

      // Verify the contract now owns the check
      const newOwner = await checksContract.read.ownerOf([checkId]);
      assert.equal(newOwner, contract.address);
    });

    it("should mint tokens for multiple checks at once", async () => {
      // Use checks #3 and #4 (single checks)
      const checkIds = [SINGLE_CHECKS[2], SINGLE_CHECKS[3]];
      const checkOwners = await Promise.all(
        checkIds.map((id) => checksContract.read.ownerOf([id])),
      );

      // Calculate total expected amount
      let totalExpectedAmount = 0n;

      for (let i = 0; i < checkIds.length; i++) {
        const checkId = checkIds[i];
        const checkOwner = checkOwners[i];

        // Fund the check owner with ETH for gas
        await testClient.setBalance({
          address: checkOwner,
          value: parseEther("10"),
        });

        // Impersonate the check owner
        await testClient.impersonateAccount({ address: checkOwner });
        const ownerClient = await viem.getWalletClient(checkOwner);

        // Get divisorIndex to calculate expected mint amount
        const checkData = await checksContract.read.getCheck([checkId]);
        const expectedAmount =
          ((1n << BigInt(checkData.stored.divisorIndex)) * parseEther("1")) /
          4096n;
        totalExpectedAmount += expectedAmount;

        // Transfer to first owner for testing
        if (i > 0) {
          await checksContract.write.transferFrom(
            [checkOwner, checkOwners[0], checkId],
            { account: checkOwner, client: ownerClient },
          );
        }

        await testClient.stopImpersonatingAccount({ address: checkOwner });
      }

      // Now all checks are owned by the first owner
      const mainOwner = checkOwners[0];
      await testClient.impersonateAccount({ address: mainOwner });
      const mainOwnerClient = await viem.getWalletClient(mainOwner);

      // Approve all checks
      for (const checkId of checkIds) {
        await checksContract.write.approve([contract.address, checkId], {
          account: mainOwner,
          client: mainOwnerClient,
        });
      }

      // Call mint with multiple check IDs
      await contract.write.mint([checkIds], {
        account: mainOwner,
        client: mainOwnerClient,
      });

      // Check balance
      const balance = await contract.read.balanceOf([mainOwner]);
      assert.equal(balance, totalExpectedAmount);

      // Check that the contract now owns both NFTs
      for (const checkId of checkIds) {
        const newOwner = await checksContract.read.ownerOf([checkId]);
        assert.equal(newOwner, contract.address);
      }

      await testClient.stopImpersonatingAccount({ address: mainOwner });
    });

    it("should handle empty array gracefully", async () => {
      const [caller] = await viem.getWalletClients();

      // Calling mint with empty array should succeed (no-op)
      await contract.write.mint([[]], {
        account: caller.account,
      });

      // No tokens should be minted
      const balance = await contract.read.balanceOf([caller.account.address]);
      assert.equal(balance, 0n);
    });

    it("should revert when minting would exceed MAX_SUPPLY", async () => {
      // First, deposit 64 single checks to get very close to max supply
      for (const checkId of SINGLE_CHECKS) {
        const owner = await checksContract.read.ownerOf([checkId]);

        await testClient.setBalance({
          address: owner,
          value: parseEther("10"),
        });

        await testClient.impersonateAccount({ address: owner });
        const ownerClient = await viem.getWalletClient(owner);
        await checksContract.write.safeTransferFrom(
          [owner, contract.address, checkId],
          { account: owner, client: ownerClient },
        );
        await testClient.stopImpersonatingAccount({ address: owner });
      }

      // Verify we're at 1.0 tokens (max supply)
      const totalSupply = await contract.read.totalSupply();
      assert.equal(totalSupply, parseEther("1"));

      // Now try to mint another check - should fail
      const extraCheck = EIGHTY_CHECKS[0];
      const extraOwner = await checksContract.read.ownerOf([extraCheck]);

      await testClient.setBalance({
        address: extraOwner,
        value: parseEther("10"),
      });

      await testClient.impersonateAccount({ address: extraOwner });
      const ownerClient = await viem.getWalletClient(extraOwner);

      // Approve the check
      await checksContract.write.approve([contract.address, extraCheck], {
        account: extraOwner,
        client: ownerClient,
      });

      await testClient.stopImpersonatingAccount({ address: extraOwner });

      // Try to mint - should fail due to max supply
      const [caller] = await viem.getWalletClients();
      await assert.rejects(
        async () => {
          await contract.write.mint([[extraCheck]], {
            account: caller.account,
          });
        },
        (error: Error) => {
          return (
            error.message.includes("MaxSupplyExceeded") ||
            error.message.includes("reverted")
          );
        },
      );
    });

    it("should revert when check in array is not approved", async () => {
      // Use two checks from different owners
      const checkIds = [SINGLE_CHECKS[7], SINGLE_CHECKS[8]];
      const owners = await Promise.all(
        checkIds.map((id) => checksContract.read.ownerOf([id])),
      );

      // Fund and approve only the first check
      await testClient.setBalance({
        address: owners[0],
        value: parseEther("10"),
      });

      await testClient.impersonateAccount({ address: owners[0] });
      const owner1Client = await viem.getWalletClient(owners[0]);

      await checksContract.write.approve([contract.address, checkIds[0]], {
        account: owners[0],
        client: owner1Client,
      });

      await testClient.stopImpersonatingAccount({ address: owners[0] });

      // Don't approve the second check - just fund the owner
      await testClient.setBalance({
        address: owners[1],
        value: parseEther("10"),
      });

      // Try to mint both - should fail because second check is not approved
      const [caller] = await viem.getWalletClients();
      await assert.rejects(
        async () => {
          await contract.write.mint([checkIds], {
            account: caller.account,
          });
        },
        (error: Error) => {
          return (
            error.message.includes("NotAllowed") ||
            error.message.includes("reverted")
          );
        },
      );

      // Verify first check was not minted (transaction reverted)
      const owner1Balance = await contract.read.balanceOf([owners[0]]);
      assert.equal(owner1Balance, 0n);

      // Verify checks are still owned by original owners
      assert.equal(await checksContract.read.ownerOf([checkIds[0]]), owners[0]);
      assert.equal(await checksContract.read.ownerOf([checkIds[1]]), owners[1]);
    });

    it("should handle minting checks from different owners in same transaction", async () => {
      // Use two checks from different owners
      const checkIds = [SINGLE_CHECKS[9], SINGLE_CHECKS[10]];
      const owners = await Promise.all(
        checkIds.map((id) => checksContract.read.ownerOf([id])),
      );

      // Verify they have different owners
      assert.notEqual(owners[0], owners[1]);

      // Approve both checks
      for (let i = 0; i < checkIds.length; i++) {
        await testClient.setBalance({
          address: owners[i],
          value: parseEther("10"),
        });

        await testClient.impersonateAccount({ address: owners[i] });
        const ownerClient = await viem.getWalletClient(owners[i]);

        await checksContract.write.approve([contract.address, checkIds[i]], {
          account: owners[i],
          client: ownerClient,
        });

        await testClient.stopImpersonatingAccount({ address: owners[i] });
      }

      // Calculate expected amounts for each owner
      const expectedAmounts = await Promise.all(
        checkIds.map(async (checkId) => {
          const checkData = await checksContract.read.getCheck([checkId]);
          return (
            ((1n << BigInt(checkData.stored.divisorIndex)) * parseEther("1")) /
            4096n
          );
        }),
      );

      // Anyone can mint both checks in one transaction
      const [caller] = await viem.getWalletClients();
      await contract.write.mint([checkIds], {
        account: caller.account,
      });

      // Verify each owner received their respective tokens
      for (let i = 0; i < owners.length; i++) {
        const balance = await contract.read.balanceOf([owners[i]]);
        assert.equal(balance, expectedAmounts[i]);
      }

      // Verify contract owns both checks
      for (const checkId of checkIds) {
        assert.equal(
          await checksContract.read.ownerOf([checkId]),
          contract.address,
        );
      }
    });

    it("should revert if duplicate check IDs in array", async () => {
      const checkId = SINGLE_CHECKS[11];
      const owner = await checksContract.read.ownerOf([checkId]);

      await testClient.setBalance({
        address: owner,
        value: parseEther("10"),
      });

      await testClient.impersonateAccount({ address: owner });
      const ownerClient = await viem.getWalletClient(owner);

      // Approve the check
      await checksContract.write.approve([contract.address, checkId], {
        account: owner,
        client: ownerClient,
      });

      await testClient.stopImpersonatingAccount({ address: owner });

      // Try to mint the same check twice in one transaction
      const [caller] = await viem.getWalletClients();
      await assert.rejects(
        async () => {
          await contract.write.mint([[checkId, checkId]], {
            account: caller.account,
          });
        },
        (error: Error) => {
          // Will fail because after first mint, contract owns it and approval is cleared
          return error.message.includes("reverted");
        },
      );
    });
  });

  describe("Exchanges", () => {
    it("should exchange tokens for a check by burning tokens", async () => {
      const checkId = SINGLE_CHECKS[0];
      const checkOwner = await checksContract.read.ownerOf([checkId]);

      // Fund the check owner with ETH for gas
      await testClient.setBalance({
        address: checkOwner,
        value: parseEther("10"),
      });

      // Deposit the check first
      await testClient.impersonateAccount({ address: checkOwner });
      const ownerClient = await viem.getWalletClient(checkOwner);

      await checksContract.write.safeTransferFrom(
        [checkOwner, contract.address, checkId],
        { account: checkOwner, client: ownerClient },
      );

      const balanceBefore = await contract.read.balanceOf([checkOwner]);
      assert(balanceBefore > 0n, "Should have tokens after deposit");

      // Exchange tokens for the check
      await contract.write.exchange([checkId], {
        account: checkOwner,
        client: ownerClient,
      });

      // Check balance is now 0
      const balanceAfter = await contract.read.balanceOf([checkOwner]);
      assert.equal(balanceAfter, 0n);

      // Check that the NFT was returned
      const newOwner = await checksContract.read.ownerOf([checkId]);
      assert.equal(newOwner, checkOwner);

      await testClient.stopImpersonatingAccount({ address: checkOwner });
    });

    it("should revert when exchanging with insufficient tokens", async () => {
      const [deployer] = await viem.getWalletClients();
      const checkId = SINGLE_CHECKS[0];

      // Try to exchange without having tokens
      await assert.rejects(
        async () => {
          await contract.write.exchange([checkId], {
            account: deployer.account,
          });
        },
        (error: Error) => {
          return (
            error.message.includes("InsufficientBalance") ||
            error.message.includes("reverted")
          );
        },
      );
    });

    it("should revert when exchanging a check that was burned during composite", async () => {
      // Get two 80-checks for compositing
      const keepId = EIGHTY_CHECKS[0];
      const burnId = EIGHTY_CHECKS[1];

      // Get owners and deposit both checks
      const keepOwner = await checksContract.read.ownerOf([keepId]);
      const burnOwner = await checksContract.read.ownerOf([burnId]);

      // Fund both owners with ETH for gas
      await testClient.setBalance({
        address: keepOwner,
        value: parseEther("10"),
      });
      await testClient.setBalance({
        address: burnOwner,
        value: parseEther("10"),
      });

      // Deposit keepId
      await testClient.impersonateAccount({ address: keepOwner });
      const keepOwnerClient = await viem.getWalletClient(keepOwner);
      await checksContract.write.safeTransferFrom(
        [keepOwner, contract.address, keepId],
        { account: keepOwner, client: keepOwnerClient },
      );

      const keepOwnerBalance = await contract.read.balanceOf([keepOwner]);
      await testClient.stopImpersonatingAccount({ address: keepOwner });

      // Deposit burnId
      await testClient.impersonateAccount({ address: burnOwner });
      const burnOwnerClient = await viem.getWalletClient(burnOwner);
      await checksContract.write.safeTransferFrom(
        [burnOwner, contract.address, burnId],
        { account: burnOwner, client: burnOwnerClient },
      );

      const burnOwnerBalance = await contract.read.balanceOf([burnOwner]);
      await testClient.stopImpersonatingAccount({ address: burnOwner });

      // Verify contract owns both checks
      assert.equal(
        await checksContract.read.ownerOf([keepId]),
        contract.address,
      );
      assert.equal(
        await checksContract.read.ownerOf([burnId]),
        contract.address,
      );

      // Composite the checks - this will burn burnId
      const [deployer] = await viem.getWalletClients();
      await contract.write.composite([keepId, burnId], {
        account: deployer.account,
      });

      // Verify burnId was burned (no longer exists)
      await assert.rejects(
        async () => {
          await checksContract.read.ownerOf([burnId]);
        },
        (error: Error) => {
          return (
            error.message.includes("ERC721NonexistentToken") ||
            error.message.includes("reverted")
          );
        },
      );

      // Now try to exchange for the burned check - should fail
      // First, fund the burnOwner so they have enough tokens
      await testClient.impersonateAccount({ address: burnOwner });
      const burnOwnerClientRetry = await viem.getWalletClient(burnOwner);

      await assert.rejects(
        async () => {
          await contract.write.exchange([burnId], {
            account: burnOwner,
            client: burnOwnerClientRetry,
          });
        },
        (error: Error) => {
          return (
            error.message.includes("ERC721NonexistentToken") ||
            error.message.includes("reverted")
          );
        },
        "Should not be able to exchange a burned check",
      );

      await testClient.stopImpersonatingAccount({ address: burnOwner });
    });
  });

  describe("Composite", () => {
    it("should composite two checks held by the contract", async () => {
      // Get two 80-checks
      const keepId = EIGHTY_CHECKS[0];
      const burnId = EIGHTY_CHECKS[1];

      // Get owners and deposit both
      const keepOwner = await checksContract.read.ownerOf([keepId]);
      const burnOwner = await checksContract.read.ownerOf([burnId]);

      // Fund both owners with ETH for gas
      await testClient.setBalance({
        address: keepOwner,
        value: parseEther("10"),
      });
      await testClient.setBalance({
        address: burnOwner,
        value: parseEther("10"),
      });

      // Deposit keepId
      await testClient.impersonateAccount({ address: keepOwner });
      const keepOwnerClient = await viem.getWalletClient(keepOwner);
      await checksContract.write.safeTransferFrom(
        [keepOwner, contract.address, keepId],
        { account: keepOwner, client: keepOwnerClient },
      );
      await testClient.stopImpersonatingAccount({ address: keepOwner });

      // Deposit burnId
      await testClient.impersonateAccount({ address: burnOwner });
      const burnOwnerClient = await viem.getWalletClient(burnOwner);
      await checksContract.write.safeTransferFrom(
        [burnOwner, contract.address, burnId],
        { account: burnOwner, client: burnOwnerClient },
      );
      await testClient.stopImpersonatingAccount({ address: burnOwner });

      // Verify contract owns both
      assert.equal(
        await checksContract.read.ownerOf([keepId]),
        contract.address,
      );
      assert.equal(
        await checksContract.read.ownerOf([burnId]),
        contract.address,
      );

      // Anyone can call composite
      const [deployer] = await viem.getWalletClients();
      await contract.write.composite([keepId, burnId], {
        account: deployer.account,
      });

      // Verify keepId still exists and burnId was burned
      assert.equal(
        await checksContract.read.ownerOf([keepId]),
        contract.address,
      );
      await assert.rejects(
        async () => {
          await checksContract.read.ownerOf([burnId]);
        },
        (error: Error) => {
          return (
            error.message.includes("ERC721NonexistentToken") ||
            error.message.includes("reverted")
          );
        },
      );
    });

    it("should revert if keepId > burnId", async () => {
      const [deployer] = await viem.getWalletClients();
      const keepId = EIGHTY_CHECKS[1];
      const burnId = EIGHTY_CHECKS[0];

      await assert.rejects(
        async () => {
          await contract.write.composite([keepId, burnId], {
            account: deployer.account,
          });
        },
        (error: Error) => {
          return error.message.includes("InvalidOrder");
        },
      );
    });
  });

  describe("One (Black Check Creation)", () => {
    it("should prevent black check exchange for less than 1.00 $BLKCHK", async () => {
      // Deposit all 64 single checks from their respective owners
      const depositors: Array<{ address: `0x${string}`; balance: bigint }> = [];

      for (const checkId of SINGLE_CHECKS) {
        const owner = await checksContract.read.ownerOf([checkId]);

        await testClient.setBalance({
          address: owner,
          value: parseEther("10"),
        });

        await testClient.impersonateAccount({ address: owner });
        const ownerClient = await viem.getWalletClient(owner);

        const balanceBefore = await contract.read.balanceOf([owner]);

        await checksContract.write.safeTransferFrom(
          [owner, contract.address, checkId],
          { account: owner, client: ownerClient },
        );

        const balanceAfter = await contract.read.balanceOf([owner]);
        depositors.push({
          address: owner,
          balance: balanceAfter - balanceBefore,
        });

        await testClient.stopImpersonatingAccount({ address: owner });
      }

      // Verify total supply = 1.0 tokens
      const supplyAfterDeposits = await contract.read.totalSupply();
      assert.equal(supplyAfterDeposits, parseEther("1"));

      // Call one() to create black check
      const [deployer] = await viem.getWalletClients();
      await contract.write.one([SINGLE_CHECKS], { account: deployer.account });

      // Verify it's a black check (divisorIndex 7)
      const blackCheckId = SINGLE_CHECKS[0];
      const checkData = await checksContract.read.getCheck([blackCheckId]);
      assert.equal(checkData.stored.divisorIndex, 7);

      // Find a depositor who doesn't have 1.0 tokens (they all have 0.015625 each)
      const smallDepositor = depositors.find(
        (d) => d.balance < parseEther("1"),
      )!;
      assert(
        smallDepositor,
        "Should have a depositor with less than 1.0 tokens",
      );

      // Try to exchange for the black check - should fail because it costs 1.0 tokens
      await testClient.impersonateAccount({ address: smallDepositor.address });
      const smallDepositorClient = await viem.getWalletClient(
        smallDepositor.address,
      );

      await assert.rejects(
        async () => {
          await contract.write.exchange([blackCheckId], {
            account: smallDepositor.address,
            client: smallDepositorClient,
          });
        },
        (error: Error) => {
          return (
            error.message.includes("InsufficientBalance") ||
            error.message.includes("reverted")
          );
        },
        "Should fail to exchange for black check with only 0.015625 tokens",
      );

      await testClient.stopImpersonatingAccount({
        address: smallDepositor.address,
      });
    });

    it("should create a black check from 64 single checks", async () => {
      // Deposit all 64 single checks
      for (const checkId of SINGLE_CHECKS) {
        const owner = await checksContract.read.ownerOf([checkId]);

        // Fund owner with ETH for gas
        await testClient.setBalance({
          address: owner,
          value: parseEther("10"),
        });

        await testClient.impersonateAccount({ address: owner });
        const ownerClient = await viem.getWalletClient(owner);
        await checksContract.write.safeTransferFrom(
          [owner, contract.address, checkId],
          { account: owner, client: ownerClient },
        );
        await testClient.stopImpersonatingAccount({ address: owner });
      }

      // Verify contract owns all checks
      for (const checkId of SINGLE_CHECKS) {
        const owner = await checksContract.read.ownerOf([checkId]);
        assert.equal(owner, contract.address);
      }

      // Call one to create black check
      const [deployer] = await viem.getWalletClients();
      await contract.write.one([SINGLE_CHECKS], { account: deployer.account });

      // Verify the first check still exists (it becomes the black check)
      const blackCheckOwner = await checksContract.read.ownerOf([
        SINGLE_CHECKS[0],
      ]);
      assert.equal(blackCheckOwner, contract.address);

      // Query and save the black check's tokenURI
      const tokenURI = await checksContract.read.tokenURI([SINGLE_CHECKS[0]]);

      // Parse and save the metadata
      if (tokenURI.startsWith("data:application/json;base64,")) {
        const base64Data = tokenURI.replace(
          "data:application/json;base64,",
          "",
        );
        const jsonString = Buffer.from(base64Data, "base64").toString("utf-8");
        const metadata = JSON.parse(jsonString);

        // Save metadata JSON
        const metadataPath = join(__dirname, "black-check-metadata.json");
        writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

        // Save SVG
        if (
          metadata.image &&
          metadata.image.startsWith("data:image/svg+xml;base64,")
        ) {
          const svgBase64 = metadata.image.replace(
            "data:image/svg+xml;base64,",
            "",
          );
          const svgContent = Buffer.from(svgBase64, "base64").toString("utf-8");
          const svgPath = join(__dirname, "black-check.svg");
          writeFileSync(svgPath, svgContent);
        }

        // Save full tokenURI
        const tokenURIPath = join(__dirname, "black-check-token-uri.txt");
        writeFileSync(tokenURIPath, tokenURI);
      }

      // Verify all others were burned
      for (let i = 1; i < SINGLE_CHECKS.length; i++) {
        await assert.rejects(
          async () => {
            await checksContract.read.ownerOf([SINGLE_CHECKS[i]]);
          },
          (error: Error) => {
            return (
              error.message.includes("ERC721NonexistentToken") ||
              error.message.includes("reverted")
            );
          },
        );
      }
    });

    it("should revert if tokenIds are not in ascending order", async () => {
      const [deployer] = await viem.getWalletClients();

      // Create array with wrong order (swap first two)
      const wrongOrder = [...SINGLE_CHECKS];
      [wrongOrder[0], wrongOrder[1]] = [wrongOrder[1], wrongOrder[0]];

      await assert.rejects(
        async () => {
          await contract.write.one([wrongOrder], { account: deployer.account });
        },
        (error: Error) => {
          return error.message.includes("InvalidOrder");
        },
      );
    });
  });
});
