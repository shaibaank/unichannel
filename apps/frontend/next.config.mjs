/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output for a lean Docker image.
  output: "standalone",
};

export default nextConfig;
