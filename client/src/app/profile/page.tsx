"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/marketplace/dashboard-shell";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RequireAuth, useAuth, errorMessage } from "@/lib/auth";
import { api } from "@/lib/api-client";
import type { Kyc, User } from "@/lib/api-types";
import { kycDisplay } from "@/lib/kyc-status";
import { ROUTES } from "@/lib/constants";

function ProfileInner() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [kyc, setKyc] = React.useState<Kyc | null>(null);
  const [name, setName] = React.useState(user?.name ?? "");
  const [phone, setPhone] = React.useState(user?.phone ?? "");
  const [email] = React.useState(user?.email ?? "");
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const phoneChanged = phone.trim() !== (user?.phone ?? "").trim() && phone.trim().length >= 10;
  const [otpSent, setOtpSent] = React.useState(false);
  const [otpCode, setOtpCode] = React.useState("");
  const [otpSending, setOtpSending] = React.useState(false);
  const [otpVerifying, setOtpVerifying] = React.useState(false);
  const [phoneVerified, setPhoneVerified] = React.useState(false);
  const [phoneVerificationToken, setPhoneVerificationToken] = React.useState<string | null>(null);
  const [otpMessage, setOtpMessage] = React.useState<string | null>(null);

  const resetPhoneOtp = () => {
    setOtpSent(false);
    setOtpCode("");
    setPhoneVerified(false);
    setPhoneVerificationToken(null);
    setOtpMessage(null);
  };

  const sendOtp = async () => {
    setError(null);
    setOtpMessage(null);
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) {
      setError("Enter a valid 10-digit phone number");
      return;
    }
    setOtpSending(true);
    try {
      await api.post<null>("/api/auth/phone-otp/request", { phone: digits, purpose: "profile" });
      setOtpSent(true);
      setOtpMessage("Verification code sent to the new number.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setOtpSending(false);
    }
  };

  const verifyOtp = async () => {
    setError(null);
    setOtpMessage(null);
    if (otpCode.trim().length !== 6) {
      setError("Enter the 6-digit code");
      return;
    }
    setOtpVerifying(true);
    try {
      const digits = phone.replace(/\D/g, "");
      const res = await api.post<{ verified: boolean; token: string }>("/api/auth/phone-otp/verify", {
        phone: digits,
        code: otpCode.trim(),
        purpose: "profile",
      });
      setPhoneVerified(true);
      setPhoneVerificationToken(res.token);
      setOtpMessage("New phone number verified.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setOtpVerifying(false);
    }
  };

  React.useEffect(() => {
    let cancelled = false;
    api
      .get<Kyc>("/api/kyc")
      .then((data) => {
        if (!cancelled) setKyc(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setError(null);
    setMessage(null);
    if (phoneChanged && !phoneVerified) {
      setError("Verify the new phone number with an OTP before saving");
      return;
    }
    setLoading(true);
    try {
      const updated = await api.patch<User>("/api/auth/me", {
        name,
        phone: phone || undefined,
        phoneVerificationToken: phoneChanged ? phoneVerificationToken ?? undefined : undefined,
      });
      setMessage("Profile saved.");
      resetPhoneOtp();
      await refreshUser().catch(() => updated);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardShell title="Profile">
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-4">
          <Avatar name={user?.name ?? "User"} size="xl" />
          <div>
            <h1 className="text-2xl font-bold">{user?.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant={user?.role === "admin" ? "success" : "default"}>{user?.role}</Badge>
              <Badge variant={user?.isOwner ? "warning" : "secondary"}>{user?.isOwner ? "Owner" : "Renter"}</Badge>
              <Badge
                variant={kycDisplay(kyc).variant}
              >
                KYC {kycDisplay(kyc).label}
              </Badge>
              {kyc && kyc.status !== "approved" && (
                <Link href={ROUTES.KYC} className="text-sm font-semibold text-primary hover:underline">
                  Complete KYC
                </Link>
              )}
            </div>
          </div>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Email" value={email} readOnly />
          <Input label="Phone" value={phone} onChange={(e) => { setPhone(e.target.value); resetPhoneOtp(); }} />
        </div>
        {phoneChanged && !phoneVerified && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">
              You changed your phone number — verify it with an OTP to save.
            </p>
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={sendOtp} loading={otpSending}>
                {otpSent ? "Resend OTP" : "Send OTP"}
              </Button>
              {otpSent && (
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="6-digit code"
                    className="h-9 w-32"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={verifyOtp} loading={otpVerifying}>
                    Verify
                  </Button>
                </div>
              )}
              {otpMessage && <p className="text-sm text-muted-foreground">{otpMessage}</p>}
            </div>
          </div>
        )}
        {phoneVerified && <p className="mt-4 text-sm font-medium text-success">New phone number verified.</p>}
        {error && <p className="mt-4 rounded-md bg-danger-50 p-3 text-sm text-danger">{error}</p>}
        {message && <p className="mt-4 rounded-md bg-secondary-50 p-3 text-sm text-secondary-700">{message}</p>}
        <div className="mt-5 flex gap-3">
          <Button loading={loading} onClick={save}>Save Profile</Button>
          {!user?.isOwner && (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await api.patch<User>("/api/auth/me", { becomeOwner: true });
                  await refreshUser();
                  router.push(ROUTES.LISTING_NEW);
                } catch (err) {
                  setError(errorMessage(err));
                }
              }}
            >
              Become an Owner
            </Button>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}

export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileInner />
    </RequireAuth>
  );
}
