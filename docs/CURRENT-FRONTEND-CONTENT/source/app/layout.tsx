import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { FloatingActions } from "@/components/layout/FloatingActions";
import { Preloader } from "@/components/layout/Preloader";
import { site } from "@/lib/site";

/** Variable serif with optical sizing — the display voice. */
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["SOFT", "WONK"],
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.tagline} | ${site.name}`,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  openGraph: {
    type: "website",
    locale: site.locale,
    siteName: site.name,
    title: `${site.tagline} | ${site.name}`,
    description: site.description,
    images: [
      { url: site.ogImage, width: 1200, height: 630, alt: site.name },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.tagline} | ${site.name}`,
    description: site.description,
    images: [site.ogImage],
  },
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#3d2a1e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const businessSchema = {
  "@context": "https://schema.org",
  "@type": "MedicalClinic",
  name: site.name,
  description: site.description,
  url: site.url,
  // The schema's address is the Chikkadpally clinic, so pair its number.
  telephone: site.branches[0].phone,
  email: site.email,
  priceRange: site.priceRange,
  image: `${site.url}${site.founder.photo}`,
  address: {
    "@type": "PostalAddress",
    streetAddress: `${site.address.line1}, ${site.address.line2}`,
    addressLocality: site.address.city,
    addressRegion: site.address.state,
    postalCode: site.address.postalCode,
    addressCountry: site.address.country,
  },
  geo: {
    "@type": "GeoCoordinates",
    latitude: site.geo.lat,
    longitude: site.geo.lng,
  },
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ],
      opens: "09:00",
      closes: "21:00",
    },
  ],
  sameAs: site.socials.map((s) => s.href),
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" className={`${fraunces.variable} ${jakarta.variable}`}>
      <body>
        <Preloader />
        <Header />
        <main id="main">{children}</main>
        <Footer />
        <FloatingActions />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(businessSchema) }}
        />
      </body>
    </html>
  );
}
