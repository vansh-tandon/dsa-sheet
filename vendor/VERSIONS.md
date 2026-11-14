# Vendored libraries

Served from this site so no script loads from a third-party CDN (the page's Content-Security-Policy allows `script-src 'self'` only).
To update one: download the new version, check its sha256, replace the file, update this table, run the build (it re-stamps `?v=`).

| File | Library | Version | Source | sha256 |
|---|---|---|---|---|
| `marked.min.js` | marked | 12.0.2 | https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js | `15fabce5b65898b32b03f5ed25e9f891a729ad4c0d6d877110a7744aa847a894` |
| `highlight.min.js` | highlight.js | 11.9.0 | https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.9.0/highlight.min.js | `837a6fa5b0c736b52bbde2b2b6190f305da3fc9ed41681db5321507057b5c846` |
| `java.min.js` | highlight.js Java grammar | 11.9.0 | https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.9.0/languages/java.min.js | `309eaa0f9c6e0ce930fb14c00c746c11058d489eb4c6f4045cde145d33eff23b` |
| `purify.min.js` | DOMPurify | 3.4.17 | https://cdn.jsdelivr.net/npm/dompurify@3.4.17/dist/purify.min.js | `cd37898f9782adf54820c413191b5691803f0f137c799d6edcfd38523b4c2c31` |

marked 12.0.2 and highlight.js 11.9.0 are byte-identical to the cdnjs copies the site used before vendoring (checked 2026-11-12).
