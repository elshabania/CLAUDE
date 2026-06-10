import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Masterplan Highway Analyzer",
  description:
    "Extract the highway network from a masterplan PDF, estimate its dimensions, and grade HCM Level of Service.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
