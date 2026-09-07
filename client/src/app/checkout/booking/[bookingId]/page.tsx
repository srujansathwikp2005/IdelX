"use client";

import * as React from "react";
import Link from "next/link";
import QRCode from "qrcode";

import { PublicShell } from "@/components/marketplace/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle, Clock, Copy } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api-client";
import { errorMessage } from "@/lib/auth";
import { formatCurrency } from "@/lib/formatters";
import { useFetchData } from "@/lib/use-fetch-data";
import { ROUTES } from "@/lib/constants";

type PaymentInstructions = {
  booking: {
    id: string;
    status: string;
    listingTitle: string | null;
    startDate: string;
    endDate: string;
    totalDays: number;
  };
  amounts: {
    rentalAmount: number;
    platformFee: number;
    securityDeposit: number;
    totalAmount: number;
  };
  payTo: {
    upiId: string | null;
    payeeName: string | null;
    upiUri: string | null;
    supportsIntent: boolean;
    note: string | null;
  };
  submission: {
    id: string;
    status: "verification_pending" | "verified" | "rejected";
    utr: string;
    submittedAt: string;
    rejectionReason: string | null;
  } | null;
};

type Tone = "good" | "waiting" | "bad";

function Banner({
  tone,
  title,
  body,
  children,
}: {
  tone: Tone;
  title: string;
  body: React.ReactNode;
  children?: React.ReactNode;
}) {
  const styles: Record<Tone, string> = {
    good: "border-secondary-200 bg-secondary-50 text-secondary-700",
    waiting: "border-accent-200 bg-accent-50 text-accent-700",
    bad: "border-danger-200 bg-danger-50 text-danger",
  };
  const Icon = tone === "good" ? CheckCircle : tone === "waiting" ? Clock : AlertTriangle;
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-4 ${styles[tone]}`}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm leading-6">{body}</p>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? "text-base font-semibold" : "text-sm"}`}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums">{formatCurrency(value)}</span>
    </div>
  );
}

/**
 * Payment for a booking the owner has already approved.
 *
 * Money moves by UPI, directly, and an admin matches the reference against
 * what arrived — the same flow the app uses. The card gateway this page used
 * to open is not what the business runs on, so the two clients were asking
 * for money in two different ways against one ledger.
 *
 * Nothing is charged before the owner agrees: the renter requests, the owner
 * approves, and only then does this page do anything. A declined request
 * never needs refunding because it was never paid.
 */
export default function PayForBookingPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = React.use(params);

  const { data, isLoading, error, refetch } = useFetchData<PaymentInstructions>(
    `/api/manual-payments/instructions/${bookingId}`,
    [bookingId],
  );

  const [utr, setUtr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [qr, setQr] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const upiUri = data?.payTo.upiUri ?? null;

  React.useEffect(() => {
    if (!upiUri) return setQr(null);
    // White quiet zone whatever the theme: a scanner needs the contrast, and
    // an inverted code does not read reliably.
    QRCode.toDataURL(upiUri, { width: 460, margin: 1, color: { dark: "#000000", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [upiUri]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const reference = utr.trim().toUpperCase();
    setSubmitError(null);
    if (reference.length < 6) {
      setSubmitError("Enter the UTR exactly as your UPI app shows it.");
      return;
    }
    setBusy(true);
    try {
      await api.post(`/api/manual-payments`, { bookingId, utr: reference });
      setUtr("");
      refetch();
    } catch (err) {
      setSubmitError(
        err instanceof ApiError && err.status === 403
          ? `${errorMessage(err)} You can complete verification from your profile.`
          : errorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyUpiId() {
    if (!data?.payTo.upiId) return;
    try {
      await navigator.clipboard.writeText(data.payTo.upiId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access can be refused; the ID is selectable on screen.
    }
  }

  if (isLoading) {
    return (
      <PublicShell>
        <div className="mx-auto max-w-lg py-16 text-center text-muted-foreground">Loading…</div>
      </PublicShell>
    );
  }

  if (error || !data) {
    return (
      <PublicShell>
        <div className="mx-auto max-w-lg py-16 text-center">
          <h1 className="text-2xl font-semibold">We could not open this payment</h1>
          <p className="mt-3 text-muted-foreground">{error?.message ?? "Booking not found."}</p>
          <Link href={ROUTES.MY_RENTALS} className="mt-6 inline-block">
            <Button variant="outline">Back to My Bookings</Button>
          </Link>
        </div>
      </PublicShell>
    );
  }

  const { amounts, payTo, submission, booking } = data;
  const settled = booking.status !== "awaiting_payment";

  return (
    <PublicShell>
      <div className="mx-auto max-w-2xl space-y-5 py-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Pay for this rental</h1>
          {booking.listingTitle && <p className="mt-1 text-muted-foreground">{booking.listingTitle}</p>}
        </div>

        <Card>
          <CardContent className="flex flex-col gap-2.5 p-5">
            <Row label="Rental" value={amounts.rentalAmount} />
            <Row label="Platform fee" value={amounts.platformFee} />
            <Row label="Refundable deposit" value={amounts.securityDeposit} />
            <div className="mt-1 border-t border-border pt-3">
              <Row label="Total to pay" value={amounts.totalAmount} strong />
            </div>
            <p className="text-sm text-muted-foreground">
              The deposit is returned after the item comes back undamaged.
            </p>
          </CardContent>
        </Card>

        {submission?.status === "verified" || settled ? (
          <Banner
            tone="good"
            title="Payment verified"
            body="Your booking is confirmed. You can arrange the handover with the owner."
          >
            <Link href={ROUTES.MY_RENTALS}>
              <Button size="sm">Go to bookings</Button>
            </Link>
          </Banner>
        ) : submission?.status === "verification_pending" ? (
          <Banner
            tone="waiting"
            title="Checking your payment"
            body={`We are matching transaction ${submission.utr} against the money received. Your booking is confirmed once that is done — there is nothing more for you to do, and nothing more to pay.`}
          />
        ) : (
          <>
            {submission?.status === "rejected" && (
              <Banner
                tone="bad"
                title="That payment could not be verified"
                body={
                  submission.rejectionReason ??
                  "We could not find a payment against that transaction ID."
                }
              />
            )}

            <Card>
              <CardHeader>
                <CardTitle>1. Pay {formatCurrency(amounts.totalAmount)}</CardTitle>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                {!payTo.upiId || !payTo.upiUri ? (
                  <Banner
                    tone="bad"
                    title="Payment details unavailable"
                    body="We cannot show where to send the money right now. Please contact support."
                  />
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Scan this with any UPI app, or copy the ID below and pay from your bank app.
                    </p>

                    {qr && (
                      <div className="mt-4 flex justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={qr}
                          alt={`UPI QR code to pay ${formatCurrency(amounts.totalAmount)}`}
                          className="h-56 w-56 rounded-xl border border-border bg-white p-3"
                        />
                      </div>
                    )}

                    <p className="mt-4 text-center font-mono text-base font-semibold select-all">
                      {payTo.upiId}
                    </p>
                    {payTo.payeeName && (
                      <p className="mt-1 text-center text-sm text-muted-foreground">{payTo.payeeName}</p>
                    )}

                    <Button
                      className="mt-4"
                      fullWidth
                      variant="outline"
                      leftIcon={<Copy size={16} />}
                      onClick={copyUpiId}
                    >
                      {copied ? "UPI ID copied" : "Copy UPI ID"}
                    </Button>

                    <p className="mt-3 text-sm text-muted-foreground">
                      Pay the exact amount. A different amount cannot be matched to this booking.
                    </p>

                    {/* Only against a merchant account, which an admin sets.
                        UPI refuses an app-to-app payment into a personal VPA,
                        and "declined for security reasons" reads as a broken
                        site rather than as a rule. */}
                    {payTo.supportsIntent && (
                      <p className="mt-3 text-center">
                        <a href={payTo.upiUri} className="text-sm font-semibold text-primary">
                          Or open a UPI app directly
                        </a>
                      </p>
                    )}

                    {payTo.note && <p className="mt-3 text-sm text-muted-foreground">{payTo.note}</p>}
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>2. Tell us the transaction ID</CardTitle>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <p className="text-sm text-muted-foreground">
                  Your UPI app shows it as a UTR or reference number once the payment goes through.
                  We match it against the money received.
                </p>
                <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
                  <Input
                    label="UPI transaction ID / UTR"
                    placeholder="123456789012"
                    value={utr}
                    onChange={(e) => setUtr(e.target.value.toUpperCase())}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {submitError && (
                    <p className="flex items-start gap-2 text-sm text-danger">
                      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                      {submitError}
                    </p>
                  )}
                  <Button type="submit" loading={busy} className="self-start">
                    Submit for verification
                  </Button>
                </form>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </PublicShell>
  );
}
