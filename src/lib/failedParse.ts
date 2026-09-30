/**
 * Detects field values that are leftover template/parsing expressions rather
 * than real data, e.g. `schemaless_list[""]`, `$.body.data`, `$exec.foo`,
 * `{{ .bar }}`. These come from failed mappings and should not be shown.
 */
const FAILED_PATTERNS: RegExp[] = [
  /^\s*\$[\w.]*\.[\w.\[\]"'#-]+\s*$/, // $.body.data, $exec.x, $node.field
  /^\s*\$[\w]+\s*$/, // $exec
  /schemaless_list\s*\[/i,
  /^\s*\{\{.*\}\}\s*$/, // {{ .field }}
];

export const isFailedParseValue = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!v) return false;
  return FAILED_PATTERNS.some((re) => re.test(v));
};
