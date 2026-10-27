import "server-only";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createSessionRecord, removeSession, sessionUser, type AppUser } from "./db";

export const SESSION_COOKIE = "current_session";
const SESSION_MS = 14 * 24 * 60 * 60 * 1000;

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  return { salt, hash: scryptSync(password, salt, 64).toString("hex") };
}

export function verifyPassword(password: string, salt: string, storedHash: string) {
  const candidate = Buffer.from(hashPassword(password, salt).hash, "hex");
  const expected = Buffer.from(storedHash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function tokenDigest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function startSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + SESSION_MS;
  await createSessionRecord(userId, tokenDigest(token), expiresAt);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await removeSession(tokenDigest(token));
  store.delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<AppUser | undefined> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return token ? await sessionUser(tokenDigest(token)) : undefined;
}

export function validUsername(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_.-]{3,32}$/.test(value.trim());
}

export function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 10 && value.length <= 200;
}



