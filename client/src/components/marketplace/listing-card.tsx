"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Heart, MapPin, Star } from "@/components/ui/icons";
import { formatCurrency } from "@/lib/formatters";
import { ROUTES } from "@/lib/constants";
import type { ListingStatus } from "@/lib/api-types";

type Listing = {
  id: string;
  title: string;
  category: string;
  location: string;
  price: number;
  rating: number;
  reviews: number;
  image: string;
  tags: string[];
  status: ListingStatus;
};

type ManageActions = {
  onPublish?: (id: string) => void;
  onDelete?: (id: string) => void;
  busy?: boolean;
};

export function ListingCard({
  listing,
  onRemove,
  manage,
}: {
  listing: Listing;
  onRemove?: (id: string) => void;
  manage?: ManageActions;
}) {
  const statusVariant =
    listing.status === "published" ? "success" : listing.status === "paused" ? "warning" : "secondary";

  return (
    <article className="group relative overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/10">
      <Link href={ROUTES.PRODUCT(listing.id)} className="block overflow-hidden">
        <div className="relative aspect-4/3 w-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={listing.image}
            alt={listing.title}
            className="h-full w-full scale-100 object-cover saturate-[1.1] transition-transform duration-500 ease-out group-hover:scale-110"
          />
          {/* Bottom-up tint on hover — makes the image feel "lit" rather than static */}
          <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/25 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        </div>
      </Link>

      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${listing.title} from wishlist`}
          onClick={() => onRemove(listing.id)}
          className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-card/90 text-danger shadow-sm backdrop-blur-sm transition-all duration-200 hover:scale-110 hover:bg-danger hover:text-white active:scale-95"
        >
          <Heart size={17} fill="currentColor" />
        </button>
      )}

      <div className="space-y-3.5 p-4">
        <div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default">{listing.category}</Badge>
              {manage && <Badge variant={statusVariant}>{listing.status}</Badge>}
            </div>
            {!onRemove && (
              <span className="text-muted-foreground transition-colors group-hover:text-primary">
                <Heart size={17} />
              </span>
            )}
          </div>

          <h3 className="mt-2 line-clamp-1 text-base font-semibold transition-colors duration-200 group-hover:text-primary">
            {listing.title}
          </h3>

          {/* Where it is and how it has gone for other people, on one line —
              the two questions asked of every card in a results grid. */}
          <div className="mt-1.5 flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
              <MapPin size={14} className="shrink-0" />
              <span className="truncate">{listing.location}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1 font-medium text-accent-700">
              <Star size={14} className="fill-current" />
              {listing.rating}
              <span className="font-normal text-muted-foreground">({listing.reviews})</span>
            </span>
          </div>
        </div>

        {manage ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              <span className="text-xl font-bold text-foreground">{formatCurrency(listing.price)}</span>
              /day
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={ROUTES.LISTING_EDIT(listing.id)}>
                <Button size="sm" variant="outline" className="transition-transform hover:-translate-y-0.5">
                  Edit
                </Button>
              </Link>
              {manage.onPublish && listing.status !== "published" && (
                <Button
                  size="sm"
                  loading={manage.busy}
                  onClick={() => manage.onPublish?.(listing.id)}
                  className="shadow-sm shadow-primary/20 transition-transform hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/30"
                >
                  Publish
                </Button>
              )}
              {manage.onDelete && (
                <Button
                  size="sm"
                  variant="danger"
                  loading={manage.busy}
                  onClick={() => manage.onDelete?.(listing.id)}
                  className="transition-transform hover:-translate-y-0.5"
                >
                  Delete
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-muted-foreground">
              <span className="text-lg font-bold text-foreground">{formatCurrency(listing.price)}</span>
              {" "}/ day
            </p>
            <Link href={ROUTES.CHECKOUT(listing.id)} className="mt-3 block">
              <Button
                size="sm"
                className="w-full shadow-sm shadow-primary/20 transition-all duration-200 hover:shadow-md hover:shadow-primary/30 active:scale-[0.98]"
              >
                Book Now
              </Button>
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}