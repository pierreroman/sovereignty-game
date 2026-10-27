import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { MAX_CATALOGUE_BYTES, validateCatalogue } from "../../src/game/catalogue.js";
import type { Myth } from "../../src/game/myths.js";
import { authenticatedEditor, sameOriginJson } from "./auth.js";

export interface Catalogue {
  myths: Myth[];
  version: string;
}

export interface CatalogueStore {
  read(): Promise<Catalogue>;
  write(myths: Myth[], version: string): Promise<Catalogue>;
}

export class CatalogueConflict extends Error {}

export function createCatalogueHandler(store: CatalogueStore) {
  return async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const response = (status: number, jsonBody: unknown): HttpResponseInit => ({
      status,
      headers: { "Cache-Control": "no-store" },
      jsonBody,
    });
    if (request.method !== "GET" && request.method !== "PUT") {
      return response(405, { error: "Method not allowed." });
    }
    if (request.method === "PUT") {
      try {
        if (!authenticatedEditor(request)) {
          return response(401, { error: "Sign in with the editor password to publish changes." });
        }
      } catch (error) {
        context.error("Editor authentication configuration failed.", error instanceof Error ? error.message : "Unknown error.");
        return response(503, { error: "Editor authentication is unavailable. Check the server password configuration." });
      }
      if (!sameOriginJson(request)) {
        return response(403, { error: "Only same-origin JSON catalogue requests are accepted." });
      }
      const version = request.headers.get("if-match");
      if (!version || (version !== "seed" && !/^"[^"\r\n]{1,200}"$/.test(version))) {
        return response(428, { error: "Reload the catalogue before publishing." });
      }
      const raw = await request.text();
      if (Buffer.byteLength(raw, "utf8") > MAX_CATALOGUE_BYTES) {
        return response(413, { error: "The catalogue exceeds the 512 KiB limit." });
      }
      let myths: Myth[];
      try {
        myths = validateCatalogue(JSON.parse(raw));
      } catch (error) {
        return response(400, { error: error instanceof Error ? error.message : "Invalid catalogue." });
      }
      try {
        return response(200, await store.write(myths, version));
      } catch (error) {
        if (error instanceof CatalogueConflict) {
          return response(409, { error: "Someone else published changes. Reload the catalogue before trying again. Your draft has not been published." });
        }
        context.error("Failed to publish myth catalogue.", error);
        return response(503, { error: "The catalogue could not be saved. Please try again later." });
      }
    }
    try {
      return response(200, await store.read());
    } catch (error) {
      context.error("Failed to load myth catalogue.", error);
      return response(503, { error: "The catalogue could not be loaded. Please try again later." });
    }
  };
}
