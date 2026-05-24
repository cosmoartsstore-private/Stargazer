// Normalizes a list of CSV column names into a stable signature for matching
// against header_templates. Why: same CSV layout should always produce the
// same signature regardless of trailing whitespace or case differences.
export function computeHeaderSignature(columns: string[]): string {
  return columns
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c.length > 0)
    .join('|');
}
