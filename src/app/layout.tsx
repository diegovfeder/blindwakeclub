import type { Metadata } from "next";
import Script from "next/script";
import Image from "next/image";
import Link from "next/link";
import { Manrope, Space_Grotesk } from "next/font/google";

import "@/app/globals.css";
import InstagramIcon from "@/components/instagram-icon";
import { BRAND_NAME, SOCIAL_LINKS } from "@/lib/constants";

const headingFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-heading",
});

const bodyFont = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: {
    default: BRAND_NAME,
    template: `%s | ${BRAND_NAME}`,
  },
  description: `Fluxo digital de termo e cadastro da ${BRAND_NAME}.`,
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/apple-touch-icon.png",
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${headingFont.variable} ${bodyFont.variable}`}>
      <body>
        <div className="site-shell">
          <header className="site-header">
        {process.env.NODE_ENV === "development" && (
          <Script
            src="//unpkg.com/react-grab/dist/index.global.js"
            crossOrigin="anonymous"
            strategy="beforeInteractive"
          />
        )}
            <Link href="/" className="site-brand" aria-label="Início Blind Wake Club">
              <Image
                src="/branding/logo-wordmark.png"
                alt={BRAND_NAME}
                width={300}
                height={275}
                className="site-logo"
                priority
              />
            </Link>

            <div className="header-actions">
              <a
                href={SOCIAL_LINKS.instagram}
                target="_blank"
                rel="noreferrer"
                aria-label="Instagram da Blind Wake Club"
                className="icon-link instagram-link"
              >
                <InstagramIcon size={22} color="currentColor" className="instagram-icon" />
              </a>
            </div>
          </header>

          {children}
        </div>
      </body>
    </html>
  );
}
