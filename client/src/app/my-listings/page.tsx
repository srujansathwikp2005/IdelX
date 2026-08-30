"use client";

import * as React from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/marketplace/dashboard-shell";
import { ListingCard } from "@/components/marketplace/listing-card";
import { Button } from "@/components/ui/button";
import { RequireAuth, errorMessage } from "@/lib/auth";
import { useFetchData } from "@/lib/use-fetch-data";
import { api } from "@/lib/api-client";
import { toCard } from "@/lib/api-types";
import type { Kyc, Listing } from "@/lib/api-types";
import { ROUTES } from "@/lib/constants";
import { AlertTriangle, Package, ShieldCheck } from "@/components/ui/icons";

function MyListingsInner() {
  const { data, isLoading, error, refetch } = useFetchData<Listing[]>("/api/listings/mine/all", []);
  const { data: kyc } = useFetchData<Kyc>("/api/kyc", []);
  const kycApproved = kyc?.status === "approved";
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const publishListing = async (id: string) => {
    setActionError(null);
    setBusyId(id);
    try {
      await api.put<Listing>(`/api/listings/${id}`, { status: "published" });
      refetch();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const deleteListing = async (id: string) => {
    if (!window.confirm("Delete this listing permanently? This cannot be undone.")) return;
    setActionError(null);
    setBusyId(id);
    try {
      await api.del(`/api/listings/${id}`);
      refetch();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardShell title="My Listings">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">My Listings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage pricing, availability, photos, and booking readiness.
          </p>
        </div>
        {kycApproved ? (
          <Link href={ROUTES.LISTING_NEW}>
            <Button className="shadow-sm shadow-primary/20 transition-transform hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/30">
              Add Listing
            </Button>
          </Link>
        ) : (
          <Link href={ROUTES.KYC} title="Your KYC must be approved by an admin before you can add listings">
            <Button variant="outline" disabled>
              Add Listing — KYC Pending
            </Button>
          </Link>
        )}
      </div>

      {!kycApproved && (
        <div className="mb-5 flex animate-[fadeInUp_0.3s_ease-out] items-start gap-3 rounded-lg border border-accent-200 bg-accent-50 p-4">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-accent-700" />
          <p className="text-sm text-accent-700">
            Listing is disabled until your KYC is approved by an admin.{" "}
            <Link href={ROUTES.KYC} className="font-semibold underline underline-offset-2">
              Complete KYC verification
            </Link>
            .
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 flex animate-[fadeInUp_0.3s_ease-out] items-start gap-3 rounded-lg border border-danger-200 bg-danger-50 p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" />
          <p className="text-sm text-danger">{error.message}</p>
        </div>
      )}

      {actionError && (
        <div className="mb-4 flex animate-[fadeInUp_0.3s_ease-out] items-start gap-3 rounded-lg border border-danger-200 bg-danger-50 p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" />
          <p className="text-sm text-danger">{actionError}</p>
        </div>
      )}

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              style={{ animationDelay: `${i * 60}ms` }}
              className="animate-[fadeInUp_0.4s_ease-out_backwards] overflow-hidden rounded-lg border border-border bg-card"
            >
              <div className="aspect-4/3 w-full animate-pulse bg-muted" />
              <div className="space-y-3 p-4">
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                <div className="h-6 w-1/3 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && (data ?? []).length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(data ?? []).map((listing, index) => (
            <div
              key={listing._id}
              style={{ animationDelay: `${index * 70}ms` }}
              className="animate-[fadeInUp_0.45s_ease-out_backwards]"
            >
              <ListingCard
                listing={toCard(listing)}
                manage={{ onPublish: publishListing, onDelete: deleteListing, busy: busyId === listing._id }}
              />
            </div>
          ))}
        </div>
      )}

      {!isLoading && !error && (data ?? []).length === 0 && (
        <div className="animate-[fadeInUp_0.4s_ease-out] rounded-lg border border-dashed border-border-strong bg-card/50 p-10 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-linear-to-br from-primary/10 to-primary-500/10">
            <Package size={26} className="text-primary" />
          </div>
          <p className="mx-auto mt-4 max-w-sm text-sm text-muted-foreground">
            {kycApproved ? (
              <>
                You haven&apos;t listed anything yet.{" "}
                <Link href={ROUTES.LISTING_NEW} className="font-semibold text-primary hover:underline">
                  Create your first listing
                </Link>
                .
              </>
            ) : (
              <>
                You haven&apos;t listed anything yet. Your account is view-only until your KYC is approved.{" "}
                <Link href={ROUTES.KYC} className="font-semibold text-primary hover:underline">
                  Complete KYC verification
                </Link>
                .
              </>
            )}
          </p>
        </div>
      )}

      </DashboardShell>
  );
}

export default function MyListingsPage() {
  return (
    <RequireAuth>
      <MyListingsInner />
    </RequireAuth>
  );
}