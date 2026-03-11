import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
// @ts-expect-error local JS utility used by tooling guard.
import { assertFrontendEnvSecurity } from "./scripts/env-security.mjs";

assertFrontendEnvSecurity();

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-ethers": ["ethers"],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    globals: true,
  },
});
