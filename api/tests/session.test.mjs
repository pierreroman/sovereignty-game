import assert from "node:assert/strict";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { test } from "node:test";
import functions from "@azure/functions";
import { authenticatedEditor, hashPassword, issueSession, readAuthConfig, verifyPassword } from "../dist/api/src/auth.js";
import { createSessionHandler } from "../dist/api/src/session.js";

const password = "test-only shared editor passphrase";
const hash = await hashPassword(password);
const secret = randomBytes(32).toString("base64url");
process.env.EDITOR_PASSWORD_HASH = hash;
process.env.EDITOR_SESSION_SECRET = secret;
const config = readAuthConfig();
const { HttpRequest } = functions;
const context = { error() {} };
function request({ method = "POST", headers = {}, body = JSON.stringify({ password }) } = {}) {
  return new HttpRequest({
    method, url: "https://game.example/api/session",
    headers: { "Content-Type": "application/json", "X-Catalogue-Request": "1", ...headers },
    ...(method === "GET" ? {} : { body: { string: body } }),
  });
}
const handler = createSessionHandler({ async consume() { return 0; } });

test("scrypt uses random salts, verifies exact passwords, and rejects weak setup passwords", async () => {
  assert.match(hash, /^scrypt\$32768\$8\$3\$/);
  assert.notEqual(await hashPassword(password), hash);
  assert.equal(await verifyPassword(password, config), true);
  assert.equal(await verifyPassword(`${password} `, config), false);
  await assert.rejects(() => hashPassword("short"), /16 and 256/);
  await assert.rejects(() => hashPassword("x".repeat(257)), /16 and 256/);
});

test("native PowerShell PBKDF2 hash format authenticates without changing legacy scrypt support", async () => {
  const nativePassword = "native-test passphrase with \u00e9";
  const salt = randomBytes(32);
  const key = pbkdf2Sync(nativePassword, salt, 600000, 32, "sha256");
  const nativeHash = `pbkdf2-sha256$600000$${salt.toString("base64url")}$${key.toString("base64url")}`;
  try {
    process.env.EDITOR_PASSWORD_HASH = nativeHash;
    const nativeConfig = readAuthConfig();
    assert.equal(await verifyPassword(nativePassword, nativeConfig), true);
    assert.equal(await verifyPassword(`${nativePassword} `, nativeConfig), false);
    const login = await handler(request({ body: JSON.stringify({ password: nativePassword }) }), context);
    assert.equal(login.status, 200);
    assert.equal(authenticatedEditor(request({ headers: { cookie: login.headers["Set-Cookie"].split(";")[0] } })), true);
    for (const invalid of [nativeHash.replace("$600000$", "$1000$"), nativeHash.slice(0, -1)]) {
      process.env.EDITOR_PASSWORD_HASH = invalid;
      assert.throws(() => readAuthConfig(), /not configured/);
    }
  } finally {
    process.env.EDITOR_PASSWORD_HASH = hash;
  }
  assert.equal(await verifyPassword(password, readAuthConfig()), true);
});

test("correct login establishes a secure HTTP-only session; GET checks it without leaking credentials", async () => {
  const login = await handler(request(), context);
  assert.equal(login.status, 200);
  assert.deepEqual(login.jsonBody, { authenticated: true });
  const cookie = login.headers["Set-Cookie"];
  for (const attribute of ["__Host-sovereignty-editor=", "HttpOnly", "Secure", "SameSite=Strict", "Path=/", "Max-Age=28800"]) {
    assert.ok(cookie.includes(attribute));
  }
  assert.ok(!JSON.stringify(login).includes(password));
  assert.ok(!JSON.stringify(login).includes(hash));
  assert.ok(!JSON.stringify(login).includes(secret));
  const session = await handler(request({ method: "GET", headers: { cookie: cookie.split(";")[0] } }), context);
  assert.deepEqual(session.jsonBody, { authenticated: true });
  assert.equal(session.headers["Cache-Control"], "no-store");
  assert.deepEqual((await handler(request({ method: "GET" }), context)).jsonBody, { authenticated: false });
});

test("incorrect password is rejected without issuing a cookie", async () => {
  const result = await handler(request({ body: JSON.stringify({ password: "incorrect" }) }), context);
  assert.equal(result.status, 401);
  assert.equal(result.headers["Set-Cookie"], undefined);
});

test("tampered, expired, future and duplicate cookies are rejected", () => {
  const now = Date.now();
  const token = issueSession(config, now).split(";")[0];
  assert.equal(authenticatedEditor(request({ headers: { cookie: token } }), now), true);
  assert.equal(authenticatedEditor(request({ headers: { cookie: `${token}; ${token}` } }), now), false);
  assert.equal(authenticatedEditor(request({ headers: { cookie: token } }), now + 28800000), false);
  assert.equal(authenticatedEditor(request({ headers: { cookie: token } }), now - 1000), false);
  const parts = token.split(".");
  parts[1] = String(Math.floor(now / 1000) + 60);
  assert.equal(authenticatedEditor(request({ headers: { cookie: parts.join(".") } }), now), false);
});

test("rotating either the password hash or signing key invalidates existing sessions", async () => {
  const cookie = issueSession(config).split(";")[0];
  try {
    process.env.EDITOR_PASSWORD_HASH = await hashPassword(password);
    assert.equal(authenticatedEditor(request({ headers: { cookie } })), false);
    process.env.EDITOR_PASSWORD_HASH = hash;
    process.env.EDITOR_SESSION_SECRET = randomBytes(32).toString("base64url");
    assert.equal(authenticatedEditor(request({ headers: { cookie } })), false);
  } finally {
    process.env.EDITOR_PASSWORD_HASH = hash;
    process.env.EDITOR_SESSION_SECRET = secret;
  }
});

test("logout clears the session with the same secure cookie scope", async () => {
  const result = await handler(request({ method: "DELETE", body: "{}" }), context);
  assert.equal(result.status, 200);
  assert.deepEqual(result.jsonBody, { authenticated: false });
  assert.match(result.headers["Set-Cookie"], /__Host-sovereignty-editor=; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=0/);
});

test("login and logout reject cross-origin and non-JSON requests", async () => {
  for (const method of ["POST", "DELETE"]) {
    for (const headers of [{ "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" },
      { "Content-Type": "text/plain" }, { "X-Catalogue-Request": "" }]) {
      assert.equal((await handler(request({ method, headers }), context)).status, 403);
    }
  }
});

test("invalid inputs do not consume expensive password attempts", async () => {
  let attempts = 0;
  const limited = createSessionHandler({ async consume() { attempts++; return 0; } });
  for (const body of ["{", "null", "{}", JSON.stringify({ password: "" }), JSON.stringify({ password: "x".repeat(257) })]) {
    assert.equal((await limited(request({ body }), context)).status, 400);
  }
  assert.equal((await limited(request({ body: " ".repeat(4097) }), context)).status, 413);
  assert.equal(attempts, 0);
  assert.equal((await handler(request({ method: "PUT" }), context)).status, 405);
});

test("login throttling returns Retry-After and never issues a session", async () => {
  const limited = createSessionHandler({ async consume() { return 300; } });
  const result = await limited(request(), context);
  assert.equal(result.status, 429);
  assert.equal(result.headers["Retry-After"], "300");
  assert.equal(result.headers["Set-Cookie"], undefined);
});

test("missing/malformed configuration and throttle storage errors fail closed without leaking secrets", async () => {
  const logs = [];
  const logging = { error: (...args) => logs.push(args) };
  try {
    delete process.env.EDITOR_PASSWORD_HASH;
    assert.equal((await handler(request(), logging)).status, 503);
    assert.equal((await handler(request({ method: "GET" }), logging)).status, 503);
    process.env.EDITOR_PASSWORD_HASH = "invalid";
    assert.equal((await handler(request(), logging)).status, 503);
  } finally {
    process.env.EDITOR_PASSWORD_HASH = hash;
  }
  const broken = createSessionHandler({ async consume() { throw new Error("storage unavailable"); } });
  assert.equal((await broken(request(), logging)).status, 503);
  assert.ok(!JSON.stringify(logs).includes(password));
  assert.ok(!JSON.stringify(logs).includes(hash));
  assert.ok(!JSON.stringify(logs).includes(secret));
});
