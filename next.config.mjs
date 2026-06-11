/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "50mb" },
  },
  async rewrites() {
    // Static apps in public/; serve each index.html at the bare directory path too.
    return [
      { source: "/abu-dhabi-streets", destination: "/abu-dhabi-streets/index.html" },
      { source: "/abu-dhabi-streets/", destination: "/abu-dhabi-streets/index.html" },
      { source: "/pokemon-arena", destination: "/pokemon-arena/index.html" },
      { source: "/pokemon-arena/", destination: "/pokemon-arena/index.html" },
    ];
  },
};

export default nextConfig;
