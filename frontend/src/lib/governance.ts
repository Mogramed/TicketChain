import { AbiCoder, Interface, ZeroHash, getAddress, keccak256, toUtf8Bytes } from "ethers";

export interface GovernanceCallPayload {
  signature: string;
  target: string;
  valueWei: string;
  calldata: string;
}

export interface GovernanceInstruction {
  key: "direct" | "schedule" | "execute";
  title: string;
  summary: string;
  call: GovernanceCallPayload;
}

export interface GovernancePacket {
  mode: "multisig" | "timelock";
  actionLabel: string;
  description: string;
  ticketEventId?: string;
  eventName?: string;
  createdAt: string;
  desiredCollectibleMode: boolean;
  directCall: GovernanceCallPayload;
  instructions: GovernanceInstruction[];
  timelock: {
    address: string;
    minDelaySeconds: number;
    predecessor: string;
    salt: string;
    operationId: string;
    scheduleCall: GovernanceCallPayload;
    executeCall: GovernanceCallPayload;
  } | null;
}

const ticketNftInterface = new Interface(["function setCollectibleMode(bool enabled)"]);
const timelockControllerInterface = new Interface([
  "function schedule(address target,uint256 value,bytes data,bytes32 predecessor,bytes32 salt,uint256 delay)",
  "function execute(address target,uint256 value,bytes data,bytes32 predecessor,bytes32 salt)",
]);
const abiCoder = AbiCoder.defaultAbiCoder();
const ZERO_VALUE_WEI = "0";

function createGovernanceSalt({
  createdAt,
  desiredCollectibleMode,
  eventId,
  eventName,
  timelockAddress,
  ticketNftAddress,
}: {
  createdAt: string;
  desiredCollectibleMode: boolean;
  eventId?: string;
  eventName?: string;
  timelockAddress: string;
  ticketNftAddress: string;
}): string {
  return keccak256(
    toUtf8Bytes(
      [
        "collectible-mode",
        ticketNftAddress,
        desiredCollectibleMode ? "enabled" : "disabled",
        eventId ?? "",
        eventName ?? "",
        timelockAddress,
        createdAt,
      ].join("|"),
    ),
  );
}

function createOperationId(
  target: string,
  valueWei: bigint,
  calldata: string,
  predecessor: string,
  salt: string,
): string {
  return keccak256(
    abiCoder.encode(
      ["address", "uint256", "bytes", "bytes32", "bytes32"],
      [target, valueWei, calldata, predecessor, salt],
    ),
  );
}

export function buildCollectibleModeGovernancePacket({
  desiredCollectibleMode,
  eventId,
  eventName,
  ticketNftAddress,
  timelockAddress,
  timelockMinDelaySeconds = 0,
  createdAt = new Date().toISOString(),
}: {
  desiredCollectibleMode: boolean;
  eventId?: string;
  eventName?: string;
  ticketNftAddress: string;
  timelockAddress?: string | null;
  timelockMinDelaySeconds?: number;
  createdAt?: string;
}): GovernancePacket {
  const normalizedTarget = getAddress(ticketNftAddress);
  const directCalldata = ticketNftInterface.encodeFunctionData("setCollectibleMode", [
    desiredCollectibleMode,
  ]);
  const directCall: GovernanceCallPayload = {
    signature: "setCollectibleMode(bool)",
    target: normalizedTarget,
    valueWei: ZERO_VALUE_WEI,
    calldata: directCalldata,
  };
  const actionLabel = desiredCollectibleMode
    ? "Enable collectible mode"
    : "Disable collectible mode";
  const description = desiredCollectibleMode
    ? "Switch TicketNFT metadata into post-event collectible mode."
    : "Restore live-event TicketNFT metadata mode.";

  if (!timelockAddress) {
    return {
      mode: "multisig",
      actionLabel,
      description,
      ticketEventId: eventId,
      eventName,
      createdAt,
      desiredCollectibleMode,
      directCall,
      instructions: [
        {
          key: "direct",
          title: "Submit direct admin call",
          summary:
            "Send the TicketNFT calldata through the governance multisig or other wallet flow that holds DEFAULT_ADMIN_ROLE.",
          call: directCall,
        },
      ],
      timelock: null,
    };
  }

  const normalizedTimelock = getAddress(timelockAddress);
  const predecessor = ZeroHash;
  const salt = createGovernanceSalt({
    createdAt,
    desiredCollectibleMode,
    eventId,
    eventName,
    timelockAddress: normalizedTimelock,
    ticketNftAddress: normalizedTarget,
  });
  const operationId = createOperationId(
    normalizedTarget,
    0n,
    directCalldata,
    predecessor,
    salt,
  );
  const scheduleCalldata = timelockControllerInterface.encodeFunctionData("schedule", [
    normalizedTarget,
    0n,
    directCalldata,
    predecessor,
    salt,
    BigInt(Math.max(0, timelockMinDelaySeconds)),
  ]);
  const executeCalldata = timelockControllerInterface.encodeFunctionData("execute", [
    normalizedTarget,
    0n,
    directCalldata,
    predecessor,
    salt,
  ]);
  const scheduleCall: GovernanceCallPayload = {
    signature:
      "schedule(address,uint256,bytes,bytes32,bytes32,uint256)",
    target: normalizedTimelock,
    valueWei: ZERO_VALUE_WEI,
    calldata: scheduleCalldata,
  };
  const executeCall: GovernanceCallPayload = {
    signature: "execute(address,uint256,bytes,bytes32,bytes32)",
    target: normalizedTimelock,
    valueWei: ZERO_VALUE_WEI,
    calldata: executeCalldata,
  };

  return {
    mode: "timelock",
    actionLabel,
    description,
    ticketEventId: eventId,
    eventName,
    createdAt,
    desiredCollectibleMode,
    directCall,
    instructions: [
      {
        key: "schedule",
        title: "Schedule in TimelockController",
        summary: `Queue the TicketNFT call in the timelock with a minimum delay of ${Math.max(0, timelockMinDelaySeconds)} seconds.`,
        call: scheduleCall,
      },
      {
        key: "execute",
        title: "Execute after delay",
        summary:
          "After the delay has elapsed, execute the queued operation from TimelockController using the same salt and predecessor.",
        call: executeCall,
      },
    ],
    timelock: {
      address: normalizedTimelock,
      minDelaySeconds: Math.max(0, timelockMinDelaySeconds),
      predecessor,
      salt,
      operationId,
      scheduleCall,
      executeCall,
    },
  };
}
