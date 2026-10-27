import { BlobServiceClient } from "@azure/storage-blob";
import { validateCatalogue } from "../../src/game/catalogue.js";
import { MYTHS, type Myth } from "../../src/game/myths.js";
import { CatalogueConflict, type CatalogueStore } from "./handler.js";

function storageError(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

export function createBlobStore(): CatalogueStore {
  const blob = () => {
    const connection = process.env.MYTHS_STORAGE_CONNECTION_STRING;
    if (!connection) throw new Error("MYTHS_STORAGE_CONNECTION_STRING is not configured.");
    return BlobServiceClient.fromConnectionString(connection)
      .getContainerClient("myths").getBlockBlobClient("catalogue.json");
  };
  return {
    async read() {
      try {
        const result = await blob().download();
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
        const result = await blob().uploadData(Buffer.from(JSON.stringify(myths)), {
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
