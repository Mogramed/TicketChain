import { AbiCoder, Interface, ZeroHash, getAddress, keccak256, toUtf8Bytes } from "ethers";
import { describe, expect, it } from "vitest";

import { buildCollectibleModeGovernancePacket } from "./governance";

const abiCoder = AbiCoder.defaultAbiCoder();
const ticketNftInterface = new Interface(["function setCollectibleMode(bool enabled)"]);

describe("buildCollectibleModeGovernancePacket", () => {
  it("creates a direct multisig packet when no timelock is configured", () => {
    const packet = buildCollectibleModeGovernancePacket({
      desiredCollectibleMode: true,
      eventId: "main-event",
      eventName: "Main Event",
      ticketNftAddress: "0x0000000000000000000000000000000000000011",
      createdAt: "2026-03-14T12:00:00.000Z",
    });

    expect(packet.mode).toBe("multisig");
    expect(packet.timelock).toBeNull();
    expect(packet.instructions).toHaveLength(1);
    expect(packet.instructions[0]?.title).toMatch(/direct admin call/i);
    expect(packet.directCall.target).toBe(
      getAddress("0x0000000000000000000000000000000000000011"),
    );
    expect(packet.directCall.calldata).toBe(
      ticketNftInterface.encodeFunctionData("setCollectibleMode", [true]),
    );
  });

  it("creates deterministic timelock schedule and execute payloads", () => {
    const packet = buildCollectibleModeGovernancePacket({
      desiredCollectibleMode: false,
      eventId: "soir-1",
      eventName: "Soir 1",
      ticketNftAddress: "0x0000000000000000000000000000000000000011",
      timelockAddress: "0x00000000000000000000000000000000000000AA",
      timelockMinDelaySeconds: 3600,
      createdAt: "2026-03-14T15:30:00.000Z",
    });

    const directCalldata = ticketNftInterface.encodeFunctionData("setCollectibleMode", [false]);
    const expectedSalt = keccak256(
      toUtf8Bytes(
        [
          "collectible-mode",
          getAddress("0x0000000000000000000000000000000000000011"),
          "disabled",
          "soir-1",
          "Soir 1",
          getAddress("0x00000000000000000000000000000000000000AA"),
          "2026-03-14T15:30:00.000Z",
        ].join("|"),
      ),
    );
    const expectedOperationId = keccak256(
      abiCoder.encode(
        ["address", "uint256", "bytes", "bytes32", "bytes32"],
        [
          getAddress("0x0000000000000000000000000000000000000011"),
          0n,
          directCalldata,
          ZeroHash,
          expectedSalt,
        ],
      ),
    );

    expect(packet.mode).toBe("timelock");
    expect(packet.instructions.map((step) => step.key)).toEqual(["schedule", "execute"]);
    expect(packet.timelock).not.toBeNull();
    expect(packet.timelock?.salt).toBe(expectedSalt);
    expect(packet.timelock?.operationId).toBe(expectedOperationId);
    expect(packet.timelock?.scheduleCall.target).toBe(
      getAddress("0x00000000000000000000000000000000000000AA"),
    );
    expect(packet.timelock?.executeCall.target).toBe(
      getAddress("0x00000000000000000000000000000000000000AA"),
    );
  });
});
