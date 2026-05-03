import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
function getKey(): Buffer {
  const k = process.env.ENCRYPTION_KEY;
  if (!k || k.length !== 64) throw new Error("ENCRYPTION_KEY must be 64-char hex string");
  return Buffer.from(k, "hex");
}
export function encryptApiKey(plain: string): { claudeApiKeyEncrypted: string; keyIv: string } {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return { claudeApiKeyEncrypted: `${encrypted.toString("hex")}:${cipher.getAuthTag().toString("hex")}`, keyIv: iv.toString("hex") };
}
export function decryptApiKey(encrypted: string, iv: string): string {
  const [ciphertext, authTag] = encrypted.split(":");
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(iv, "hex"), { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "hex")), decipher.final()]).toString("utf8");
}
