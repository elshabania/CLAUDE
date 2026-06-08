import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Abu Dhabi Population Explorer",
  description:
    "Compare population and population density across Abu Dhabi's regions over time, using official open data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
