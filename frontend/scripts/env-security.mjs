import fs from "node:fs";
import path from "node:path";

const DEFAULT_SENSITIVE_PATTERNS = [
  /private[_-]?key/i,
  /mnemonic/i,
  /secret/i,
  /password/i,
  /passphrase/i,
  /api[_-]?key/i,
  /token/i,
  /client[_-]?secret/i,
  /auth/i,
  /seed/i,
];

function parseEnvKeys(contents) {
  const keys = [];

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (key) {
      keys.push(key);
    }
  }

  return keys;
}

function isSensitiveKey(key, sensitivePatterns = DEFAULT_SENSITIVE_PATTERNS) {
  return sensitivePatterns.some((pattern) => pattern.test(key));
}

export function findSensitiveNonViteKeys(keys, sensitivePatterns = DEFAULT_SENSITIVE_PATTERNS) {
  return keys.filter((key) => !key.startsWith("VITE_") && isSensitiveKey(key, sensitivePatterns));
}

export function validateFrontendEnvSecurity(options = {}) {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const envPath = options.envPath ? path.resolve(options.envPath) : path.join(cwd, ".env");

  if (!fs.existsSync(envPath)) {
    return {
      ok: true,
      envPath,
      keys: [],
      blockedKeys: [],
      issues: [],
    };
  }

  const contents = fs.readFileSync(envPath, "utf8");
  const keys = parseEnvKeys(contents);
  const blockedKeys = findSensitiveNonViteKeys(keys);

  const issues = blockedKeys.map(
    (key) =>
      `Sensitive key \"${key}\" found in frontend/.env. Move it to root .env and use only VITE_* variables in frontend/.env.`,
  );

  return {
    ok: issues.length === 0,
    envPath,
    keys,
    blockedKeys,
    issues,
  };
}

export function assertFrontendEnvSecurity(options = {}) {
  const result = validateFrontendEnvSecurity(options);

  if (!result.ok) {
    const message = [
      `Frontend environment security check failed for ${result.envPath}`,
      ...result.issues.map((issue) => `- ${issue}`),
    ].join("\n");

    const error = new Error(message);
    Object.assign(error, { code: "FRONTEND_ENV_SECURITY_ERROR", result });
    throw error;
  }

  return result;
}

export const __private = {
  parseEnvKeys,
  isSensitiveKey,
  DEFAULT_SENSITIVE_PATTERNS,
};
