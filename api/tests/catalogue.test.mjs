import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import functions from "@azure/functions";
import { validateCatalogue } from "../dist/src/game/catalogue.js";
import { MYTHS } from "../dist/src/game/myths.js";
import { pinnedMyth, randomMyth } from "../dist/src/game/pick.js";
import { CatalogueConflict, createCatalogueHandler } from "../dist/api/src/handler.js";
import { createBlobStore } from "../dist/api/src/store.js";

const principal = (patch = {}) => Buffer.from(JSON.stringify({
  identityProvider: "aad", userId: "tenant-user", userRoles: ["anonymous", "authenticated"], ...patch,
})).toString("base64");
const { HttpRequest } = functions;
const context = { error() {} };
function request({ method = "PUT", headers = {}, body = JSON.stringify(MYTHS) } = {}) {
  return new HttpRequest({
    method, url: "https://game.example/api/myths",
    headers: {
      "x-ms-client-principal": principal(), "content-type": "application/json",
      "x-catalogue-request": "1", "if-match": "seed", ...headers,
    },
    ...(method === "GET" ? {} : { body: { string: body } }),
  });
}
function fixture() {
  let state = { myths: MYTHS, version: "seed" };
  let writes = 0;
  const store = {
    async read() { return state; },
    async write(myths, version) {
      if (version !== state.version) throw new CatalogueConflict();
      state = { myths, version: `"${++writes}"` };
      return state;
    },
  };
  return { handler: createCatalogueHandler(store), writes: () => writes };
}

test("the seed catalogue validates and normalization is non-mutating", () => {
  assert.deepEqual(validateCatalogue(MYTHS), MYTHS);
  const copy = structuredClone(MYTHS);
  copy[0].summary = "  Updated summary  ";
  assert.equal(validateCatalogue(copy)[0].summary, "Updated summary");
  assert.equal(copy[0].summary, "  Updated summary  ");
});

test("validation rejects unsafe links, duplicate identifiers, empty content and invalid classifications", () => {
  const invalid = [
    (m) => { m[0].sources[0].url = "javascript:alert(1)"; },
    (m) => { m[0].sources[0].url = "data:text/html,test"; },
    (m) => { m[0].sources[0].url = "https://user:password@example.com"; },
    (m) => { m[0].sources[0].url = "not a URL"; },
    (m) => { m[0].id = m[1].id; },
    (m) => { m[0].number = m[1].number; },
    (m) => { m[0].number = 1.5; },
    (m) => { m[0].id = "../api"; },
    (m) => { m[0].summary = " "; },
    (m) => { m[0].summary = "x".repeat(8001); },
    (m) => { m[0].verdict = "other"; },
    (m) => { m[0].areas = ["unknown"]; },
    (m) => { m[0].areas = ["law", "law"]; },
    (m) => { m[0].rationale = []; },
    (m) => { m[0].sources = []; },
    (m) => { m[0].sources[0].label = ""; },
    (m) => { m[0].claim = null; },
  ];
  for (const change of invalid) {
    const copy = structuredClone(MYTHS);
    change(copy);
    assert.throws(() => validateCatalogue(copy));
  }
  for (const value of [null, {}, [], Array(101).fill(MYTHS[0])]) {
    assert.throws(() => validateCatalogue(value));
  }
});

test("published catalogues drive pinned and random selection, including a single myth", () => {
  const myth = { ...MYTHS[0], id: "new-myth", number: 42, summary: "Published summary" };
  const myths = [myth];
  assert.equal(pinnedMyth("?myth=42", myths), myth);
  assert.equal(pinnedMyth("?myth=new-myth", myths), myth);
  assert.equal(pinnedMyth("?myth=residency", myths), undefined);
  assert.equal(randomMyth([], undefined, myths).myth, myth);
  assert.equal(randomMyth([myth.id], myth.id, myths).myth, myth);
  const pair = [myth, MYTHS[1]];
  assert.equal(randomMyth([], myth.id, pair).myth, pair[1]);
});

test("anonymous users can read without changing storage", async () => {
  const f = fixture();
  const result = await f.handler(request({ method: "GET", headers: { "x-ms-client-principal": "" } }), context);
  assert.equal(result.status, 200);
  assert.deepEqual(result.jsonBody.myths, MYTHS);
  assert.equal(result.headers["Cache-Control"], "no-store");
  assert.equal(f.writes(), 0);
});

test("anonymous, malformed, unauthenticated and non-Microsoft principals cannot write", async () => {
  const f = fixture();
  for (const header of ["", "not-base64", Buffer.from("null").toString("base64"),
    principal({ identityProvider: "github" }), principal({ userRoles: ["anonymous"] }),
    principal({ userId: "" })]) {
    const result = await f.handler(request({ headers: { "x-ms-client-principal": header } }), context);
    assert.equal(result.status, 401);
  }
  assert.equal(f.writes(), 0);
});

test("cross-origin and non-JSON writes are rejected", async () => {
  const f = fixture();
  for (const headers of [{ origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
    { "sec-fetch-site": "same-site" }, { "content-type": "text/plain" },
    { "x-catalogue-request": "" }]) {
    assert.equal((await f.handler(request({ headers }), context)).status, 403);
  }
  assert.equal(f.writes(), 0);
});

test("tenant-authenticated users publish all content fields and reads see the new data", async () => {
  const f = fixture();
  const draft = structuredClone(MYTHS);
  draft[0].summary = "Updated summary";
  draft[0].rationale = ["Updated explanation", "Another paragraph"];
  draft[0].sources = [{ label: "Updated source", url: "https://learn.microsoft.com/" }];
  const result = await f.handler(request({
    headers: { origin: "https://game.example", "sec-fetch-site": "same-origin" }, body: JSON.stringify(draft),
  }), context);
  assert.equal(result.status, 200);
  const read = await f.handler(request({ method: "GET" }), context);
  assert.deepEqual(read.jsonBody.myths, draft);
  assert.equal(read.jsonBody.version, '"1"');
});

test("stale versions cannot overwrite another editor's changes", async () => {
  const f = fixture();
  assert.equal((await f.handler(request(), context)).status, 200);
  assert.equal((await f.handler(request(), context)).status, 409);
  assert.equal(f.writes(), 1);
});

test("missing and wildcard versions, invalid JSON, empty lists and oversized bodies are rejected", async () => {
  const f = fixture();
  for (const version of ["", "*", "unquoted", '"a", "b"']) {
    assert.equal((await f.handler(request({ headers: { "if-match": version } }), context)).status, 428);
  }
  assert.equal((await f.handler(request({ body: "{" }), context)).status, 400);
  assert.equal((await f.handler(request({ body: "[]" }), context)).status, 400);
  assert.equal((await f.handler(request({ body: " ".repeat(512 * 1024 + 1) }), context)).status, 413);
  assert.equal((await f.handler(request({ method: "DELETE" }), context)).status, 405);
  assert.equal(f.writes(), 0);
});

test("storage failures are logged and returned as explicit failures", async () => {
  const logs = [];
  const failingStore = {
    async read() { throw new Error("storage unavailable"); },
    async write() { throw new Error("storage unavailable"); },
  };
  const handler = createCatalogueHandler(failingStore);
  for (const method of ["GET", "PUT"]) {
    const result = await handler(request({ method }), { error: (...args) => logs.push(args) });
    assert.equal(result.status, 503);
    assert.ok(result.jsonBody.error);
  }
  assert.equal(logs.length, 2);
});

test("deployment restricts Microsoft authentication to the exact tenant and protects writes", async () => {
  const config = JSON.parse(await readFile(new URL("../../public/staticwebapp.config.json", import.meta.url), "utf8"));
  const providers = config.auth.identityProviders;
  assert.deepEqual(Object.keys(providers), ["azureActiveDirectory"]);
  assert.equal(providers.azureActiveDirectory.registration.openIdIssuer,
    "https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47/v2.0");
  assert.ok(providers.azureActiveDirectory.registration.clientIdSettingName);
  assert.ok(providers.azureActiveDirectory.registration.clientSecretSettingName);
  const writeRule = config.routes.find((r) => r.route === "/api/myths" && r.methods.includes("PUT"));
  assert.deepEqual(writeRule.allowedRoles, ["authenticated"]);
  assert.ok(config.navigationFallback.exclude.includes("/api/*"));
  assert.ok(config.navigationFallback.exclude.includes("/.auth/*"));
});

// Exercise the real Blob SDK against a local HTTP fixture, including ETag conditions.
let server;
let endpoint;
let contents;
let version = 0;
let forcedError;
const previousConnection = process.env.MYTHS_STORAGE_CONNECTION_STRING;
before(async () => {
  server = createServer(async (req, res) => {
    res.setHeader("x-ms-request-id", "local-storage-test");
    const fail = (status, code) => {
      res.writeHead(status, { "Content-Type": "application/xml", "x-ms-error-code": code });
      res.end(`<?xml version="1.0"?><Error><Code>${code}</Code><Message>Local test response</Message></Error>`);
    };
    if (forcedError) return fail(403, forcedError);
    if (req.method === "GET") {
      if (!contents) return fail(404, "BlobNotFound");
      res.writeHead(200, {
        "Content-Type": "application/json", "Content-Length": Buffer.byteLength(contents),
        ETag: `"blob-${version}"`, "Last-Modified": new Date().toUTCString(),
      });
      res.end(contents);
      return;
    }
    if (req.headers["if-none-match"] === "*" && contents) return fail(412, "ConditionNotMet");
    if (req.headers["if-match"] && req.headers["if-match"] !== `"blob-${version}"`) return fail(412, "ConditionNotMet");
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    contents = Buffer.concat(chunks).toString("utf8");
    version++;
    res.writeHead(201, { ETag: `"blob-${version}"`, "Last-Modified": new Date().toUTCString() });
    res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  endpoint = `http://127.0.0.1:${server.address().port}/localaccount`;
  process.env.MYTHS_STORAGE_CONNECTION_STRING =
    `DefaultEndpointsProtocol=http;AccountName=localaccount;AccountKey=${Buffer.alloc(32).toString("base64")};BlobEndpoint=${endpoint};`;
});
after(async () => {
  if (previousConnection === undefined) delete process.env.MYTHS_STORAGE_CONNECTION_STRING;
  else process.env.MYTHS_STORAGE_CONNECTION_STRING = previousConnection;
  await new Promise((resolve) => server.close(resolve));
});

test("Blob SDK persists across store instances and uses conditional create/update", async () => {
  const store = createBlobStore();
  assert.deepEqual(await store.read(), { myths: MYTHS, version: "seed" });
  const updated = structuredClone(MYTHS);
  updated[0].summary = "Persisted summary";
  const first = await store.write(updated, "seed");
  assert.equal(first.version, '"blob-1"');
  assert.deepEqual(await createBlobStore().read(), first);
  await assert.rejects(() => store.write(MYTHS, "seed"), CatalogueConflict);
  const second = await store.write(MYTHS, first.version);
  assert.equal(second.version, '"blob-2"');
  await assert.rejects(() => store.write(updated, first.version), CatalogueConflict);
  assert.deepEqual((await store.read()).myths, MYTHS);
});

test("Blob SDK does not hide permission/configuration errors as a seed fallback", async () => {
  forcedError = "AuthorizationFailure";
  try {
    await assert.rejects(() => createBlobStore().read(), /Local test response/);
  } finally {
    forcedError = undefined;
  }
});
