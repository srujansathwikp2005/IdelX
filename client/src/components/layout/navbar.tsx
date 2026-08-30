"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Bell, MessageCircle, Search, Menu, X, User, LogOut, Settings, LayoutDashboard, Home, Heart,
} from "@/components/ui/icons";
import { PUBLIC_NAV } from "@/config/site";
import { ROUTES } from "@/lib/constants";
import { useAuth } from "@/lib/auth";
import { getToken } from "@/lib/api-client";
import { BrandMark } from "./brand";
import { ThemeToggle } from "./theme-toggle";

export function Navbar() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [menu, setMenu] = React.useState(false);

  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const signedIn = mounted && (!!user || !!getToken());
  const isAdmin = user?.role === "admin";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        {/* Logo */}
        <Link href={ROUTES.HOME} className="group flex shrink-0 items-center gap-2">
          <BrandMark
            size={32}
            className="transition-transform duration-300 group-hover:scale-105 group-hover:rotate-3"
          />
          <span className="text-lg font-bold tracking-tight text-foreground">
            Idle<span className="text-primary">X</span>
          </span>
        </Link>

        {/* Sections (desktop) */}
        <nav className="hidden items-center gap-5 lg:flex">
          {[
            [ROUTES.HOME, "Home"],
            [ROUTES.CATEGORIES, "Categories"],
            ["/#how-it-works", "How it Works"],
            [ROUTES.BECOME_HOST, "Become a Host"],
          ].map(([href, label]) => (
            <Link
              key={label}
              href={href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Search (desktop) */}
        <div className="mx-4 hidden max-w-xl flex-1 md:flex">
          <form action={ROUTES.SEARCH} className="group relative w-full">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary"
            />
            <input
              name="q"
              type="text"
              placeholder="Search for items (camera, tent, bike...)"
              className="h-10 w-full rounded-lg border border-border bg-muted/40 pl-10 pr-4 text-sm transition-all duration-200 focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </form>
        </div>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          {signedIn && (
            <>
              <Link
                href={ROUTES.MESSAGES}
                className="relative hidden h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary-50 hover:text-primary sm:inline-flex"
              >
                <MessageCircle size={20} />
              </Link>
              <Link
                href={ROUTES.NOTIFICATIONS}
                className="relative hidden h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary-50 hover:text-primary sm:inline-flex"
              >
                <Bell size={20} />
              </Link>
            </>
          )}
          <ThemeToggle className="hidden sm:inline-flex" />

          {/* User menu */}
          {signedIn ? (
            <div className="relative">
              <button
                onClick={() => setMenu((m) => !m)}
                className="flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-2 transition-all duration-200 hover:border-primary/40 hover:shadow-md hover:shadow-primary/10"
              >
                <Menu size={16} />
                <Avatar name={user?.name ?? "User"} size="sm" />
              </button>
              {menu && (
                <div
                  className="absolute right-0 z-50 mt-2 w-64 origin-top-right animate-[menuIn_0.15s_ease-out] rounded-xl border border-border bg-card p-2 shadow-lg shadow-black/5"
                  onClick={() => setMenu(false)}
                >
                  <div className="mb-2 border-b border-border p-3">
                    <p className="text-sm font-semibold">{user?.name ?? "Account"}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                  {isAdmin ? (
                    <MenuLink href={ROUTES.ADMIN} icon={<LayoutDashboard size={16} />}>Admin Console</MenuLink>
                  ) : (
                    <>
                      <MenuLink href={ROUTES.DASHBOARD} icon={<LayoutDashboard size={16} />}>Dashboard</MenuLink>
                      <MenuLink href={ROUTES.WISHLIST} icon={<Heart size={16} />}>Wishlist</MenuLink>
                      <MenuLink href={ROUTES.MY_LISTINGS} icon={<Settings size={16} />}>My Listings</MenuLink>
                      <MenuLink href={ROUTES.MY_RENTALS} icon={<User size={16} />}>My Bookings</MenuLink>
                      <MenuLink href={ROUTES.PROFILE} icon={<User size={16} />}>Profile</MenuLink>
                      <MenuLink href={ROUTES.SETTINGS} icon={<Settings size={16} />}>Settings</MenuLink>
                    </>
                  )}
                  <hr className="my-2 border-border" />
                  <button
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-danger-50 hover:text-danger-700"
                    onClick={() => { logout(); router.push(ROUTES.HOME); }}
                  >
                    <span className="text-muted-foreground"><LogOut size={16} /></span>
                    Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link href={ROUTES.LOGIN}>
                <Button variant="ghost" size="sm">
                  Log in
                </Button>
              </Link>
              <Link href={ROUTES.REGISTER}>
                <Button size="sm" className="transition-transform hover:-translate-y-0.5">
                  Sign up
                </Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile menu toggle */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md transition-colors hover:bg-muted md:hidden"
        >
          <span className="transition-transform duration-200" style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </span>
        </button>
      </div>

      {/* Mobile dropdown nav */}
      {open && (
        <div className="animate-[fadeInDown_0.2s_ease-out] space-y-2 border-t border-border bg-card px-4 py-3 md:hidden">
          <form action={ROUTES.SEARCH} className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              name="q"
              type="text"
              placeholder="Search for items..."
              className="h-10 w-full rounded-lg border border-border bg-muted/40 pl-10 pr-4 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </form>
          <Link
            href={ROUTES.HOME}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
          >
            <span className="text-muted-foreground"><Home size={16} /></span>
            Home
          </Link>
          {PUBLIC_NAV.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}

      </header>
  );
}

function MenuLink({
  href, icon, children,
}: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
    >
      <span className="text-muted-foreground">{icon}</span>
      {children}
    </Link>
  );
}