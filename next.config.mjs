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
      // STEAM-AI web app demo (static mode: a snapshot of the API in
      // public/steam-ai/data) is a static SPA build in public/steam-ai; files are
      // served first, unmatched client routes fall back to its index.html.
      { source: "/steam-ai", destination: "/steam-ai/index.html" },
      { source: "/steam-ai/:path*", destination: "/steam-ai/index.html" },
    ];
  },
};

export default nextConfig;
