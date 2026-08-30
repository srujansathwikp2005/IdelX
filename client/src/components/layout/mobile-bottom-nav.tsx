"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ICONS } from "@/components/ui/icons";
import { BOTTOM_NAV } from "@/config/navigation";
import { USER_ROLES } from "@/lib/constants";

export function MobileBottomNav({ role = USER_ROLES.RENTER }: { role?: keyof typeof BOTTOM_NAV }) {
  const pathname = usePathname();
  const items = BOTTOM_NAV[role];
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border">
      <div className="grid grid-cols-5">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 py-2 text-xs",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              {Icon && <Icon size={20} />}
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
