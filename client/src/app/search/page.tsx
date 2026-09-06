"use client";

import * as React from "react";

import { PublicShell } from "@/components/marketplace/app-shell";
import { ListingCard } from "@/components/marketplace/listing-card";
import { Button } from "@/components/ui/button";
import { ChevronDown, Grid, MapPin, Search as SearchIcon, Tags } from "@/components/ui/icons";
import { Input, Select } from "@/components/ui/input";
import { useFetchData } from "@/lib/use-fetch-data";
import { toCard } from "@/lib/api-types";
import type { Listing, ListingQueryResult } from "@/lib/api-types";
import { CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/utils";

const SORTS = [
  { value: "-createdAt", label: "Newest" },
  { value: "price-low", label: "Price: Low to High" },
  { value: "rating", label: "Top rated" },
];

const CITIES = ["Hyderabad", "Bhimavaram", "Pedanandipadu", "Vijayawada", "Visakhapatnam"];

const AVAILABILITY = [
  { value: "", label: "Anytime" },
  { value: "today", label: "Available today" },
  { value: "week", label: "This week" },
];

const MAX_PRICE = 5000;

/** A dropdown that reads as a pill, for the quick filters above the results. */
function FilterPill({
  icon,
  value,
  onChange,
  options,
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative inline-flex items-center gap-2 rounded-lg border border-border bg-card py-2 pl-3 pr-8 text-sm shadow-sm">
      <span className="text-muted-foreground">{icon}</span>
      <span className="font-medium">
        {options.find((o) => o.value === value)?.label ?? options[0].label}
      </span>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 text-muted-foreground" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = React.use(searchParams);

  // Two layers of state. The pills and the sidebar both edit `draft`; only the
  // pills apply immediately. The sidebar waits for Apply, because a price
  // slider that refetches on every pixel is unusable on a slow connection.
  const initial = {
    q: params.q ?? "",
    city: "",
    category: params.category ?? "",
    sort: "-createdAt",
    maxPrice: MAX_PRICE,
    availability: "",
  };
  const [applied, setApplied] = React.useState(initial);
  const [draft, setDraft] = React.useState(initial);

  // Which page of results has been pulled in, and everything pulled so far.
  // The API pages at twenty; the grid used to render whichever page it last
  // fetched, so a search reporting "31 results found" showed twenty of them
  // and offered no way to reach the other eleven.
  const [page, setPage] = React.useState(1);
  const [items, setItems] = React.useState<Listing[]>([]);

  function applyNow(patch: Partial<typeof initial>) {
    setDraft((d) => ({ ...d, ...patch }));
    setApplied((a) => ({ ...a, ...patch }));
    // A changed filter is a different question — start its answer again.
    setPage(1);
  }

  const urlParams = new URLSearchParams({ status: "published" });
  if (applied.category) urlParams.set("category", applied.category);
  if (applied.city) urlParams.set("city", applied.city);
  if (applied.q) urlParams.set("q", applied.q);
  if (applied.maxPrice < MAX_PRICE) urlParams.set("maxPrice", String(applied.maxPrice));
  urlParams.set(
    "ordering",
    applied.sort === "price-low" ? "pricePerDay" : applied.sort === "rating" ? "-ratingAvg" : "-createdAt"
  );

  urlParams.set("page", String(page));

  const { data, isLoading, error } = useFetchData<ListingQueryResult>(
    `/api/listings?${urlParams.toString()}`,
    [applied.city, applied.category, applied.q, applied.sort, applied.maxPrice, page]
  );

  React.useEffect(() => {
    if (!data) return;
    setItems((prev) => {
      // Page one replaces; later pages extend. Keyed by id because an
      // effect can run twice for the same response, and a duplicate key
      // in the grid is a React error rather than a cosmetic problem.
      const base = data.pagination.page === 1 ? [] : prev;
      const seen = new Set(base.map((item) => item._id));
      return [...base, ...data.items.filter((item) => !seen.has(item._id))];
    });
  }, [data]);

  const total = data?.pagination.total ?? 0;
  const hasMore = data ? data.pagination.page < data.pagination.pages : false;
  // The first page swaps the grid for a loading state; later pages leave
  // what is already on screen where it is.
  const loadingFirstPage = isLoading && page === 1;
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);

  return (
    <PublicShell>
      <section className="bg-muted">
        <div className="mx-auto max-w-7xl px-4 pb-12 pt-9 sm:px-6">
          <h1 className="text-3xl font-bold tracking-tight">Search rentals</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Find the perfect item you need</p>

          {/* The four things people reach for first, one click from anywhere on
              the page. The full set stays in the panel below. */}
          <div className="mt-6 flex flex-wrap gap-2.5">
            <FilterPill
              icon={<Tags size={15} />}
              value={draft.category}
              onChange={(category) => applyNow({ category })}
              options={[
                { value: "", label: "All Categories" },
                ...CATEGORIES.map((c) => ({ value: c.slug, label: c.name })),
              ]}
            />
            <FilterPill
              icon={<MapPin size={15} />}
              value={draft.city}
              onChange={(city) => applyNow({ city })}
              options={[
                { value: "", label: "All locations" },
                ...CITIES.map((c) => ({ value: c, label: c })),
              ]}
            />
            <FilterPill
              icon={<Tags size={15} />}
              value={draft.sort === "price-low" ? "price-low" : ""}
              onChange={(v) => applyNow({ sort: v === "price-low" ? "price-low" : "-createdAt" })}
              options={[
                { value: "", label: "Price: Any" },
                { value: "price-low", label: "Price: Low to High" },
              ]}
            />
            <FilterPill
              icon={<Grid size={15} />}
              value={draft.sort}
              onChange={(sort) => applyNow({ sort })}
              options={SORTS.map((s) => ({ value: s.value, label: `Sort by: ${s.label}` }))}
            />
          </div>

          <div className="mt-5 grid gap-5 rounded-2xl border border-border bg-card p-5 shadow-sm lg:grid-cols-[248px_1fr]">
            <aside className="h-max">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Filters</h2>
                <button
                  onClick={() => {
                    setDraft(initial);
                    setApplied(initial);
                  }}
                  className="text-sm font-medium text-primary transition-colors hover:text-primary-700"
                >
                  Clear all
                </button>
              </div>

              <div className="mt-4 flex flex-col gap-4">
                <Input
                  label="Search"
                  value={draft.q}
                  onChange={(e) => setDraft({ ...draft, q: e.target.value })}
                  placeholder="Search items..."
                />
                <Select
                  label="Location"
                  value={draft.city}
                  onChange={(e) => setDraft({ ...draft, city: e.target.value })}
                  options={[
                    { value: "", label: "All locations" },
                    ...CITIES.map((c) => ({ value: c, label: c })),
                  ]}
                />
                <Select
                  label="Category"
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  options={[
                    { value: "", label: "All categories" },
                    ...CATEGORIES.map((c) => ({ value: c.slug, label: c.name })),
                  ]}
                />

                <div>
                  <p className="text-sm font-medium text-foreground">Price Range</p>
                  <input
                    type="range"
                    min={0}
                    max={MAX_PRICE}
                    step={100}
                    value={draft.maxPrice}
                    onChange={(e) => setDraft({ ...draft, maxPrice: Number(e.target.value) })}
                    aria-label="Maximum price per day"
                    className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-primary-100 accent-primary"
                  />
                  <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
                    <span>₹0</span>
                    <span className="tabular-nums">
                      ₹{draft.maxPrice.toLocaleString("en-IN")}
                      {draft.maxPrice >= MAX_PRICE ? "+" : ""}
                    </span>
                  </div>
                </div>

                <Select
                  label="Availability"
                  value={draft.availability}
                  onChange={(e) => setDraft({ ...draft, availability: e.target.value })}
                  options={AVAILABILITY}
                />

                <Button
                  className="w-full"
                  onClick={() => setApplied(draft)}
                  disabled={!dirty}
                >
                  Apply Filters
                </Button>
              </div>
            </aside>

            <div>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {loadingFirstPage ? "Searching…" : `${total} result${total === 1 ? "" : "s"} found`}
                </p>
                <button
                  type="button"
                  disabled
                  title="Map view is coming soon"
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5",
                    "text-sm font-medium text-muted-foreground opacity-60"
                  )}
                >
                  <Grid size={15} />
                  Map view
                </button>
              </div>

              {error && (
                <p className="mb-4 rounded-md bg-danger-50 p-3 text-sm text-danger-700">{error.message}</p>
              )}

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {items.map((listing) => (
                  <ListingCard key={listing._id} listing={toCard(listing)} />
                ))}
              </div>

              {hasMore && (
                <div className="mt-8 flex justify-center">
                  <Button
                    variant="outline"
                    loading={isLoading && page > 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Show more ({total - items.length} left)
                  </Button>
                </div>
              )}

              {!loadingFirstPage && !error && items.length === 0 && (
                <div className="rounded-xl border border-border bg-muted p-10 text-center">
                  <SearchIcon size={22} className="mx-auto text-muted-foreground" />
                  <p className="mt-3 font-medium">Nothing matches these filters</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Widen the price range or clear a filter to see more.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
