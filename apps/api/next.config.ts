import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@society-ev/contracts", "@society-ev/db"],
};

export default nextConfig;
