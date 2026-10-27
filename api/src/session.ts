import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { authenticatedEditor, clearSession, issueSession, readAuthConfig, sameOriginJson, verifyPassword } from "./auth.js";

export interface LoginLimiter {
  /** Reserve an attempt atomically. Returns zero, or the seconds until another attempt is allowed. */
  consume(now: number): Promise<number>;
}

export function createSessionHandler(limiter: LoginLimiter) {
  return async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const response = (status: number, jsonBody: unknown, headers: Record<string, string> = {}): HttpResponseInit => ({
      status, jsonBody, headers: { "Cache-Control": "no-store", ...headers },
    });
    if (!["GET", "POST", "DELETE"].includes(request.method)) {
      return response(405, { error: "Method not allowed." });
    }
    if (request.method !== "GET" && !sameOriginJson(request)) {
      return response(403, { error: "Only same-origin JSON authentication requests are accepted." });
    }
    if (request.method === "DELETE") {
      return response(200, { authenticated: false }, { "Set-Cookie": clearSession() });
    }
    try {
      const config = readAuthConfig();
      if (request.method === "GET") return response(200, { authenticated: authenticatedEditor(request) });
      const raw = await request.text();
      if (Buffer.byteLength(raw, "utf8") > 4096) return response(413, { error: "Sign-in request is too large." });
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return response(400, { error: "Sign-in requires a JSON password." });
      }
      if (typeof body !== "object" || body === null || !("password" in body) ||
          typeof body.password !== "string" || !body.password.length || body.password.length > 256) {
        return response(400, { error: "Enter the editor password (at most 256 characters)." });
      }
      const retryAfter = await limiter.consume(Date.now());
      if (retryAfter > 0) {
        return response(429, { error: `Too many sign-in attempts. Try again in ${Math.ceil(retryAfter / 60)} minutes.` },
          { "Retry-After": String(retryAfter) });
      }
      if (!await verifyPassword(body.password, config)) {
        return response(401, { error: "Incorrect editor password." });
      }
      return response(200, { authenticated: true }, { "Set-Cookie": issueSession(config) });
    } catch (error) {
      context.error("Editor authentication failed.", error instanceof Error ? error.message : "Unknown authentication error.");
      return response(503, { error: "Editor sign-in is unavailable. Check the server password and storage configuration." });
    }
  };
}
