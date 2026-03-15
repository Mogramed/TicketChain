import { z } from "zod";

export const addressParamSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
});

export const tokenIdParamSchema = z.object({
  tokenId: z.string().regex(/^\d+$/, "Invalid tokenId"),
});

export const listingsQuerySchema = z.object({
  eventId: z.string().trim().min(1).optional(),
  sort: z.enum(["price_asc", "price_desc", "recent"]).default("recent"),
  limit: z.coerce.number().int().min(1).max(250).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const eventQuerySchema = z.object({
  eventId: z.string().trim().min(1).optional(),
});
