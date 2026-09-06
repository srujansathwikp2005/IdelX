"use client";

import Link from "next/link";
import { DashboardShell } from "@/components/marketplace/dashboard-shell";
import { ReviewModal } from "@/components/marketplace/review-modal";
import { StatCard } from "@/components/shared/stat-card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RequireAuth, useAuth, errorMessage } from "@/lib/auth";
import { api } from "@/lib/api-client";
import { useFetchData } from "@/lib/use-fetch-data";
import { formatCurrency, formatDate, timeAgo } from "@/lib/formatters";
import type { Booking, Kyc, Listing, Payout, Review } from "@/lib/api-types";
import { kycDisplay } from "@/lib/kyc-status";
import { ChevronRight, ICONS } from "@/components/ui/icons";
import { ProfileSheet } from "@/components/marketplace/profile-sheet";
import { LineChart } from "@/components/marketplace/charts";
import { ROUTES } from "@/lib/constants";
import * as React from "react";

function BookingRow({ booking, asOwner, onApprove, onReject, onConfirmReturn, onReview, onViewRenter, busy }: {
  booking: Booking;
  /** Whether the signed-in user owns the item in THIS booking. */
  asOwner: boolean;
  onApprove?: (booking: Booking) => void;
  onReject?: (booking: Booking) => void;
  onConfirmReturn?: (booking: Booking) => void;
  onReview?: (booking: Booking) => void;
  onViewRenter?: (userId: string) => void;
  busy?: boolean;
}) {
  const title = typeof booking.listing === "object" && booking.listing !== null ? booking.listing.title : "Rental";
  const renter = typeof booking.renter === "object" && booking.renter !== null ? booking.renter : null;
  const rating = renter && typeof renter === "object" && "ratingAvg" in renter
    ? (renter as { ratingAvg?: number; ratingCount?: number })
    : null;

  return (
    <div className="rounded-lg bg-muted p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">
            {formatDate(booking.startDate)} - {formatDate(booking.endDate)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={booking.status === "completed" ? "success" : booking.status === "cancelled" ? "danger" : booking.status === "return_requested" || booking.status === "awaiting_payment" ? "warning" : "default"}>{booking.status}</Badge>
          {/* Every action below is gated on owning THIS booking, not on the
              account being an owner of anything. Gating on the latter put an
              Approve button on the user's own rentals, and the server — which
              checks properly — answered "Only the owner can confirm". */}
          {asOwner && onApprove && booking.status === "requested" && (
            <Button size="sm" loading={busy} disabled={busy} onClick={() => onApprove(booking)}>
              Approve
            </Button>
          )}
          {asOwner && onReject && booking.status === "requested" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onReject(booking)}>
              Reject
            </Button>
          )}
          {asOwner && onConfirmReturn && booking.status === "return_requested" && (
            <Button size="sm" loading={busy} disabled={busy} onClick={() => onConfirmReturn(booking)}>
              Confirm Return
            </Button>
          )}
          {/* Where a renter's rating comes from. Without this the web could
              read ratings but never produce one, so every renter stayed on
              "No reviews yet" forever. */}
          {asOwner && onReview && booking.status === "completed" && (
            <Button size="sm" variant="outline" onClick={() => onReview(booking)}>
              Rate renter
            </Button>
          )}
        </div>
      </div>

      {/* Who is asking, and how it has gone for other people. An owner
          choosing between competing requests needs it in front of them. */}
      {asOwner && booking.status === "requested" && renter && (
        <button
          type="button"
          onClick={() => renter._id && onViewRenter?.(renter._id)}
          disabled={!onViewRenter || !renter._id}
          className="mt-2.5 flex w-full items-center gap-2 border-t border-border pt-2.5 text-left text-sm enabled:hover:text-primary disabled:cursor-default"
        >
          <Avatar name={renter.name ?? "Renter"} size="sm" />
          <span className="font-medium">{renter.name ?? "Renter"}</span>
          <span className="ml-auto text-muted-foreground">
            {rating?.ratingCount
              ? `${rating.ratingAvg?.toFixed(1)} ★ (${rating.ratingCount})`
              : "No reviews yet"}
          </span>
          {onViewRenter && renter._id && (
            <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
          )}
        </button>
      )}
    </div>
  );
}

function DashboardInner() {
  const { user } = useAuth();
  const isOwner = user?.isOwner || user?.role === "admin" || user?.role === "owner";

  const { data: myListings } = useFetchData<Listing[]>("/api/listings/mine/all", [isOwner]);
  const { data: renterBookings } = useFetchData<Booking[]>("/api/bookings", []);
  const { data: ownerBookings, refetch: refetchOwner } = useFetchData<Booking[]>("/api/bookings/owner", [isOwner]);
  const { data: payouts } = useFetchData<Payout[]>("/api/payments/payouts", [isOwner]);
  const { data: myReviews, refetch: refetchReviews } = useFetchData<Review[]>("/api/reviews/mine", []);
  const { data: kyc } = useFetchData<Kyc>("/api/kyc", [user?._id]);
  const [approvalError, setApprovalError] = React.useState<string | null>(null);
  const [reviewing, setReviewing] = React.useState<Booking | null>(null);
  const [viewingRenter, setViewingRenter] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const approve = async (booking: Booking) => {
    // Guard against a second click while the first request is in flight.
    // Without it, rapid clicks fire concurrent confirms: the first succeeds
    // and the rest come back "Cannot confirm a booking in 'confirmed'
    // state", so the owner sees an error for an action that worked.
    if (busyId) return;
    setApprovalError(null);
    setBusyId(booking._id);
    try {
      await api.post<Booking>(`/api/bookings/${booking._id}/confirm`, {});
      refetchOwner();
    } catch (err) {
      setApprovalError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (booking: Booking) => {
    if (busyId) return;
    const title = typeof booking.listing === "object" && booking.listing !== null ? booking.listing.title : "this rental";
    if (!window.confirm(`Reject this request for ${title}? The renter is told the dates went elsewhere, and nothing is charged.`)) {
      return;
    }
    setApprovalError(null);
    setBusyId(booking._id);
    try {
      // The server requires a reason and records it on the booking, which is
      // what the renter is shown. Posting an empty body failed validation,
      // so Reject did nothing but print "Validation failed — reason: Required".
      await api.post<Booking>(`/api/bookings/${booking._id}/cancel`, {
        reason: "The owner declined this request",
      });
      refetchOwner();
    } catch (err) {
      setApprovalError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const confirmReturn = async (booking: Booking) => {
    if (busyId) return;
    setApprovalError(null);
    setBusyId(booking._id);
    try {
      await api.post<Booking>(`/api/bookings/${booking._id}/confirm-return`, {});
      refetchOwner();
    } catch (err) {
      setApprovalError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const upcoming = (renterBookings ?? []).filter((b) => ["requested", "confirmed", "active"].includes(b.status));
  const ownerUpcoming = (ownerBookings ?? []).filter((b) => ["requested", "confirmed", "active", "return_requested"].includes(b.status));
  // Finished rentals the owner has not rated yet. They are the only source of
  // a renter's reputation, so they need somewhere to be acted on.
  const reviewedBookingIds = new Set((myReviews ?? []).map((r) => String(r.booking)));
  const toRate = (ownerBookings ?? []).filter(
    (b) => b.status === "completed" && !reviewedBookingIds.has(String(b._id))
  );
  const listedCount = myListings?.length ?? 0;
  const publishedCount = myListings?.filter((l) => l.status === "published").length ?? 0;
  const payoutTotal = (payouts ?? []).filter((p) => p.status !== "failed").reduce((sum, p) => sum + p.amount, 0);

  // One feed out of three sources, newest first. There is no activity table
  // for a normal user — the audit log is an admin thing — so this is assembled
  // from the records that already exist rather than from a new collection.
  const activity = React.useMemo(() => {
    type Entry = { id: string; icon: string; text: string; at: string; amount?: number };
    const entries: Entry[] = [];

    for (const b of ownerBookings ?? []) {
      const title = typeof b.listing === "object" && b.listing ? b.listing.title : "your listing";
      if (b.status === "requested") {
        entries.push({ id: `req-${b._id}`, icon: "CalendarCheck", text: `New booking request for ${title}`, at: b.createdAt });
      }
      if (["confirmed", "active", "completed"].includes(b.status)) {
        entries.push({
          id: `pay-${b._id}`,
          icon: "Banknote",
          text: `Payment received for ${title}`,
          at: b.updatedAt || b.createdAt,
          amount: b.totalAmount,
        });
      }
    }
    for (const l of myListings ?? []) {
      if (l.status === "published") {
        entries.push({ id: `live-${l._id}`, icon: "Package", text: `Your listing '${l.title}' is live`, at: l.updatedAt || l.createdAt });
      }
    }
    for (const b of renterBookings ?? []) {
      if (b.status === "completed") {
        const title = typeof b.listing === "object" && b.listing ? b.listing.title : "a rental";
        entries.push({ id: `done-${b._id}`, icon: "Star", text: `Rental completed for ${title}`, at: b.updatedAt || b.createdAt });
      }
    }
    return entries.sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 5);
  }, [ownerBookings, myListings, renterBookings]);

  // Earnings by month, from payouts that were not refused.
  const earnings = React.useMemo(() => {
    const months = new Map<string, number>();
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.set(d.toLocaleDateString("en-IN", { month: "short" }), 0);
    }
    for (const p of payouts ?? []) {
      if (p.status === "failed") continue;
      const key = new Date(p.createdAt).toLocaleDateString("en-IN", { month: "short" });
      if (months.has(key)) months.set(key, (months.get(key) ?? 0) + p.amount);
    }
    return [...months].map(([label, value]) => ({ label, value }));
  }, [payouts]);

  const kycState = kycDisplay(kyc);

  return (
    <DashboardShell title="Dashboard">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Active Bookings"
          value={String(upcoming.length + ownerUpcoming.length)}
          description="Across your rentals"
          icon="CalendarCheck"
        />
        <StatCard
          title="Listed Items"
          value={String(listedCount)}
          description={`${publishedCount} published`}
          icon="Package"
        />
        <StatCard
          title="Total Earnings"
          value={formatCurrency(payoutTotal)}
          description="Paid out to you"
          icon="Wallet"
        />
        <StatCard
          title="Profile Status"
          value={kycState.label}
          description={kycState.label === "Verified" ? "All good!" : "Finish verification to get paid"}
          icon="ShieldCheck"
          valueClassName={kycState.label === "Verified" ? "text-success" : undefined}
        />
      </div>

      {approvalError && (
        <p className="mt-4 rounded-md bg-danger-50 p-3 text-sm text-danger-700">{approvalError}</p>
      )}

      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel
          title="Upcoming Bookings"
          action={<Link href={ROUTES.MY_RENTALS} className="text-sm font-semibold text-primary">View all</Link>}
        >
          {upcoming.length === 0 && ownerUpcoming.length === 0 ? (
            <Empty>Nothing booked yet. Browse the marketplace to rent something.</Empty>
          ) : (
            <div className="flex flex-col gap-2.5">
              {/* Requests waiting on this owner come first. Merging the two
                  lists and slicing to four buried them behind the user's own
                  rentals — an owner with two power bank requests saw a
                  basketball he had asked to rent, and nothing to act on. */}
              {ownerUpcoming
                .filter((b) => b.status === "requested")
                .concat(ownerUpcoming.filter((b) => b.status !== "requested"))
                .slice(0, 3)
                .map((booking) => (
                  <BookingRow
                    key={booking._id}
                    booking={booking}
                    asOwner
                    onApprove={approve}
                    onReject={reject}
                    onConfirmReturn={confirmReturn}
                    onViewRenter={setViewingRenter}
                    busy={busyId === booking._id}
                  />
                ))}
              {toRate.slice(0, 2).map((booking) => (
                <BookingRow
                  key={booking._id}
                  booking={booking}
                  asOwner
                  onReview={setReviewing}
                  busy={busyId === booking._id}
                />
              ))}
              {upcoming.slice(0, 3).map((booking) => (
                <BookingRow
                  key={booking._id}
                  booking={booking}
                  asOwner={false}
                  busy={busyId === booking._id}
                />
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Recent Activity"
          action={<Link href={ROUTES.MY_RENTALS} className="text-sm font-semibold text-primary">View all activity</Link>}
        >
          {activity.length === 0 ? (
            <Empty>Nothing has happened yet. Bookings and payouts show up here.</Empty>
          ) : (
            <ul className="flex flex-col gap-3.5">
              {activity.map((entry) => {
                const Icon = ICONS[entry.icon];
                return (
                  <li key={entry.id} className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-50 text-primary">
                      {Icon && <Icon size={15} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{entry.text}</p>
                      <p className="text-xs text-muted-foreground">{timeAgo(entry.at)}</p>
                    </div>
                    {entry.amount != null && (
                      <span className="shrink-0 text-sm font-semibold text-success">
                        + {formatCurrency(entry.amount)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </section>

      <ProfileSheet userId={viewingRenter} onClose={() => setViewingRenter(null)} />

      <ReviewModal
        open={!!reviewing}
        onClose={() => setReviewing(null)}
        asOwner
        booking={
          reviewing
            ? {
                _id: reviewing._id,
                // The person, not the item — this review is about them.
                title:
                  typeof reviewing.renter === "object" && reviewing.renter !== null
                    ? reviewing.renter.name ?? "the renter"
                    : "the renter",
              }
            : null
        }
        onSubmitted={() => {
          setReviewing(null);
          refetchOwner();
          refetchReviews();
        }}
      />

      <section className="mt-5 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Earnings Overview</h2>
          <span className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground">
            Last 6 months
          </span>
        </div>
        <div className="mt-4">
          <LineChart data={earnings} formatter={(v) => formatCurrency(v)} />
        </div>
      </section>
    </DashboardShell>
  );
}

/** A titled panel with an optional action on the right. */
function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-muted p-5 text-sm text-muted-foreground">{children}</p>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardInner />
    </RequireAuth>
  );
}
