#!/usr/bin/env node
import path from "node:path";
import { assertFrontendEnvSecurity } from "./env-security.mjs";

try {
  const cwd = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  assertFrontendEnvSecurity({ cwd });
  console.log("Frontend environment security check passed.");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
