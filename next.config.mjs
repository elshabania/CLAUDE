/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static HTML export so the app can ship inside Electron (and any static
  // host) with no Node server. The whole pipeline - PDF extraction,
  // classification, network build, HCM analysis - runs client-side.
  output: "export",
  images: { unoptimized: true },
  productionBrowserSourceMaps: false,
};

export default nextConfig;
