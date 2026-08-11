import type { NextConfig } from "next";
import os from "os";

// Automatically find the laptop's Wi-Fi IP address
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]!) {
      // Return the first external IPv4 address
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

const currentIp = getLocalIp();
const allowedDevOrigins = [
  "127.0.0.1",
  "localhost",
  ...(currentIp ? [currentIp] : []),
];

const nextConfig: NextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  transpilePackages: ["@society-ev/contracts", "@society-ev/db"],
  allowedDevOrigins,
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
