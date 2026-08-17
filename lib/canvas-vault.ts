import { getAppEnv } from "../db";

const textEncoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function importVaultKey() {
  const encoded = getAppEnv().CANVAS_TOKEN_WRAP_KEY;
  if (!encoded) {
    throw new Error(
      "The secure token vault is not configured."
    );
  }

  const raw = base64UrlToBytes(encoded.trim());
  if (raw.byteLength !== 32) {
    throw new Error("The secure token vault key is invalid.");
  }

  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptCanvasToken(token: string) {
  const key = await importVaultKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    textEncoder.encode(token)
  );

  return {
    ciphertext: bytesToBase64Url(new Uint8Array(encrypted)),
    iv: bytesToBase64Url(iv),
  };
}

export async function decryptCanvasToken(ciphertext: string, encodedIv: string) {
  const key = await importVaultKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(encodedIv) },
    key,
    base64UrlToBytes(ciphertext)
  );
  return new TextDecoder().decode(decrypted);
}
