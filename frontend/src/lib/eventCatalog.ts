import { Contract, JsonRpcProvider } from "ethers";

import type { ContractConfig, EventDeployment } from "../types/chainticket";
import { CHAIN_TICKET_FACTORY_ABI } from "./abi";

export function getFallbackEventDeployment(config: ContractConfig): EventDeployment {
  return {
    ticketEventId: config.eventId ?? "main-event",
    name: config.eventName ?? "Main Event",
    symbol: "CTK",
    primaryPriceWei: "0",
    maxSupply: "0",
    treasury: "",
    admin: "",
    ticketNftAddress: config.ticketNftAddress,
    marketplaceAddress: config.marketplaceAddress,
    checkInRegistryAddress: config.checkInRegistryAddress,
    deploymentBlock: config.deploymentBlock,
    registeredAt: 0,
  };
}

function parseFactoryDeployment(raw: unknown): EventDeployment {
  const value = raw as {
    eventId?: unknown;
    name?: unknown;
    symbol?: unknown;
    primaryPrice?: unknown;
    maxSupply?: unknown;
    treasury?: unknown;
    admin?: unknown;
    ticketNFT?: unknown;
    marketplace?: unknown;
    checkInRegistry?: unknown;
    deploymentBlock?: unknown;
    registeredAt?: unknown;
  } & unknown[];

  return {
    ticketEventId: String(value.eventId ?? value[0] ?? ""),
    name: String(value.name ?? value[1] ?? ""),
    symbol: String(value.symbol ?? value[2] ?? ""),
    primaryPriceWei: String(value.primaryPrice ?? value[3] ?? "0"),
    maxSupply: String(value.maxSupply ?? value[4] ?? "0"),
    treasury: String(value.treasury ?? value[5] ?? ""),
    admin: String(value.admin ?? value[6] ?? ""),
    ticketNftAddress: String(value.ticketNFT ?? value[7] ?? ""),
    marketplaceAddress: String(value.marketplace ?? value[8] ?? ""),
    checkInRegistryAddress: String(value.checkInRegistry ?? value[9] ?? ""),
    deploymentBlock: Number(value.deploymentBlock ?? value[10] ?? 0),
    registeredAt: Number(value.registeredAt ?? value[11] ?? 0),
  };
}

export async function discoverFactoryEvents(
  contractConfig: ContractConfig,
  factoryAddress: string,
): Promise<EventDeployment[]> {
  const provider = new JsonRpcProvider(contractConfig.rpcUrl, contractConfig.chainId);
  const factory = new Contract(factoryAddress, CHAIN_TICKET_FACTORY_ABI, provider);
  const totalEvents = Number(await factory.totalEvents());

  if (totalEvents === 0) {
    return [];
  }

  const rawDeployments = await Promise.all(
    Array.from({ length: totalEvents }, async (_value, index) => factory.getEventAt(index)),
  );

  return rawDeployments.map((raw) => parseFactoryDeployment(raw));
}
