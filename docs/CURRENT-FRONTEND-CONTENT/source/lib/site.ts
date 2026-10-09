/**
 * Single source of truth for business details.
 * Everything here came from the client's old site (see docs/textprd.md §1).
 * Items flagged CONFIRM are open questions — see docs/CONTENT-TODO.md.
 */

export const site = {
  name: "Bhargavi Health World",
  shortName: "Bhargavi",
  tagline: "Wellness Center in Chikkadpally",
  description:
    "Holistic wellness care in Chikkadpally, Hyderabad. Acupuncture, acupressure, naturopathy and natural pain-relief therapies led by Anjana Bhargavi.",
  /**
   * Canonical origin, used for metadataBase, sitemap.xml and robots.txt.
   * Override with NEXT_PUBLIC_SITE_URL in Vercel if the live domain differs
   * or you need a staging origin. No trailing slash.
   */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.bhargavihealthworld.com",
  locale: "en_IN",

  founder: {
    name: "Anjana Bhargavi",
    // CONFIRM: old site mixes "Mrs." and "Dr." — qualifications list no medical degree.
    honorific: "Mrs.",
    qualifications: "BA, B.Ed, MA, Diploma in Acupuncture",
    role: "Founder Acupuncture",
    photo: "/images/team/anjana-bhargavi.jpg",
  },

  phones: [
    { label: "+91 70751 57013", href: "tel:+917075157013", branch: "Bowenpally" },
    { label: "+91 98663 76203", href: "tel:+919866376203", branch: "Chikkadpally" },
  ],
  /**
   * The two clinic locations. The appointment form asks which branch the
   * visitor wants before handing the request over to that branch's WhatsApp.
   */
  branches: [
    { name: "Chikkadpally", phone: "+91 98663 76203", whatsapp: "+919866376203" },
    { name: "Bowenpally", phone: "+91 70751 57013", whatsapp: "+917075157013" },
  ],
  whatsapp: {
    number: "+917075157013",
    href: "https://api.whatsapp.com/send?phone=+917075157013&text=hello&lang=en",
  },
  email: "bhargavihealthworld@gmail.com",

  address: {
    line1: "H. No 1-8-539/1/a, Metro Pillar No-1115",
    line2: "Near Pista House, Chikkadpally",
    city: "Hyderabad",
    state: "Telangana",
    postalCode: "500020",
    country: "IN",
    full: "H. No 1-8-539/1/a, Metro Pillar No-1115, Near Pista House, Chikkadpally, Hyderabad, Telangana - 500020",
  },
  geo: { lat: 17.405174930115965, lng: 78.49652574603265 },
  mapsUrl: "https://maps.app.goo.gl/XLX7hEATPodxRXa4A",
  mapEmbedSrc:
    "https://www.google.com/maps?q=17.405174930115965,78.49652574603265&z=16&output=embed",

  priceRange: "₹100–1000",

  hours: [
    { days: "Monday – Sunday", time: "9:00 AM – 9:00 PM" },
  ],

  socials: [
    { name: "Facebook", href: "https://www.facebook.com/Bhargavihealthworld" },
    { name: "Instagram", href: "https://www.instagram.com/bhargavihealthworld/" },
    { name: "YouTube", href: "https://www.youtube.com/@bhargavihealthworld8686" },
  ],

  /** Emblem only — square, green ground, reads well as a circular badge. */
  logo: "/images/brand/bhargavi-mark.png",
  /** Full lockup: emblem + wordmark. Used for the loading screen. */
  logoLockup: "/images/brand/bhargavi-lockup.png",
  /** The logo's own green. Kept in sync with `--color-brand` in globals.css. */
  brandColor: "#44683d",
  /** 1200×630 social preview card. */
  ogImage: "/images/brand/og-card.png",
} as const;

export type NavChild = { label: string; href: string; hint?: string };

export type NavItem = {
  label: string;
  href: string;
  children?: NavChild[];
};

export const nav: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Services", href: "/services" },
  {
    label: "Media",
    href: "/gallery",
    children: [
      { label: "Clinic Gallery", href: "/gallery" },
      { label: "Health Talks", href: "/videos" },
    ],
  },
  { label: "Testimonials", href: "/testimonials" },
  { label: "Blog", href: "/blog" },
  { label: "Careers", href: "/careers" },
  { label: "Contact", href: "/contact" },
];
