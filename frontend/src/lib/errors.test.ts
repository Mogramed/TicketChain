import { describe, expect, it } from "vitest";

import { mapEthersError } from "./errors";

describe("mapEthersError", () => {
  it("prefers shortMessage and removes revert prefix", () => {
    const message = mapEthersError({
      shortMessage: "execution reverted: Wallet ticket limit reached",
      message: "fallback message",
    });

    expect(message).toBe("Wallet ticket limit reached");
  });

  it("falls back to nested info error message", () => {
    const message = mapEthersError({
      info: {
        error: {
          message: "execution reverted: Incorrect payment amount",
        },
      },
    });

    expect(message).toBe("Incorrect payment amount");
  });

  it("returns a safe generic message when input is unknown", () => {
    expect(mapEthersError(undefined)).toBe("Unknown error.");
  });
});
