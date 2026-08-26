# Fonts

Geist, self-hosted. Both files are variable — one weight axis, 100–900 — so every
weight the design system uses (400 / 500 / 600) comes out of a single download
per style rather than one file per weight.

| File here | Source file | Notes |
|---|---|---|
| `Geist-Variable.woff2` | `geist/dist/fonts/geist-sans/Geist-Variable.woff2` | upright |
| `Geist-Italic.woff2` | `geist/dist/fonts/geist-sans/Geist-Italic[wght].woff2` | italic |

Taken from the `geist` npm package (v1.x) and renamed. **The italic came from
`Geist-Italic[wght].woff2`, not `Geist-Italic.woff2`** — the package ships both,
and the shorter name is a single static weight. Our `@font-face` declares
`font-weight: 100 900`, so a static file there would have made the browser
synthesise every weight but one. Take the `[wght]` file if these are ever
re-copied.

The `geist` package itself is deliberately NOT a dependency of this app: it
exists to feed `next/font` in Next.js, which the admin is not. Only the two
binaries are needed.

Declared in `src/styles/index.css` (`@font-face`) and named by
`typography.fontFamily` in `src/theme/tokens.ts`.

Licence: SIL Open Font Licence 1.1 — see `LICENSE.txt`, which must travel with
the files.
