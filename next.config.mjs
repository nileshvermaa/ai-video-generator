/** @type {import('next').NextConfig} */
const nextConfig = {
  // Don't bundle the heavy node-only render deps into the server build.
  serverExternalPackages: ["@vercel/sandbox"],
};

export default nextConfig;
