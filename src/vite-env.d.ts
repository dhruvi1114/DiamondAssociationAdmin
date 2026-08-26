/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  /** AES algorithm label — must match the backend's CHIPER. */
  readonly VITE_CHIPER: string;
  /** 32-character AES-256 key. Public by construction (security.md §4). */
  readonly VITE_TERIFF: string;
  /** 16-character AES-CBC IV. Public by construction. */
  readonly VITE_PLAN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
