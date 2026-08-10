import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host?.includes("localhost") ? "http" : "https");
  const metadataBase = new URL(host ? `${protocol}://${host}` : "http://localhost:3000");
  const description = "IHK-Prototyp für belegbasierte Lebenslaufanalyse, Anschreiben und Interviewvorbereitung.";
  const imageUrl = new URL("/og.png", metadataBase).toString();

  return {
    metadataBase,
    title: "CareerPilot AI – prüfbare Bewerbungsassistenz",
    description,
    openGraph: {
      title: "CareerPilot AI",
      description,
      type: "website",
      locale: "de_DE",
      images: [{ url: imageUrl, width: 1200, height: 630, alt: "CareerPilot AI – prüfbare Bewerbungsassistenz" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "CareerPilot AI",
      description,
      images: [imageUrl],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
