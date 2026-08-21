"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/marketplace/admin-shell";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, Td, Th } from "@/components/ui/data-table";
import { LineChart, BarChart, DonutChart, ProgressRows, type ChartDatum } from "@/components/marketplace/charts";
import { api } from "@/lib/api-client";
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
  Dispute,
  Kyc,
  Listing,
  Pagination,
  Payment,
  SeriesPoint,
  User,
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

export function AdminOverview() {
  const { data: analytics, error: analyticsError } = useFetchData<AdminAnalytics>("/api/admin/analytics", []);
  const { data: stats } = useFetchData<AdminStats>("/api/admin/stats", []);

  const totals = analytics?.totals ?? stats;
  const activity = analytics?.recentActivity ?? [];

  return (
    <AdminShell>
      <AdminError error={analyticsError} />

      {/* Stat cards */}
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

export function AdminUsersPage() {
  const { data, isLoading, error, refetch } = useFetchData<User[]>("/api/admin/users", []);

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
      </div>
      <AdminError error={error} />
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
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
  const { data, isLoading, error, refetch } = useFetchData<Kyc[]>("/api/admin/kyc", []);

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
                    <div className="text-xs">
                      <p className="font-semibold">{kyc.bankDetails.accountHolderName}</p>
                      <p className="text-muted-foreground">{kyc.bankDetails.bankName} • {kyc.bankDetails.ifsc}</p>
                      <p className="text-muted-foreground">••••{kyc.bankDetails.accountNumber.slice(-4)}{kyc.bankDetails.upiId ? ` • ${kyc.bankDetails.upiId}` : ""}</p>
                    </div>
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
