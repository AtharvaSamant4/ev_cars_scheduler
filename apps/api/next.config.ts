import type { NextConfig } from "next";
import os from "os";

// Permit every active local IPv4 interface in development. Windows can expose
// Docker/VPN adapters before Wi-Fi, so selecting only the first address makes
// physical-phone demos fail unpredictably.
function getLocalIps() {
  const interfaces = os.networkInterfaces();
  const addresses = new Set<string>();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]!) {
      if (iface.family === "IPv4" && !iface.internal) {
        addresses.add(iface.address);
      }
    }
  }
  return [...addresses];
}

const allowedDevOrigins = [
  "127.0.0.1",
  "localhost",
  ...getLocalIps(),
];

const nextConfig: NextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  transpilePackages: ["@society-ev/contracts", "@society-ev/db"],
  allowedDevOrigins,
  serverExternalPackages: ["pdfkit"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
