import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    // image_url produk boleh berupa tautan HTTPS apa pun (termasuk Supabase Storage).
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  allowedDevOrigins: [
    "*.preview.emergentagent.com",
    "*.preview.emergentcf.cloud",
    "*.emergentagent.com",
  ],
};

export default nextConfig;
