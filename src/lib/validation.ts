/** Raised when user input fails validation. Carries an HTTP 400 semantics. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Schemes we are willing to redirect to. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Practical upper bound on stored URL length. Browsers and proxies vary, but
 * ~2KB is a common safe limit and keeps a single malicious payload from
 * bloating the row.
 */
export const MAX_URL_LENGTH = 2048;

/**
 * Validate and normalize a candidate URL.
 *
 * Rejects anything that is not a syntactically valid absolute http(s) URL.
 * Blocking non-http(s) schemes (e.g. `javascript:`, `data:`, `file:`) is a
 * deliberate safety measure: the redirect endpoint sends users straight to the
 * stored value, so an unrestricted scheme would turn the service into an
 * open vector for script/data-URI redirects.
 *
 * Returns the WHATWG-normalized form (adds a trailing slash to bare hosts,
 * lower-cases the host, etc.) so equivalent inputs are stored consistently.
 */
export function normalizeUrl(input: unknown): string {
  if (typeof input !== 'string') {
    throw new ValidationError('`url` is required and must be a string');
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new ValidationError('`url` must not be empty');
  }
  if (trimmed.length > MAX_URL_LENGTH) {
    throw new ValidationError(`\`url\` must be at most ${MAX_URL_LENGTH} characters`);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ValidationError('`url` is not a valid URL');
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new ValidationError('`url` must use the http or https scheme');
  }

  return parsed.toString();
}
