import { NextRequest, NextResponse } from "next/server";

function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function middleware(request: NextRequest): NextResponse {
  const nonce = createNonce();
  const apiOrigin = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
  const isDevelopment = process.env.NODE_ENV === "development";
  const policy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self'${isDevelopment ? " 'unsafe-eval'" : ""} 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com`,
    "style-src 'self' 'sha256-skqujXORqzxt1aE0NNXxujEanPTX6raoqSscTV/Ww/Y='",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.basemaps.cartocdn.com",
    "font-src 'self' data:",
    `connect-src 'self' ${apiOrigin}${isDevelopment ? " ws://localhost:* ws://127.0.0.1:*" : ""} https://*.basemaps.cartocdn.com https://challenges.cloudflare.com`,
    "frame-src https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "upgrade-insecure-requests"
  ].join("; ");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", policy);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("x-nonce", nonce);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
