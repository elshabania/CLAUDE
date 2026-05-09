import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Road CAD Viewer",
  description: "Upload DWG/DXF road drawings and inspect detected geometry.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
