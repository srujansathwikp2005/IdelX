"use client";

import * as React from "react";
import Link from "next/link";
import { PublicShell } from "@/components/marketplace/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { categoryStats } from "@/lib/mock-data";
import { useFetchData } from "@/lib/use-fetch-data";
import { listingImage } from "@/lib/api-types";
import type { ListingQueryResult, MarketplaceStats } from "@/lib/api-types";
import { ROUTES } from "@/lib/constants";
import { useIsMounted } from "@/lib/auth";
import { useHostStatus } from "@/lib/use-host-status";
import {
  ArrowRight,
  Bike,
  CalendarCheck,
  Camera,
  Home as HomeIcon,
  MessageCircle,
  Package,
  Search,
  Smartphone,
  Star,
  Trees,
  Wrench,
} from "@/components/ui/icons";

const steps = [
  { title: "Find", copy: "Search for items you need", Icon: Search },
  { title: "Book", copy: "Choose dates and place request", Icon: CalendarCheck },
  { title: "Connect", copy: "Chat with owner and confirm", Icon: MessageCircle },
  { title: "Use & Return", copy: "Enjoy it and return on time", Icon: Package },
  { title: "Review", copy: "Rate your experience", Icon: Star },
];

const categoryIcons = {
  Electronics: Smartphone,
  Cameras: Camera,
  Outdoor: Trees,
  Tools: Wrench,
  "Home Appliances": HomeIcon,
  Sports: Bike,
};

// Lightweight scroll-reveal — no library, just IntersectionObserver.
function useReveal<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

export default function Home() {
  const { data } = useFetchData<ListingQueryResult>("");
  const { data: stats } = useFetchData<MarketplaceStats>("/api/stats");
  const mounted = useIsMounted();
  const { hasListings } = useHostStatus();
  const isHost = mounted && hasListings;

  const categoriesReveal = useReveal<HTMLDivElement>();
  const stepsReveal = useReveal<HTMLDivElement>();
  const extensionReveal = useReveal<HTMLDivElement>();

  const tiles = [
    { className: "col-span-2 row-span-2", image: data?.items[0] ? listingImage(data.items[0]) : "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80", title: data?.items[0]?.title ?? "Camera kit" },
    { className: "col-span-1 row-span-1", image: data?.items[1] ? listingImage(data.items[1]) : "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=1200&q=80", title: data?.items[1]?.title ?? "Drill set" },
    { className: "col-span-1 row-span-1", image: data?.items[2] ? listingImage(data.items[2]) : "https://images.unsplash.com/photo-1626379953822-baec19c3accd?auto=format&fit=crop&w=1200&q=80", title: data?.items[2]?.title ?? "Projector" },
    { className: "col-span-1 row-span-1", image: data?.items[3] ? listingImage(data.items[3]) : "https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1200&q=80", title: data?.items[3]?.title ?? "City bike" },
    { className: "col-span-1 row-span-1", image: "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=900&q=80", title: "Weekend camping tent" },
  ];

  return (
    <PublicShell>
      <section className="relative overflow-hidden bg-card">
        {/* Ambient gradient blobs — slow float, purely decorative, behind everything */}
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 animate-[float_9s_ease-in-out_infinite] rounded-full bg-linear-to-br from-primary-300/30 to-fuchsia-300/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 top-40 h-112 w-md animate-[float_11s_ease-in-out_infinite_1s] rounded-full bg-linear-to-br from-primary/20 to-primary-200/20 blur-3xl" />

        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 pb-6 pt-8 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:pb-10 lg:pt-12">
          <div className="flex flex-col justify-center animate-[fadeInUp_0.7s_ease-out]">
            <Badge className="w-fit border-primary-200 bg-primary-50 text-primary-700">Rent Smart. Live More.</Badge>
            <h1 className="mt-5 max-w-xl text-4xl font-bold leading-tight text-foreground sm:text-6xl">
              Rent{" "}
              <span className="bg-linear-to-r from-primary to-primary-500 bg-clip-text text-transparent">
                Anything.
              </span>
              <br />
              Own Nothing.
              <br />
              Live Fully.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">
              IdleX is your trusted community marketplace to rent items you love and earn from
              what you do not use.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={ROUTES.SEARCH}>
                <Button
                  size="lg"
                  rightIcon={<ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />}
                  className="group shadow-md shadow-primary/20 transition-transform hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/30"
                >
                  Browse Items
                </Button>
              </Link>
              <Link href={isHost ? ROUTES.LISTING_NEW : ROUTES.BECOME_HOST}>
                <Button size="lg" variant="outline" className="transition-transform hover:-translate-y-0.5">
                  {isHost ? "Add another listing" : "Become a Host"}
                </Button>
              </Link>
            </div>
            <div className="mt-10 grid max-w-lg grid-cols-3 gap-5">
              {[
                [`${(stats?.activeListings ?? data?.pagination.total ?? 10000).toLocaleString("en-IN")}+`, "Active Listings"],
                [`${(stats?.happyRenters ?? 5000).toLocaleString("en-IN")}+`, "Happy Renters"],
                [stats?.averageRating ? stats.averageRating.toFixed(1) : "4.8", "Average Rating"],
              ].map(([value, label]) => (
                <div key={label}>
                  <p className="text-2xl font-bold text-primary">{value}</p>
                  <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative min-h-130">
            <div className="grid h-full grid-cols-3 grid-rows-4 gap-4">
              {tiles.map(({ image, title, className }, index) => (
                <div
                  key={`${title}-${index}`}
                  style={{ animationDelay: `${index * 90}ms` }}
                  className={`${className} group relative animate-[fadeInUp_0.6s_ease-out_backwards] overflow-hidden rounded-2xl bg-muted shadow-md shadow-black/5 ring-1 ring-black/5 transition-all duration-500 hover:shadow-xl hover:shadow-primary/10`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image}
                    alt={title}
                    className="h-full w-full origin-center scale-105 object-cover saturate-[1.15] contrast-[1.03] transition-transform duration-700 ease-out group-hover:scale-115"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-primary-900/15 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Popular Categories</h2>
            <p className="mt-2 text-sm text-muted-foreground">Find the things you need without buying them.</p>
          </div>
          <Link href={ROUTES.CATEGORIES} className="text-sm font-semibold text-primary transition-colors hover:text-primary-600">
            View all
          </Link>
        </div>
        <div
          ref={categoriesReveal.ref}
          className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-6"
        >
          {categoryStats.slice(0, 6).map((category, index) => {
            const Icon = categoryIcons[category.name as keyof typeof categoryIcons] ?? Package;
            const count = stats ? stats.listingsByCategory?.find((row) => row.category === category.slug)?.count ?? 0 : category.count;
            return (
              <Link
                key={category.slug}
                href={`${ROUTES.SEARCH}?category=${category.slug}`}
                style={{
                  transitionDelay: categoriesReveal.visible ? `${index * 60}ms` : "0ms",
                }}
                className={`group rounded-xl border border-border bg-card p-5 text-center shadow-sm transition-all duration-500 hover:-translate-y-1 hover:border-primary hover:shadow-lg hover:shadow-primary/10 ${
                  categoriesReveal.visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
                }`}
              >
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-linear-to-br from-primary to-primary-600 text-on-brand shadow-sm shadow-primary/30 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                  <Icon size={22} />
                </span>
                <p className="mt-3 font-semibold">{category.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{count.toLocaleString("en-IN")}+ items</p>
              </Link>
            );
          })}
        </div>
      </section>

      <section id="how-it-works" className="border-y border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-14 text-center sm:px-6">
          <h2 className="text-2xl font-bold">How IdleX Works</h2>
          <div ref={stepsReveal.ref} className="mt-9 grid gap-5 md:grid-cols-5">
            {steps.map(({ title, copy, Icon }, index) => (
              <div
                key={title}
                style={{ transitionDelay: stepsReveal.visible ? `${index * 90}ms` : "0ms" }}
                className={`relative transition-all duration-500 ${
                  stepsReveal.visible ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"
                }`}
              >
                {index < steps.length - 1 && (
                  <div className="absolute left-[55%] top-7 hidden h-px w-[90%] bg-linear-to-r from-primary/40 to-border md:block" />
                )}
                <div className="group relative mx-auto grid h-14 w-14 place-items-center rounded-full border border-border bg-card text-primary shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary hover:shadow-lg hover:shadow-primary/20">
                  <Icon size={22} className="transition-transform duration-300 group-hover:scale-110" />
                </div>
                <p className="mt-4 text-sm font-bold">{index + 1}. {title}</p>
                <p className="mx-auto mt-2 max-w-32 text-xs leading-5 text-muted-foreground">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-primary-50/60">
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-linear-to-br from-primary/15 to-primary-300/15 blur-3xl" />
        <div
          ref={extensionReveal.ref}
          className={`relative mx-auto grid max-w-7xl gap-6 px-4 py-12 transition-all duration-700 sm:px-6 lg:grid-cols-[1fr_420px] ${
            extensionReveal.visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
          }`}
        >
          <div>
            <Badge className="border-primary-200 bg-card text-primary-700">New rental extension</Badge>
            <h2 className="mt-4 text-3xl font-bold">Need one more day? Extend without starting over.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Renters can check extension rules before booking, and owners can set extension pricing,
              maximum days, and approval rules while listing an item.
            </p>
          </div>
          <div className="rounded-2xl border border-primary-100 bg-card p-5 shadow-lg shadow-primary/5 transition-shadow duration-300 hover:shadow-xl hover:shadow-primary/10">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Extension request</span>
              <Badge variant="warning">Pending owner</Badge>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Extra days</span><strong>2 days</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Extension rate</span><strong>20% higher</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total due</span><strong>Rs 3,200</strong></div>
            </div>
          </div>
        </div>
      </section>

      </PublicShell>
  );
}