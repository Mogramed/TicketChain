import { describe, expect, it } from "vitest";

import { addressParamSchema, listingsQuerySchema, tokenIdParamSchema } from "./validators.js";

describe("bff validators", () => {
  it("accepts valid listing query and applies defaults", () => {
    const parsed = listingsQuerySchema.parse({});
    expect(parsed.sort).toBe("recent");
    expect(parsed.limit).toBe(100);
    expect(parsed.offset).toBe(0);
  });

  it("rejects invalid address parameter", () => {
    expect(() => addressParamSchema.parse({ address: "invalid" })).toThrow();
  });

  it("accepts token id path parameter", () => {
    const parsed = tokenIdParamSchema.parse({ tokenId: "123" });
    expect(parsed.tokenId).toBe("123");
  });
});
