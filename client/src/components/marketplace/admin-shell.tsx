"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ADMIN_SIDEBAR } from "@/config/navigation";
import { ICONS } from "@/components/ui/icons";
import { ROUTES } from "@/lib/constants";
import { useFetchData } from "@/lib/use-fetch-data";
import { cn } from "@/lib/utils";

type Queues = Record<string, number>;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The same counts the dashboard shows, so a badge can never disagree with
  // the number on the page it links to.
  const { data: queues } = useFetchData<Queues>("/api/admin/queues", []);

  return (
    <div className="min-h-screen bg-muted lg:grid lg:grid-cols-[280px_1fr]">
      <aside className="hidden border-r border-border bg-white lg:block">
        <div className="flex h-16 items-center gap-2 border-b border-border px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-sm font-bold text-white">
            iX
          </div>
          <Link href={ROUTES.ADMIN} className="font-bold">IdleX Admin</Link>
        </div>
        <nav className="p-3 pb-8">
          {ADMIN_SIDEBAR.map((group) => (
            <div key={group.section ?? "top"} className={group.section ? "mt-5" : ""}>
              {group.section && (
                <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.section}
                </p>
              )}
              {group.items.map((item) => {
                const Icon = ICONS[item.icon];
                // Exact match for the dashboard, prefix for the rest —
                // otherwise "/admin" is highlighted on every page.
                const active =
                  item.href === ROUTES.ADMIN
                    ? pathname === item.href
                    : pathname?.startsWith(item.href);
                const count = item.queueKey ? queues?.[item.queueKey] ?? 0 : 0;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-foreground text-white"
                        : "text-foreground hover:bg-muted",
                    )}
                  >
                    {Icon && <Icon size={17} />}
                    <span className="flex-1">{item.label}</span>
                    {/* Only when there is something. A badge showing 0 is
                        noise, and a badge that is always there stops being
                        read at all. */}
                    {count > 0 && (
                      <Badge variant={active ? "default" : "danger"}>{count}</Badge>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
      <main>
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-white px-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase text-primary">Operations</p>
            <h1 className="text-lg font-semibold">Admin Control Center</h1>
          </div>
          <Badge variant="success">Admin console</Badge>
        </header>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</div>
      </main>
    </div>
  );
}
