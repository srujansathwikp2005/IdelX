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
import { ADMIN_SIDEBAR, RENTER_SIDEBAR, OWNER_SIDEBAR } from "@/config/navigation";
import { ROUTES } from "@/lib/constants";
import { useAuth } from "@/lib/auth";

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
  const baseItems = isAdmin ? ADMIN_SIDEBAR : isOwner ? OWNER_SIDEBAR : RENTER_SIDEBAR;

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
    <aside className="h-full flex flex-col bg-white border-r border-border w-64">
      {/* Brand */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-border">
        <Link href={homeHref} className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center text-white font-bold text-sm">
            iX
          </div>
          <span className="text-lg font-bold">
            Idle<span className="text-primary">X</span>
          </span>
        </Link>
        {onCloseMobile && (
          <button onClick={onCloseMobile} className="md:hidden">
            <X size={20} />
          </button>
        )}
      </div>

      {/* User card */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Avatar name={user?.name ?? "User"} src={user?.avatarUrl ?? undefined} size="md" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{user?.name ?? "User"}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email ?? ""}</p>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1">
          {user?.isEmailVerified && <Badge variant="success" className="text-[10px]">Email verified</Badge>}
          {isOwner && <Badge className="text-[10px]">Owner</Badge>}
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
                  ? "bg-primary text-white font-medium"
                  : "text-foreground hover:bg-muted"
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
                      active ? "bg-white text-primary" : "bg-danger text-white"
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
      <div className="p-3 border-t border-border">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 px-3 py-2 text-sm text-foreground hover:bg-muted"
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
