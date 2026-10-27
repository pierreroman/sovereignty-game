import { BlobServiceClient } from "@azure/storage-blob";
import { validateCatalogue } from "../../src/game/catalogue.js";
import { MYTHS, type Myth } from "../../src/game/myths.js";
import { CatalogueConflict, type CatalogueStore } from "./handler.js";
import type { LoginLimiter } from "./session.js";

function storageError(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function blob(name: string) {
  const connection = process.env.MYTHS_STORAGE_CONNECTION_STRING;
  if (!connection) throw new Error("MYTHS_STORAGE_CONNECTION_STRING is not configured.");
  return BlobServiceClient.fromConnectionString(connection).getContainerClient("myths").getBlockBlobClient(name);
}

export function createBlobStore(): CatalogueStore {
  return {
    async read() {
      try {
        const result = await blob("catalogue.json").download();
        if (!result.readableStreamBody || !result.etag) throw new Error("Incomplete catalogue response.");
        const chunks: Buffer[] = [];
        for await (const chunk of result.readableStreamBody) chunks.push(Buffer.from(chunk));
        return { myths: validateCatalogue(JSON.parse(Buffer.concat(chunks).toString("utf8"))), version: result.etag };
      } catch (error) {
        if (storageError(error, "BlobNotFound")) return { myths: MYTHS, version: "seed" };
        throw error;
      }
    },
    async write(myths: Myth[], version: string) {
      try {
        const result = await blob("catalogue.json").uploadData(Buffer.from(JSON.stringify(myths)), {
          conditions: version === "seed" ? { ifNoneMatch: "*" } : { ifMatch: version },
          blobHTTPHeaders: { blobContentType: "application/json", blobCacheControl: "no-store" },
        });
        if (!result.etag) throw new Error("Storage did not return a catalogue version.");
        return { myths, version: result.etag };
      } catch (error) {
        if (storageError(error, "ConditionNotMet") || storageError(error, "BlobAlreadyExists") ||
            (version !== "seed" && storageError(error, "BlobNotFound"))) {
          throw new CatalogueConflict();
        }
        throw error;
      }
    },
  };
}

export function createLoginLimiter(): LoginLimiter {
  const windowMs = 15 * 60 * 1000;
  return {
    async consume(now) {
      const currentWindow = Math.floor(now / windowMs);
      for (let retry = 0; retry < 8; retry++) {
        const client = blob("editor-login-attempts.json");
        let version: string | undefined;
        let attempts = 0;
        try {
          const result = await client.download();
          if (!result.readableStreamBody || !result.etag) throw new Error("Incomplete login limiter response.");
          const chunks: Buffer[] = [];
          for await (const chunk of result.readableStreamBody) chunks.push(Buffer.from(chunk));
          const state: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (typeof state !== "object" || state === null ||
              !("window" in state) || !Number.isSafeInteger(state.window) ||
              !("attempts" in state) || typeof state.attempts !== "number" ||
              !Number.isSafeInteger(state.attempts) || state.attempts < 0 || state.attempts > 10) {
            throw new Error("Invalid persistent login limiter state.");
          }
          version = result.etag;
          if (state.window === currentWindow) attempts = state.attempts;
        } catch (error) {
          if (!storageError(error, "BlobNotFound")) throw error;
        }
        if (attempts >= 10) return Math.max(1, Math.ceil(((currentWindow + 1) * windowMs - now) / 1000));
        try {
          await client.uploadData(Buffer.from(JSON.stringify({ window: currentWindow, attempts: attempts + 1 })), {
            conditions: version ? { ifMatch: version } : { ifNoneMatch: "*" },
            blobHTTPHeaders: { blobContentType: "application/json", blobCacheControl: "no-store" },
          });
          return 0;
        } catch (error) {
          if (!storageError(error, "ConditionNotMet") && !storageError(error, "BlobAlreadyExists")) throw error;
        }
      }
      throw new Error("Login attempt reservation conflicted too many times.");
    },
  };
}
