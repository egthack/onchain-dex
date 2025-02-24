/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    unoptimized: true,
  },
  basePath: "/frontend",
  async rewrites() {
    return [
      {
        source: "/frontend/:path*",
        destination: "/:path*",
      },
      {
        source: "/frontend/api/:path*",
        destination: "/api/:path*",
      },
    ];
  },
};

export default nextConfig;
