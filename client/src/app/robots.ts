import type { MetadataRoute } from "next";
import { SITE_CONFIG } from "@/config/site";

// Served by the server as a real /robots.txt, so it never passes through
// RouteGuard. A client-rendered page here would be redirected to /login for
// any crawler that executes JavaScript.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Everything requiring a session. Crawling these wastes budget on
      // pages that only ever redirect, and keeps URLs that reference a
      // specific person's data out of search results.
      disallow: [
        "/admin",
        "/api/",
        "/checkout",
        "/dashboard",
        "/kyc",
        "/kyc-verification",
        "/messages",
        "/my-listings",
        "/my-rentals",
        "/notifications",
        "/payments",
        "/profile",
        "/settings",
        "/wishlist",
        // Uploads are user-submitted files including KYC documents; they
        // must never be indexed.
        "/uploads/",
        // Auth pages have no search value and can leak a ?next= target.
        "/login",
        "/register",
        "/sign-up",
        "/forgot-password",
        "/verify-otp",
        "/verify-email",
      ],
    },
    sitemap: `${SITE_CONFIG.url}/sitemap.xml`,
  };
}
