"use client";

import * as React from "react";

import { DashboardShell } from "@/components/marketplace/dashboard-shell";
import { Avatar } from "@/components/ui/avatar";
import { StarRating } from "@/components/ui/star-rating";
import { RequireAuth, useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/formatters";
import { useFetchData } from "@/lib/use-fetch-data";
import type { Review } from "@/lib/api-types";

type PublicProfile = {
  rating: number;
  ratingCount: number;
  reviews: Array<{
    id: string;
    rating: number;
    comment?: string;
    createdAt: string;
    by: { name: string; avatarUrl: string | null } | null;
  }>;
};

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-panel p-5 text-sm text-muted-foreground">{children}</p>;
}

function ReviewsInner() {
  const { user } = useAuth();
  const { data: profile } = useFetchData<PublicProfile>(
    user ? `/api/users/${user._id}` : null,
    [user?._id],
  );
  const { data: written } = useFetchData<Review[]>("/api/reviews/mine", []);

  const about = profile?.reviews ?? [];
  const mine = written ?? [];

  return (
    <DashboardShell title="Reviews">
      <div className="flex flex-col gap-5">
        <Panel title="Your rating">
          {profile && profile.ratingCount > 0 ? (
            <div className="flex items-center gap-3">
              <span className="text-3xl font-semibold tabular-nums">{profile.rating.toFixed(1)}</span>
              <span>
                <StarRating value={profile.rating} size={16} />
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  from {profile.ratingCount} review{profile.ratingCount === 1 ? "" : "s"}
                </span>
              </span>
            </div>
          ) : (
            <Empty>
              No rating yet. Owners rate you after a rental completes, and it shows on your
              requests — which is what helps an owner choose between people asking for the same
              dates.
            </Empty>
          )}
        </Panel>

        <Panel title="What people said about you">
          {about.length === 0 ? (
            <Empty>Nothing written about you yet.</Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {about.map((r) => (
                <li key={r.id} className="rounded-lg bg-panel p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <Avatar name={r.by?.name ?? "Someone"} src={r.by?.avatarUrl ?? undefined} size="sm" />
                      <span className="text-sm font-medium">{r.by?.name ?? "Someone"}</span>
                    </span>
                    <StarRating value={r.rating} size={14} />
                  </div>
                  {r.comment && <p className="mt-2 text-sm">{r.comment}</p>}
                  <p className="mt-1.5 text-xs text-muted-foreground">{formatDate(r.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Reviews you have written">
          {mine.length === 0 ? (
            <Empty>You have not reviewed anything yet.</Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {mine.map((r) => (
                <li key={r._id} className="rounded-lg bg-panel p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">
                      {typeof r.listing === "object" && r.listing !== null
                        ? (r.listing as { title?: string }).title ?? "A rental"
                        : "A rental"}
                    </span>
                    <StarRating value={r.rating} size={14} />
                  </div>
                  {r.comment && <p className="mt-2 text-sm">{r.comment}</p>}
                  <p className="mt-1.5 text-xs text-muted-foreground">{formatDate(r.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </DashboardShell>
  );
}

export default function ReviewsPage() {
  return (
    <RequireAuth>
      <ReviewsInner />
    </RequireAuth>
  );
}
