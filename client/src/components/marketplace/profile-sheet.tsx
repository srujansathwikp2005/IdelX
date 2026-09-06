"use client";

import * as React from "react";

import { Avatar } from "@/components/ui/avatar";
import { ShieldCheck } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { StarRating } from "@/components/ui/star-rating";
import { useFetchData } from "@/lib/use-fetch-data";

type PublicProfile = {
  id: string;
  name: string;
  avatarUrl: string | null;
  memberSince: string | null;
  identityVerified: boolean;
  rating: number;
  ratingCount: number;
  rentalsTaken: number;
  rentalsGiven: number;
  listings: number;
  reviews: Array<{
    id: string;
    rating: number;
    comment?: string;
    createdAt: string;
    by: { name: string; avatarUrl: string | null } | null;
  }>;
};

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex-1 rounded-xl bg-panel p-3 text-center">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

/**
 * Who the owner is about to hand their property to — the same thing the app
 * shows from an incoming request. Only what the server will say about
 * someone: ratings, how much they have rented, whether an admin has seen
 * their documents. No contact details; those come with a booking.
 */
export function ProfileSheet({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const { data: profile, isLoading, error } = useFetchData<PublicProfile>(
    userId ? `/api/users/${userId}` : null,
    [userId],
  );

  const memberSince = profile?.memberSince
    ? new Date(profile.memberSince).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
    : null;

  return (
    <Modal open={Boolean(userId)} onClose={onClose} size="md" title="Renter profile">
      {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
      {error && !isLoading && <p className="py-8 text-center text-sm text-danger">{error.message}</p>}

      {profile && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-4">
            <Avatar name={profile.name} src={profile.avatarUrl ?? undefined} size="lg" />
            <div>
              <p className="text-lg font-semibold">{profile.name}</p>
              {memberSince && (
                <p className="text-sm text-muted-foreground">On IdleX since {memberSince}</p>
              )}
              {profile.identityVerified && (
                <p className="mt-1 flex items-center gap-1 text-sm font-medium text-primary">
                  <ShieldCheck size={15} />
                  Identity verified
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <Stat
              label="Rating"
              value={profile.ratingCount === 0 ? "New" : profile.rating.toFixed(1)}
              sub={
                profile.ratingCount === 0
                  ? "Not rated yet"
                  : `${profile.ratingCount} review${profile.ratingCount === 1 ? "" : "s"}`
              }
            />
            <Stat label="Rented" value={String(profile.rentalsTaken)} sub="as a renter" />
            <Stat label="Lent" value={String(profile.rentalsGiven)} sub="as an owner" />
          </div>

          <div>
            <p className="text-sm font-semibold">What people say</p>
            {profile.reviews.length === 0 ? (
              <p className="mt-2 rounded-xl bg-panel p-4 text-sm text-muted-foreground">
                {profile.rentalsTaken === 0
                  ? "Nobody has rented to them yet. Everyone starts here."
                  : "No written reviews yet."}
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-3">
                {profile.reviews.map((r) => (
                  <li key={r.id} className="rounded-xl bg-panel p-4">
                    <div className="flex items-center justify-between gap-3">
                      <StarRating value={r.rating} size={15} />
                      {r.by?.name && (
                        <span className="text-xs text-muted-foreground">{r.by.name}</span>
                      )}
                    </div>
                    {r.comment && <p className="mt-2 text-sm">{r.comment}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
