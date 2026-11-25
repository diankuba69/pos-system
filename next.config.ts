import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    // Hanya host yang benar-benar dipakai untuk gambar produk (Supabase Storage).
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
  allowedDevOrigins: ["*.vercel.run", "*.preview.emergentagent.com",
    "*.preview.emergentcf.cloud",
    "*.emergentagent.com",
  ],
};

export default nextConfig;
