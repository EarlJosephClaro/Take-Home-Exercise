import { randomInt } from 'node:crypto';

/**
 * Base62 alphabet (0-9, A-Z, a-z). URL-safe and case-sensitive, giving 62
 * symbols per character.
 */
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export const DEFAULT_CODE_LENGTH = 7;

/**
 * Generate a random base62 short code.
 *
 * We generate codes randomly (rather than encoding a sequential id) so codes
 * are not guessable or enumerable. With the default length of 7 the keyspace is
 * 62^7 ≈ 3.5 trillion, so collisions are astronomically rare at this scale;
 * the UNIQUE constraint in the database plus retry logic in the store handle
 * the theoretical case. See the README for the tradeoff vs. sequential ids.
 *
 * `randomInt` draws from a CSPRNG and is unbiased across the alphabet range.
 */
export function generateShortCode(length: number = DEFAULT_CODE_LENGTH): string {
  if (!Number.isInteger(length) || length < 1) {
    throw new Error(`short code length must be a positive integer, got ${length}`);
  }

  let code = '';
  for (let i = 0; i < length; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}
