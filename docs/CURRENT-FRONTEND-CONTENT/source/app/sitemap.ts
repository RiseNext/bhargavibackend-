import type { MetadataRoute } from "next";
import { site } from "@/lib/site";
import { services } from "@/content/services";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = [
    { path: "", priority: 1 },
    { path: "/about", priority: 0.8 },
    { path: "/services", priority: 0.9 },
    { path: "/gallery", priority: 0.6 },
    { path: "/videos", priority: 0.6 },
    { path: "/testimonials", priority: 0.7 },
    { path: "/blog", priority: 0.5 },
    { path: "/careers", priority: 0.5 },
    { path: "/contact", priority: 0.8 },
  ];

  return [
    ...staticRoutes.map((r) => ({
      url: `${site.url}${r.path}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: r.priority,
    })),
    ...services.map((s) => ({
      url: `${site.url}/services/${s.slug}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
