import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const vaultFile = resolve(process.cwd(), ".dev.vars");
const existing = existsSync(vaultFile) ? readFileSync(vaultFile, "utf8") : "";

if (/^CANVAS_TOKEN_WRAP_KEY=.+$/m.test(existing)) {
  process.stdout.write("Local encrypted vault is already configured.\n");
  process.exit(0);
}

const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
const key = randomBytes(32).toString("base64url");
writeFileSync(
  vaultFile,
  `${existing}${separator}CANVAS_TOKEN_WRAP_KEY=${key}\n`,
  { encoding: "utf8", mode: 0o600 }
);
process.stdout.write("Local encrypted vault is ready.\n");
