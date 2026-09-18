import type { Metadata } from "next";
import { Poppins, Space_Grotesk } from "next/font/google";
import "./globals.css";

const headingFont = Space_Grotesk({
  variable: "--font-heading",
  subsets: ["latin"],
});

const bodyFont = Poppins({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const description = "Course material, recorded lectures, live Kuppi sessions, deadlines and an AI study assistant for FIT Batch 23.";

export const metadata: Metadata = {
  // Link previews need absolute image URLs; set NEXT_PUBLIC_SITE_URL in production.
  metadataBase: new URL(siteUrl),
  title: { default: "FIT23 Hub", template: "%s | FIT23 Hub" },
  description,
  openGraph: {
    type: "website",
    siteName: "FIT23 Hub",
    title: "FIT23 Hub",
    description,
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "FIT23 batch logo" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "FIT23 Hub",
    description,
    images: ["/og-image.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${headingFont.variable} ${bodyFont.variable} bg-[var(--bg)] text-[var(--text)] antialiased`}>
        {children}
      </body>
    </html>
  );
}
