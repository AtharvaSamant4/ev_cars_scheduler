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

const nextConfig: NextConfig = {
  transpilePackages: ["@society-ev/contracts", "@society-ev/db"],
  allowedDevOrigins: currentIp ? [currentIp] : [],
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
