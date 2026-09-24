/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "50mb" },
  },
  async redirects() {
    // The game's assets are relative (./assets), so it must be served from /play/ with the slash.
    return [{ source: "/play", destination: "/play/", permanent: false }];
  },
  async rewrites() {
    // The Abu Dhabi Streets app is a static page in public/; serve its
    // index.html at the bare directory path too.
    return [
      { source: "/abu-dhabi-streets", destination: "/abu-dhabi-streets/index.html" },
      { source: "/abu-dhabi-streets/", destination: "/abu-dhabi-streets/index.html" },
      // Wildchord (creature-rpg/) is built into public/play by the prebuild script.
      { source: "/play/", destination: "/play/index.html" },
    ];
  },
};

export default nextConfig;
