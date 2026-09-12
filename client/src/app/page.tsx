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

  const { ref: categoriesRevealRef, visible: categoriesVisible } = useReveal<HTMLDivElement>();
  const { ref: stepsRevealRef, visible: stepsVisible } = useReveal<HTMLDivElement>();
  const { ref: extensionRevealRef, visible: extensionVisible } = useReveal<HTMLDivElement>();

  // An overlapping stack rather than a grid: the point of the picture is
  // "all this is sitting idle in someone's cupboard", and a tidy grid reads
  // as a catalogue instead of a pile. Positions are percentages so the whole
  // arrangement scales with the column.
  const collage = [
    { top: "0%",   left: "6%",  w: "42%", ratio: "4/3", rotate: "-3deg", z: 3,
      image: data?.items[0] ? listingImage(data.items[0]) : "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80",
      title: data?.items[0]?.title ?? "Camera kit" },
    { top: "-2%",  left: "51%", w: "46%", ratio: "5/4", rotate: "2deg",  z: 2,
      image: "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=1100&q=80",
      title: "Weekend camping tent" },
    { top: "50%",  left: "0%",  w: "36%", ratio: "4/3", rotate: "-2deg", z: 4,
      image: data?.items[3] ? listingImage(data.items[3]) : "https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1000&q=80",
      title: data?.items[3]?.title ?? "City bike" },
    { top: "38%",  left: "38%", w: "28%", ratio: "1/1", rotate: "3deg",  z: 6,
      image: data?.items[1] ? listingImage(data.items[1]) : "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=900&q=80",
      title: data?.items[1]?.title ?? "Drill set" },
    { top: "66%",  left: "26%", w: "24%", ratio: "1/1", rotate: "-4deg", z: 5,
      image: data?.items[2] ? listingImage(data.items[2]) : "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=800&q=80",
      title: data?.items[2]?.title ?? "Headphones" },
    { top: "56%",  left: "60%", w: "38%", ratio: "4/3", rotate: "2deg",  z: 3,
      image: "https://images.unsplash.com/photo-1626379953822-baec19c3accd?auto=format&fit=crop&w=1000&q=80",
      title: "Studio light" },
  ];

  return (
    <PublicShell>
      <section className="relative overflow-hidden bg-card">
        {/* Ambient gradient blobs — slow float, purely decorative, behind everything */}
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 animate-[float_9s_ease-in-out_infinite] rounded-full bg-linear-to-br from-primary-300/30 to-fuchsia-300/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 top-40 h-112 w-md animate-[float_11s_ease-in-out_infinite_1s] rounded-full bg-linear-to-br from-primary/20 to-primary-200/20 blur-3xl" />

        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 pb-6 pt-8 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:pb-10 lg:pt-12">
          <div className="flex flex-col justify-center animate-[fadeInUp_0.7s_ease-out]">
            <h1 className="max-w-xl text-4xl font-bold leading-[1.06] tracking-tight text-foreground sm:text-6xl">
              Rent <span className="text-primary">Smart.</span>
              <br />
              Own <span className="text-primary">Less.</span>
              <br />
              Live <span className="text-primary">More.</span>
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
          </div>

          <div className="relative mt-2 hidden min-h-[26rem] lg:block">
            {collage.map(({ image, title, top, left, w, ratio, rotate, z }, index) => (
              <div
                key={`${title}-${index}`}
                style={{
                  top,
                  left,
                  width: w,
                  aspectRatio: ratio,
                  zIndex: z,
                  transform: `rotate(${rotate})`,
                  animationDelay: `${index * 90}ms`,
                }}
                className="group absolute animate-[fadeInUp_0.6s_ease-out_backwards] overflow-hidden rounded-2xl bg-muted shadow-lg shadow-black/10 ring-4 ring-card transition-transform duration-500 hover:z-10 hover:scale-[1.04] hover:rotate-0"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image}
                  alt={title}
                  className="h-full w-full object-cover saturate-[1.1] transition-transform duration-700 ease-out group-hover:scale-105"
                />
              </div>
            ))}
          </div>

          {/* Overlapping tiles need room to overlap into. On a phone there is
              none, so the same photographs run as a plain scroller. */}
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 lg:hidden">
            {collage.map(({ image, title }, index) => (
              <div
                key={`m-${title}-${index}`}
                className="h-36 w-44 shrink-0 overflow-hidden rounded-2xl bg-muted shadow-md shadow-black/10"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt={title} className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* A band directly under the hero rather than a card grid further down.
          It is the first thing to do on the page — pick a kind of thing — so
          it sits where the eye lands after the headline, and the counts are
          real so an empty category reads as empty rather than as coming soon. */}
      <section className="border-y border-border bg-muted">
        <div
          ref={categoriesRevealRef}
          className="mx-auto grid max-w-7xl grid-cols-3 gap-2 px-4 py-7 sm:px-6 md:grid-cols-6"
        >
          {categoryStats.slice(0, 6).map((category, index) => {
            const Icon = categoryIcons[category.name as keyof typeof categoryIcons] ?? Package;
            const count = stats
              ? stats.listingsByCategory?.find((row) => row.category === category.slug)?.count ?? 0
              : category.count;
            return (
              <Link
                key={category.slug}
                href={`${ROUTES.SEARCH}?category=${category.slug}`}
                style={{
                  transitionDelay: categoriesVisible ? `${index * 60}ms` : "0ms",
                }}
                className={`group rounded-xl border border-border bg-white p-5 text-center shadow-sm transition-all duration-500 hover:-translate-y-1 hover:border-primary hover:shadow-lg hover:shadow-primary/10 ${
                  categoriesVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
                }`}
              >
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-card text-primary shadow-sm ring-1 ring-border transition-transform duration-300 group-hover:-translate-y-0.5">
                  <Icon size={21} />
                </span>
                <span className="text-sm font-semibold text-foreground">{category.name}</span>
                <span className="text-xs text-muted-foreground">
                  {count.toLocaleString("en-IN")}+ items
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section id="how-it-works" className="border-y border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-14 text-center sm:px-6">
          <h2 className="text-2xl font-bold">How IdleX Works</h2>
          <div ref={stepsRevealRef} className="mt-9 grid gap-5 md:grid-cols-5">
            {steps.map(({ title, copy, Icon }, index) => (
              <div
                key={title}
                style={{ transitionDelay: stepsVisible ? `${index * 90}ms` : "0ms" }}
                className={`relative transition-all duration-500 ${
                  stepsVisible ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"
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
          ref={extensionRevealRef}
          className={`relative mx-auto grid max-w-7xl gap-6 px-4 py-12 transition-all duration-700 sm:px-6 lg:grid-cols-[1fr_420px] ${
            extensionVisible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
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