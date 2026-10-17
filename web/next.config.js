const apiOrigin = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' https://challenges.cloudflare.com",
  "style-src 'self' 'sha256-skqujXORqzxt1aE0NNXxujEanPTX6raoqSscTV/Ww/Y='",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.basemaps.cartocdn.com",
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin} https://*.basemaps.cartocdn.com https://challenges.cloudflare.com`,
  "frame-src https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests"
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()"
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload"
          }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
