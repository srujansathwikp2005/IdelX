import type { MetadataRoute } from "next";
import { SITE_CONFIG } from "@/config/site";

// Only pages a signed-out visitor can actually reach. Listing a URL that
// redirects to /login is worse than omitting it: the crawler records a
// redirect to a login form rather than content.
//
// Individual listings are deliberately absent — the catalogue is empty, and
// generating entries per listing needs a database read at build time, which
// would couple the build to a live database connection.
const ROUTES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
  { path: "/", priority: 1.0, changeFrequency: "daily" },
  { path: "/search", priority: 0.9, changeFrequency: "daily" },
  { path: "/categories", priority: 0.8, changeFrequency: "weekly" },
  { path: "/become-a-host", priority: 0.7, changeFrequency: "monthly" },
  { path: "/about", priority: 0.5, changeFrequency: "monthly" },
  { path: "/help", priority: 0.5, changeFrequency: "monthly" },
  { path: "/faq", priority: 0.5, changeFrequency: "monthly" },
  { path: "/safety", priority: 0.5, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.4, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/privacy-policy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/security-deposit-policy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/cancellation-refund-policy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/community-guidelines", priority: 0.3, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_CONFIG.url}${path === "/" ? "" : path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
