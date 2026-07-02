import type { NextConfig } from "next";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Extract origin (scheme + host) from the API URL for CSP
let apiOrigin = apiUrl;
try {
  apiOrigin = new URL(apiUrl).origin;
} catch {
  // fallback: keep as-is
}

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `connect-src 'self' ${apiOrigin}`,     // allow fetch to the backend
      "script-src 'self' 'unsafe-inline'",   // Next.js requires unsafe-inline for hydration
      "style-src 'self' 'unsafe-inline'",    // Tailwind inline styles
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "frame-ancestors 'none'",              // equivalent to X-Frame-Options DENY
      "object-src 'none'",
      "base-uri 'self'",
    ].join("; "),
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
