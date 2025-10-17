import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { network } from "hardhat";
import BlackCheckModule from "../ignition/modules/BlackCheck.js";

describe("Black Check", async function () {
  const { viem, ignition } = await network.connect();

  let contract: Awaited<ReturnType<typeof viem.getContractAt<"BlackCheck">>>;

  beforeEach(async () => {
    // Deploy the BlackCheck contract using Ignition
    const { blackCheck } = await ignition.deploy(BlackCheckModule);

    // Get a viem contract instance for easier interaction
    contract = await viem.getContractAt("BlackCheck", blackCheck.address);
  });

  it("should return the correct token name", async () => {
    const name = await contract.read.name();

    assert.equal(name, "Black Check");
  });

  it("should return the correct token symbol", async () => {
    const symbol = await contract.read.symbol();

    assert.equal(symbol, "$BLKCHK");
  });
});
