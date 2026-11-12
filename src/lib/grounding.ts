import type { Source } from "./schema";
import { references } from "./context";
export interface EvidenceRecord {
  passageId: string;
  quote: string;
  values: string[];
}
const values = (text: string) =>
  [
    ...text.matchAll(
      /(?<![\w])[-+]?\d+(?:[,.]\d+)*(?:\s*%|\s*(?:kg|km|cm|mm|mg|ms|years?|days?|hours?|participants|observations)\b)?/gi,
    ),
  ].map((m) => m[0].trim());
// Exact source excerpts, never model-produced facts. Repeated identical excerpts
// within one passage are deduplicated; source identities remain distinct.
export function numericalEvidence(sources: Source[]): EvidenceRecord[] {
  return sources.flatMap((s) =>
    s.passages.flatMap((p) =>
      [
        ...new Set(
          p.text
            .split(/(?<=[.!?])\s+|\n+/)
            .map((t) => t.trim())
            .filter((t) => t && !/^#{1,6}\s/.test(t) && values(t).length),
        ),
      ].map((quote) => ({ passageId: p.id, quote, values: values(quote) })),
    ),
  );
}
export function auditGrounding(answer: string, sources: Source[]) {
  const refs = references(answer, sources);
  const normalize = (v: string) => v.toLowerCase().replace(/\s+/g, " ");
  const missing = new Set<string>();
  const quotes: { quote: string; found: boolean }[] = [];
  // Keep reference scope local to the claim. Decimal points and quoted sentence
  // boundaries are preserved. Unparseable relationships remain unverified.
  const claims = answer.split(/\n+|(?<!["”])[.!?] +(?=[A-Z])/);
  for (const claim of claims) {
    const evidence = references(claim, sources).flatMap((r) =>
      r.passage ? [r.passage.text] : [],
    );
    const text = claim.replace(/\[[^\]\n]+\](?:\([^)]*\))?/g, "");
    const sourceNumbers = new Set(
      evidence.flatMap((t) => values(t).map(normalize)),
    );
    for (const value of values(text))
      if (!sourceNumbers.has(normalize(value))) missing.add(value);
    for (const match of text.matchAll(/[“"]([^”"\n]+)[”"]/g)) {
      const quote = match[1]!;
      quotes.push({ quote, found: evidence.some((p) => p.includes(quote)) });
    }
  }
  const missingValues = [...missing];
  return {
    status: "Unable to verify" as const,
    missingValues,
    quotes,
    invalidReferences: refs.filter((r) => !r.passage).map((r) => r.id),
    explanation:
      "This is a literal evidence check, not semantic verification. A value appearing in a passage cited in the same claim does not prove the claim, range, unit relationship or calculation. Missing values require source review; derived calculations are not validated.",
  };
}

export function numericalRanges(sources: Source[]) {
  const groups = new Map<string, { value: number; passageId: string }[]>();
  for (const record of numericalEvidence(sources))
    for (const token of record.values) {
      const match =
        /^([-+]?\d+(?:\.\d+)?)\s+(observations|participants|kg|km|cm|mm|mg|ms|years?|days?|hours?)$/i.exec(
          token,
        );
      if (!match) continue;
      const unit = match[2]!.toLowerCase();
      const list = groups.get(unit) ?? [];
      list.push({ value: Number(match[1]), passageId: record.passageId });
      groups.set(unit, list);
    }
  return [...groups]
    .filter(([, items]) => items.length > 1)
    .map(([unit, items]) => {
      const minimum = items.reduce((a, b) => (a.value < b.value ? a : b));
      const maximum = items.reduce((a, b) => (a.value > b.value ? a : b));
      return {
        operation: "minimum and maximum of literal source mentions",
        unit,
        mentions: items.length,
        minimum,
        maximum,
        limitation:
          "This calculation does not establish a study-wide range, causation, totals, or equivalence between different entities. Check scope against the question.",
      };
    });
}
