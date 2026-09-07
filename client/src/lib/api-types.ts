/**
 * TypeScript mirrors of the backend (Express + Mongoose) entities.
 * Keep field names in sync with idlex-backend/src/models/*.
 */

export type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T;
};

export type UserRole = "renter" | "owner" | "admin";

export type User = {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  isOwner: boolean;
  isRenter: boolean;
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  isActive: boolean;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ListingPhoto = {
  _id: string;
  url: string;
  caption: string;
  order: number;
};

export type AvailabilityBlock = {
  _id: string;
  startDate: string;
  endDate: string;
  reason?: string;
};

export type ListingStatus = "draft" | "published" | "paused";

export type Listing = {
  _id: string;
  owner: string | Pick<User, "_id" | "name" | "avatarUrl">;
  title: string;
  description: string;
  category: string;
  pricePerDay: number;
  securityDeposit: number;
  location?: {
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    lat?: number;
    lng?: number;
  };
  photos: ListingPhoto[];
  availability: AvailabilityBlock[];
  extension?: {
    allowed: boolean;
    pricing: "same" | "custom";
    ratePercent: number;
    requestBeforeHours: number;
    maxExtensionDays: number;
  };
  status: ListingStatus;
  ratingAvg: number;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ListingQueryResult = {
  items: Listing[];
  pagination: { page: number; limit: number; total: number; pages: number };
};

export type BookingStatus =
  | "requested"
  | "awaiting_payment"
  | "confirmed"
  | "active"
  | "return_requested"
  | "completed"
  | "cancelled"
  | "disputed";

export type ExtensionRequest = {
  _id: string;
  requestedNewEndDate: string;
  reason?: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  respondedAt?: string;
};

export type Booking = {
  _id: string;
  listing: string | Listing;
  renter: string | Pick<User, "_id" | "name" | "avatarUrl">;
  owner: string | Pick<User, "_id" | "name" | "avatarUrl">;
  startDate: string;
  endDate: string;
  status: BookingStatus;
  pricePerDay: number;
  totalDays: number;
  subtotal: number;
  serviceFee: number;
  securityDeposit: number;
  deliveryAddress?: {
    label?: string;
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    pincode?: string;
    lat?: number;
    lng?: number;
    instructions?: string;
  };
  totalAmount: number;
  cancelledBy: string | null;
  cancellationReason: string | null;
  extensionRequests: ExtensionRequest[];
  /**
   * Where a UPI payment for this booking has got to, when one has been
   * submitted. `status` stays at "awaiting_payment" from the owner's
   * approval until an admin has matched the reference against the money, so
   * it cannot distinguish someone who has not paid from someone who paid an
   * hour ago and is waiting on us.
   */
  paymentSubmission?: {
    status: "verification_pending" | "verified" | "rejected";
    utr: string;
    submittedAt: string;
    rejectionReason: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

/** Paid, and waiting on us. Nothing should ask for money in this state. */
export const isPaymentUnderReview = (booking: Booking) =>
  booking.status === "awaiting_payment" &&
  booking.paymentSubmission?.status === "verification_pending";

/** Paid, but the reference did not check out — they do need to act. */
export const isPaymentRejected = (booking: Booking) =>
  booking.status === "awaiting_payment" &&
  booking.paymentSubmission?.status === "rejected";

export type PaymentStatus = "created" | "authorized" | "captured" | "failed" | "refunded";

export type Payment = {
  _id: string;
  booking: string | null;
  payer: string | Pick<User, "_id" | "name" | "email" | "avatarUrl">;
  listing?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  gateway: string;
  gatewayOrderId: string;
  gatewayPaymentId: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  createdAt: string;
};

// Response of POST /api/payments/checkout — the client uses this to open
// the Razorpay Checkout popup. `configured: false` means no Razorpay keys
// are set (dev mode): the UI simulates the payment via /verify.
export type CheckoutOrder = {
  paymentId: string;
  orderId: string;
  amount: number;
  currency: string;
  gateway: string;
  /** Consumed by the Cashfree browser SDK; null when the gateway is unconfigured. */
  paymentSessionId: string | null;
  /** Must match the mode the order was created in. */
  mode: "sandbox" | "production";
  configured: boolean;
};

export type Payout = {
  _id: string;
  owner: string;
  booking: string;
  amount: number;
  status: "pending" | "processing" | "paid" | "failed";
  gatewayPayoutId: string | null;
  createdAt: string;
};

export type PayoutSettings = {
  _id: string;
  owner: string;
  accountHolderName?: string;
  accountNumber?: string;
  ifscOrRoutingNumber?: string;
  bankName?: string;
  upiId?: string;
};

export type KycStatus = "not_started" | "in_progress" | "pending" | "approved" | "rejected";

export type BankDetails = {
  accountHolderName?: string;
  accountNumber?: string;
  ifsc?: string;
  bankName?: string;
  upiId?: string;
};

export type Kyc = {
  _id: string;
  user: string | Pick<User, "_id" | "name" | "email" | "phone">;
  status: KycStatus;
  document?: { fileUrl?: string; uploadedAt?: string };
  selfie?: { fileUrl?: string; uploadedAt?: string };
  bankDetails?: BankDetails;
  rejectionReason?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Review = {
  _id: string;
  booking: string;
  listing: string;
  reviewer: string | Pick<User, "_id" | "name" | "avatarUrl">;
  rating: number;
  comment: string;
  createdAt: string;
};

export type Conversation = {
  _id: string;
  participants: Array<string | Pick<User, "_id" | "name" | "avatarUrl">>;
  listing: string | null | Listing;
  lastMessage: string;
  lastMessageAt: string;
  createdAt: string;
};

export type Message = {
  _id: string;
  conversation: string;
  sender: string | Pick<User, "_id" | "name" | "avatarUrl">;
  text: string;
  readBy: string[];
  createdAt: string;
};

export type Dispute = {
  _id: string;
  booking: string | Booking;
  // Phone included: an admin resolving a dispute needs to reach both people,
  // and an email address alone is a slow way to settle who keeps a deposit.
  raisedBy: string | Pick<User, "_id" | "name" | "email" | "phone">;
  reason: string;
  // What kind of complaint. The owner's three are about a return; the
  // renter's two are about never getting the item or it not matching.
  category?:
    | "damage"
    | "missing_item"
    | "late_return"
    | "not_as_described"
    | "not_received"
    | "other";
  // Only an owner claims against the deposit; a renter's dispute carries 0.
  claimedAmount?: number;
  status: "open" | "under_review" | "resolved" | "rejected";
  resolutionNote: string | null;
  resolvedBy: string | null;
  createdAt: string;
};

export type AdminStats = {
  totalUsers: number;
  totalListings: number;
  activeBookings: number;
  totalRevenue: number;
};

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

export type AuditLogCategory = "auth" | "listing" | "booking" | "payment" | "kyc" | "review" | "admin" | "system";

export type AuditLog = {
  _id: string;
  actor: string | null | Pick<User, "_id" | "name" | "email" | "avatarUrl" | "role">;
  action: string;
  category: AuditLogCategory;
  resourceType: string | null;
  resourceId: string | null;
  summary: string;
  details: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type AuditLogResult = {
  items: AuditLog[];
  pagination: Pagination;
};

export type SeriesPoint = {
  date: string;
  value: number;
};

export type AdminAnalytics = {
  windowDays: number;
  totals: AdminStats;
  newSignups: SeriesPoint[];
  revenueTrend: SeriesPoint[];
  bookingTrend: SeriesPoint[];
  bookingsByStatus: Array<{ status: string; count: number }>;
  listingsByCategory: Array<{ category: string; count: number }>;
  activityBreakdown: Array<{ action: string; count: number }>;
  topUsers: Array<{
    user: Pick<User, "_id" | "name" | "email" | "avatarUrl" | "isActive"> | null;
    actions: number;
    lastActive: string;
  }>;
  recentActivity: AuditLog[];
};

export type AdminBookingsResult = {
  items: Booking[];
  pagination: Pagination;
};

export type AdminPaymentsResult = {
  items: Payment[];
  pagination: Pagination;
};

export type MarketplaceStats = {
  activeListings: number;
  happyRenters: number;
  averageRating: number;
  listingsByCategory: { category: string; count: number }[];
};

export type AuthResult = {
  user: User;
  accessToken: string;
  refreshToken: string;
};

export type AppNotificationType =
  | "booking_request"
  | "booking_confirmed"
  | "booking_cancelled"
  | "extension_requested"
  | "return_requested"
  | "return_confirmed"
  | "payment_captured"
  | "info";

export type AppNotification = {
  _id: string;
  recipient: string;
  type: AppNotificationType;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
};

export function ownerName(owner: Listing["owner"]): string {
  if (typeof owner === "object" && owner !== null) return (owner as { name?: string }).name || "Owner";
  return "Owner";
}

export function ownerAvatar(owner: Listing["owner"]): string | undefined {
  if (typeof owner === "object" && owner !== null) return (owner as { avatarUrl?: string }).avatarUrl ?? undefined;
  return undefined;
}

export function listingImage(listing: Listing): string {
  return listing.photos?.[0]?.url || "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=1200&q=80";
}

export function listingCity(listing: Listing): string {
  return listing.location?.city || "India";
}

export type ListingCardShape = {
  id: string;
  title: string;
  category: string;
  location: string;
  price: number;
  rating: number;
  reviews: number;
  image: string;
  tags: string[];
  status: ListingStatus;
};

export function toCard(listing: Listing): ListingCardShape {
  return {
    id: listing._id,
    title: listing.title,
    category: listing.category,
    location: listing.location?.city || "India",
    price: listing.pricePerDay,
    rating: listing.ratingAvg || 0,
    reviews: listing.ratingCount || 0,
    image: listingImage(listing),
    tags: [listing.status === "published" ? "Available" : listing.status],
    status: listing.status,
  };
}

export type SupportReply = {
  _id: string;
  author: { _id: string; name: string } | string;
  isAdmin: boolean;
  message: string;
  createdAt: string;
};

export type SupportTicket = {
  _id: string;
  user: { _id: string; name: string; email: string; phone?: string } | string;
  subject: string;
  message: string;
  status: "open" | "answered" | "closed";
  replies: SupportReply[];
  createdAt: string;
};

export type AdminCategory = {
  name: string;
  listings: number;
  published: number;
  avgPricePerDay: number;
};

export type AdminExtensionRequest = {
  _id: string;
  bookingId: string;
  status: string;
  requestedUntil?: string;
  createdAt: string;
  renter?: { _id: string; name: string; email: string } | string;
  listing?: { _id: string; title: string } | string;
};

// What the platform still owes someone, with the details needed to pay it.
// Returned by GET /api/ledger/outstanding.
export type PayoutDetails = {
  accountHolderName?: string | null;
  accountNumber?: string | null;
  ifsc?: string | null;
  bankName?: string | null;
  upiId?: string | null;
};

export type SettlementObligation = {
  id: string;
  booking: { _id: string; startDate?: string; endDate?: string; totalAmount?: number; status?: string } | string | null;
  component: string;
  amount: number;
  payTo: "owner" | "renter" | "platform" | "gateway";
  recipient: { _id: string; name?: string; email?: string; phone?: string } | null;
  createdAt: string;
  note?: string | null;
  payoutDetails: PayoutDetails | null;
};

export type OutstandingResult = {
  items: SettlementObligation[];
  total: number;
  provider: string;
};
