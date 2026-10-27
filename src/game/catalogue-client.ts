import { validateCatalogue } from "./catalogue";
import type { Myth } from "./myths";

export interface Catalogue {
  myths: Myth[];
  version: string;
}

export class CatalogueRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export async function catalogueRequest(init?: RequestInit): Promise<Catalogue> {
  const response = await fetch("/api/myths", { cache: "no-store", ...init });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
      ? body.error : `Catalogue request failed (${response.status}). Please try again.`;
    throw new CatalogueRequestError(message, response.status);
  }
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("myths" in body) ||
      !("version" in body) || typeof body.version !== "string" || !body.version) {
    throw new Error("The server returned an invalid catalogue.");
  }
  return { myths: validateCatalogue(body.myths), version: body.version };
}
