"use client";

import * as React from "react";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { TopBar } from "@/components/layout/topbar";
import { useAuth } from "@/lib/auth";

export function DashboardShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const { user } = useAuth();
  const role =
    user?.role === "admin" ? "admin" : user?.isOwner || user?.role === "owner" ? "owner" : "renter";

  return (
    <div className="min-h-screen bg-muted">
      <div className="hidden md:fixed md:inset-y-0 md:flex">
        <DashboardSidebar />
      </div>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            className="absolute inset-0 bg-black/30"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="relative h-full w-72 bg-card">
            <DashboardSidebar onCloseMobile={() => setOpen(false)} />
          </div>
        </div>
      )}
      <div className="md:pl-64">
        <TopBar title={title} onMenuClick={() => setOpen(true)} />
        <main className="mx-auto max-w-7xl px-4 py-6 pb-24 sm:px-6 md:pb-8">{children}</main>
      </div>
      <MobileBottomNav role={role} />
    </div>
  );
}
