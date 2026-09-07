"use client";

import * as React from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/marketplace/dashboard-shell";
import { RentalExtensionPanel } from "@/components/marketplace/rental-extension-panel";
import { ReviewModal } from "@/components/marketplace/review-modal";
import type { ReviewTarget } from "@/components/marketplace/review-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RequireAuth, useAuth, errorMessage } from "@/lib/auth";
import { api } from "@/lib/api-client";
import { useFetchData } from "@/lib/use-fetch-data";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { isPaymentRejected, isPaymentUnderReview } from "@/lib/api-types";
import type { Booking } from "@/lib/api-types";

function RentalDetailInner({ rentalId }: { rentalId: string }) {
  const { user } = useAuth();
  const { data: booking, isLoading, error, refetch } = useFetchData<Booking>(`/api/bookings/${rentalId}`, [rentalId]);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = React.useState<ReviewTarget | null>(null);
  const [reviewed, setReviewed] = React.useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await api.post<Booking>(`/api/bookings/${rentalId}/confirm`, {});
      refetch();
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const respondExtension = async (reqId: string, approve: boolean) => {
    setBusy(true);
    try {
      await api.post<Booking>(`/api/bookings/${rentalId}/extension-request/${reqId}/respond`, { approve });
      refetch();
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <DashboardShell title="Booking Detail"><p className="text-sm text-muted-foreground">Loading…</p></DashboardShell>;
  if (error || !booking) {
    return <DashboardShell title="Booking Detail"><p className="rounded-md bg-danger-50 p-3 text-sm text-danger">{error?.message}</p></DashboardShell>;
  }

  const title = typeof booking.listing === "object" && booking.listing !== null ? booking.listing.title : "Rental";
  const isOwner = booking.owner && (typeof booking.owner === "object" ? booking.owner._id : booking.owner) === user?._id;
  const isRenter = booking.renter && (typeof booking.renter === "object" ? booking.renter._id : booking.renter) === user?._id;
  const pendingExt = booking.extensionRequests?.find((r) => r.status === "pending");
  const canReview = isRenter && ["completed", "return_requested"].includes(booking.status) && !reviewed;
  const canRequestReturn = isRenter && ["confirmed", "active"].includes(booking.status);
  const canConfirmReturn = isOwner && booking.status === "return_requested";
  // Only while 'confirmed': once the rental is active the rent has already
  // been released and confirming again would be meaningless.
  const canConfirmReceipt = isRenter && booking.status === "confirmed";

  // Releases the rent from escrow to the owner — the only path that does so.
  const confirmReceipt = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await api.post<Booking>(`/api/bookings/${rentalId}/start`, {});
      refetch();
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const requestReturn = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await api.post<Booking>(`/api/bookings/${rentalId}/request-return`, {});
      refetch();
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmReturn = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await api.post<Booking>(`/api/bookings/${rentalId}/confirm-return`, {});
      refetch();
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const extension = {
    available: Boolean(isRenter && ["confirmed", "active"].includes(booking.status)),
    currentReturn: formatDate(booking.endDate),
    dailyRate: booking.pricePerDay,
    maxDays: 3,
    approval: "Owner approval required",
    notice: "Request before 12 hours of return time",
  };

  return (
    <DashboardShell title="Booking Detail">
      <div className="space-y-6">
        {message && <p className="rounded-md bg-danger-50 p-3 text-sm text-danger">{message}</p>}
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between gap-3">
            <Badge
              variant={
                isPaymentUnderReview(booking)
                  ? "warning"
                  : booking.status === "completed"
                    ? "success"
                    : booking.status === "cancelled"
                      ? "danger"
                      : booking.status === "return_requested"
                        ? "warning"
                        : "default"
              }
            >
              {isPaymentUnderReview(booking)
                ? "verifying payment"
                : isPaymentRejected(booking)
                  ? "payment not verified"
                  : booking.status}
            </Badge>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {isOwner && booking.status === "requested" && (
                <Button size="sm" loading={busy} onClick={confirm}>Confirm Booking</Button>
              )}
              {/* Not while a submitted payment is still being checked —
                  offering it again is how people pay twice. */}
              {isRenter && booking.status === "awaiting_payment" && !isPaymentUnderReview(booking) && (
                <Link href={`/checkout/booking/${booking._id}`}>
                  <Button size="sm">{isPaymentRejected(booking) ? "Try payment again" : "Pay now"}</Button>
                </Link>
              )}
              {isRenter && isPaymentUnderReview(booking) && (
                <p className="text-sm text-muted-foreground">
                  Payment received — verification pending. Nothing more to do.
                </p>
              )}
              {canConfirmReceipt && (
                <Button size="sm" loading={busy} onClick={confirmReceipt}>
                  I&apos;ve received the item
                </Button>
              )}
              {canRequestReturn && (
                <Button size="sm" variant="outline" loading={busy} onClick={requestReturn}>
                  Request Return
                </Button>
              )}
              {canConfirmReturn && (
                <Button size="sm" loading={busy} onClick={confirmReturn}>Confirm Return</Button>
              )}
              {canReview && (
                <Button size="sm" variant="outline" onClick={() => setReviewTarget({ _id: booking._id, title })}>
                  Leave a Review
                </Button>
              )}
              {isRenter && booking.status === "completed" && reviewed && (
                <Badge variant="success">Reviewed</Badge>
              )}
            </div>
          </div>
          <h1 className="mt-3 text-2xl font-bold">{title}</h1>
          <p className="mt-2 text-muted-foreground">{formatDate(booking.startDate)} - {formatDate(booking.endDate)}</p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {["Requested", "Owner confirmed", "Return inspection"].map((step) => (
              <div key={step} className="rounded-lg bg-muted p-4">
                <p className="font-semibold">{step}</p>
                <p className="mt-1 text-sm text-muted-foreground">Status tracked for both renter and owner.</p>
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border p-4">
              <span className="text-sm text-muted-foreground">Total</span>
              <p className="mt-1 text-xl font-bold">{formatCurrency(booking.totalAmount)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {booking.totalDays} day{booking.totalDays > 1 ? "s" : ""} · {formatCurrency(booking.subtotal)} + {formatCurrency(booking.serviceFee)} fee
                {booking.securityDeposit > 0 && ` + ${formatCurrency(booking.securityDeposit)} deposit`}
              </p>
            </div>
            <div className="rounded-lg border border-primary-100 bg-primary-50 p-4">
              <span className="text-sm text-primary-700">Extension status</span>
              <p className="mt-1 font-semibold text-primary-900">
                {pendingExt ? `Pending: ${formatDate(pendingExt.requestedNewEndDate)}` : extension.available ? "Eligible for extension" : "Closed"}
              </p>
            </div>
          </div>
          {pendingExt && isOwner && (
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-border p-4">
              <div className="flex-1">
                <p className="text-sm font-semibold">Extension request</p>
                <p className="text-xs text-muted-foreground">
                  New end date: {formatDate(pendingExt.requestedNewEndDate)}
                  {pendingExt.reason ? ` · ${pendingExt.reason}` : ""}
                </p>
              </div>
              <Button size="sm" variant="outline" loading={busy} onClick={() => respondExtension(pendingExt._id, false)}>Reject</Button>
              <Button size="sm" loading={busy} onClick={() => respondExtension(pendingExt._id, true)}>Approve</Button>
            </div>
          )}
        </div>
        {isRenter && <RentalExtensionPanel extension={extension} bookingId={rentalId} />}
      </div>
      <ReviewModal
        open={!!reviewTarget}
        onClose={() => setReviewTarget(null)}
        booking={reviewTarget}
        onSubmitted={() => setReviewed(true)}
      />
    </DashboardShell>
  );
}

export default function RentalDetailPage({ params }: { params: Promise<{ rentalId: string }> }) {
  const { rentalId } = React.use(params);
  return (
    <RequireAuth>
      <RentalDetailInner rentalId={rentalId} />
    </RequireAuth>
  );
}
