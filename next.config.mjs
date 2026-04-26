/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["@anthropic-ai/sdk", "openai"],
  },
};

export default nextConfig;
