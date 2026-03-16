import { describe, expect, it } from "vitest";

import {
  buildDemoMetadataUri,
  buildDemoTokenSymbol,
  parseBooleanEnv,
  parseFactoryAddressFromDeployOutput,
} from "./demoDeploy.js";

describe("demoDeploy", () => {
  it("builds short deterministic token symbols and event-scoped metadata uris", () => {
    expect(buildDemoTokenSymbol("Beyonce World Tour", "demo-fr-beyonce-20260714-abcd12")).toMatch(
      /^[A-Z0-9]{3,5}$/,
    );
    expect(
      buildDemoMetadataUri("ipfs://chainticket/base", "demo-fr-beyonce-20260714-abcd12", "live"),
    ).toBe("ipfs://chainticket/base/demo-fr-beyonce-20260714-abcd12/live/");
  });

  it("parses booleans and factory addresses from deployment logs", () => {
    expect(parseBooleanEnv("true")).toBe(true);
    expect(parseBooleanEnv("1")).toBe(true);
    expect(parseBooleanEnv("no")).toBe(false);
    expect(
      parseFactoryAddressFromDeployOutput(
        "ChainTicketFactory deployed: 0x0000000000000000000000000000000000000042",
      ),
    ).toBe("0x0000000000000000000000000000000000000042");
    expect(
      parseFactoryAddressFromDeployOutput(
        "Using ChainTicketFactory: 0x00000000000000000000000000000000000000aa",
      ),
    ).toBe("0x00000000000000000000000000000000000000aa");
  });
});
