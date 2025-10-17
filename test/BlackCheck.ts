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

  describe("Withdrawals", () => {
    it("should withdraw a check by burning tokens", async () => {
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

      // Withdraw the check
      await contract.write.withdraw([checkId], {
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

    it("should revert when withdrawing with insufficient tokens", async () => {
      const [deployer] = await viem.getWalletClients();
      const checkId = SINGLE_CHECKS[0];

      // Try to withdraw without having deposited
      await assert.rejects(
        async () => {
          await contract.write.withdraw([checkId], {
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
    it("should prevent black check withdrawal for less than 1.00 $BLKCHK", async () => {
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

      // Try to withdraw the black check - should fail because it costs 1.0 tokens
      await testClient.impersonateAccount({ address: smallDepositor.address });
      const smallDepositorClient = await viem.getWalletClient(
        smallDepositor.address,
      );

      await assert.rejects(
        async () => {
          await contract.write.withdraw([blackCheckId], {
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
        "Should fail to withdraw black check with only 0.015625 tokens",
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
