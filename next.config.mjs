/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "50mb" },
  },
  async rewrites() {
    // Static apps live in public/; serve their index.html at the bare
    // directory path too.
    return [
      { source: "/abu-dhabi-streets", destination: "/abu-dhabi-streets/index.html" },
      { source: "/abu-dhabi-streets/", destination: "/abu-dhabi-streets/index.html" },
      { source: "/pokemon-arcade", destination: "/pokemon-arcade/index.html" },
      { source: "/pokemon-arcade/", destination: "/pokemon-arcade/index.html" },
    ];
  },
};

export default nextConfig;
