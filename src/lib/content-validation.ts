/**
 * Plain-English validation for the Workbench editors.
 * Pure functions — no React, no network. Every rule from the approved
 * plan lives here so each screen reports errors the same way.
 */

export interface FieldSpec {
  type: 'text' | 'longtext' | 'link' | 'number' | 'flag' | 'image';
  required: boolean;
  maxLength?: number;
  /** token names this field may contain, e.g. ['shown','total'] */
  tokens?: string[];
}

/** `{shown}` etc. Anything else in braces is rejected. */
const TOKEN_PATTERN = /\{([a-zA-Z_]+)\}/g;

export const ALLOWED_TOKENS = ['shown', 'total'] as const;

/**
 * Validate one field value. Returns an error sentence, or null when valid.
 * - required fields cannot be empty
 * - text respects maxLength
 * - links must start with / or https://
 * - numbers must be whole naira when used as amounts (integer check left
 *   to the caller via `integerOnly`)
 * - only fields that declare tokens may contain {token}, and only with
 *   the approved names
 */
export function validateField(
  spec: FieldSpec,
  rawValue: string | number,
  opts: { integerOnly?: boolean } = {}
): string | null {
  const value = typeof rawValue === 'number' ? String(rawValue) : rawValue;
  const trimmed = value.trim();

  if (spec.required && trimmed === '') {
    return 'This cannot be saved empty — the storefront renders it on every load.';
  }

  // tokens: only declared fields may carry them, and only approved names
  if (typeof value === 'string') {
    const found = Array.from(value.matchAll(TOKEN_PATTERN)).map((m) => m[1]!);
    if (found.length > 0) {
      if (!spec.tokens || spec.tokens.length === 0) {
        return `This field does not take placeholders — remove ${found
          .map((t) => `{${t}}`)
          .join(', ')}.`;
      }
      const bad = found.filter((t) => !spec.tokens!.includes(t) && !(ALLOWED_TOKENS as readonly string[]).includes(t));
      if (bad.length > 0) {
        return `Unknown placeholder${bad.length > 1 ? 's' : ''} ${bad
          .map((t) => `{${t}}`)
          .join(', ')} — allowed here: ${spec.tokens.map((t) => `{${t}}`).join(', ')}.`;
      }
      // a declared-but-unknown-to-the-spec token that is globally approved is fine
    }
  }

  if (trimmed === '') return null; // optional empty value

  if (spec.type === 'number') {
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return 'Enter a number.';
    if (opts.integerOnly && !Number.isInteger(n)) return 'Enter a whole number.';
    if (n < 0) return 'Enter zero or more.';
    return null;
  }

  if (spec.type === 'link') {
    const isPath = value.startsWith('/');
    const isHttps = value.startsWith('https://');
    if (!isPath && !isHttps) {
      return 'Links must be a path starting with / (like /shop) or a full https:// address.';
    }
    if (value.startsWith('//') || value.toLowerCase().startsWith('/\\')) {
      return 'That link would leave the site unexpectedly — use /path or https://.';
    }
  }

  if (spec.type === 'image') {
    // Media-library URLs are Storage https URLs; empty means "use the
    // built-in art" (the required check above still applies when required).
    if (!value.startsWith('https://')) {
      return 'Pick an image from the media library (it must be an https:// address).';
    }
  }

  if (spec.maxLength !== undefined && value.length > spec.maxLength) {
    return `Too long: ${value.length} characters, limit ${spec.maxLength}.`;
  }

  return null;
}

/** WhatsApp number: international digits only, no +, spaces or dashes. */
export function validateWhatsAppNumber(raw: string): string | null {
  const v = raw.trim();
  if (v === '') return 'Enter the WhatsApp number.';
  if (!/^[0-9]+$/.test(v)) {
    return 'Digits only — no +, no spaces, no dashes (e.g. 2348012345678).';
  }
  if (v.length < 10 || v.length > 15) {
    return `That looks off: ${v.length} digits, expected 10–15.`;
  }
  return null;
}

/** Whole naira amounts (free-delivery threshold). */
export function validateWholeNaira(raw: string): string | null {
  const v = raw.trim();
  if (v === '') return 'Enter an amount in naira.';
  if (!/^[0-9]+$/.test(v)) return 'Whole naira only — digits, no decimals or symbols.';
  return null;
}

/** The wa.me URL a "Test link" button opens. Never called at build time. */
export function waMeUrl(number: string): string {
  return `https://wa.me/${number.trim()}`;
}

/** Validate a whole list: returns itemId+fieldKey → error message. */
export function validateListItems(
  itemFields: (FieldSpec & { key: string; label: string })[],
  items: { id: string; fields: Record<string, string | number | boolean> }[]
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const item of items) {
    for (const spec of itemFields) {
      if (spec.type === 'flag') continue;
      const raw = item.fields[spec.key];
      const value = typeof raw === 'boolean' ? '' : (raw ?? '');
      const message = validateField(spec, value);
      if (message) errors[`${item.id}:${spec.key}`] = message;
    }
  }
  return errors;
}
