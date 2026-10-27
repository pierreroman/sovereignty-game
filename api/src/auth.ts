import { createHmac, pbkdf2, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { HttpRequest } from "@azure/functions";

const SESSION_SECONDS = 8 * 60 * 60;
export const SESSION_COOKIE = "__Host-sovereignty-editor";
const COOKIE_ATTRIBUTES = "Path=/; HttpOnly; Secure; SameSite=Strict";
const HASH_PATTERN = /^scrypt\$32768\$8\$3\$([A-Za-z0-9_-]{43})\$([A-Za-z0-9_-]{86})$/;
const PBKDF2_PATTERN = /^pbkdf2-sha256\$600000\$([A-Za-z0-9_-]{43})\$([A-Za-z0-9_-]{43})$/;

export interface AuthConfig {
  passwordHash: string;
  sessionSecret: Buffer;
}

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 16 || password.length > 256) {
    throw new Error("Use an editor passphrase between 16 and 256 characters.");
  }
  const salt = randomBytes(32);
  const key = await derive(password, salt);
  return `scrypt$32768$8$3$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export function readAuthConfig(): AuthConfig {
  const passwordHash = process.env.EDITOR_PASSWORD_HASH;
  const secret = process.env.EDITOR_SESSION_SECRET;
  if (!passwordHash || (!HASH_PATTERN.test(passwordHash) && !PBKDF2_PATTERN.test(passwordHash)) ||
      !secret || !/^[A-Za-z0-9_-]{43}$/.test(secret)) {
    throw new Error("Editor password authentication is not configured. Run infra\\set-editor-password.ps1.");
  }
  return { passwordHash, sessionSecret: Buffer.from(secret, "base64url") };
}

export async function verifyPassword(password: string, config: AuthConfig): Promise<boolean> {
  const pbkdf2Match = PBKDF2_PATTERN.exec(config.passwordHash);
  if (pbkdf2Match) {
    const key = await new Promise<Buffer>((resolve, reject) => {
      pbkdf2(password, Buffer.from(pbkdf2Match[1], "base64url"), 600000, 32, "sha256", (error, derived) => {
        if (error) reject(error);
        else resolve(derived);
      });
    });
    return timingSafeEqual(key, Buffer.from(pbkdf2Match[2], "base64url"));
  }
  const match = HASH_PATTERN.exec(config.passwordHash);
  if (!match) throw new Error("Invalid editor password hash configuration.");
  const key = await derive(password, Buffer.from(match[1], "base64url"));
  return timingSafeEqual(key, Buffer.from(match[2], "base64url"));
}

function signature(payload: string, config: AuthConfig): string {
  // Binding to the salted password hash invalidates sessions when the password is rotated.
  return createHmac("sha256", config.sessionSecret)
    .update(config.passwordHash).update(":").update(payload).digest("base64url");
}

export function issueSession(config: AuthConfig, now = Date.now()): string {
  const payload = `v1.${Math.floor(now / 1000)}.${randomBytes(16).toString("base64url")}`;
  return `${SESSION_COOKIE}=${payload}.${signature(payload, config)}; ${COOKIE_ATTRIBUTES}; Max-Age=${SESSION_SECONDS}`;
}

export function clearSession(): string {
  return `${SESSION_COOKIE}=; ${COOKIE_ATTRIBUTES}; Max-Age=0`;
}

export function authenticatedEditor(request: HttpRequest, now = Date.now()): boolean {
  const cookies = (request.headers.get("cookie") || "").split(";").map((cookie) => cookie.trim());
  const values = cookies.filter((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
  if (values.length !== 1) return false;
  const token = values[0].slice(SESSION_COOKIE.length + 1);
  const match = /^(v1\.(\d{1,12})\.[A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const config = readAuthConfig();
  const expected = Buffer.from(signature(match[1], config), "base64url");
  const received = Buffer.from(match[3], "base64url");
  if (received.length !== expected.length || !timingSafeEqual(expected, received)) return false;
  const age = Math.floor(now / 1000) - Number(match[2]);
  return age >= 0 && age < SESSION_SECONDS;
}

export function sameOriginJson(request: HttpRequest): boolean {
  // SWA proxies the API URL; compare Fetch Metadata, not frontend/Functions hostnames.
  const site = request.headers.get("sec-fetch-site");
  return (!site || site === "same-origin" || site === "none") &&
    request.headers.get("x-catalogue-request") === "1" &&
    request.headers.get("content-type")?.split(";")[0].trim() === "application/json";
}
