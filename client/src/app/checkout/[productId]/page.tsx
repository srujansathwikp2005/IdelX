"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PublicShell } from "@/components/marketplace/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { formatCurrency } from "@/lib/formatters";
import { api } from "@/lib/api-client";
import { useFetchData } from "@/lib/use-fetch-data";
import { useAuth, errorMessage, RequireKyc } from "@/lib/auth";
import { listingImage } from "@/lib/api-types";
import type { Booking, Listing, CheckoutOrder, User } from "@/lib/api-types";
import { ROUTES } from "@/lib/constants";
import { daysBetween } from "@/lib/formatters";

const CASHFREE_SDK_URL = "https://sdk.cashfree.com/js/v3/cashfree.js";

type CashfreeInstance = {
  checkout: (options: {
    paymentSessionId: string;
    redirectTarget?: "_self" | "_blank" | "_modal";
  }) => Promise<{ error?: { message?: string }; paymentDetails?: unknown }>;
};

type CashfreeFactory = (options: { mode: "sandbox" | "production" }) => CashfreeInstance;

function loadCashfreeSdk(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }
    if ((window as unknown as { Cashfree?: unknown }).Cashfree) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = CASHFREE_SDK_URL;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function CheckoutPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = React.use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { data: listing, isLoading } = useFetchData<Listing>(`/api/listings/${productId}`, [productId]);

  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [done, setDone] = React.useState<Booking | null>(null);
  // Dev-mode simulated gateway step: when Cashfree keys are not configured,
  // the user still goes through a payment dialog so the booking + owner
  // notification only happen after an explicit payment.
  const [pendingOrder, setPendingOrder] = React.useState<CheckoutOrder | null>(null);
  const [paying, setPaying] = React.useState(false);

  // Cashfree's return_url sends the renter back here as
  // /checkout/<listing>?order_id=... after a redirect-style payment — which
  // is what UPI and QR do, since those leave the page rather than resolving
  // inside the modal. Without this the payment succeeds, the renter lands
  // back on an ordinary checkout page, and nothing tells them it worked.
  React.useEffect(() => {
    const returned = searchParams.get("order_id");
    if (!returned || done || paying) return;

    let cancelled = false;
    (async () => {
      setPaying(true);
      try {
        const booking = await api.post<Booking>("/api/payments/verify", { orderId: returned });
        if (!cancelled) setDone(booking);
      } catch {
        if (!cancelled) {
          setError(
            "We could not confirm that payment. If money left your account, check My Rentals before paying again."
          );
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

  if (isLoading || !listing) {
    return <PublicShell><div className="grid min-h-[50vh] place-items-center text-sm text-muted-foreground">Loading…</div></PublicShell>;
  }

  const days = startDate && endDate ? daysBetween(startDate, endDate) : 0;
  const rent = listing.pricePerDay * days;
  const fee = Math.round(rent * 0.1);
  const total = rent + fee + listing.securityDeposit;

  const ownerId = typeof listing.owner === "object" && listing.owner !== null ? listing.owner._id : listing.owner;
  const isOwn = !!user && ownerId === user._id;

  // Verification is server-side only: we hand Cashfree's order id to our own
  // backend, which asks the gateway what happened. Nothing the browser
  // reports about the payment is trusted.
  const verifyPayment = (order: CheckoutOrder) =>
    api.post<Booking>("/api/payments/verify", { orderId: order.orderId });

  const openCashfreeCheckout = async (order: CheckoutOrder): Promise<boolean> => {
    const factory = (window as unknown as { Cashfree?: CashfreeFactory }).Cashfree;
    if (!factory || !order.paymentSessionId) {
      setError("Payment checkout failed to load. Please try again.");
      return false;
    }

    // The SDK mode must match the mode the order was created in, so it comes
    // from the server response rather than being hardcoded here.
    const cashfree = factory({ mode: order.mode === "production" ? "production" : "sandbox" });

    // The SDK's own result is treated as a hint, never as the answer. It has
    // been observed throwing internally ("paymentId is not defined") AFTER a
    // payment succeeds — which surfaced that error to the renter even though
    // their money had gone through and the booking existed.
    //
    // The gateway is the source of truth either way: whatever the SDK does,
    // ask our backend, which asks Cashfree what actually happened to the
    // order. That makes an SDK bug cosmetic instead of a lost booking.
    let sdkError: string | null = null;
    try {
      // _modal keeps the user on the page; a redirect would lose React state
      // and force the whole booking context to be rebuilt on return.
      const result = await cashfree.checkout({
        paymentSessionId: order.paymentSessionId,
        redirectTarget: "_modal",
      });
      if (result?.error) sdkError = result.error.message || null;
    } catch (err) {
      sdkError = err instanceof Error ? err.message : String(err);
    }

    try {
      const booking = await verifyPayment(order);
      setDone(booking);
      return true;
    } catch (verifyErr) {
      // Only now is a failure real — the gateway says the order was not paid.
      //
      // The SDK's text is used only when it reads as a payment outcome. It
      // has been seen throwing its own internal ReferenceError
      // ("paymentId is not defined"), which is a bug in their bundle and
      // means nothing to a renter staring at a checkout page. Surfacing raw
      // JavaScript errors as payment status is how "your payment failed"
      // gets shown for a payment that never started.
      const looksInternal =
        !sdkError ||
        /is not defined|undefined is not|cannot read|null is not|\bReferenceError\b|\bTypeError\b/i.test(
          sdkError
        );
      setError(
        looksInternal
          ? "Payment was not completed. If money left your account, it will be returned automatically — please check My Rentals before paying again."
          : sdkError
      );
      return false;
    }
  };

  const verifyDevPayment = async (order: CheckoutOrder) => {
    // Dev mode only: with no gateway configured the backend accepts the
    // order without asking Cashfree anything.
    const booking = await api.post<Booking>("/api/payments/verify", { orderId: order.orderId });
    setDone(booking);
    router.push(ROUTES.MY_RENTALS);
  };

  const confirmDevPayment = async () => {
    if (!pendingOrder) return;
    setPaying(true);
    setError(null);
    try {
      await verifyDevPayment(pendingOrder);
    } catch (err) {
      setError(errorMessage(err));
      setPaying(false);
    }
  };

  const pay = async () => {
    setError(null);
    if (isOwn) {
      setError("You cannot book your own listing.");
      return;
    }
    if (!startDate || !endDate) {
      setError("Choose start and end dates");
      return;
    }
    if (days < 1) {
      setError("End date must be after start date");
      return;
    }
    if (!user) {
      setError("Please sign in to complete your booking.");
      return;
    }
    setLoading(true);
    try {
      // Step 1 — create a Cashfree order for the listing + dates.
      const order = await api.post<CheckoutOrder>("/api/payments/checkout", {
        listingId: listing._id,
        startDate,
        endDate,
      });

      if (order.configured && order.paymentSessionId) {
        // Step 2 — real gateway: open Cashfree Checkout, then confirm the
        // outcome with our backend, which asks the gateway directly.
        const loaded = await loadCashfreeSdk();
        if (!loaded) {
          setError("Could not load the payment gateway. Please try again.");
          setLoading(false);
          return;
        }
        const paid = await openCashfreeCheckout(order);
        if (!paid) {
          setLoading(false);
          return;
        }
        router.push(ROUTES.MY_RENTALS);
      } else {
        // Step 2 — dev mode: no Cashfree keys configured yet, so show the
        // simulated gateway dialog. The booking is only created and the
        // owner only notified after the user completes this payment step.
        setPendingOrder(order);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <RequireKyc>
      <PublicShell>
      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <h1 className="text-3xl font-bold">Checkout</h1>
          <Card>
            <CardHeader><CardTitle>Rental details</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Input label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <Input label="End date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              <Select label="Pickup option" options={[{ value: "pickup", label: "Owner pickup" }, { value: "delivery", label: "Doorstep delivery" }]} />
            </CardContent>
          </Card>
          <p className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
            Payment is handled securely by <strong>Cashfree</strong> — you&apos;ll be taken to a
            payment popup after confirming. Your booking is created only after the payment succeeds,
            and the owner is notified right away.
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
            <p className="flex justify-between text-base"><span>Total today</span><strong>{formatCurrency(total)}</strong></p>
            {error && <p className="rounded-md bg-danger-50 p-3 text-danger">{error}</p>}
            {done && <p className="rounded-md bg-secondary-50 p-3 text-secondary-700">Booking requested! The owner will confirm shortly.</p>}
            {isOwn && (
              <p className="rounded-md border border-border bg-muted p-3 text-center text-sm text-muted-foreground">
                This is your listing — you can&apos;t book your own items.
              </p>
            )}
            <Button fullWidth loading={loading} disabled={isOwn} onClick={pay}>Pay and Reserve</Button>
            <Link href={`/product/${listing._id}`} className="block text-center text-sm font-semibold text-primary">Back to item</Link>
          </CardContent>
        </Card>
      </section>

      <Modal
        open={!!pendingOrder}
        onClose={() => {
          if (!paying) setPendingOrder(null);
        }}
        title="Complete your payment"
        description="Your booking is created and the owner is notified only after this payment succeeds."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={paying} onClick={() => setPendingOrder(null)}>Cancel</Button>
            <Button loading={paying} onClick={confirmDevPayment}>
              {paying ? "Processing…" : `Pay ${pendingOrder ? formatCurrency(pendingOrder.amount) : ""}`}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <p className="flex justify-between"><span>{listing.title}</span><strong>{formatCurrency(pendingOrder?.amount ?? 0)}</strong></p>
            <p className="mt-1 flex justify-between text-muted-foreground">
              <span>Order ref</span><span className="font-mono text-xs">{pendingOrder?.orderId}</span>
            </p>
            <p className="mt-1 flex justify-between text-muted-foreground">
              <span>Dates</span><span>{startDate} → {endDate}</span>
            </p>
          </div>
          <p className="rounded-md bg-warning-50 p-3 text-xs text-warning-700">
            Test mode — the payment gateway is not configured yet, so this dialog simulates the
            payment step. Configure CASHFREE keys to charge real money.
          </p>
        </div>
      </Modal>
    </PublicShell>
    </RequireKyc>
  );
}