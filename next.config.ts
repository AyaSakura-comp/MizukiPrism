import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  output: "export",
  basePath: isProd ? "/MizukiPrism" : "",
  assetPrefix: isProd ? "/MizukiPrism/" : "",
};

export default nextConfig;
