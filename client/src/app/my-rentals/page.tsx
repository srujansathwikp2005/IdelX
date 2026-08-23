"use client";

import * as React from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/marketplace/dashboard-shell";
import { ReviewModal } from "@/components/marketplace/review-modal";
import type { ReviewTarget } from "@/components/marketplace/review-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RequireAuth, errorMessage } from "@/lib/auth";
import { api } from "@/lib/api-client";
import { useFetchData } from "@/lib/use-fetch-data";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { Booking, Review } from "@/lib/api-types";
import { ROUTES } from "@/lib/constants";

function statusVariant(status: Booking["status"]) {
  if (status === "completed") return "success";
  if (status === "cancelled") return "danger";
  if (["active", "return_requested"].includes(status)) return "warning";
  return "default";
}

function MyRentalsInner() {
  const { data, isLoading, error, refetch } = useFetchData<Booking[]>("/api/bookings", []);
  const { data: myReviews, refetch: refetchReviews } = useFetchData<Review[]>("/api/reviews/mine", []);
  const [reviewTarget, setReviewTarget] = React.useState<ReviewTarget | null>(null);
  const [reviewedNow, setReviewedNow] = React.useState<Set<string>>(new Set());
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const reviewedIds = React.useMemo(() => {
    const ids = new Set<string>();
    (myReviews ?? []).forEach((r) => ids.add(String(r.booking)));
    reviewedNow.forEach((id) => ids.add(id));
    return ids;
  }, [myReviews, reviewedNow]);

  const markReviewed = (bookingId: string) => {
    setReviewedNow((prev) => new Set(prev).add(bookingId));
    void refetch();
    void refetchReviews();
  };

  // Releases the rent from escrow to the owner. This is the only path that
  // does so, and until now nothing in the UI called it — every booking in
  // production sat at rentStatus 'held' and no owner was ever paid.
  const confirmReceipt = async (bookingId: string) => {
    setActionError(null);
    setBusyId(bookingId);
    try {
      await api.post<Booking>(`/api/bookings/${bookingId}/start`, {});
      refetch();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const requestReturn = async (bookingId: string) => {
    setActionError(null);
    setBusyId(bookingId);
    try {
      await api.post<Booking>(`/api/bookings/${bookingId}/request-return`, {});
      refetch();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardShell title="My Bookings">
      <div className="space-y-3">
        {error && <p className="rounded-md bg-danger-50 p-3 text-sm text-danger">{error.message}</p>}
        {actionError && <p className="rounded-md bg-danger-50 p-3 text-sm text-danger">{actionError}</p>}
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {(data ?? []).map((booking) => {
          const title = typeof booking.listing === "object" && booking.listing !== null ? booking.listing.title : "Rental";
          const isReviewed = reviewedIds.has(booking._id);
          const canRequestReturn = ["confirmed", "active"].includes(booking.status);
          const canReview = ["completed", "return_requested"].includes(booking.status);
          return (
            <div key={booking._id} className="rounded-lg border border-border bg-card p-5 hover:border-primary">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <Link href={ROUTES.RENTAL_DETAIL(booking._id)}>
                  <h2 className="font-semibold">{title}</h2>
                </Link>
                <div className="text-right">
                  <Badge variant={statusVariant(booking.status)}>{booking.status}</Badge>
                  <p className="mt-2 font-semibold">{formatCurrency(booking.totalAmount)}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {formatDate(booking.startDate)} - {formatDate(booking.endDate)}
                  {booking.status === "requested" && " · Awaiting owner confirmation"}
                  {booking.status === "confirmed" && " · Confirm receipt once you have the item — this pays the owner"}
                  {booking.status === "active" && " · In progress · rent paid to owner, deposit still held"}
                  {booking.status === "return_requested" && " · Return requested, awaiting owner confirmation"}
                  {booking.status === "completed" && " · Completed · deposit refunded"}
                </p>
                <div className="flex items-center gap-2">
                  {booking.status === "confirmed" && (
                    <Button size="sm" variant="primary" loading={busyId === booking._id} onClick={() => confirmReceipt(booking._id)}>
                      I&apos;ve received the item
                    </Button>
                  )}
                  {canRequestReturn && (
                    <Button size="sm" variant="outline" loading={busyId === booking._id} onClick={() => requestReturn(booking._id)}>
                      Request Return
                    </Button>
                  )}
                  {canReview && (
                    <Button
                      size="sm"
                      variant={isReviewed ? "outline" : "primary"}
                      disabled={isReviewed}
                      onClick={() => setReviewTarget({ _id: booking._id, title })}
                    >
                      {isReviewed ? "Reviewed" : "Leave a Review"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {!isLoading && !error && (data ?? []).length === 0 && (
          <p className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No bookings yet. Browse the marketplace to rent something.
          </p>
        )}
      </div>
      <ReviewModal
        open={!!reviewTarget}
        onClose={() => setReviewTarget(null)}
        booking={reviewTarget}
        onSubmitted={() => reviewTarget && markReviewed(reviewTarget._id)}
      />
    </DashboardShell>
  );
}

export default function MyRentalsPage() {
  return (
    <RequireAuth>
      <MyRentalsInner />
    </RequireAuth>
  );
}
