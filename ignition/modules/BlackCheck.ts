import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("BlackCheckModule", (m) => {
  const blackCheck = m.contract("BlackCheck");

  return { blackCheck };
});
