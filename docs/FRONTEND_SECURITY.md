# Frontend security policy

The App Router applies static security headers in `web/next.config.js`. Its middleware
generates a fresh per-request nonce, sends the corresponding Content Security Policy
to Next.js during rendering, and returns that policy to the browser so framework
scripts can run without permitting arbitrary inline scripts. `script-src` never uses
`unsafe-inline`.

## Content Security Policy sources

| Directive/source | Reason |
| --- | --- |
| `default-src 'self'` | Default-deny policy for resources hosted by this app only. |
| `base-uri 'self'` | Prevent injected markup from changing relative URL resolution. |
| `object-src 'none'` | No Flash or other embedded object content is required. |
| `frame-ancestors 'none'` and `X-Frame-Options: DENY` | Prevent the application from being framed. |
| `form-action 'self'` | Forms may submit only to this application. |
| `script-src 'self'` | Serve the application’s own scripts. |
| Per-request `nonce-…` and `'strict-dynamic'` in middleware | Authorize Next.js inline bootstrap scripts only when they carry the unpredictable request nonce; no blanket inline permission. |
| `https://challenges.cloudflare.com` in `script-src` and `frame-src` | Load and frame the Cloudflare Turnstile widget when the verification flow is enabled. |
| `style-src 'self'` and per-request `nonce-…` | Allow compiled same-origin stylesheets and explicitly nonce-bearing inline style elements. |
| `sha256-skqujXORqzxt1aE0NNXxujEanPTX6raoqSscTV/Ww/Y=` | Allow next-themes’ exact temporary transition-suppression stylesheet; arbitrary inline style blocks remain blocked. |
| `style-src-attr 'unsafe-inline'` | Permit Leaflet runtime map positioning styles; this does not permit inline scripts or `<style>` blocks. |
| `img-src 'self' data: blob: https://*.basemaps.cartocdn.com` | Allow local/interface images, generated previews, and map tiles from the configured Carto basemap host. |
| `font-src 'self' data:` | Serve self-hosted Next/font files and its font data URLs. |
| `connect-src 'self'` | Allow same-origin application requests. |
| Configured API origin in `connect-src` | Allow the browser client to call `NEXT_PUBLIC_API_BASE_URL`; this value must be an origin trusted by the deployment. |
| `https://*.basemaps.cartocdn.com` in `connect-src` | Allow the map renderer to retrieve Carto tiles. |
| `https://challenges.cloudflare.com` in `connect-src` | Allow the Turnstile widget to contact its verification service. |
| `worker-src 'self' blob:` | Allow same-origin workers and workers created from in-memory map-renderer code. |
| `upgrade-insecure-requests` | Upgrade accidental insecure subresource requests on HTTPS deployments. |

No provider API key, signing key, database credential, or other secret may use a
`NEXT_PUBLIC_` variable. The public API base URL, explorer URL, GitHub URL, chain ID,
contract address, and Turnstile site key are identifiers/configuration, not secrets.
Server-side verification secrets must remain in the API process.

`style-src-attr 'unsafe-inline'` is limited to style attributes set by the Leaflet
map renderer and animated components. It does not permit inline scripts or inline
`<style>` blocks. Style elements require the per-request nonce or the exact
next-themes transition hash above. The policy deliberately avoids enabling
`'unsafe-inline'` for the full `style-src` directive.

## Other response headers

- `X-Content-Type-Options: nosniff` prevents MIME-type sniffing.
- `Referrer-Policy: strict-origin-when-cross-origin` limits cross-site referrer detail.
- `Permissions-Policy` disables camera, microphone, geolocation, and payment APIs.
- `Strict-Transport-Security` enforces HTTPS after the first secure response.
- `X-Frame-Options: DENY` is retained as a compatibility fallback for CSP
  `frame-ancestors`.

The API is configured separately with a CORS allow-list. CSP `connect-src` is not a
replacement for server-side CORS, request validation, Turnstile, or API authorization.
