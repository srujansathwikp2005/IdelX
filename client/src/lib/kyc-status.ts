import type { Kyc } from "@/lib/api-types";

/**
 * Single source of truth for how a KYC state is shown to a user.
 *
 * The backend has five states (not_started, in_progress, pending, approved,
 * rejected) but users only need to know three things: whether they are
 * verified, whether we are still looking, or whether they need to act. Every
 * surface — sidebar, profile, KYC page — must agree, so the mapping lives
 * here rather than being re-derived at each call site.
 */
export type KycDisplay = {
  label: string;
  /** Maps to the Badge component's variants. */
  variant: "success" | "warning" | "danger" | "secondary";
  /** True only for `approved`; gates listing creation and booking. */
  isVerified: boolean;
};

export function kycDisplay(kyc?: Kyc | null): KycDisplay {
  switch (kyc?.status) {
    case "approved":
      return { label: "Verified", variant: "success", isVerified: true };
    case "pending":
      // Submitted and waiting on an admin decision.
      return { label: "Pending", variant: "warning", isVerified: false };
    case "rejected":
      return { label: "Rejected", variant: "danger", isVerified: false };
    case "in_progress":
    case "not_started":
    default:
      // in_progress means started but not submitted, so from the user's point
      // of view it is the same as not having submitted: still not verified.
      // `undefined` lands here too — no record yet means nothing submitted.
      return { label: "Not Verified", variant: "secondary", isVerified: false };
  }
}
