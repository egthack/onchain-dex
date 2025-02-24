/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: "/:path*",
        destination: "/_next/static/:path*",
      },
      {
        source: "/api/:path*",
        destination: "/api/:path*",
      },
    ];
  },
};

export default nextConfig;
