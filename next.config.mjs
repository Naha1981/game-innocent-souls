/** @type {import('next').NextConfig} */
const nextConfig = {
  // ESLint runs as an explicit CI quality gate (`npm run lint`).
  // Next 15's build-time ESLint integration can conflict with flat-config
  // compatibility layers, so production compilation should not be blocked by it.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
