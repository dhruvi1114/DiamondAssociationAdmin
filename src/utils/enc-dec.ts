/**
 * Encrypted transport (ADR-004 / api-conventions.md §2).
 *
 * Byte-identical to `backend/src/helpers/encryption.ts`,
 * `customer/src/utils/enc-dec.ts` and `sarvadhi-sentinel/lib.js` — all four must
 * agree exactly or every request fails.
 *
 *   encrypt: JSON.stringify -> pako.gzip -> base64 -> prefix 16 random chars
 *            -> AES-256-CBC(key = utf8(TERIFF), iv = utf8(PLAN)) -> base64 string
 *   decrypt: AES decrypt -> drop the first 16 chars -> base64 -> pako.ungzip -> JSON.parse
 *
 * ⚠️  The base64 hop deliberately round-trips through UTF-8, matching
 * `Buffer.from(str).toString('base64')` in the Node implementations. Bare `btoa`
 * is latin1 and produces a DIFFERENT ciphertext for any byte > 0x7F — and gzip
 * output is full of those. Each side would still round-trip against itself, so
 * unit tests pass on both while the integration boundary is silently broken.
 * That is precisely the bug this project hit in M0; do not "simplify" this.
 *
 * This is obfuscation, not authorization: the key ships in the bundle and is
 * readable by anyone who opens dev tools (security.md §4). Every route still
 * runs authn, authz and validation after decryption.
 */
import CryptoJS from 'crypto-js';
import pako from 'pako';

const ENCRYPTION_KEY = import.meta.env.VITE_TERIFF ?? '';
const ENCRYPTION_IV = import.meta.env.VITE_PLAN ?? '';
const CHIPER = import.meta.env.VITE_CHIPER ?? '';

const NOISE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const NOISE_LENGTH = 16;

/** True when all three AES env vars are present and correctly sized. */
export const isCryptoConfigured = (): boolean =>
  Boolean(CHIPER) && ENCRYPTION_KEY.length === 32 && ENCRYPTION_IV.length === 16;

/** `Buffer.from(str, 'utf8').toString('base64')` without depending on Buffer. */
export const universalBtoa = (input: string): string => {
  const utf8 = new TextEncoder().encode(input);
  let binary = '';

  for (let i = 0; i < utf8.length; i += 1) {
    binary += String.fromCharCode(utf8[i] as number);
  }

  return globalThis.btoa(binary);
};

/** `Buffer.from(str, 'base64').toString('utf8')` without depending on Buffer. */
export const universalAtob = (input: string): string => {
  const binary = globalThis.atob(input);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new TextDecoder('utf-8').decode(bytes);
};

const bufferToBase64 = (buf: Uint8Array): string => {
  let binary = '';

  for (let i = 0; i < buf.length; i += 1) {
    binary += String.fromCharCode(buf[i] as number);
  }

  return universalBtoa(binary);
};

const base64ToBuffer = (base64: string): Uint8Array => {
  const binary = universalAtob(base64);
  const buf = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    buf[i] = binary.charCodeAt(i);
  }

  return buf;
};

const noisePrefix = (length = NOISE_LENGTH): string => {
  let result = '';

  for (let i = 0; i < length; i += 1) {
    result += NOISE_CHARS.charAt(Math.floor(Math.random() * NOISE_CHARS.length));
  }

  return result;
};

export const compressData = (str: string): string =>
  noisePrefix() + bufferToBase64(pako.gzip(new TextEncoder().encode(str)));

export const decompressData = (str: string): string =>
  new TextDecoder('utf-8').decode(pako.ungzip(base64ToBuffer(str.substring(NOISE_LENGTH))));

const key = (): CryptoJS.lib.WordArray => CryptoJS.enc.Utf8.parse(ENCRYPTION_KEY);
const iv = (): CryptoJS.lib.WordArray => CryptoJS.enc.Utf8.parse(ENCRYPTION_IV);

export const encrypt = (data: unknown): string =>
  CryptoJS.AES.encrypt(compressData(JSON.stringify(data ?? null)), key(), { iv: iv() }).toString();

/**
 * Returns `null` rather than throwing when a payload cannot be read: a response
 * that fails to decrypt should surface as an ErrorState in the UI, not as an
 * unhandled exception that blanks the screen.
 */
export const decrypt = <T = unknown>(ciphertext: string): T | null => {
  try {
    const plaintext = CryptoJS.AES.decrypt(ciphertext, key(), { iv: iv() }).toString(
      CryptoJS.enc.Utf8,
    );

    if (!plaintext) {
      return null;
    }

    return JSON.parse(decompressData(plaintext)) as T;
  } catch {
    return null;
  }
};
