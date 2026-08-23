"use client";

import Link from "next/link";
import { DashboardShell } from "@/components/marketplace/dashboard-shell";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RequireAuth, useAuth, errorMessage } from "@/lib/auth";
import { api } from "@/lib/api-client";
import { useFetchData } from "@/lib/use-fetch-data";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { Booking, Listing, Payout } from "@/lib/api-types";
import { ROUTES } from "@/lib/constants";
import * as React from "react";

function BookingRow({ booking, onApprove, onConfirmReturn, busy }: {
  booking: Booking;
  onApprove?: (booking: Booking) => void;
  onConfirmReturn?: (booking: Booking) => void;
  busy?: boolean;
}) {
  const title = typeof booking.listing === "object" && booking.listing !== null ? booking.listing.title : "Rental";
  return (
    <div className="flex items-center justify-between rounded-lg bg-muted p-3">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{formatDate(booking.startDate)} - {formatDate(booking.endDate)}</p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={booking.status === "completed" ? "success" : booking.status === "cancelled" ? "danger" : booking.status === "return_requested" || booking.status === "awaiting_payment" ? "warning" : "default"}>{booking.status}</Badge>
        {onApprove && booking.status === "requested" && (
          <Button size="sm" loading={busy} disabled={busy} onClick={() => onApprove(booking)}>
            Approve
          </Button>
        )}
        {onConfirmReturn && booking.status === "return_requested" && (
          <Button size="sm" loading={busy} disabled={busy} onClick={() => onConfirmReturn(booking)}>
            Confirm Return
          </Button>
        )}
      </div>
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
  const [approvalError, setApprovalError] = React.useState<string | null>(null);
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
  const recentCompleted = (renterBookings ?? [])
    .filter((b) => b.status === "completed")
    .sort((a, b) => +new Date(b.updatedAt || b.createdAt) - +new Date(a.updatedAt || a.createdAt))
    .slice(0, 5);
  const listedCount = myListings?.length ?? 0;
  const publishedCount = myListings?.filter((l) => l.status === "published").length ?? 0;
  const payoutTotal = (payouts ?? []).filter((p) => p.status !== "failed").reduce((sum, p) => sum + p.amount, 0);

  return (
    <DashboardShell title="Dashboard">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Active bookings" value={String(upcoming.length + ownerUpcoming.length)} description="Across your rentals" icon="CalendarCheck" />
        <StatCard title="Listed items" value={String(listedCount)} description={`${publishedCount} published`} icon="Package" />
        <StatCard title="Payout eligible" value={formatCurrency(payoutTotal)} description="Owner earnings" icon="Wallet" />
        <StatCard title="Role" value={isOwner ? "Owner" : "Renter"} description={user?.email ?? ""} icon="ShieldCheck" />
      </div>
      {approvalError && <p className="mt-4 rounded-md bg-danger-50 p-3 text-sm text-danger">{approvalError}</p>}
      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-semibold">Upcoming rentals</h2>
          <div className="mt-4 space-y-3">
            {upcoming.length === 0 && <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">No upcoming rentals. Browse the marketplace to book something.</p>}
            {upcoming.map((booking) => <BookingRow key={booking._id} booking={booking} />)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-semibold">{isOwner ? "Incoming requests" : "Recent activity"}</h2>
          <div className="mt-4 space-y-3">
            {ownerUpcoming.length === 0 && <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">No requests yet.</p>}
            {ownerUpcoming.map((booking) => <BookingRow key={booking._id} booking={booking} onApprove={isOwner ? approve : undefined} onConfirmReturn={isOwner ? confirmReturn : undefined} busy={busyId === booking._id} />)}
          </div>
        </div>
      </section>
      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Recently completed bookings</h2>
          <Link href={ROUTES.MY_RENTALS} className="text-sm font-semibold text-primary">View all</Link>
        </div>
        <div className="mt-4 space-y-3">
          {recentCompleted.length === 0 && (
            <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">No completed bookings yet.</p>
          )}
          {recentCompleted.map((booking) => {
            const listing = typeof booking.listing === "object" && booking.listing !== null ? booking.listing : null;
            const listingId = listing ? listing._id : typeof booking.listing === "string" ? booking.listing : null;
            const image = listing?.photos?.[0]?.url ?? "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=800&q=80";
            return (
              <div key={booking._id} className="flex items-center gap-3 rounded-lg bg-muted p-3">
                <Link href={ROUTES.RENTAL_DETAIL(booking._id)} className="flex min-w-0 flex-1 items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image} alt={listing?.title ?? "listing photo"} className="h-12 w-16 shrink-0 rounded-md object-cover" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{listing?.title ?? "Rental"}</p>
                    <p className="text-sm text-muted-foreground">{formatDate(booking.startDate)} - {formatDate(booking.endDate)}</p>
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    <Badge variant="success">completed</Badge>
                    <span className="text-sm font-semibold">{formatCurrency(booking.totalAmount)}</span>
                  </div>
                </Link>
                {listingId && (
                  <Link href={ROUTES.PRODUCT(listingId)} className="shrink-0">
                    <Button size="sm" variant="outline">Book Again</Button>
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </DashboardShell>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardInner />
    </RequireAuth>
  );
}
