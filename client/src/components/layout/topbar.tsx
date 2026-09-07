"use client";

import * as React from "react";
import Link from "next/link";
import { Search, Bell, MessageCircle, Menu, Home } from "@/components/ui/icons";
import { Avatar } from "@/components/ui/avatar";
import { useAuth, useIsMounted } from "@/lib/auth";
import { useFetchData } from "@/lib/use-fetch-data";
import { ROUTES } from "@/lib/constants";

export function TopBar({ onMenuClick, title }: { onMenuClick?: () => void; title?: string }) {
  const { user: signedIn } = useAuth();
  // Same reason as the sidebar: the stored user does not exist server-side,
  // so rendering it on the first client pass breaks hydration.
  const mounted = useIsMounted();
  const user = mounted ? signedIn : null;
  const isAdmin = user?.role === "admin";
  const messagesHref = isAdmin ? ROUTES.ADMIN_MESSAGES : ROUTES.MESSAGES;
  const notificationsHref = isAdmin ? ROUTES.ADMIN : ROUTES.NOTIFICATIONS;
  const { data: unread } = useFetchData<{ count: number }>("/api/notifications/unread-count", []);
  const unreadCount = unread?.count ?? 0;
  return (
    <div className="sticky top-0 z-20 h-16 bg-card border-b border-border px-4 md:px-6 flex items-center gap-3">
      <Link href={ROUTES.HOME} title="Home" className="h-10 w-10 inline-flex items-center justify-center rounded-md hover:bg-muted">
        <Home size={20} />
      </Link>
      {onMenuClick && (
        <button onClick={onMenuClick} className="md:hidden h-10 w-10 inline-flex items-center justify-center rounded-md hover:bg-muted">
          <Menu size={20} />
        </button>
      )}
      {title && <h1 className="hidden md:block text-lg font-semibold">{title}</h1>}

      <div className="flex-1 max-w-md">
        <div className="relative hidden sm:block">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search..."
            className="w-full h-10 pl-10 pr-4 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Link href={messagesHref} className="relative h-10 w-10 inline-flex items-center justify-center rounded-full hover:bg-muted">
          <MessageCircle size={20} />
        </Link>
        <Link href={notificationsHref} className="relative h-10 w-10 inline-flex items-center justify-center rounded-full hover:bg-muted">
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 h-4 min-w-4 px-1 text-[10px] font-bold rounded-full bg-danger text-on-brand flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Link>
        <div className="ml-2">
          <Avatar name={user?.name ?? "User"} src={user?.avatarUrl ?? undefined} size="sm" />
        </div>
      </div>
    </div>
  );
}
