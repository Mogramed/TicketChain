import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";

beforeEach(() => {
  window.localStorage.setItem("chainticket.onboarding-seen", "true");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const tokenMatch = url.match(/\/(\d+)\.json/i);
      const tokenId = tokenMatch?.[1] ?? "0";

      return new Response(
        JSON.stringify({
          name: `ChainTicket Pass #${tokenId}`,
          description: `Metadata fixture for token ${tokenId}.`,
          image: `https://images.example/${tokenId}.png`,
          attributes: [
            { trait_type: "Section", value: "Collector" },
            { trait_type: "Entry", value: "Mobile" },
          ],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }),
  );
});

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});
