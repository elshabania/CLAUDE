/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "50mb" },
  },
  async rewrites() {
    // The Abu Dhabi Streets and STEAM 2040 apps are static pages in public/;
    // serve their index.html at the bare directory path too.
    return [
      { source: "/abu-dhabi-streets", destination: "/abu-dhabi-streets/index.html" },
      { source: "/abu-dhabi-streets/", destination: "/abu-dhabi-streets/index.html" },
      { source: "/steam-2040", destination: "/steam-2040/index.html" },
      { source: "/steam-2040/", destination: "/steam-2040/index.html" },
    ];
  },
};

export default nextConfig;
