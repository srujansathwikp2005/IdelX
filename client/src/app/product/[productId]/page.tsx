"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PublicShell } from "@/components/marketplace/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [messageBusy, setMessageBusy] = React.useState(false);
  const [messageError, setMessageError] = React.useState<string | null>(null);

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

  return (
    <PublicShell>
      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_360px]">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt={listing.title} className="aspect-video w-full rounded-lg object-cover" />

          {gallery.length > 1 && (
            // Thumbnail strip. Only shown for more than one photo — a single
            // thumbnail under its own full-size image is just noise.
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {gallery.map((photo, i) => (
                <button
                  key={photo._id ?? photo.url}
                  type="button"
                  onClick={() => setActivePhoto(i)}
                  aria-label={`View photo ${i + 1} of ${gallery.length}`}
                  aria-current={i === activePhoto}
                  className={cn(
                    "h-16 w-20 shrink-0 overflow-hidden rounded-md border-2 transition-all",
                    i === activePhoto
                      ? "border-primary"
                      : "border-transparent opacity-70 hover:opacity-100"
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.caption || `${listing.title} photo ${i + 1}`}
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
          <div className="mt-6">
            <Badge variant="outline">{listing.category}</Badge>
            <h1 className="mt-3 text-3xl font-bold">{listing.title}</h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin size={16} />
              {listing.location?.city || "India"} - hosted by {owner}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant={listing.status === "published" ? "success" : "secondary"}>{listing.status}</Badge>
              {listing.securityDeposit > 0 && <Badge variant="secondary">Deposit {formatCurrency(listing.securityDeposit)}</Badge>}
              {listing.extension?.allowed ? (
                <Badge variant="success">Extension available</Badge>
              ) : (
                <Badge variant="outline">No extension allowed</Badge>
              )}
            </div>
            <p className="mt-6 leading-7 text-muted-foreground">{listing.description}</p>

            <div className="mt-8">
              <h2 className="text-xl font-semibold">Reviews ({reviews?.length ?? 0})</h2>
              <div className="mt-4 space-y-4">
                {(reviews ?? []).length === 0 && (
                  <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
                    No reviews yet. Be the first to rent and review this item.
                  </p>
                )}
                {(reviews ?? []).map((review) => (
                  <div key={review._id} className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{typeof review.reviewer === "object" ? review.reviewer.name : "Renter"}</p>
                      <StarRating value={review.rating} size={14} />
                      <span className="ml-auto text-xs text-muted-foreground">{formatDate(review.createdAt)}</span>
                    </div>
                    {review.comment && <p className="mt-2 text-sm text-muted-foreground">{review.comment}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <Card className="h-max">
          <CardHeader>
            <CardTitle>{formatCurrency(listing.pricePerDay)} / day</CardTitle>
            <div className="flex items-center gap-1 text-sm text-accent-700">
              <StarRating value={listing.ratingAvg} size={15} /> {listing.ratingAvg || "New"} {listing.ratingCount > 0 && `from ${listing.ratingCount} reviews`}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted p-4 text-sm">
              <p className="flex justify-between"><span>Security deposit</span><strong>{formatCurrency(listing.securityDeposit)}</strong></p>
              <p className="mt-2 flex justify-between"><span>Platform protection</span><strong>Included</strong></p>
            </div>
            {listing.extension?.allowed ? (
              <div className="rounded-lg border border-primary-200 bg-primary-50 p-4 text-sm text-primary-900">
                <p className="flex items-center gap-2 font-semibold text-primary">
                  <Repeat size={16} />
                  Rental extension available
                </p>
                <ul className="mt-2 space-y-1 text-xs text-primary-900">
                  <li>
                    Pricing:{" "}
                    {listing.extension.pricing === "custom"
                      ? `${listing.extension.ratePercent}% above the daily rate`
                      : "Same as the daily rate"}
                  </li>
                  <li>Request: at least {listing.extension.requestBeforeHours}h before the booking ends</li>
                  <li>Maximum: {listing.extension.maxExtensionDays} extra day{listing.extension.maxExtensionDays === 1 ? "" : "s"}</li>
                </ul>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                  <Repeat size={16} />
                  No extension allowed
                </p>
              </div>
            )}
            <div className="flex items-center gap-2 rounded-lg border border-secondary-200 bg-secondary-50 p-3 text-sm text-secondary-700">
              <ShieldCheck size={18} />
              KYC verified owner and protected handover
            </div>
            {isOwn ? (
              <div className="rounded-lg border border-border bg-muted p-3 text-center text-sm text-muted-foreground">
                This is your listing — you can&apos;t book your own items.
              </div>
            ) : (
              <Link href={ROUTES.CHECKOUT(listing._id)}><Button fullWidth>Reserve Item</Button></Link>
            )}

            {/* The messages page tells people to "message an owner from a
                listing", but there was no way to do it — conversations could
                only be opened by knowing a URL. */}
            {signedIn && !isOwn && (
              <Button variant="outline" fullWidth loading={messageBusy} onClick={messageOwner}>
                Message owner
              </Button>
            )}
            {messageError && (
              <p className="rounded-md bg-danger-50 p-2 text-xs text-danger">{messageError}</p>
            )}
            {signedIn && (
              <>
                <Button
                  variant="outline"
                  fullWidth
                  loading={wishlistBusy}
                  onClick={toggleWishlist}
                  leftIcon={
                    <Heart size={16} className={saved ? "fill-danger text-danger" : ""} />
                  }
                >
                  {saved ? "Saved to Wishlist" : "Save to Wishlist"}
                </Button>
                {wishlistError && (
                  <p className="rounded-md bg-danger-50 p-2 text-xs text-danger">{wishlistError}</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </section>
    </PublicShell>
  );
}
