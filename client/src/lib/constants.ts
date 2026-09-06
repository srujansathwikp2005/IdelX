/**
 * Centralized route paths & app-wide constants.
 */

export const ROUTES = {
  // Public
  HOME: "/",
  CATEGORIES: "/categories",
  SEARCH: "/search",
  PRODUCT: (id: string) => `/product/${id}`,
  ABOUT: "/about",
  SAFETY: "/safety",
  CONTACT: "/contact",
  FAQ: "/faq",
  PRIVACY: "/privacy-policy",
  TERMS: "/terms",
  SECURITY_DEPOSIT_POLICY: "/security-deposit-policy",
  CANCELLATION_REFUND_POLICY: "/cancellation-refund-policy",
  COMMUNITY_GUIDELINES: "/community-guidelines",
  BECOME_HOST: "/become-a-host",

  // Auth
  SIGN_UP: "/sign-up",
  REGISTER: "/register",
  LOGIN: "/login",
  FORGOT_PASSWORD: "/forgot-password",
  RESET_PASSWORD: "/reset-password",
  VERIFY_OTP: "/verify-otp",
  VERIFY_EMAIL: "/verify-email",

  // Dashboard
  DASHBOARD: "/dashboard",
  MY_LISTINGS: "/my-listings",
  LISTING_NEW: "/my-listings/new",
  LISTING_EDIT: (id: string) => `/my-listings/${id}/edit`,
  MY_RENTALS: "/my-rentals",
  RENTAL_DETAIL: (id: string) => `/my-rentals/${id}`,
  MESSAGES: "/messages",
  MESSAGE_THREAD: (id: string) => `/messages/${id}`,
  NOTIFICATIONS: "/notifications",
  PAYMENTS: "/payments",
  PROFILE: "/profile",
  WISHLIST: "/wishlist",
  REVIEWS: "/reviews",
  HELP: "/help",
  KYC: "/kyc",
  SETTINGS: "/settings",
  KYC_VERIFICATION: "/kyc-verification",
  PAYOUTS: "/payouts",

  // Checkout
  CHECKOUT: (id: string) => `/checkout/${id}`,

  // Admin
  ADMIN: "/admin",
  ADMIN_USERS: "/admin/users",
  ADMIN_LISTINGS: "/admin/listings",
  ADMIN_BOOKINGS: "/admin/bookings",
  ADMIN_PAYMENTS: "/admin/payments",
  ADMIN_SETTLEMENTS: "/admin/settlements",
  ADMIN_MANUAL_PAYMENTS: "/admin/manual-payments",
  ADMIN_KYC: "/admin/kyc",
  ADMIN_DISPUTES: "/admin/disputes",
  ADMIN_REPORTS: "/admin/reports",
  ADMIN_EXTENSION_REQUESTS: "/admin/extension-requests",
  ADMIN_MESSAGES: "/admin/messages",
  ADMIN_CATEGORIES: "/admin/categories",
  ADMIN_OFFERS: "/admin/offers",
  ADMIN_SYSTEM: "/admin/system-settings",
  ADMIN_AUDIT: "/admin/audit-logs",
  ADMIN_SUPPORT: "/admin/support-tickets",
} as const;

export const BOOKING_STATUS = {
  UPCOMING: "upcoming",
  ONGOING: "ongoing",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  PENDING: "pending",
  CONFIRMED: "confirmed",
  REJECTED: "rejected",
} as const;
export type BookingStatus = (typeof BOOKING_STATUS)[keyof typeof BOOKING_STATUS];

/**
 * Routes visible without logging in: the catalogue, the legal and
 * informational pages, and the auth pages. Every other page is protected by
 * RouteGuard and requires a logged-in user.
 *
 * RouteGuard matches on prefix, so an entry here covers its children too.
 * Add a route only when it must be readable by a stranger — anything showing
 * a specific person's data (bookings, messages, wishlist, payments, KYC)
 * belongs behind the guard.
 * /verify-email stays public so a freshly registered (already signed-in)
 * user can complete verification; it is deliberately NOT an AUTH_PAGES
 * entry, or RouteGuard would bounce the new user straight back home.
 */
export const PUBLIC_ROUTES = [
  "/",

  // Authentication.
  "/login",
  "/register",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/verify-otp",
  "/verify-email",

  // Browsing. A visitor has to be able to see what is for rent before they
  // have any reason to create an account; requiring a login to view the
  // catalogue asks for commitment before showing the product.
  // RouteGuard matches a prefix, so "/product" covers "/product/<id>".
  "/search",
  "/categories",
  "/product",
  "/reviews",

  // Legal. These must be reachable without an account: a visitor cannot be
  // expected to agree to terms they can only read after signing up, and a
  // privacy policy exists precisely for people deciding whether to hand over
  // their data.
  "/terms",
  "/privacy-policy",
  "/security-deposit-policy",
  "/cancellation-refund-policy",
  "/community-guidelines",

  // Information and marketing pages.
  "/about",
  "/help",
  "/safety",
  "/contact",
  "/faq",
  "/become-a-host",
] as const;

/** Auth pages a signed-in user should be redirected away from. */
export const AUTH_PAGES = ["/login", "/register", "/sign-up", "/forgot-password", "/verify-otp"] as const;

export const KYC_STATUS = {
  NOT_STARTED: "not_started",
  IN_PROGRESS: "in_progress",
  PENDING_REVIEW: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;
export type KycStatus = (typeof KYC_STATUS)[keyof typeof KYC_STATUS];

export const LISTING_STATUS = {
  DRAFT: "draft",
  ACTIVE: "active",
  PAUSED: "paused",
  EXPIRED: "expired",
} as const;
export type ListingStatus = (typeof LISTING_STATUS)[keyof typeof LISTING_STATUS];

export const USER_ROLES = {
  GUEST: "guest",
  RENTER: "renter",
  OWNER: "owner",
  ADMIN: "admin",
} as const;
export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const CATEGORIES = [
  { slug: "electronics", name: "Electronics", icon: "Smartphone", count: 2350 },
  { slug: "cameras", name: "Cameras", icon: "Camera", count: 1230 },
  { slug: "outdoor", name: "Outdoor", icon: "Trees", count: 1876 },
  { slug: "tools", name: "Tools", icon: "Wrench", count: 1086 },
  { slug: "home-appliances", name: "Home Appliances", icon: "Home", count: 1543 },
  { slug: "sports", name: "Sports", icon: "Bike", count: 1245 },
  { slug: "vehicles", name: "Vehicles", icon: "Car", count: 642 },
  { slug: "books", name: "Books", icon: "BookOpen", count: 478 },
] as const;
