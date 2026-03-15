import { getAddress, id, type TransactionResponse } from "ethers";

import type { TxResponseLike } from "../../types/chainticket";
import type {
  BaseLogEvent,
  CancelledEvent,
  CollectibleModeEvent,
  ListedEvent,
  ListingValue,
  SoldEvent,
  TransferEvent,
  UsedEvent,
} from "./internalTypes";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const DEFAULT_ADMIN_ROLE = `0x${"0".repeat(64)}`;
export const PAUSER_ROLE = id("PAUSER_ROLE");
export const SCANNER_ADMIN_ROLE = id("SCANNER_ADMIN_ROLE");
export const SCANNER_ROLE = id("SCANNER_ROLE");

export function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number") {
    return BigInt(value);
  }

  if (typeof value === "string") {
    return BigInt(value);
  }

  if (value && typeof value === "object" && "toString" in value) {
    return BigInt((value as { toString: () => string }).toString());
  }

  return 0n;
}

export function sameAddress(first: string, second: string): boolean {
  return first.toLowerCase() === second.toLowerCase();
}

export function normalizeAddress(value: string): string {
  try {
    return getAddress(value);
  } catch {
    return value;
  }
}

export function toTxResponse(response: TransactionResponse): TxResponseLike {
  return {
    hash: response.hash,
    wait: async () => {
      await response.wait();
    },
  };
}

export function sortByBlockAndLog<T extends { blockNumber: number; logIndex: number }>(events: T[]): T[] {
  return [...events].sort((left, right) => {
    if (left.blockNumber !== right.blockNumber) {
      return left.blockNumber - right.blockNumber;
    }
    return left.logIndex - right.logIndex;
  });
}

export function parseListing(raw: unknown): ListingValue {
  if (Array.isArray(raw)) {
    return {
      seller: String(raw[0] ?? ZERO_ADDRESS),
      price: toBigInt(raw[1] ?? 0n),
    };
  }

  const value = raw as { seller?: unknown; price?: unknown };
  return {
    seller: String(value?.seller ?? ZERO_ADDRESS),
    price: toBigInt(value?.price ?? 0n),
  };
}

function parseTokenLog(raw: unknown): BaseLogEvent {
  const value = raw as {
    args?: { tokenId?: unknown } | unknown[];
    blockNumber?: number;
    index?: number;
    logIndex?: number;
    transactionHash?: string;
  };

  const args = value.args;
  const tokenId = Array.isArray(args)
    ? toBigInt(args[0] ?? 0n)
    : toBigInt((args as { tokenId?: unknown } | undefined)?.tokenId ?? 0n);

  return {
    tokenId,
    blockNumber: Number(value.blockNumber ?? 0),
    logIndex: Number(value.index ?? value.logIndex ?? 0),
    txHash: String(value.transactionHash ?? ""),
  };
}

export function parseTransferLog(raw: unknown): TransferEvent {
  const value = raw as {
    args?: { from?: unknown; to?: unknown; tokenId?: unknown } | unknown[];
    blockNumber?: number;
    index?: number;
    logIndex?: number;
    transactionHash?: string;
  };

  const args = value.args;
  const isArray = Array.isArray(args);
  const from = isArray
    ? String(args[0] ?? ZERO_ADDRESS)
    : String((args as { from?: unknown } | undefined)?.from ?? ZERO_ADDRESS);
  const to = isArray
    ? String(args[1] ?? ZERO_ADDRESS)
    : String((args as { to?: unknown } | undefined)?.to ?? ZERO_ADDRESS);
  const token = isArray ? args[2] : (args as { tokenId?: unknown } | undefined)?.tokenId;

  return {
    from,
    to,
    tokenId: toBigInt(token ?? 0n),
    blockNumber: Number(value.blockNumber ?? 0),
    logIndex: Number(value.index ?? value.logIndex ?? 0),
    txHash: String(value.transactionHash ?? ""),
  };
}

export function parseListedLog(raw: unknown): ListedEvent {
  const base = parseTokenLog(raw);
  const value = raw as {
    args?: { seller?: unknown; price?: unknown } | unknown[];
  };

  const args = value.args;
  const seller = Array.isArray(args)
    ? String(args[1] ?? ZERO_ADDRESS)
    : String((args as { seller?: unknown } | undefined)?.seller ?? ZERO_ADDRESS);
  const price = Array.isArray(args)
    ? toBigInt(args[2] ?? 0n)
    : toBigInt((args as { price?: unknown } | undefined)?.price ?? 0n);

  return {
    ...base,
    seller,
    price,
  };
}

export function parseCancelledLog(raw: unknown): CancelledEvent {
  const base = parseTokenLog(raw);
  const value = raw as {
    args?: { actor?: unknown } | unknown[];
  };

  const actor = Array.isArray(value.args)
    ? String(value.args[1] ?? ZERO_ADDRESS)
    : String((value.args as { actor?: unknown } | undefined)?.actor ?? ZERO_ADDRESS);

  return {
    ...base,
    actor,
  };
}

export function parseSoldLog(raw: unknown): SoldEvent {
  const base = parseTokenLog(raw);
  const value = raw as {
    args?: {
      seller?: unknown;
      buyer?: unknown;
      price?: unknown;
      feeAmount?: unknown;
    } | unknown[];
  };

  const args = value.args;
  if (Array.isArray(args)) {
    return {
      ...base,
      seller: String(args[1] ?? ZERO_ADDRESS),
      buyer: String(args[2] ?? ZERO_ADDRESS),
      price: toBigInt(args[3] ?? 0n),
      feeAmount: toBigInt(args[4] ?? 0n),
    };
  }

  return {
    ...base,
    seller: String((args as { seller?: unknown } | undefined)?.seller ?? ZERO_ADDRESS),
    buyer: String((args as { buyer?: unknown } | undefined)?.buyer ?? ZERO_ADDRESS),
    price: toBigInt((args as { price?: unknown } | undefined)?.price ?? 0n),
    feeAmount: toBigInt((args as { feeAmount?: unknown } | undefined)?.feeAmount ?? 0n),
  };
}

export function parseUsedLog(raw: unknown): UsedEvent {
  const base = parseTokenLog(raw);
  const value = raw as {
    args?: { scanner?: unknown } | unknown[];
  };

  const scanner = Array.isArray(value.args)
    ? String(value.args[1] ?? ZERO_ADDRESS)
    : String((value.args as { scanner?: unknown } | undefined)?.scanner ?? ZERO_ADDRESS);

  return {
    ...base,
    scanner,
  };
}

export function parseCollectibleLog(raw: unknown): CollectibleModeEvent {
  const value = raw as {
    args?: { enabled?: unknown } | unknown[];
    blockNumber?: number;
    index?: number;
    logIndex?: number;
    transactionHash?: string;
  };

  const enabled = Array.isArray(value.args)
    ? Boolean(value.args[0])
    : Boolean((value.args as { enabled?: unknown } | undefined)?.enabled);

  return {
    enabled,
    blockNumber: Number(value.blockNumber ?? 0),
    logIndex: Number(value.index ?? value.logIndex ?? 0),
    txHash: String(value.transactionHash ?? ""),
  };
}

export function getLogEventFromArgs(args: unknown[]): unknown {
  return args[args.length - 1];
}
