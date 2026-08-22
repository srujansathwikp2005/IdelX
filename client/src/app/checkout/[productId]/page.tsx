"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
import type { Booking, Listing, RazorpayCheckoutOrder, User } from "@/lib/api-types";
import { ROUTES } from "@/lib/constants";
import { daysBetween } from "@/lib/formatters";

const RAZORPAY_CHECKOUT_URL = "https://checkout.razorpay.com/v1/checkout.js";

type RazorpayResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayConstructor = new (options: Record<string, unknown>) => { open: () => void };

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = RAZORPAY_CHECKOUT_URL;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function CheckoutPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = React.use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { data: listing, isLoading } = useFetchData<Listing>(`/api/listings/${productId}`, [productId]);

  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [done, setDone] = React.useState<Booking | null>(null);
  // Dev-mode simulated gateway step: when Razorpay keys are not configured,
  // the user still goes through a payment dialog so the booking + owner
  // notification only happen after an explicit payment.
  const [pendingOrder, setPendingOrder] = React.useState<RazorpayCheckoutOrder | null>(null);
  const [paying, setPaying] = React.useState(false);

  if (isLoading || !listing) {
    return <PublicShell><div className="grid min-h-[50vh] place-items-center text-sm text-muted-foreground">Loading…</div></PublicShell>;
  }

  const days = startDate && endDate ? daysBetween(startDate, endDate) : 0;
  const rent = listing.pricePerDay * days;
  const fee = Math.round(rent * 0.1);
  const total = rent + fee + listing.securityDeposit;

  const ownerId = typeof listing.owner === "object" && listing.owner !== null ? listing.owner._id : listing.owner;
  const isOwn = !!user && ownerId === user._id;

  const verifyPayment = (order: RazorpayCheckoutOrder, response: RazorpayResponse) =>
    api.post<Booking>("/api/payments/verify", {
      orderId: response.razorpay_order_id,
      paymentId: response.razorpay_payment_id,
      signature: response.razorpay_signature,
    });

  const openRazorpayCheckout = (order: RazorpayCheckoutOrder, currentUser: User) =>
    new Promise<boolean>((resolve) => {
      const RazorpayCtor = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
      if (!RazorpayCtor) {
        setError("Razorpay Checkout failed to load. Please try again.");
        resolve(false);
        return;
      }
      const rzp = new RazorpayCtor({
        key: order.keyId,
        amount: Math.round(order.amount * 100),
        currency: order.currency,
        name: "IdleX",
        description: "Rental booking payment",
        order_id: order.orderId,
        // Explicitly list the methods rather than relying on what happens to
        // be enabled in the dashboard. EMI and Pay Later are off: both settle
        // to us over time or via a lender, which does not fit a rental where
        // a refundable security deposit has to be returned to the renter
        // shortly after the booking ends.
        method: {
          card: true,
          upi: true,
          netbanking: true,
          wallet: true,
          emi: false,
          paylater: false,
        },
        prefill: {
          name: currentUser.name,
          email: currentUser.email,
          contact: currentUser.phone || "",
        },
        handler: (response: RazorpayResponse) => {
          verifyPayment(order, response)
            .then((booking) => {
              setDone(booking);
              resolve(true);
            })
            .catch((err) => {
              setError(errorMessage(err));
              resolve(false);
            });
        },
        modal: { ondismiss: () => resolve(false) },
      });
      rzp.open();
    });

  const verifyDevPayment = async (order: RazorpayCheckoutOrder) => {
    const booking = await api.post<Booking>("/api/payments/verify", {
      orderId: order.orderId,
      paymentId: "dev_payment",
      signature: "dev-signature",
    });
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
      // Step 1 — create a Razorpay order for the listing + dates.
      const order = await api.post<RazorpayCheckoutOrder>("/api/payments/checkout", {
        listingId: listing._id,
        startDate,
        endDate,
      });

      if (order.configured && order.keyId) {
        // Step 2 — real gateway: open the Razorpay Checkout popup, then
        // verify the returned signature server-side inside the handler.
        const loaded = await loadRazorpayScript();
        if (!loaded) {
          setError("Could not load the payment gateway. Please try again.");
          setLoading(false);
          return;
        }
        const paid = await openRazorpayCheckout(order, user);
        if (!paid) {
          setLoading(false);
          return;
        }
        router.push(ROUTES.MY_RENTALS);
      } else {
        // Step 2 — dev mode: no Razorpay keys configured yet, so show the
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
            Payment is handled securely by <strong>Razorpay</strong> — you&apos;ll be taken to a
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
            payment step. Configure RAZORPAY keys to charge real money.
          </p>
        </div>
      </Modal>
    </PublicShell>
    </RequireKyc>
  );
}