"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFetchData } from "@/lib/use-fetch-data";
import { kycDisplay } from "@/lib/kyc-status";
import type { Kyc } from "@/lib/api-types";
import { LogOut, X } from "@/components/ui/icons";
import { ICONS } from "@/components/ui/icons";
import { ADMIN_SIDEBAR_FLAT, RENTER_SIDEBAR, OWNER_SIDEBAR } from "@/config/navigation";
import { ROUTES } from "@/lib/constants";
import { useAuth } from "@/lib/auth";
import { BrandLockup } from "./brand";

export function DashboardSidebar({
  onCloseMobile,
}: {
  onCloseMobile?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "admin";
  const isOwner = user?.isOwner || user?.role === "owner" || user?.role === "admin";
  // Admins only see admin routes — user routes are not displayed.
  const baseItems = isAdmin ? ADMIN_SIDEBAR_FLAT : isOwner ? OWNER_SIDEBAR : RENTER_SIDEBAR;

  // Real KYC state, not a literal. Non-admins see their own status; admins
  // see how many submissions are actually awaiting review.
  const { data: kyc } = useFetchData<Kyc>(user && !isAdmin ? "/api/kyc" : null, [user?._id, isAdmin]);
  const { data: pendingKyc } = useFetchData<Kyc[]>(isAdmin ? "/api/admin/kyc?status=pending" : null, [isAdmin]);

  const items = React.useMemo(
    () =>
      baseItems.map((item) => {
        if (item.href === ROUTES.KYC_VERIFICATION) {
          return { ...item, badge: kycDisplay(kyc).label };
        }
        if (item.href === ROUTES.ADMIN_KYC) {
          const count = pendingKyc?.length ?? 0;
          // Omit the badge entirely at zero rather than showing "0".
          return count > 0 ? { ...item, badge: count } : item;
        }
        return item;
      }),
    [baseItems, kyc, pendingKyc]
  );
  const homeHref = isAdmin ? ROUTES.ADMIN : ROUTES.DASHBOARD;

  return (
    // Dark in both themes, like the footer. A dashboard sidebar is chrome
    // rather than content: it stays put while the page beside it changes, and
    // holding one constant tone is what makes it read as the frame rather
    // than as another panel.
    <aside className="flex h-full w-64 flex-col border-r border-white/5 bg-inverse text-inverse-foreground">
      {/* Brand */}
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
        <Link href={homeHref}>
          <BrandLockup />
        </Link>
        {onCloseMobile && (
          <button onClick={onCloseMobile} className="md:hidden">
            <X size={20} />
          </button>
        )}
      </div>

      {/* Who is signed in, and the way to their own details. The email used
          to sit here, which is the one fact the person already knows. */}
      <div className="border-b border-white/10 p-4">
        <div className="flex items-center gap-3">
          <Avatar name={user?.name ?? "User"} src={user?.avatarUrl ?? undefined} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{user?.name ?? "User"}</p>
            <Link
              href={ROUTES.PROFILE}
              onClick={onCloseMobile}
              className="text-xs text-inverse-foreground/70 transition-colors hover:text-white"
            >
              View Profile
            </Link>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={onCloseMobile}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors",
                active
                  ? "bg-primary font-medium text-on-brand"
                  : "text-inverse-foreground/80 hover:bg-white/5 hover:text-white"
              )}
            >
              {Icon && <Icon size={18} />}
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                typeof item.badge === "string" ? (
                  <Badge
                    variant={item.href === ROUTES.KYC_VERIFICATION ? kycDisplay(kyc).variant : "danger"}
                    className="text-[10px]"
                  >
                    {item.badge}
                  </Badge>
                ) : (
                  <span
                    className={cn(
                      "min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full text-[10px] font-bold",
                      active ? "bg-white text-primary" : "bg-danger text-on-brand"
                    )}
                  >
                    {item.badge}
                  </span>
                )
              )}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="border-t border-white/10 p-3">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 px-3 py-2 text-sm text-inverse-foreground/80 hover:bg-white/5 hover:text-white"
          onClick={() => {
            logout();
            router.push(ROUTES.LOGIN);
          }}
        >
          <LogOut size={18} />
          Logout
        </Button>
      </div>
    </aside>
  );
}
