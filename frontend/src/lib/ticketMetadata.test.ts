import { describe, expect, it } from "vitest";

import {
  buildTokenUriFromBase,
  parseTicketMetadata,
  resolveGatewayUrl,
} from "./ticketMetadata";

describe("ticketMetadata", () => {
  it("resolves ipfs metadata and media urls through the gateway", () => {
    expect(
      resolveGatewayUrl(
        "ipfs://bafybeif6v2g5w5zq3jgn5qv2gpyf7xk3gk4hmj6k2pw6ajf7h32g2a2rty/test.json",
      ),
    ).toBe(
      "https://ipfs.io/ipfs/bafybeif6v2g5w5zq3jgn5qv2gpyf7xk3gk4hmj6k2pw6ajf7h32g2a2rty/test.json",
    );
    expect(resolveGatewayUrl("https://example.com/asset.png")).toBe(
      "https://example.com/asset.png",
    );
  });

  it("ignores placeholder ipfs roots that are not valid CIDs", () => {
    expect(resolveGatewayUrl("ipfs://chainticket/base/1.json")).toBeNull();
  });

  it("builds collectible preview token URIs from base URIs", () => {
    expect(buildTokenUriFromBase("ipfs://ticket/collectible/", 12n)).toBe(
      "ipfs://ticket/collectible/12.json",
    );
  });

  it("parses standard NFT metadata fields and traits", () => {
    const metadata = parseTicketMetadata(
      {
        name: "VIP Pass",
        description: "Front-row mobile entry",
        image: "ipfs://bafy/image.png",
        animation_url: "https://example.com/reveal.mp4",
        attributes: [
          { trait_type: "Seat", value: "A-12" },
          { trait_type: "Tier", value: "VIP", display_type: "string" },
        ],
      },
      "ipfs://ticket/base/1.json",
    );

    expect(metadata.name).toBe("VIP Pass");
    expect(metadata.image).toBe("https://ipfs.io/ipfs/bafy/image.png");
    expect(metadata.animationUrl).toBe("https://example.com/reveal.mp4");
    expect(metadata.attributes).toEqual([
      { traitType: "Seat", value: "A-12" },
      { traitType: "Tier", value: "VIP", displayType: "string" },
    ]);
  });
});
