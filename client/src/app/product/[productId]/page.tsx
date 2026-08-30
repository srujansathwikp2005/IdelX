"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PublicShell } from "@/components/marketplace/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Heart, MapPin, Repeat, ShieldCheck } from "@/components/ui/icons";
import { StarRating } from "@/components/ui/star-rating";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { useFetchData } from "@/lib/use-fetch-data";
import { useAuth, useIsMounted, errorMessage } from "@/lib/auth";
import { api, getToken } from "@/lib/api-client";
import { ownerName, listingImage } from "@/lib/api-types";
import type { Conversation, Listing, Review } from "@/lib/api-types";
import { ROUTES } from "@/lib/constants";

export default function ProductPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = React.use(params);
  const router = useRouter();
  const { user } = useAuth();
  // Index into the gallery. Reset on navigation so opening a second listing
  // does not start on whatever index the previous one was showing.
  const [activePhoto, setActivePhoto] = React.useState(0);
  const mounted = useIsMounted();
  const signedIn = mounted && (!!user || !!getToken());

  const { data: listing, isLoading, error } = useFetchData<Listing>(`/api/listings/${productId}`, [productId]);
  // Declared here, with the other hooks, and NOT next to the handler that
  // uses them: the early returns below for loading and error states mean any
  // hook placed after them is skipped on those renders. React compares hook
  // counts between renders, so a hook after a conditional return crashes the
  // whole page the moment the condition flips.
  const [messageBusy, setMessageBusy] = React.useState(false);
  const [messageError, setMessageError] = React.useState<string | null>(null);
  React.useEffect(() => setActivePhoto(0), [productId]);

  const { data: reviews } = useFetchData<Review[]>(`/api/listings/${productId}/reviews`, [productId]);
  const { data: wishlist, refetch: refetchWishlist } = useFetchData<Listing[]>(
    signedIn ? "/api/wishlist" : null,
    [productId, signedIn]
  );
  const [wishlistBusy, setWishlistBusy] = React.useState(false);
  const [wishlistError, setWishlistError] = React.useState<string | null>(null);

  const saved = signedIn && !!listing && (wishlist ?? []).some((l) => l._id === listing._id);

  const toggleWishlist = async () => {
    if (!listing) return;
    setWishlistBusy(true);
    setWishlistError(null);
    try {
      if (saved) await api.del(`/api/wishlist/${listing._id}`);
      else await api.post(`/api/wishlist/${listing._id}`, {});
      refetchWishlist();
    } catch (err) {
      setWishlistError(errorMessage(err));
    } finally {
      setWishlistBusy(false);
    }
  };

  if (isLoading) return <PublicShell><div className="grid min-h-[50vh] place-items-center text-sm text-muted-foreground">Loading…</div></PublicShell>;
  if (error || !listing) {
    return (
      <PublicShell>
        <div className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h1 className="text-2xl font-bold">Listing not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error?.message}</p>
          <Link href={ROUTES.SEARCH} className="mt-6 inline-block"><Button variant="outline">Back to search</Button></Link>
        </div>
      </PublicShell>
    );
  }

  // Gallery source. Fall back to listingImage() when a listing has no
  // photos so the placeholder still renders rather than an empty frame.
  const gallery = (listing.photos ?? []).filter((p) => p.url);
  const image = gallery[activePhoto]?.url ?? listingImage(listing);
  const owner = ownerName(listing.owner);
  const ownerId = typeof listing.owner === "object" && listing.owner !== null ? listing.owner._id : listing.owner;
  const isOwn = mounted && !!user && ownerId === user._id;
  // Opens the thread with this listing's owner, creating it if needed. The
  // endpoint is idempotent on the participant pair plus listing, so clicking
  // twice reuses the same conversation rather than forking it.
  const messageOwner = async () => {
    if (!ownerId || messageBusy) return;
    setMessageBusy(true);
    setMessageError(null);
    try {
      const conversation = await api.post<Conversation>("/api/chat/conversations", {
        userId: ownerId,
        listingId: listing?._id,
      });
      router.push(`/messages/${conversation._id}`);
    } catch (err) {
      setMessageError(errorMessage(err));
    } finally {
      setMessageBusy(false);
    }
  };

  const city = listing.location?.city || "India";
  const region = [listing.location?.city, listing.location?.state].filter(Boolean).join(", ") || "India";

  // Shown as the pick-up window. A listing with no blocks is simply available,
  // which is worth saying rather than leaving the row blank.
  const nextBlock = (listing.availability ?? [])
    .filter((b) => b.endDate && new Date(b.endDate) >= new Date())
    .sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate))[0];

  const rules = [
    "No damage or misuse",
    "Return on time",
    "Keep original accessories safe",
    "Report any issues immediately",
  ];

  return (
    <PublicShell>
      <section className="mx-auto max-w-7xl px-4 pb-12 pt-5 sm:px-6">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <Link href={ROUTES.HOME} className="transition-colors hover:text-foreground">Home</Link>
          <span aria-hidden>›</span>
          <Link href={ROUTES.CATEGORIES} className="transition-colors hover:text-foreground">Categories</Link>
          <span aria-hidden>›</span>
          <Link
            href={`${ROUTES.SEARCH}?category=${listing.category}`}
            className="capitalize transition-colors hover:text-foreground"
          >
            {listing.category.replace(/-/g, " ")}
          </Link>
          <span aria-hidden>›</span>
          <span className="truncate font-medium text-foreground">{listing.title}</span>
        </nav>

        <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_380px]">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt={listing.title}
              className="aspect-4/3 w-full rounded-2xl border border-border object-cover"
            />

            {gallery.length > 1 && (
              // Four thumbnails, and a count on the last one when there are
              // more. A strip that scrolls off the edge hides how many there
              // are; a number says it outright.
              <div className="mt-3 grid grid-cols-4 gap-3">
                {gallery.slice(0, 4).map((photo, i) => {
                  const isLast = i === 3 && gallery.length > 4;
                  return (
                    <button
                      key={photo._id ?? photo.url}
                      type="button"
                      onClick={() => setActivePhoto(i)}
                      aria-label={`View photo ${i + 1} of ${gallery.length}`}
                      aria-current={i === activePhoto}
                      className={cn(
                        "relative aspect-4/3 overflow-hidden rounded-xl border-2 transition-all",
                        i === activePhoto ? "border-primary" : "border-transparent hover:border-border"
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.url}
                        alt={photo.caption || `${listing.title} photo ${i + 1}`}
                        className="h-full w-full object-cover"
                      />
                      {isLast && (
                        <span className="absolute inset-0 grid place-items-center bg-black/55 text-sm font-semibold text-white">
                          +{gallery.length - 3}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <Card className="h-max">
            <CardContent className="space-y-4 pt-6">
              <Badge variant="default" className="capitalize">
                {listing.category.replace(/-/g, " ")}
              </Badge>
              <h1 className="text-2xl font-bold tracking-tight">{listing.title}</h1>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Avatar name={owner} size="sm" />
                <span className="text-muted-foreground">by</span>
                <span className="font-medium">{owner}</span>
                <span className="ml-auto flex items-center gap-1 font-medium text-accent-700">
                  <StarRating value={listing.ratingAvg} size={14} />
                  {listing.ratingAvg ? listing.ratingAvg.toFixed(1) : "New"}
                  {listing.ratingCount > 0 && (
                    <span className="font-normal text-muted-foreground">
                      ({listing.ratingCount} review{listing.ratingCount === 1 ? "" : "s"})
                    </span>
                  )}
                </span>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-2xl font-bold">
                  {formatCurrency(listing.pricePerDay)}
                  <span className="text-base font-normal text-muted-foreground"> / day</span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Security deposit: {formatCurrency(listing.securityDeposit)}{" "}
                  <span className="text-xs">(Refundable)</span>
                </p>
              </div>

              <div className="flex flex-col gap-3 border-t border-border pt-4 text-sm">
                <div className="flex items-start gap-2.5">
                  <MapPin size={16} className="mt-0.5 shrink-0 text-primary" />
                  <div>
                    <p className="font-medium">Pick-up</p>
                    <p className="text-muted-foreground">{region}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-medium">Availability</p>
                      <Link
                        href={ROUTES.CHECKOUT(listing._id)}
                        className="text-xs font-medium text-primary transition-colors hover:text-primary-700"
                      >
                        Change dates
                      </Link>
                    </div>
                    <p className="text-muted-foreground">
                      {nextBlock
                        ? `Booked ${formatDate(nextBlock.startDate)} – ${formatDate(nextBlock.endDate)}`
                        : "Available now"}
                    </p>
                  </div>
                </div>
              </div>

              {isOwn ? (
                <div className="rounded-lg border border-border bg-muted p-3 text-center text-sm text-muted-foreground">
                  This is your listing — you can&apos;t book your own items.
                </div>
              ) : (
                <Link href={ROUTES.CHECKOUT(listing._id)} className="block">
                  <Button fullWidth>Request to Book</Button>
                </Link>
              )}

              {signedIn && (
                <>
                  <Button
                    variant="outline"
                    fullWidth
                    loading={wishlistBusy}
                    onClick={toggleWishlist}
                    leftIcon={<Heart size={16} className={saved ? "fill-danger text-danger" : ""} />}
                  >
                    {saved ? "Saved to Wishlist" : "Add to Wishlist"}
                  </Button>
                  {wishlistError && (
                    <p className="rounded-md bg-danger-50 p-2 text-xs text-danger-700">{wishlistError}</p>
                  )}
                </>
              )}

              {signedIn && !isOwn && (
                <>
                  <Button variant="ghost" fullWidth loading={messageBusy} onClick={messageOwner}>
                    Message owner
                  </Button>
                  {messageError && (
                    <p className="rounded-md bg-danger-50 p-2 text-xs text-danger-700">{messageError}</p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_380px]">
          <Card>
            <CardHeader>
              <CardTitle>About this item</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="leading-7 text-muted-foreground">{listing.description}</p>

              <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4 text-sm">
                <p className="flex items-center gap-2">
                  <ShieldCheck size={15} className="shrink-0 text-primary" />
                  KYC verified owner and protected handover
                </p>
                <p className="flex items-center gap-2">
                  <MapPin size={15} className="shrink-0 text-primary" />
                  Picked up in {city}
                </p>
                <p className="flex items-center gap-2">
                  <Repeat size={15} className="shrink-0 text-primary" />
                  {listing.extension?.allowed
                    ? `Extendable by up to ${listing.extension.maxExtensionDays} day${
                        listing.extension.maxExtensionDays === 1 ? "" : "s"
                      }, requested ${listing.extension.requestBeforeHours}h before the end`
                    : "Cannot be extended once booked"}
                </p>
                {listing.extension?.allowed && (
                  <p className="flex items-center gap-2">
                    <Repeat size={15} className="shrink-0 text-primary" />
                    Extension priced{" "}
                    {listing.extension.pricing === "custom"
                      ? `${listing.extension.ratePercent}% above the daily rate`
                      : "at the same daily rate"}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="h-max">
            <CardHeader>
              <CardTitle>Rules</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2.5 text-sm text-muted-foreground">
                {rules.map((rule) => (
                  <li key={rule} className="flex items-start gap-2.5">
                    <ShieldCheck size={15} className="mt-0.5 shrink-0 text-primary" />
                    {rule}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6">
          <h2 className="text-xl font-semibold">Reviews ({reviews?.length ?? 0})</h2>
          <div className="mt-4 flex flex-col gap-4">
            {(reviews ?? []).length === 0 && (
              <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
                No reviews yet. Be the first to rent and review this item.
              </p>
            )}
            {(reviews ?? []).map((review) => (
              <div key={review._id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">
                    {typeof review.reviewer === "object" ? review.reviewer.name : "Renter"}
                  </p>
                  <StarRating value={review.rating} size={14} />
                  <span className="ml-auto text-xs text-muted-foreground">{formatDate(review.createdAt)}</span>
                </div>
                {review.comment && <p className="mt-2 text-sm text-muted-foreground">{review.comment}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
