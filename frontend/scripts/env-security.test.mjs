import { describe, expect, it } from "vitest";

import { findSensitiveNonViteKeys, validateFrontendEnvSecurity, __private } from "./env-security.mjs";

describe("env security helpers", () => {
  it("finds sensitive non-VITE keys", () => {
    const keys = [
      "VITE_TICKET_NFT_ADDRESS",
      "PRIVATE_KEY",
      "API_KEY",
      "NORMAL_LABEL",
    ];

    expect(findSensitiveNonViteKeys(keys)).toEqual(["PRIVATE_KEY", "API_KEY"]);
  });

  it("does not flag safe non-sensitive keys", () => {
    const keys = ["VITE_MARKETPLACE_ADDRESS", "EVENT_NAME", "CHAIN_LABEL"];
    expect(findSensitiveNonViteKeys(keys)).toEqual([]);
  });

  it("parses env keys from file content", () => {
    const parsed = __private.parseEnvKeys(
      "# comment\nPRIVATE_KEY=abc\nVITE_X=1\nINVALID\nEMPTY=\n",
    );

    expect(parsed).toEqual(["PRIVATE_KEY", "VITE_X", "EMPTY"]);
  });

  it("returns ok when env file is missing", () => {
    const result = validateFrontendEnvSecurity({ envPath: "./__missing__.env" });
    expect(result.ok).toBe(true);
  });
});
