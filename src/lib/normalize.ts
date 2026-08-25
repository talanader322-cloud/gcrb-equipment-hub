/**
 * Technical-code normalization.
 *
 * Mirrors the SQL functions public.normalize_code / public.normalize_text so
 * client-side and database-side matching always agree.
 *
 * Original technical numbers are NEVER modified for storage/display — the
 * normalized value is only an additional search key.
 */

/** `23A-15-00053` and `23A 15 00053` both normalize to `23A1500053`. */
export function normalizeCode(input: string | null | undefined): string {
  if (!input) return "";
  return input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** Collapses whitespace and upper-cases free text (descriptions, titles). */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return "";
  return input.replace(/\s+/g, " ").trim().toUpperCase();
}

/** True when two technical identifiers are equivalent after normalization. */
export function codesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeCode(a);
  return na.length > 0 && na === normalizeCode(b);
}

export type QueryKind = "part_number" | "serial_number" | "model" | "catalog_number" | "text";

/** Best-effort classification used to rank result groups. */
export function classifyQuery(raw: string): QueryKind {
  const q = raw.trim();
  if (!q) return "text";
  const code = normalizeCode(q);
  if (/^\d{4,10}$/.test(code)) return "serial_number";
  if (/[A-Z]/.test(code) && /\d/.test(code) && code.length >= 6 && /[-/.\s]/.test(q))
    return "part_number";
  if (/^[A-Z]{1,4}\d{2,5}[A-Z0-9-]*$/i.test(q.replace(/\s/g, ""))) return "model";
  if (code.length >= 6 && !q.includes(" ")) return "catalog_number";
  return "text";
}

/** Escapes a value for use inside a PostgREST `ilike` pattern. */
export function likePattern(value: string): string {
  return `%${value.replace(/[%_,()]/g, "")}%`;
}
