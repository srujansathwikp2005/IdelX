"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PublicShell } from "@/components/marketplace/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { api, ApiError } from "@/lib/api-client";
import { useFetchData } from "@/lib/use-fetch-data";
import { errorMessage } from "@/lib/auth";
import type { Booking, CheckoutOrder } from "@/lib/api-types";
import { ROUTES } from "@/lib/constants";

const CASHFREE_SDK_URL = "https://sdk.cashfree.com/js/v3/cashfree.js";

type CashfreeInstance = {
  checkout: (options: {
    paymentSessionId: string;
    redirectTarget?: "_self" | "_blank" | "_modal";
  }) => Promise<{ error?: { message?: string }; paymentDetails?: unknown }>;
};
type CashfreeFactory = (options: { mode: "sandbox" | "production" }) => CashfreeInstance;

// Payment for a booking the owner has already approved.
//
// Money is taken at this point and not before: the renter requests, the owner
// agrees, and only then does anything get charged. A declined request never
// has to be refunded because it was never paid for.
export default function PayForBookingPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = React.use(params);
  const searchParams = useSearchParams();

  const { data: booking, isLoading, refetch } = useFetchData<Booking>(
    `/api/bookings/${bookingId}`,
    [bookingId]
  );

  const [paying, setPaying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [trackingId, setTrackingId] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<Booking | null>(null);

  React.useEffect(() => {
    if (document.querySelector(`script[src="${CASHFREE_SDK_URL}"]`)) return;
    const script = document.createElement("script");
    script.src = CASHFREE_SDK_URL;
    script.async = true;
    document.body.appendChild(script);
  }, []);

  // Cashfree's return_url sends the renter back here after a redirect-style
  // payment — which is what UPI and QR do, since those leave the page rather
  // than resolving inside the modal. Without this the payment succeeds and
  // nothing on screen says so.
  React.useEffect(() => {
    const returned = searchParams.get("order_id");
    if (!returned) return;
    let cancelled = false;
    (async () => {
      setPaying(true);
      try {
        const confirmed = await api.post<Booking>("/api/payments/verify", { orderId: returned });
        if (!cancelled) setDone(confirmed);
      } catch {
        // The modal-close verify may already have confirmed this booking.
        const settled = await confirmedByBookingState();
        if (!cancelled && !settled) {
          setError("We could not confirm that payment. If money left your account, check My Rentals before paying again.");
          setTrackingId(returned);
        }
      } finally {
        if (!cancelled) setPaying(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-reads the booking and treats anything at or past 'confirmed' as paid.
  // Used whenever a verify call fails, so a lost race is never reported to
  // the renter as a failed payment.
  const confirmedByBookingState = React.useCallback(async () => {
    try {
      const fresh = await api.get<Booking>(`/api/bookings/${bookingId}`);
      const paid = ["confirmed", "active", "return_requested", "completed"].includes(fresh.status);
      if (paid) setDone(fresh);
      return paid;
    } catch {
      return false;
    }
  }, [bookingId]);

  const pay = async () => {
    setError(null);
    setTrackingId(null);
    setPaying(true);
    try {
      const order = await api.post<CheckoutOrder>("/api/payments/checkout", { bookingId });

      const factory = (window as unknown as { Cashfree?: CashfreeFactory }).Cashfree;
      if (!factory || !order.paymentSessionId) {
        setError("Payment checkout failed to load. Please try again.");
        return;
      }
      const cashfree = factory({ mode: order.mode === "production" ? "production" : "sandbox" });

      // The SDK's result is a hint, never the answer — it has been seen
      // throwing its own internal errors after a payment succeeds. The
      // gateway is asked either way.
      let sdkError: string | null = null;
      try {
        const result = await cashfree.checkout({
          paymentSessionId: order.paymentSessionId,
          redirectTarget: "_modal",
        });
        if (result?.error) sdkError = result.error.message || null;
      } catch (err) {
        sdkError = err instanceof Error ? err.message : String(err);
      }

      try {
        const confirmed = await api.post<Booking>("/api/payments/verify", { orderId: order.orderId });
        setDone(confirmed);
        refetch();
      } catch (verifyErr) {
        // Before reporting anything, ask what state the booking is actually
        // in. Two verifies run for a redirect payment — one when the modal
        // closes, one when Cashfree returns — and the loser of that race
        // gets an error for a payment that went through perfectly. The
        // booking is the truth: if it is confirmed, the money arrived,
        // whatever this particular request was told.
        const settled = await confirmedByBookingState();
        if (settled) return;

        // Raw JavaScript errors from inside the SDK are not payment outcomes
        // and mean nothing to a renter, so they are replaced.
        const looksInternal =
          !sdkError ||
          /is not defined|undefined is not|cannot read|null is not|\bReferenceError\b|\bTypeError\b/i.test(sdkError);
        const details = verifyErr instanceof ApiError ? (verifyErr.details as { trackingId?: string } | undefined) : undefined;
        setTrackingId(details?.trackingId ?? order.orderId);
        setError(
          looksInternal
            ? "Payment was not completed. If money left your account, it will be returned automatically — please check My Rentals before paying again."
            : sdkError
        );
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPaying(false);
    }
  };

  if (isLoading || !booking) {
    return (
      <PublicShell>
        <div className="grid min-h-[50vh] place-items-center text-sm text-muted-foreground">Loading…</div>
      </PublicShell>
    );
  }

  const listing = typeof booking.listing === "object" && booking.listing !== null ? booking.listing : null;
  const title = listing?.title ?? "your rental";

  if (done || booking.status === "confirmed") {
    return (
      <PublicShell>
        <div className="mx-auto max-w-lg py-16 text-center">
          <h1 className="text-2xl font-semibold">Payment received</h1>
          <p className="mt-3 text-muted-foreground">
            Your booking for <strong>{title}</strong> is confirmed. Once you have the item, confirm
            receipt in My Bookings — that is what releases the rent to the owner.
          </p>
          <Link href={ROUTES.MY_RENTALS} className="mt-6 inline-block">
            <Button>Go to My Bookings</Button>
          </Link>
        </div>
      </PublicShell>
    );
  }

  if (booking.status !== "awaiting_payment") {
    return (
      <PublicShell>
        <div className="mx-auto max-w-lg py-16 text-center">
          <h1 className="text-2xl font-semibold">Not ready for payment</h1>
          <p className="mt-3 text-muted-foreground">
            {booking.status === "requested"
              ? "The owner has not approved this booking yet. You will be notified the moment they do, and can pay then."
              : `This booking is ${booking.status.replace(/_/g, " ")} and cannot be paid for.`}
          </p>
          <Link href={ROUTES.MY_RENTALS} className="mt-6 inline-block">
            <Button variant="outline">Back to My Bookings</Button>
          </Link>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <div className="mx-auto max-w-2xl space-y-6 py-10">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Complete payment</h1>
          <p className="mt-2 text-muted-foreground">
            The owner approved your request. Pay now to secure the booking.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {formatDate(booking.startDate)} – {formatDate(booking.endDate)}
            </p>
            <div className="space-y-2 border-t border-border pt-3 text-sm">
              <Row label={`Rent x ${booking.totalDays} days`} value={booking.subtotal} />
              <Row label="Platform fee" value={booking.serviceFee} />
              <Row label="Refundable deposit" value={booking.securityDeposit} />
              <div className="flex items-center justify-between border-t border-border pt-2 text-base font-semibold">
                <span>Total</span>
                <span>{formatCurrency(booking.totalAmount)}</span>
              </div>
            </div>

            {booking.deliveryAddress?.line1 && (
              <div className="rounded-md bg-panel p-3 text-sm">
                <p className="font-medium">Delivering to</p>
                <p className="mt-1 text-muted-foreground">
                  {[booking.deliveryAddress.line1, booking.deliveryAddress.line2, booking.deliveryAddress.city, booking.deliveryAddress.pincode]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
            )}

            {error && (
              <div className="rounded-md bg-danger-50 p-3 text-danger">
                <p>{error}</p>
                {trackingId && (
                  <div className="mt-3 border-t border-danger/20 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Tracking ID</p>
                    <p className="mt-1 select-all break-all font-mono text-xs">{trackingId}</p>
                    <p className="mt-2 text-xs opacity-80">We&apos;ve emailed this to you. Quote it if you contact support.</p>
                  </div>
                )}
              </div>
            )}

            <Button fullWidth loading={paying} onClick={pay}>
              Pay {formatCurrency(booking.totalAmount)}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              The deposit is held in escrow and returned after the owner confirms the item came back.
            </p>
          </CardContent>
        </Card>
      </div>
    </PublicShell>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{formatCurrency(value)}</span>
    </div>
  );
}
