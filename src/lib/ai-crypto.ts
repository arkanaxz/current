import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function encryptionKey() {
  const secret = process.env.CURRENT_DATA_ENCRYPTION_KEY || process.env.TURSO_AUTH_TOKEN;
  if (!secret) throw new Error("Set CURRENT_DATA_ENCRYPTION_KEY to encrypt the saved AI provider key.");
  return createHash("sha256").update(secret).digest();
}
export function encryptApiKey(value:string) {
  const iv=randomBytes(12), cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv);
  const encrypted=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  return {cipher:encrypted.toString("base64"),iv:iv.toString("base64"),tag:cipher.getAuthTag().toString("base64")};
}
export function decryptApiKey(value:{cipher:string;iv:string;tag:string}) {
  const decipher=createDecipheriv("aes-256-gcm",encryptionKey(),Buffer.from(value.iv,"base64"));
  decipher.setAuthTag(Buffer.from(value.tag,"base64"));
  return Buffer.concat([decipher.update(Buffer.from(value.cipher,"base64")),decipher.final()]).toString("utf8");
}
