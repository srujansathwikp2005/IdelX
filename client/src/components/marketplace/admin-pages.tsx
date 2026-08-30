"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/components/marketplace/admin-shell";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Table, Td, Th } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { LineChart, BarChart, DonutChart, ProgressRows, type ChartDatum } from "@/components/marketplace/charts";
import { api } from "@/lib/api-client";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { RequireAuth, useAuth, errorMessage, useIsMounted } from "@/lib/auth";
import { ApiError, useFetchData } from "@/lib/use-fetch-data";
import { formatCurrency, formatDate, formatDateTime, timeAgo } from "@/lib/formatters";
import type {
  AdminAnalytics,
  AdminBookingsResult,
  AdminPaymentsResult,
  AdminStats,
  AuditLog,
  AuditLogResult,
  Booking,
  OutstandingResult,
  SettlementObligation,
  Dispute,
  Kyc,
  Listing,
  Pagination,
  Payment,
  SeriesPoint,
  User,
  Conversation,
  SupportTicket,
  AdminCategory,
  AdminExtensionRequest,
} from "@/lib/api-types";
import { ROUTES } from "@/lib/constants";

function AdminError({ error }: { error?: Error | null }) {
  if (!error) return null;
  const isApiResponse = error instanceof ApiError;
  return (
    <p className="mb-4 rounded-md bg-danger-50 p-3 text-sm text-danger">
      {error.message}
      {!isApiResponse && (
        <span className="mt-1 block text-xs text-muted-foreground">
          Tip: start the backend with <code className="rounded bg-muted px-1">npm run dev</code> inside idlex-backend/ to see live data.
        </span>
      )}
    </p>
  );
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function toChartData(series?: SeriesPoint[]): ChartDatum[] {
  return (series ?? []).map((s) => ({ label: shortDate(s.date), value: s.value }));
}

function trend(series?: SeriesPoint[]): { value: string; type: "increase" | "decrease" } | undefined {
  if (!series || series.length < 2) return undefined;
  const last = series[series.length - 1].value;
  const prev = series[series.length - 2].value;
  if (last === prev) return undefined;
  const pct = prev === 0 ? 100 : Math.round(((last - prev) / prev) * 100);
  return { value: `${Math.abs(pct)}%`, type: last > prev ? "increase" : "decrease" };
}

function CategoryBadge({ category }: { category: AuditLog["category"] }) {
  const map: Record<AuditLog["category"], "default" | "success" | "warning" | "danger"> = {
    auth: "default",
    listing: "warning",
    booking: "warning",
    payment: "success",
    kyc: "default",
    review: "success",
    admin: "danger",
    system: "default",
  };
  return <Badge variant={map[category] ?? "default"}>{category}</Badge>;
}

function actorName(log: AuditLog): string {
  if (log.actor && typeof log.actor === "object") return log.actor.name || log.actor.email || "User";
  return "System";
}

function PaginationBar({ pagination, onPage }: { pagination: Pagination | null; onPage: (page: number) => void }) {
  if (!pagination || pagination.pages <= 1) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>
        Page {pagination.page} of {pagination.pages} · {pagination.total} record{pagination.total === 1 ? "" : "s"}
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>
          Previous
        </Button>
        <Button size="sm" variant="outline" disabled={pagination.page >= pagination.pages} onClick={() => onPage(pagination.page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

const CATEGORY_OPTIONS = [
  { value: "", label: "All categories" },
  { value: "auth", label: "Auth" },
  { value: "listing", label: "Listing" },
  { value: "booking", label: "Booking" },
  { value: "payment", label: "Payment" },
  { value: "kyc", label: "KYC" },
  { value: "review", label: "Review" },
  { value: "admin", label: "Admin" },
  { value: "system", label: "System" },
];

const ACTION_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "user.login", label: "Sign in" },
  { value: "user.registered", label: "Register" },
  { value: "listing.created", label: "Listing created" },
  { value: "listing.updated", label: "Listing updated" },
  { value: "listing.deleted", label: "Listing deleted" },
  { value: "booking.created", label: "Booking requested" },
  { value: "booking.confirmed", label: "Booking confirmed" },
  { value: "booking.cancelled", label: "Booking cancelled" },
  { value: "booking.completed", label: "Booking completed" },
  { value: "booking.extension_requested", label: "Extension requested" },
  { value: "booking.extension_responded", label: "Extension responded" },
  { value: "booking.return_requested", label: "Return requested" },
  { value: "payment.intent_created", label: "Payment initiated" },
  { value: "kyc.submitted", label: "KYC submitted" },
  { value: "kyc.step_saved", label: "KYC step saved" },
  { value: "review.created", label: "Review created" },
  { value: "admin.user_updated", label: "Admin user action" },
  { value: "admin.listing_moderated", label: "Listing moderated" },
  { value: "admin.dispute_resolved", label: "Dispute resolved" },
  { value: "admin.kyc_reviewed", label: "KYC reviewed" },
];

const RESOURCE_OPTIONS = [
  { value: "", label: "All resources" },
  { value: "user", label: "User" },
  { value: "listing", label: "Listing" },
  { value: "booking", label: "Booking" },
  { value: "payment", label: "Payment" },
  { value: "kyc", label: "KYC" },
  { value: "review", label: "Review" },
  { value: "dispute", label: "Dispute" },
];

function bookingStatusVariant(status: Booking["status"]): "default" | "success" | "warning" | "danger" {
  switch (status) {
    case "confirmed":
    case "completed":
      return "success";
    case "cancelled":
    case "disputed":
      return "danger";
    case "requested":
    case "return_requested":
      return "warning";
    default:
      return "default";
  }
}

function paymentStatusVariant(status: Payment["status"]): "default" | "success" | "warning" | "danger" {
  switch (status) {
    case "captured":
      return "success";
    case "failed":
      return "danger";
    case "authorized":
      return "warning";
    default:
      return "default";
  }
}

// ---------------------------------------------------------------------------
// Dashboard — graphical metrics + activity
// ---------------------------------------------------------------------------


/** Counts of everything waiting on a person. */
type AdminQueues = {
  paymentsToVerify: number;
  kycPending: number;
  disputesOpen: number;
  extensionsPending: number;
  payoutsOutstanding: number;
  payoutsAmount: number;
};

/**
 * What needs doing, at the top of the dashboard.
 *
 * The screen opened with totals — users, listings, revenue — which say how
 * the platform is doing but not what anyone has to do about it. On a
 * marketplace where payments are verified by hand, an operator opens this to
 * find out whether money is waiting, and had to click through five separate
 * pages to discover it.
 *
 * Only queues with something in them are shown. A row of zeroes trains
 * people to ignore the row, and then they miss the one that is not zero.
 */
function WorkQueues({ queues }: { queues: AdminQueues | null }) {
  const items = [
    {
      label: "Payments to verify",
      count: queues?.paymentsToVerify ?? 0,
      href: ROUTES.ADMIN_MANUAL_PAYMENTS,
      note: "Bookings stay unconfirmed until you check these",
      tone: "urgent" as const,
    },
    {
      label: "Payouts to send",
      count: queues?.payoutsOutstanding ?? 0,
      href: ROUTES.ADMIN_SETTLEMENTS,
      note: queues?.payoutsAmount
        ? `${formatCurrency(queues.payoutsAmount)} owed to owners and renters`
        : "Money owed out",
      tone: "urgent" as const,
    },
    {
      label: "KYC to review",
      count: queues?.kycPending ?? 0,
      href: ROUTES.ADMIN_KYC,
      note: "People cannot rent or list until approved",
      tone: "normal" as const,
    },
    {
      label: "Open disputes",
      count: queues?.disputesOpen ?? 0,
      href: ROUTES.ADMIN_DISPUTES,
      note: "Deposits are held while these are open",
      tone: "normal" as const,
    },
    {
      label: "Extension requests",
      count: queues?.extensionsPending ?? 0,
      href: ROUTES.ADMIN_EXTENSION_REQUESTS,
      note: "Renters waiting on a longer rental",
      tone: "normal" as const,
    },
  ].filter((i) => i.count > 0);

  // Nothing at all until the counts are in. Rendering the heading over an
  // empty grid while loading reads as "nothing needs you", which is the one
  // thing this section must never say when it does not yet know.
  if (!queues) return null;

  if (items.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-card px-5 py-4">
        <p className="text-sm font-medium">Nothing waiting</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          No payments, payouts, verifications or disputes need attention right now.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Needs you now
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((i) => (
          <Link
            key={i.label}
            href={i.href}
            className={cn(
              "group rounded-lg border bg-card p-4 transition-colors",
              // Money waiting reads differently from a queue that can sit an
              // hour. The colour carries that, not just the ordering.
              i.tone === "urgent"
                ? "border-warning/40 hover:border-warning"
                : "border-border hover:border-foreground/30",
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">{i.label}</span>
              <span
                className={cn(
                  "text-2xl font-bold tabular-nums",
                  i.tone === "urgent" ? "text-warning" : "text-foreground",
                )}
              >
                {i.count}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{i.note}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function AdminOverview() {
  const { data: analytics, error: analyticsError } = useFetchData<AdminAnalytics>("/api/admin/analytics", []);
  const { data: stats } = useFetchData<AdminStats>("/api/admin/stats", []);
  const { data: queues } = useFetchData<AdminQueues>("/api/admin/queues", []);

  const totals = analytics?.totals ?? stats;
  const activity = analytics?.recentActivity ?? [];

  return (
    <AdminShell>
      <AdminError error={analyticsError} />

      {/* Work first, then how the platform is doing. */}
      <div className="mb-8">
        <WorkQueues queues={queues} />
      </div>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Platform
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total users"
          value={(totals?.totalUsers ?? 0).toLocaleString("en-IN")}
          description="Registered accounts"
          icon="Users"
          change={trend(analytics?.newSignups)}
        />
        <StatCard
          title="Listings"
          value={(totals?.totalListings ?? 0).toLocaleString("en-IN")}
          description="Across all categories"
          icon="Package"
        />
        <StatCard
          title="Active bookings"
          value={(totals?.activeBookings ?? 0).toString()}
          description="Confirmed + active"
          icon="CalendarCheck"
          change={trend(analytics?.bookingTrend)}
        />
        <StatCard
          title="Revenue"
          value={formatCurrency(totals?.totalRevenue ?? 0)}
          description="Captured payments"
          icon="Wallet"
          change={trend(analytics?.revenueTrend)}
        />
      </div>

      {/* Trend charts */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">New signups</h2>
              <p className="text-xs text-muted-foreground">Last {analytics?.windowDays ?? 30} days</p>
            </div>
            <Badge>Live</Badge>
          </div>
          <LineChart data={toChartData(analytics?.newSignups)} />
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Revenue</h2>
              <p className="text-xs text-muted-foreground">Captured payments per day</p>
            </div>
            <Badge variant="success">INR</Badge>
          </div>
          <BarChart data={toChartData(analytics?.revenueTrend)} color="#10b981" formatter={(v) => formatCurrency(v)} />
        </div>
      </div>

      {/* Distribution */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-4 font-semibold">Bookings by status</h2>
          <DonutChart
            data={(analytics?.bookingsByStatus ?? []).map((b) => ({ label: b.status, value: b.count }))}
            centerLabel="Bookings"
          />
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-4 font-semibold">Listings by category</h2>
          <ProgressRows
            data={(analytics?.listingsByCategory ?? []).map((c) => ({ label: c.category, value: c.count }))}
          />
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-4 font-semibold">Top activity</h2>
          <ProgressRows data={(analytics?.activityBreakdown ?? []).map((a) => ({ label: a.action, value: a.count }))} color="#f59e0b" />
        </div>
      </div>

      {/* Activity feed + top users */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-4 font-semibold">Recent activity</h2>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No activity yet — it appears here as users sign in, book, list items, and take other actions.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {activity.map((log) => (
                <li key={log._id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-50 text-xs font-bold text-primary">
                    {actorName(log).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      <span className="font-semibold">{actorName(log)}</span>{" "}
                      <span className="text-muted-foreground">{log.summary}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{timeAgo(log.createdAt)}</p>
                  </div>
                  <CategoryBadge category={log.category} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-4 font-semibold">Most active users</h2>
          {(analytics?.topUsers ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No user activity recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {(analytics?.topUsers ?? []).map(({ user, actions, lastActive }) => (
                <li key={user?._id ?? "unknown"} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary-50 text-xs font-bold text-secondary-700">
                    {user?.name?.slice(0, 2).toUpperCase() ?? "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{user?.name ?? "Deleted user"}</p>
                    <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{actions} actions</p>
                    <p className="text-xs text-muted-foreground">{timeAgo(lastActive)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

// ---------------------------------------------------------------------------
// Audit logs
// ---------------------------------------------------------------------------

export function AdminAuditLogsPage() {
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [action, setAction] = React.useState("");
  const [resourceType, setResourceType] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [expanded, setExpanded] = React.useState<string | null>(null);

  // Debounce the free-text search so we don't fire a request per keystroke.
  React.useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setDebouncedQ(q);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const reset = (fn: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setPage(1);
    fn(e.target.value);
  };

  const params = new URLSearchParams({ limit: "25", page: String(page) });
  if (debouncedQ) params.set("q", debouncedQ);
  if (category) params.set("category", category);
  if (action) params.set("action", action);
  if (resourceType) params.set("resourceType", resourceType);
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const { data, isLoading, error } = useFetchData<AuditLogResult>(`/api/admin/audit-logs?${params.toString()}`, [page, debouncedQ, category, action, resourceType, from, to]);

  return (
    <AdminShell>
      <div className="mb-5">
        <h1 className="text-2xl font-bold">Audit Logs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every meaningful action across the platform — sign-ins, bookings, listings, KYC reviews and admin changes.
        </p>
      </div>

      {/* Filters */}
      <div className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-2 xl:grid-cols-6">
        <div className="xl:col-span-2">
          <Input label="Search" placeholder="Actor name, email or summary…" value={q} onChange={reset(setQ)} />
        </div>
        <Select label="Category" value={category} onChange={reset(setCategory)} options={CATEGORY_OPTIONS} />
        <Select label="Action" value={action} onChange={reset(setAction)} options={ACTION_OPTIONS} />
        <Select label="Resource" value={resourceType} onChange={reset(setResourceType)} options={RESOURCE_OPTIONS} />
        <div className="grid grid-cols-2 gap-2">
          <Input label="From" type="date" value={from} onChange={reset(setFrom)} />
          <Input label="To" type="date" value={to} onChange={reset(setTo)} />
        </div>
      </div>

      <AdminError error={error} />
      {isLoading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}

      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Actor</Th>
              <Th>Action</Th>
              <Th>Category</Th>
              <Th>Resource</Th>
              <Th>Summary</Th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((log) => (
              <React.Fragment key={log._id}>
                <tr
                  className={expanded === log._id ? "bg-muted/60" : "cursor-pointer hover:bg-muted/50"}
                  onClick={() => setExpanded(expanded === log._id ? null : log._id)}
                >
                  <Td className="whitespace-nowrap">{formatDateTime(log.createdAt)}</Td>
                  <Td>{actorName(log)}</Td>
                  <Td>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{log.action}</code>
                  </Td>
                  <Td><CategoryBadge category={log.category} /></Td>
                  <Td className="text-muted-foreground">
                    {log.resourceType ? (
                      <span className="whitespace-nowrap">
                        {log.resourceType}
                        {log.resourceId ? <span className="text-xs"> · {log.resourceId.slice(-6)}</span> : null}
                      </span>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td className="max-w-xs">
                    <span className="truncate">{log.summary || "—"}</span>
                  </Td>
                </tr>
                {expanded === log._id && (
                  <tr className="bg-muted/60">
                    <Td colSpan={6}>
                      <div className="grid gap-3 text-sm md:grid-cols-2">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Context</p>
                          <p className="mt-1">
                            IP: <span className="font-mono text-xs">{log.ip ?? "—"}</span>
                          </p>
                          <p className="mt-0.5">
                            User agent: <span className="text-xs text-muted-foreground">{log.userAgent ?? "—"}</span>
                          </p>
                          {log.resourceId && (
                            <p className="mt-0.5">
                              Resource id: <span className="font-mono text-xs">{log.resourceId}</span>
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Details</p>
                          {log.details ? (
                            <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-2 text-xs">{JSON.stringify(log.details, null, 2)}</pre>
                          ) : (
                            <p className="mt-1 text-muted-foreground">No additional details.</p>
                          )}
                        </div>
                      </div>
                    </Td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {(data?.items ?? []).length === 0 && !isLoading && (
              <tr>
                <Td colSpan={6} className="py-8 text-center text-muted-foreground">
                  No audit logs match your filters.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
        <PaginationBar pagination={data?.pagination ?? null} onPage={setPage} />
      </section>
    </AdminShell>
  );
}

// ---------------------------------------------------------------------------
// Bookings & payments
// ---------------------------------------------------------------------------

const BOOKING_STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "requested", label: "Requested" },
  { value: "confirmed", label: "Confirmed" },
  { value: "active", label: "Active" },
  { value: "return_requested", label: "Return requested" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "disputed", label: "Disputed" },
];

export function AdminBookingsPage() {
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState("");
  const params = new URLSearchParams({ limit: "20", page: String(page) });
  if (status) params.set("status", status);
  const { data, isLoading, error } = useFetchData<AdminBookingsResult>(`/api/admin/bookings?${params.toString()}`, [page, status]);

  // The address an admin needs during a dispute is the whole thing, but a
  // table row cannot carry it. So the cell shows what identifies a place at a
  // glance and keeps the rest reachable: the full text on hover, and a map
  // link when the renter dropped a pin.
  const addressCell = (b: Booking) => {
    const a = b.deliveryAddress;
    if (!a?.line1 && !a?.city) return <span className="text-muted-foreground">—</span>;

    const full = [a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(", ");
    return (
      <div className="max-w-52 text-xs" title={a.instructions ? `${full}\n\nNote: ${a.instructions}` : full}>
        <p className="truncate">{a.line1 || "—"}</p>
        <p className="truncate text-muted-foreground">
          {[a.city, a.pincode].filter(Boolean).join(" · ")}
        </p>
        {/* Coordinates only exist if the renter chose "Use my location" —
            typing an address is the normal path, so most rows will not have
            them. Shown as text as well as a link because an admin comparing
            two addresses in a dispute wants the numbers, not a new tab. */}
        {a.lat !== undefined && a.lng !== undefined && (
          <>
            <p className="select-all font-mono text-[11px] text-muted-foreground">
              {a.lat.toFixed(5)}, {a.lng.toFixed(5)}
            </p>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              View on map
            </a>
          </>
        )}
      </div>
    );
  };

  const person = (ref: unknown): string => {
    if (ref && typeof ref === "object" && "name" in ref) {
      const name = (ref as { name?: unknown }).name;
      return typeof name === "string" && name ? name : "—";
    }
    return "—";
  };

  return (
    <AdminShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Bookings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every rental booking across the marketplace.</p>
        </div>
        <Select
          className="w-48"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
          options={BOOKING_STATUS_OPTIONS}
        />
      </div>
      <AdminError error={error} />
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <Table>
          <thead>
            <tr>
              <Th>Item</Th>
              <Th>Renter</Th>
              <Th>Owner</Th>
              <Th>Dates</Th>
              <Th>Address</Th>
              <Th>Total</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((b) => (
              <tr key={b._id}>
                <Td className="max-w-55">
                  <span className="truncate">{b.listing && typeof b.listing === "object" ? b.listing.title : "Listing"}</span>
                </Td>
                <Td>{person(b.renter)}</Td>
                <Td>{person(b.owner)}</Td>
                <Td className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatDate(b.startDate)} → {formatDate(b.endDate)}
                </Td>
                <Td>{addressCell(b)}</Td>
                <Td className="font-semibold">{formatCurrency(b.totalAmount)}</Td>
                <Td><Badge variant={bookingStatusVariant(b.status)}>{b.status.replaceAll("_", " ")}</Badge></Td>
              </tr>
            ))}
            {(data?.items ?? []).length === 0 && !isLoading && (
              <tr>
                <Td colSpan={6} className="py-8 text-center text-muted-foreground">No bookings yet.</Td>
              </tr>
            )}
          </tbody>
        </Table>
        <PaginationBar pagination={data?.pagination ?? null} onPage={setPage} />
      </section>
    </AdminShell>
  );
}

const PAYMENT_STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "created", label: "Created" },
  { value: "authorized", label: "Authorized" },
  { value: "captured", label: "Captured" },
  { value: "failed", label: "Failed" },
  { value: "refunded", label: "Refunded" },
];

export function AdminPaymentsPage() {
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState("");
  const params = new URLSearchParams({ limit: "20", page: String(page) });
  if (status) params.set("status", status);
  const { data, isLoading, error } = useFetchData<AdminPaymentsResult>(`/api/admin/payments?${params.toString()}`, [page, status]);

  return (
    <AdminShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Payments & Payouts</h1>
          <p className="mt-1 text-sm text-muted-foreground">Monitor captured payments, refunds, and owner payouts.</p>
        </div>
        <Select
          className="w-48"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
          options={PAYMENT_STATUS_OPTIONS}
        />
      </div>
      <AdminError error={error} />
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <Table>
          <thead>
            <tr>
              <Th>Payer</Th>
              <Th>Order</Th>
              <Th>Gateway</Th>
              <Th>Amount</Th>
              <Th>Status</Th>
              <Th>Date</Th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((p) => (
              <tr key={p._id}>
                <Td>{p.payer && typeof p.payer === "object" ? p.payer.name : "User"}</Td>
                <Td>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{p.gatewayOrderId}</code>
                </Td>
                <Td className="capitalize text-muted-foreground">{p.gateway}</Td>
                <Td className="font-semibold">{formatCurrency(p.amount)}</Td>
                <Td><Badge variant={paymentStatusVariant(p.status)}>{p.status}</Badge></Td>
                <Td className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(p.createdAt)}</Td>
              </tr>
            ))}
            {(data?.items ?? []).length === 0 && !isLoading && (
              <tr>
                <Td colSpan={6} className="py-8 text-center text-muted-foreground">No payments yet.</Td>
              </tr>
            )}
          </tbody>
        </Table>
        <PaginationBar pagination={data?.pagination ?? null} onPage={setPage} />
      </section>
    </AdminShell>
  );
}

// ---------------------------------------------------------------------------
// Existing pages
// ---------------------------------------------------------------------------

/**
 * Search box for the admin tables.
 *
 * Searches on the server rather than filtering what is on screen: the list
 * endpoints are paginated, so filtering client-side would only ever search
 * the first page and quietly miss everyone after it.
 */
function AdminSearch({
  value,
  onChange,
  placeholder,
  resultCount,
  isSearching,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  resultCount?: number;
  isSearching?: boolean;
}) {
  return (
    <div className="w-full sm:w-80">
      <div className="relative">
        <Input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="pr-16"
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        ) : null}
      </div>
      {value ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {isSearching
            ? "Searching…"
            : `${resultCount ?? 0} ${resultCount === 1 ? "match" : "matches"}`}
        </p>
      ) : null}
    </div>
  );
}

export function AdminUsersPage() {
  const [search, setSearch] = React.useState("");
  const query = useDebouncedValue(search.trim());
  const { data, isLoading, error, refetch } = useFetchData<User[]>(
    query ? `/api/admin/users?q=${encodeURIComponent(query)}` : "/api/admin/users",
    [],
  );

  const suspend = async (id: string, isActive: boolean) => {
    await api.patch<User>(`/api/admin/users/${id}`, { isActive: !isActive });
    refetch();
  };

  return (
    <AdminShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage registered accounts and suspensions.</p>
        </div>
        <AdminSearch
          value={search}
          onChange={setSearch}
          placeholder="Search name, email or phone"
          resultCount={data?.length}
          isSearching={isLoading || search.trim() !== query}
        />
      </div>
      <AdminError error={error} />
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Phone</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Action</Th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((user) => (
              <tr key={user._id}>
                <Td>{user.name}</Td>
                <Td>{user.email}</Td>
                {/* phone is optional on the User model; say so rather than
                    rendering an empty cell that looks like a loading state. */}
                <Td>{user.phone || <span className="text-muted-foreground">Not provided</span>}</Td>
                <Td>{user.role}</Td>
                <Td><Badge variant={user.isActive ? "success" : "danger"}>{user.isActive ? "Active" : "Suspended"}</Badge></Td>
                <Td><Button size="sm" variant={user.isActive ? "danger" : "outline"} onClick={() => suspend(user._id, user.isActive)}>{user.isActive ? "Suspend" : "Restore"}</Button></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
    </AdminShell>
  );
}

export function AdminListingsPage() {
  const { data, isLoading, error, refetch } = useFetchData<Listing[]>("/api/admin/listings", []);

  const moderate = async (id: string, status: Listing["status"]) => {
    await api.patch<Listing>(`/api/admin/listings/${id}`, { status });
    refetch();
  };

  return (
    <AdminShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Listings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Moderate published listings.</p>
        </div>
      </div>
      <AdminError error={error} />
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <Table>
          <thead>
            <tr>
              <Th>Title</Th>
              <Th>Owner</Th>
              <Th>Price/day</Th>
              <Th>Status</Th>
              <Th>Action</Th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((listing) => (
              <tr key={listing._id}>
                <Td>{listing.title}</Td>
                <Td>{listing.owner && typeof listing.owner === "object" ? listing.owner.name : "Owner"}</Td>
                <Td>{formatCurrency(listing.pricePerDay)}</Td>
                <Td><Badge variant={listing.status === "published" ? "success" : "warning"}>{listing.status}</Badge></Td>
                <Td>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => moderate(listing._id, "paused")}>Pause</Button>
                    <Button size="sm" variant="outline" onClick={() => moderate(listing._id, "published")}>Publish</Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
    </AdminShell>
  );
}

export function AdminDisputesPage() {
  const { data, isLoading, error, refetch } = useFetchData<Dispute[]>("/api/admin/disputes", []);

  const resolve = async (id: string) => {
    await api.post<Dispute>(`/api/admin/disputes/${id}/resolve`, { status: "resolved", resolutionNote: "Resolved by admin" });
    refetch();
  };

  return (
    <AdminShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Disputes</h1>
          <p className="mt-1 text-sm text-muted-foreground">Review and resolve disputes.</p>
        </div>
      </div>
      <AdminError error={error} />
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <Table>
          <thead>
            <tr>
              <Th>Reason</Th>
              <Th>Raised by</Th>
              <Th>Status</Th>
              <Th>Action</Th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((dispute) => (
              <tr key={dispute._id}>
                <Td>{dispute.reason}</Td>
                <Td>{dispute.raisedBy && typeof dispute.raisedBy === "object" ? dispute.raisedBy.name : "User"}</Td>
                <Td><Badge variant={dispute.status === "open" ? "danger" : dispute.status === "resolved" ? "success" : "warning"}>{dispute.status}</Badge></Td>
                <Td>{dispute.status !== "resolved" && <Button size="sm" onClick={() => resolve(dispute._id)}>Resolve</Button>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
    </AdminShell>
  );
}

export function AdminKycPage() {
  const [search, setSearch] = React.useState("");
  const query = useDebouncedValue(search.trim());
  const { data, isLoading, error, refetch } = useFetchData<Kyc[]>(
    query ? `/api/admin/kyc?q=${encodeURIComponent(query)}` : "/api/admin/kyc",
    [],
  );
  // Which submission's bank details are open, or null for none. Holding the
  // record itself keeps the dialog in step with the row that opened it.
  const [bankDetailsFor, setBankDetailsFor] = React.useState<Kyc | null>(null);

  const review = async (id: string, status: "approved" | "rejected") => {
    await api.patch<Kyc>(`/api/admin/kyc/${id}`, { status, rejectionReason: status === "rejected" ? "Documents unclear" : undefined });
    refetch();
  };

  return (
    <AdminShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">KYC Verification</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Users upload an identity document (PDF) plus a live selfie. Download the PDF, compare the selfie with the document photo, then approve or reject.
          </p>
        </div>
        <AdminSearch
          value={search}
          onChange={setSearch}
          placeholder="Search name, email or phone"
          resultCount={data?.length}
          isSearching={isLoading || search.trim() !== query}
        />
      </div>
      <AdminError error={error} />
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <Table>
          <thead>
            <tr>
              <Th>User</Th>
              <Th>Live Selfie</Th>
              <Th>Document</Th>
              <Th>Bank Details</Th>
              <Th>Status</Th>
              <Th>Submitted</Th>
              <Th>Action</Th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((kyc) => (
              <tr key={kyc._id}>
                <Td>{kyc.user && typeof kyc.user === "object" ? `${kyc.user.name} (${kyc.user.email})` : kyc.user ?? "User"}</Td>
                <Td>
                  {kyc.selfie?.fileUrl ? (
                    <a href={kyc.selfie.fileUrl} target="_blank" rel="noreferrer" title="Open selfie">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={kyc.selfie.fileUrl} alt="Live selfie" className="h-10 w-10 rounded-md border border-border object-cover" />
                    </a>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td>
                  {kyc.document?.fileUrl ? (
                    <a href={kyc.document.fileUrl} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
                      Download PDF
                    </a>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td>
                  {kyc.bankDetails?.accountNumber ? (
                    // Summary in the table, full details on demand. The
                    // account number stays masked in the list so a shoulder
                    // glance at the queue does not expose every payout
                    // account; opening the dialog is a deliberate act.
                    <button
                      type="button"
                      onClick={() => setBankDetailsFor(kyc)}
                      className="text-left text-xs hover:underline"
                    >
                      <p className="font-semibold text-primary">{kyc.bankDetails.accountHolderName}</p>
                      <p className="text-muted-foreground">{kyc.bankDetails.bankName} • ••••{kyc.bankDetails.accountNumber.slice(-4)}</p>
                      <p className="text-primary">View details</p>
                    </button>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td><Badge variant={kyc.status === "approved" ? "success" : kyc.status === "rejected" ? "danger" : kyc.status === "pending" ? "warning" : "default"}>{kyc.status}</Badge></Td>
                <Td>{formatDate(kyc.createdAt)}</Td>
                <Td>
                  {kyc.status === "pending" && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => review(kyc._id, "approved")}>Approve</Button>
                      <Button size="sm" variant="danger" onClick={() => review(kyc._id, "rejected")}>Reject</Button>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>

      {/* Full bank details, shown only when an admin opts in. Values come
          straight from the user's KYC record — nothing is derived here. */}
      <Modal
        open={!!bankDetailsFor}
        onClose={() => setBankDetailsFor(null)}
        title="Bank details"
        description={
          typeof bankDetailsFor?.user === "object"
            ? `Payout account for ${bankDetailsFor.user.name}`
            : "Payout account"
        }
      >
        {bankDetailsFor?.bankDetails ? (
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            {([
              ["Account holder", bankDetailsFor.bankDetails.accountHolderName],
              ["Bank", bankDetailsFor.bankDetails.bankName],
              ["Account number", bankDetailsFor.bankDetails.accountNumber],
              ["IFSC", bankDetailsFor.bankDetails.ifsc],
              ["UPI ID", bankDetailsFor.bankDetails.upiId],
            ] as Array<[string, string | undefined]>).map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 font-medium break-all">
                  {value || <span className="font-normal text-muted-foreground">Not provided</span>}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">No bank details were submitted.</p>
        )}
      </Modal>

    </AdminShell>
  );
}

export function AdminReportsPage() {
  const { data, isLoading, error } = useFetchData<Dispute[]>("/api/admin/reports", []);

  return (
    <AdminShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">Flagged content queue.</p>
        </div>
      </div>
      <AdminError error={error} />
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <Table>
          <thead>
            <tr>
              <Th>Reason</Th>
              <Th>Raised by</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((report) => (
              <tr key={report._id}>
                <Td>{report.reason}</Td>
                <Td>{report.raisedBy && typeof report.raisedBy === "object" ? report.raisedBy.name : "User"}</Td>
                <Td><Badge variant={report.status === "open" ? "danger" : "success"}>{report.status}</Badge></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
    </AdminShell>
  );
}

export function AdminSectionPage({ title, description }: { title: string; description: string }) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [error, setError] = React.useState<string | null>(null);

  return (
    <AdminShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {title === "Support Tickets" && (
          <Button
            onClick={async () => {
              setError(null);
              try {
                await api.get<null>("/api/auth/me");
              } catch (err) {
                setError(errorMessage(err));
              }
            }}
          >
            Verify session
          </Button>
        )}
      </div>
      <AdminError error={error ? new Error(error) : null} />
      <div className="mt-6 rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
        {user?.role === "admin" ? (
          <>
            Signed in as <strong className="text-foreground">{user.email}</strong>. This section is rendered
            from static mock data — the backend does not expose a dedicated endpoint for it yet.
          </>
        ) : (
          <>
            Not authenticated as admin.{" "}
            <button className="font-semibold text-primary" onClick={() => { logout(); router.push(ROUTES.LOGIN); }}>
              Sign in
            </button>{" "}
            with an admin account to manage {title.toLowerCase()}.
          </>
        )}
      </div>
    </AdminShell>
  );
}

export function AdminGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user } = useAuth();
  const mounted = useIsMounted();
  const bouncedRef = React.useRef(false);

  React.useEffect(() => {
    if (bouncedRef.current) return;
    bouncedRef.current = true;
    if (!user) {
      // Carry the origin so the sign-in screen knows this is the admin
      // entrance and can hide the registration link.
      if (mounted) router.replace(`${ROUTES.LOGIN}?next=${encodeURIComponent(ROUTES.ADMIN)}`);
    } else if (mounted && user.role !== "admin") {
      router.replace(ROUTES.DASHBOARD);
    }
  }, [user, router, mounted]);

  if (!mounted || !user) {
    return <div className="grid min-h-screen place-items-center bg-muted"><p className="text-sm text-muted-foreground">Loading…</p></div>;
  }
  if (user.role !== "admin") {
    return <div className="grid min-h-screen place-items-center bg-muted"><p className="text-sm text-muted-foreground">Redirecting…</p></div>;
  }
  return <>{children}</>;
}

export { RequireAuth };

// --- Sections that previously rendered from static mock data ---------------

export function AdminMessagesPage() {
  const { data, isLoading, error } = useFetchData<Conversation[]>("/api/admin/conversations", []);

  return (
    <AdminShell>
      <div className="mb-5">
        <h1 className="text-2xl font-bold">Messages</h1>
        <p className="text-sm text-muted-foreground">Conversations between renters and owners.</p>
      </div>
      <AdminError error={error} />
      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No conversations yet.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Participants</Th>
                <Th>Listing</Th>
                <Th>Last message</Th>
                <Th>When</Th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((c) => (
                <tr key={c._id}>
                  <Td>
                    {(c.participants ?? [])
                      .map((p) => (typeof p === "object" && p !== null ? p.name : "Unknown"))
                      .join(" ↔ ")}
                  </Td>
                  <Td>{typeof c.listing === "object" && c.listing !== null ? c.listing.title : "—"}</Td>
                  <Td className="max-w-md truncate">{c.lastMessage || "—"}</Td>
                  <Td>{c.lastMessageAt ? formatDate(c.lastMessageAt) : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </AdminShell>
  );
}

export function AdminCategoriesPage() {
  const { data, isLoading, error } = useFetchData<AdminCategory[]>("/api/admin/categories", []);

  return (
    <AdminShell>
      <div className="mb-5">
        <h1 className="text-2xl font-bold">Categories</h1>
        {/* Categories are a free-text field on listings rather than a fixed
            list, so this reflects what owners actually use. */}
        <p className="text-sm text-muted-foreground">Categories in use across the marketplace.</p>
      </div>
      <AdminError error={error} />
      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No categories yet — no listings have been created.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Category</Th>
                <Th>Listings</Th>
                <Th>Published</Th>
                <Th>Avg / day</Th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((c) => (
                <tr key={c.name}>
                  <Td className="font-medium">{c.name}</Td>
                  <Td>{c.listings}</Td>
                  <Td>{c.published}</Td>
                  <Td>₹{c.avgPricePerDay}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </AdminShell>
  );
}

export function AdminExtensionRequestsPage() {
  const { data, isLoading, error } = useFetchData<AdminExtensionRequest[]>("/api/admin/extension-requests", []);

  return (
    <AdminShell>
      <div className="mb-5">
        <h1 className="text-2xl font-bold">Extension requests</h1>
        <p className="text-sm text-muted-foreground">Requests to extend an active rental.</p>
      </div>
      <AdminError error={error} />
      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No extension requests yet.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Renter</Th>
                <Th>Listing</Th>
                <Th>Requested until</Th>
                <Th>Status</Th>
                <Th>Raised</Th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((r) => (
                <tr key={r._id}>
                  <Td>{typeof r.renter === "object" && r.renter !== null ? r.renter.name : "—"}</Td>
                  <Td>{typeof r.listing === "object" && r.listing !== null ? r.listing.title : "—"}</Td>
                  <Td>{r.requestedUntil ? formatDate(r.requestedUntil) : "—"}</Td>
                  <Td><Badge variant={r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : "warning"}>{r.status}</Badge></Td>
                  <Td>{formatDate(r.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </AdminShell>
  );
}

export function AdminSupportTicketsPage() {
  const { data, isLoading, error, refetch } = useFetchData<SupportTicket[]>("/api/admin/support-tickets", []);
  const [openTicket, setOpenTicket] = React.useState<SupportTicket | null>(null);
  const [reply, setReply] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [replyError, setReplyError] = React.useState<string | null>(null);

  const sendReply = async () => {
    if (!openTicket || !reply.trim()) return;
    setBusy(true);
    setReplyError(null);
    try {
      await api.post<SupportTicket>(`/api/admin/support-tickets/${openTicket._id}/replies`, { message: reply.trim() });
      setReply("");
      setOpenTicket(null);
      refetch();
    } catch (err) {
      // Keep the dialog open and the text intact so the reply is not lost.
      setReplyError(err instanceof Error ? err.message : "Could not send the reply.");
    } finally {
      setBusy(false);
    }
  };

  const close = async (id: string) => {
    await api.patch<SupportTicket>(`/api/admin/support-tickets/${id}/close`, {});
    refetch();
  };

  return (
    <AdminShell>
      <div className="mb-5">
        <h1 className="text-2xl font-bold">Support requests</h1>
        <p className="text-sm text-muted-foreground">Issues raised by users.</p>
      </div>
      <AdminError error={error} />
      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No support requests yet.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>From</Th>
                <Th>Subject</Th>
                <Th>Status</Th>
                <Th>Replies</Th>
                <Th>Raised</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((t) => (
                <tr key={t._id}>
                  <Td>{typeof t.user === "object" && t.user !== null ? t.user.name : "—"}</Td>
                  <Td className="max-w-xs truncate">{t.subject}</Td>
                  <Td>
                    <Badge variant={t.status === "answered" ? "success" : t.status === "closed" ? "default" : "warning"}>
                      {t.status}
                    </Badge>
                  </Td>
                  <Td>{t.replies?.length ?? 0}</Td>
                  <Td>{formatDate(t.createdAt)}</Td>
                  <Td>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setOpenTicket(t)}>View</Button>
                      {t.status !== "closed" && (
                        <Button size="sm" variant="danger" onClick={() => close(t._id)}>Close</Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <Modal
        open={!!openTicket}
        onClose={() => { setOpenTicket(null); setReplyError(null); }}
        title={openTicket?.subject}
        description={
          typeof openTicket?.user === "object" && openTicket.user !== null
            ? `${openTicket.user.name} · ${openTicket.user.email}`
            : undefined
        }
      >
        {openTicket && (
          <div className="space-y-4">
            <div className="rounded-md bg-muted p-3 text-sm">{openTicket.message}</div>

            {openTicket.replies?.map((r) => (
              <div
                key={r._id}
                className={cn(
                  "rounded-md p-3 text-sm",
                  // Admin replies are visually distinct so a long thread stays
                  // readable at a glance.
                  r.isAdmin ? "ml-6 bg-primary-50" : "mr-6 bg-muted"
                )}
              >
                <p className="mb-1 text-xs font-semibold text-muted-foreground">
                  {r.isAdmin ? "Support" : typeof r.author === "object" && r.author !== null ? r.author.name : "User"}
                  {" · "}
                  {formatDate(r.createdAt)}
                </p>
                {r.message}
              </div>
            ))}

            {openTicket.status !== "closed" && (
              <div className="space-y-2">
                <Textarea
                  label="Reply"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Type your response…"
                />
                {replyError && <p className="text-sm text-danger">{replyError}</p>}
                <Button onClick={sendReply} disabled={busy || !reply.trim()}>
                  {busy ? "Sending…" : "Send reply"}
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </AdminShell>
  );
}

// Settlements — what the platform still owes, and the only place a payout is
// recorded as sent.
//
// This screen exists because settlement is manual: Cashfree declined
// standalone Payouts, so an admin moves the money by UPI or bank transfer and
// then tells the ledger it happened. Without it the obligations are recorded
// correctly and no one can act on them.
export function AdminSettlementsPage() {
  const { data, isLoading, error, refetch } = useFetchData<OutstandingResult>(
    "/api/ledger/outstanding",
    []
  );

  const [paying, setPaying] = React.useState<SettlementObligation | null>(null);
  const [reference, setReference] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [justPaid, setJustPaid] = React.useState<string | null>(null);

  const recipientName = (o: SettlementObligation) => o.recipient?.name || "Unknown";

  // What to copy, in the order someone paying actually wants it: a UPI id if
  // there is one, since that is a single paste, otherwise the account and
  // IFSC pair.
  const payTarget = (o: SettlementObligation): string | null => {
    const d = o.payoutDetails;
    if (!d) return null;
    if (d.upiId) return d.upiId;
    if (d.accountNumber) return `${d.accountNumber} / ${d.ifsc ?? "IFSC missing"}`;
    return null;
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard access can be refused; the value is on screen to read
      // either way, so this is not worth interrupting anyone over.
    }
  };

  const confirmPaid = async () => {
    if (!paying) return;
    if (!reference.trim()) {
      setActionError("Enter the UPI or bank reference for this transfer.");
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await api.post(`/api/ledger/entries/${paying.id}/settle`, {
        reference: reference.trim(),
        provider: "manual",
      });
      setJustPaid(recipientName(paying));
      setPaying(null);
      setReference("");
      refetch();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const items = data?.items ?? [];
  const owners = items.filter((o) => o.payTo === "owner");
  const renters = items.filter((o) => o.payTo === "renter");

  return (
    <AdminShell>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Settlements</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Money the platform has collected and still owes. Send it, then record the
            reference here so it is not paid twice.
          </p>
        </div>
        {data && (
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Outstanding</p>
            <p className="text-2xl font-bold">{formatCurrency(data.total)}</p>
          </div>
        )}
      </div>

      <AdminError error={error} />
      {actionError && !paying && (
        <p className="mb-4 rounded-md bg-danger-50 p-3 text-sm text-danger">{actionError}</p>
      )}
      {justPaid && (
        <p className="mb-4 rounded-md bg-secondary-50 p-3 text-sm text-secondary-700">
          Recorded as paid to {justPaid}.
        </p>
      )}
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {data && data.provider === "manual" && (
        <div className="mb-5 rounded-lg border border-accent-200 bg-accent-50 p-4 text-sm text-accent-700">
          <strong>Transfers are manual.</strong> Nothing here is sent automatically — send
          the money from the platform account by UPI or bank transfer, then mark it paid.
          Deposit refunds to renters go back to the original card through the gateway and
          normally settle themselves; anything listed here needs a person.
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="font-medium">Nothing outstanding</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Every obligation has been settled. New ones appear when a renter confirms they
            received an item, or when a deposit becomes refundable.
          </p>
        </div>
      )}

      {owners.length > 0 && (
        <SettlementGroup
          title="Owners awaiting payment"
          caption="Rent released after the renter confirmed receipt, and approved damage deductions."
          items={owners}
          recipientName={recipientName}
          payTarget={payTarget}
          onCopy={copy}
          onPay={(o) => {
            setPaying(o);
            setReference("");
            setActionError(null);
          }}
        />
      )}

      {renters.length > 0 && (
        <SettlementGroup
          title="Renters awaiting refund"
          caption="Deposits the gateway did not refund automatically — usually because the original payment could not be traced. These need a manual transfer."
          items={renters}
          recipientName={recipientName}
          payTarget={payTarget}
          onCopy={copy}
          onPay={(o) => {
            setPaying(o);
            setReference("");
            setActionError(null);
          }}
        />
      )}

      <Modal
        open={!!paying}
        onClose={() => setPaying(null)}
        title="Record this payment"
        description={
          paying
            ? `Confirm you have sent ${formatCurrency(paying.amount)} to ${recipientName(paying)}.`
            : undefined
        }
      >
        {paying && (
          <div className="space-y-4">
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <p className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <strong>{formatCurrency(paying.amount)}</strong>
              </p>
              <p className="mt-1 flex justify-between">
                <span className="text-muted-foreground">Send to</span>
                <span className="font-mono text-xs">{payTarget(paying) ?? "No details on file"}</span>
              </p>
            </div>

            <Input
              label="UPI or bank reference"
              placeholder="e.g. 441782940113"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              This is only a record that you sent the money — it does not move anything. The
              reference is what lets you prove the transfer later.
            </p>

            {actionError && <p className="text-sm text-danger">{actionError}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPaying(null)} disabled={busy}>
                Cancel
              </Button>
              <Button loading={busy} onClick={confirmPaid}>
                Mark as paid
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </AdminShell>
  );
}

function SettlementGroup({
  title,
  caption,
  items,
  recipientName,
  payTarget,
  onCopy,
  onPay,
}: {
  title: string;
  caption: string;
  items: SettlementObligation[];
  recipientName: (o: SettlementObligation) => string;
  payTarget: (o: SettlementObligation) => string | null;
  onCopy: (text: string) => void;
  onPay: (o: SettlementObligation) => void;
}) {
  const groupTotal = items.reduce((sum, o) => sum + o.amount, 0);

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{caption}</p>
        </div>
        <p className="text-sm font-semibold">{formatCurrency(groupTotal)}</p>
      </div>

      <div className="space-y-3">
        {items.map((o) => {
          const target = payTarget(o);
          return (
            <div
              key={o.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border p-4"
            >
              <div className="min-w-0">
                <p className="font-medium">{recipientName(o)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {o.component.replaceAll("_", " ")}
                  {o.recipient?.email ? ` · ${o.recipient.email}` : ""}
                </p>
                {target ? (
                  <button
                    type="button"
                    onClick={() => onCopy(target)}
                    className="mt-2 select-all rounded bg-muted/60 px-2 py-1 font-mono text-xs hover:bg-muted"
                    title="Click to copy"
                  >
                    {target}
                  </button>
                ) : (
                  // Said plainly rather than shown as an empty field: an admin
                  // needs to know why they cannot pay this one, and that the
                  // fix is asking the owner for details.
                  <p className="mt-2 text-xs text-danger">
                    No payout details on file — ask them to complete KYC bank details.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-4">
                <p className="text-lg font-semibold tabular-nums">{formatCurrency(o.amount)}</p>
                <Button size="sm" disabled={!target} onClick={() => onPay(o)}>
                  Mark as paid
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** A payment the renter says they made, waiting on someone to confirm it. */
type ManualPayment = {
  _id: string;
  utr: string;
  status: "verification_pending" | "verified" | "rejected";
  rentalAmount: number;
  platformFee: number;
  securityDeposit: number;
  totalAmount: number;
  rejectionReason?: string | null;
  createdAt: string;
  payer?: { _id: string; name?: string; email?: string; phone?: string } | null;
  listing?: { _id: string; title?: string } | null;
  booking?: { _id: string; status?: string; startDate?: string; endDate?: string } | null;
};

/**
 * Verify payments received by UPI.
 *
 * The one screen in the admin panel that moves money forward: nothing a
 * renter does confirms a booking, so until someone here matches a reference
 * against the bank statement, the rental does not happen. Laid out so the
 * two figures that have to agree — what was owed and what to look for — are
 * next to each other rather than in different columns.
 */
export function AdminManualPaymentsPage() {
  const [status, setStatus] = React.useState("verification_pending");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [rejecting, setRejecting] = React.useState<ManualPayment | null>(null);
  const [reason, setReason] = React.useState("");
  const { data, isLoading, error, refetch } = useFetchData<ManualPayment[]>(
    `/api/manual-payments/review?status=${status}`,
    [],
  );

  const review = async (id: string, next: "verified" | "rejected", rejectionReason?: string) => {
    setBusyId(id);
    try {
      await api.patch(`/api/manual-payments/review/${id}`, { status: next, rejectionReason });
      setRejecting(null);
      setReason("");
      refetch();
    } finally {
      setBusyId(null);
    }
  };

  const rows = data ?? [];

  return (
    <AdminShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Verify Payments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Renters pay by UPI and submit the transaction reference. Check it against the money
            received before verifying — a booking is only confirmed once you do.
          </p>
        </div>
        <div className="w-56">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: "verification_pending", label: "Awaiting verification" },
              { value: "verified", label: "Verified" },
              { value: "rejected", label: "Rejected" },
              { value: "all", label: "All" },
            ]}
          />
        </div>
      </div>

      <AdminError error={error} />
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && rows.length === 0 && (
        <section className="mt-6 rounded-lg border border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {status === "verification_pending"
              ? "Nothing waiting to be checked."
              : "No payments with that status."}
          </p>
        </section>
      )}

      <div className="mt-6 space-y-4">
        {rows.map((p) => (
          <section key={p._id} className="rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-semibold">{p.listing?.title ?? "Unknown item"}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {p.payer?.name ?? "Unknown"} · {p.payer?.email ?? "—"}
                  {p.payer?.phone ? ` · ${p.payer.phone}` : ""}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Booking {p.booking?._id ?? "—"} · submitted{" "}
                  {new Date(p.createdAt).toLocaleString()}
                </p>
              </div>
              <Badge
                variant={
                  p.status === "verified" ? "success" : p.status === "rejected" ? "danger" : "warning"
                }
              >
                {p.status === "verification_pending" ? "Awaiting verification" : p.status}
              </Badge>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {/* What was owed. */}
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Expected
                </p>
                <div className="flex justify-between"><span>Rental</span><span>₹{p.rentalAmount}</span></div>
                <div className="flex justify-between"><span>Platform fee</span><span>₹{p.platformFee}</span></div>
                <div className="flex justify-between"><span>Refundable deposit</span><span>₹{p.securityDeposit}</span></div>
                <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
                  <span>Total</span><span>₹{p.totalAmount}</span>
                </div>
              </div>

              {/* What to look for on the statement. */}
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Look for this reference
                </p>
                <p className="break-all font-mono text-base font-semibold">{p.utr}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Confirm ₹{p.totalAmount} arrived against this reference before verifying.
                </p>
                {p.rejectionReason ? (
                  <p className="mt-2 text-xs text-danger">Rejected: {p.rejectionReason}</p>
                ) : null}
              </div>
            </div>

            {p.status === "verification_pending" && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={busyId === p._id}
                  onClick={() => review(p._id, "verified")}
                >
                  {busyId === p._id ? "Working…" : `Verify ₹${p.totalAmount} received`}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busyId === p._id}
                  onClick={() => setRejecting(p)}
                >
                  Reject
                </Button>
              </div>
            )}
          </section>
        ))}
      </div>

      {/* Rejection asks for a reason, because the renter is shown it and
          "rejected" on its own is not something they can act on. */}
      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title="Reject this payment"
      >
        <p className="text-sm text-muted-foreground">
          The renter sees this and can submit a different transaction ID.
        </p>
        <Textarea
          className="mt-3"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="No payment of that amount found against this reference."
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setRejecting(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={!rejecting || busyId === rejecting._id}
            onClick={() => rejecting && review(rejecting._id, "rejected", reason.trim() || undefined)}
          >
            Reject payment
          </Button>
        </div>
      </Modal>
    </AdminShell>
  );
}
