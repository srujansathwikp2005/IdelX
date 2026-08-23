import { ROUTES, type UserRole } from "@/lib/constants";

/** Renter sidebar items (matches the renter dashboard screenshot). */
export const RENTER_SIDEBAR: Array<{ label: string; href: string; icon: string; badge?: number | string }> = [
  { label: "Dashboard", href: ROUTES.DASHBOARD, icon: "Home" },
  { label: "Browse Items", href: ROUTES.SEARCH, icon: "Search" },
  { label: "My Bookings", href: ROUTES.MY_RENTALS, icon: "CalendarCheck" },
  { label: "Extension Requests", href: `${ROUTES.MY_RENTALS}?tab=extensions`, icon: "Repeat" },
  { label: "My Payments", href: ROUTES.PAYMENTS, icon: "Wallet" },
  { label: "Wishlist", href: ROUTES.WISHLIST, icon: "Heart" },
  { label: "Messages", href: ROUTES.MESSAGES, icon: "MessageCircle" },
  { label: "Reviews", href: ROUTES.REVIEWS, icon: "Star" },
  { label: "My Profile", href: ROUTES.PROFILE, icon: "User" },
  // No badge here: the real KYC status is injected by the sidebar at render
  // time. A literal string would report "Verified" to every user regardless
  // of their actual state.
  { label: "KYC Verification", href: ROUTES.KYC_VERIFICATION, icon: "ShieldCheck" },
  { label: "Settings", href: ROUTES.SETTINGS, icon: "Settings" },
  { label: "Help & Support", href: ROUTES.HELP, icon: "HelpCircle" },
];

/** Owner sidebar (overlaps with renter; owner-specific entries come first). */
export const OWNER_SIDEBAR: Array<{ label: string; href: string; icon: string; badge?: number | string }> = [
  { label: "Dashboard", href: ROUTES.DASHBOARD, icon: "Home" },
  { label: "My Listings", href: ROUTES.MY_LISTINGS, icon: "Package" },
  { label: "Bookings", href: `${ROUTES.DASHBOARD}?view=bookings`, icon: "CalendarCheck" },
  { label: "Wishlist", href: ROUTES.WISHLIST, icon: "Heart" },
  { label: "Messages", href: ROUTES.MESSAGES, icon: "MessageCircle" },
  { label: "Reviews", href: ROUTES.REVIEWS, icon: "Star" },
  { label: "Payouts", href: ROUTES.PAYMENTS, icon: "Banknote" },
  // No badge here: the real KYC status is injected by the sidebar at render
  // time. A literal string would report "Verified" to every user regardless
  // of their actual state.
  { label: "KYC Verification", href: ROUTES.KYC_VERIFICATION, icon: "ShieldCheck" },
  { label: "Profile Settings", href: ROUTES.PROFILE, icon: "User" },
  { label: "Help & Support", href: ROUTES.HELP, icon: "HelpCircle" },
];

/** Admin sidebar (matches the admin dashboard screenshot). */
export const ADMIN_SIDEBAR: Array<{ label: string; href: string; icon: string; badge?: number | string }> = [
  { label: "Dashboard", href: ROUTES.ADMIN, icon: "LayoutDashboard" },
  { label: "Users", href: ROUTES.ADMIN_USERS, icon: "Users" },
  { label: "Listings", href: ROUTES.ADMIN_LISTINGS, icon: "Package" },
  { label: "Bookings", href: ROUTES.ADMIN_BOOKINGS, icon: "CalendarCheck" },
  { label: "Payments & Payouts", href: ROUTES.ADMIN_PAYMENTS, icon: "Wallet" },
  // Separate from Payments: that screen shows money coming in, this one shows
  // what still has to go out and is the only place a payout gets recorded.
  { label: "Settlements", href: ROUTES.ADMIN_SETTLEMENTS, icon: "Banknote" },
  // The count is injected at render time from the real pending queue; a
  // literal here reported 12 submissions awaiting review no matter what.
  { label: "KYC Verification", href: ROUTES.ADMIN_KYC, icon: "ShieldCheck" },
  { label: "Disputes", href: ROUTES.ADMIN_DISPUTES, icon: "AlertTriangle" },
  { label: "Reviews & Reports", href: ROUTES.ADMIN_REPORTS, icon: "Flag" },
  { label: "Extension Requests", href: ROUTES.ADMIN_EXTENSION_REQUESTS, icon: "Repeat", badge: 6 },
  { label: "Messages", href: ROUTES.ADMIN_MESSAGES, icon: "MessageCircle" },
  { label: "Categories & Attributes", href: ROUTES.ADMIN_CATEGORIES, icon: "Tags" },
  { label: "Offers & Promotions", href: ROUTES.ADMIN_OFFERS, icon: "Tag" },
  { label: "System Settings", href: ROUTES.ADMIN_SYSTEM, icon: "Settings" },
  { label: "Audit Logs", href: ROUTES.ADMIN_AUDIT, icon: "ScrollText" },
  { label: "Support Tickets", href: ROUTES.ADMIN_SUPPORT, icon: "LifeBuoy" },
];

/** Mobile bottom nav — varies by role. */
export const BOTTOM_NAV: Record<UserRole, Array<{ label: string; href: string; icon: string }>> = {
  guest: [
    { label: "Home", href: ROUTES.HOME, icon: "Home" },
    { label: "Browse", href: ROUTES.SEARCH, icon: "Search" },
    { label: "Bookings", href: ROUTES.MY_RENTALS, icon: "CalendarCheck" },
    { label: "Inbox", href: ROUTES.MESSAGES, icon: "MessageCircle" },
    { label: "Profile", href: ROUTES.PROFILE, icon: "User" },
  ],
  renter: [
    { label: "Home", href: ROUTES.DASHBOARD, icon: "Home" },
    { label: "Browse", href: ROUTES.SEARCH, icon: "Search" },
    { label: "Bookings", href: ROUTES.MY_RENTALS, icon: "CalendarCheck" },
    { label: "Inbox", href: ROUTES.MESSAGES, icon: "MessageCircle" },
    { label: "Profile", href: ROUTES.PROFILE, icon: "User" },
  ],
  owner: [
    { label: "Home", href: ROUTES.DASHBOARD, icon: "Home" },
    { label: "Listings", href: ROUTES.MY_LISTINGS, icon: "Package" },
    { label: "Bookings", href: `${ROUTES.DASHBOARD}?view=bookings`, icon: "CalendarCheck" },
    { label: "Inbox", href: ROUTES.MESSAGES, icon: "MessageCircle" },
    { label: "Profile", href: ROUTES.PROFILE, icon: "User" },
  ],
  admin: [
    { label: "Home", href: ROUTES.ADMIN, icon: "LayoutDashboard" },
    { label: "Users", href: ROUTES.ADMIN_USERS, icon: "Users" },
    { label: "Listings", href: ROUTES.ADMIN_LISTINGS, icon: "Package" },
    { label: "Inbox", href: ROUTES.ADMIN_MESSAGES, icon: "MessageCircle" },
    { label: "Profile", href: ROUTES.ADMIN, icon: "User" },
  ],
};
