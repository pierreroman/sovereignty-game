import { RISK_AREAS, VERDICTS, type Myth, type RiskArea, type Verdict } from "./myths.js";

export const MAX_CATALOGUE_BYTES = 512 * 1024;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, field: string, max = 8000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error(`${field} must contain between 1 and ${max} characters.`);
  }
  return value.trim();
}

export function validateCatalogue(value: unknown): Myth[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new Error("The catalogue must contain between 1 and 100 myths.");
  }
  const ids = new Set<string>();
  const numbers = new Set<number>();
  return value.map((entry, index) => {
    const field = `Myth ${index + 1}`;
    if (!record(entry)) throw new Error(`${field} must be an object.`);
    const id = text(entry.id, `${field}: ID`, 80);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || ids.has(id)) {
      throw new Error(`${field}: IDs must be unique lowercase words separated by hyphens.`);
    }
    ids.add(id);
    const number = entry.number;
    if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 1 || numbers.has(number)) {
      throw new Error(`${field}: display numbers must be unique positive integers.`);
    }
    numbers.add(number);
    if (!VERDICTS.some((v) => v.id === entry.verdict)) throw new Error(`${field}: invalid verdict.`);
    if (!Array.isArray(entry.areas) || !entry.areas.length || entry.areas.length > 4 ||
        !entry.areas.every((area) => RISK_AREAS.some((risk) => risk.id === area)) ||
        new Set(entry.areas).size !== entry.areas.length) {
      throw new Error(`${field}: select one or more distinct risk areas.`);
    }
    if (!Array.isArray(entry.rationale) || !entry.rationale.length || entry.rationale.length > 30) {
      throw new Error(`${field}: provide between 1 and 30 rationale paragraphs.`);
    }
    if (!Array.isArray(entry.sources) || !entry.sources.length || entry.sources.length > 30) {
      throw new Error(`${field}: provide between 1 and 30 sources.`);
    }
    return {
      id,
      number,
      claim: text(entry.claim, `${field}: claim`, 1000),
      verdict: entry.verdict as Verdict,
      ...(entry.qualifier === undefined || entry.qualifier === "" ? {} : {
        qualifier: text(entry.qualifier, `${field}: qualifier`, 200),
      }),
      areas: entry.areas as RiskArea[],
      summary: text(entry.summary, `${field}: summary`),
      rationale: entry.rationale.map((p) => text(p, `${field}: rationale`)),
      tradeoff: text(entry.tradeoff, `${field}: tradeoff`),
      sources: entry.sources.map((source) => {
        if (!record(source)) throw new Error(`${field}: invalid source.`);
        const label = text(source.label, `${field}: source label`, 500);
        const url = text(source.url, `${field}: source URL`, 2000);
        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          throw new Error(`${field}: source URLs must be valid HTTP or HTTPS links.`);
        }
        if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
          throw new Error(`${field}: source URLs must be HTTP or HTTPS links without credentials.`);
        }
        return { label, url };
      }),
    };
  });
}
