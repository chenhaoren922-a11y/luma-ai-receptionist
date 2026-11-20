import type { NextConfig } from "next";

const backend = process.env.LUMA_BACKEND_URL?.trim();
const backendOrigin = backend ? new URL(backend) : undefined;
if (backendOrigin && (
  backendOrigin.protocol !== "https:" ||
  backendOrigin.pathname !== "/" ||
  backendOrigin.search || backendOrigin.hash ||
  backendOrigin.username || backendOrigin.password
)) {
  throw new Error("LUMA_BACKEND_URL must be an HTTPS origin with no path or credentials.");
}

const nextConfig: NextConfig = {
  agentRules: false,
  devIndicators: false,
  serverExternalPackages: ["googleapis", "sql.js"],
  async rewrites() {
    return {
      beforeFiles: backendOrigin
        ? [{ source: "/api/:path*", destination: `${backendOrigin.origin}/api/:path*` }]
        : [],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
