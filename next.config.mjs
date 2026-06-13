/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "50mb" },
  },
  async rewrites() {
    // The Abu Dhabi Streets app is a static page in public/; serve its
    // index.html at the bare directory path too.
    return [
      { source: "/abu-dhabi-streets", destination: "/abu-dhabi-streets/index.html" },
      { source: "/abu-dhabi-streets/", destination: "/abu-dhabi-streets/index.html" },
      { source: "/pokemon-arena", destination: "/pokemon-arena/index.html" },
      { source: "/pokemon-arena/", destination: "/pokemon-arena/index.html" },
    ];
  },
};

export default nextConfig;
