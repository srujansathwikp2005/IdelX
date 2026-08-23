"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PublicShell } from "@/components/marketplace/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { formatCurrency } from "@/lib/formatters";
import { api } from "@/lib/api-client";
import { useFetchData } from "@/lib/use-fetch-data";
import { useAuth, errorMessage, RequireKyc } from "@/lib/auth";
import { listingImage } from "@/lib/api-types";
import type { Booking, Listing } from "@/lib/api-types";
import { ROUTES } from "@/lib/constants";
import { daysBetween } from "@/lib/formatters";
import {
  DeliveryAddressFields,
  isAddressComplete,
  type DeliveryAddress,
} from "@/components/marketplace/delivery-address";

// Step one of two: the renter asks, and nothing is charged.
//
// Payment used to happen here, before the owner had agreed to anything, which
// meant a renter could pay for a request the owner then declined and have to
// be refunded. Now the request goes to the owner first; payment opens only
// once they approve, on /checkout/booking/<id>.
export default function RequestBookingPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = React.use(params);
  const router = useRouter();
  const { user } = useAuth();

  const { data: listing, isLoading } = useFetchData<Listing>(`/api/listings/${productId}`, [productId]);

  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [pickup, setPickup] = React.useState("pickup");
  const [address, setAddress] = React.useState<DeliveryAddress>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (isLoading || !listing) {
    return (
      <PublicShell>
        <div className="grid min-h-[50vh] place-items-center text-sm text-muted-foreground">Loading…</div>
      </PublicShell>
    );
  }

  const days = startDate && endDate ? daysBetween(startDate, endDate) : 0;
  const rent = listing.pricePerDay * days;
  const fee = Math.round(rent * 0.1);
  const total = rent + fee + listing.securityDeposit;

  const ownerId = typeof listing.owner === "object" && listing.owner !== null ? listing.owner._id : listing.owner;
  const isOwn = !!user && ownerId === user._id;

  // Always asked, the way a food delivery app asks before an order rather
  // than after. For doorstep delivery it is where the item goes; for pickup
  // it is where the renter is, which the owner needs in order to arrange a
  // handover and which gives a dispute somewhere to start.
  const isDelivery = pickup === "delivery";

  const submit = async () => {
    setError(null);
    if (isOwn) return setError("You cannot book your own listing.");
    if (!user) return setError("Please sign in to request this booking.");
    if (!startDate || !endDate) return setError("Choose start and end dates");
    if (days < 1) return setError("End date must be after start date");
    if (!isAddressComplete(address)) {
      return setError(
        isDelivery
          ? "Add a delivery address — flat/house, city and PIN code are needed."
          : "Add your address — flat/house, city and PIN code are needed so the owner can arrange the handover."
      );
    }

    setSubmitting(true);
    try {
      const booking = await api.post<Booking>("/api/bookings", {
        listingId: listing._id,
        startDate,
        endDate,
        deliveryAddress: address,
      });
      router.push(`${ROUTES.MY_RENTALS}?requested=${booking._id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <RequireKyc>
      <PublicShell>
        <section className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-5">
            <h1 className="text-3xl font-bold">Request this rental</h1>

            <Card>
              <CardHeader><CardTitle>Rental details</CardTitle></CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <Input label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                <Input label="End date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                <Select
                  label="Pickup option"
                  value={pickup}
                  onChange={(e) => setPickup(e.target.value)}
                  options={[
                    { value: "pickup", label: "Owner pickup" },
                    { value: "delivery", label: "Doorstep delivery" },
                  ]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <DeliveryAddressFields
                  value={address}
                  onChange={setAddress}
                  disabled={submitting}
                  heading={isDelivery ? "Delivery address" : "Your address"}
                  hint={
                    isDelivery
                      ? "Where the owner should deliver the item."
                      : "Where you are collecting from — the owner uses this to arrange the handover."
                  }
                />
              </CardContent>
            </Card>

            <p className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
              <strong>You will not be charged yet.</strong> The owner reviews your request first —
              once they approve it you&apos;ll be notified and can pay to secure the booking. An
              unanswered request expires after 24 hours and frees the dates again.
            </p>
          </div>

          <Card className="h-max">
            <CardHeader><CardTitle>{listing.title}</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={listingImage(listing)} alt={listing.title} className="aspect-video w-full rounded-lg object-cover" />
              <p className="flex justify-between"><span>Rent x {days || "-"} days</span><strong>{formatCurrency(rent)}</strong></p>
              <p className="flex justify-between"><span>Platform fee</span><strong>{formatCurrency(fee)}</strong></p>
              <p className="flex justify-between"><span>Refundable deposit</span><strong>{formatCurrency(listing.securityDeposit)}</strong></p>
              <hr className="border-border" />
              <p className="flex justify-between text-base"><span>Total on approval</span><strong>{formatCurrency(total)}</strong></p>

              {error && <p className="rounded-md bg-danger-50 p-3 text-danger">{error}</p>}

              <Button fullWidth loading={submitting} onClick={submit}>
                Send request to owner
              </Button>
              <Link href={ROUTES.PRODUCT(listing._id)} className="block text-center text-sm text-primary">
                Back to item
              </Link>
            </CardContent>
          </Card>
        </section>
      </PublicShell>
    </RequireKyc>
  );
}
