"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/form-controls";
import { Input, Select } from "@/components/ui/input";
import {
  ArrowRight,
  Camera,
  CheckCircle,
  MapPin,
  Package,
  ShieldCheck,
  Star,
  User,
  Wallet,
} from "@/components/ui/icons";
import { ROUTES } from "@/lib/constants";
import { useAuth, errorMessage, isNetworkError } from "@/lib/auth";
import { api } from "@/lib/api-client";
import { BrandLockup } from "@/components/layout/brand";

const roles = [
  {
    id: "renter",
    title: "Renter",
    copy: "Find trusted items nearby",
    Icon: User,
  },
  {
    id: "owner",
    title: "Owner",
    copy: "List items and earn",
    Icon: Wallet,
  },
] as const;

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [role, setRole] = React.useState<(typeof roles)[number]["id"]>("renter");
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [acceptedTerms, setAcceptedTerms] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const [otpSent, setOtpSent] = React.useState(false);
  const [otpCode, setOtpCode] = React.useState("");
  const [otpSending, setOtpSending] = React.useState(false);
  const [otpVerifying, setOtpVerifying] = React.useState(false);
  const [phoneVerified, setPhoneVerified] = React.useState(false);
  const [phoneVerificationToken, setPhoneVerificationToken] = React.useState<string | null>(null);
  const [otpMessage, setOtpMessage] = React.useState<string | null>(null);

  const resetOtp = () => {
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
      await api.post<null>("/api/auth/phone-otp/request", { phone: digits, purpose: "signup" });
      setOtpSent(true);
      setOtpMessage("Verification code sent to your phone.");
    } catch (err) {
      if (isNetworkError(err)) {
        // Backend unreachable — offline demo mode: treat the phone as verified.
        setPhoneVerified(true);
        setOtpMessage("Offline demo mode — phone marked as verified.");
      } else {
        setError(errorMessage(err));
      }
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
        purpose: "signup",
      });
      setPhoneVerified(true);
      setPhoneVerificationToken(res.token);
      setOtpMessage("Phone verified.");
    } catch (err) {
      if (isNetworkError(err)) {
        setPhoneVerified(true);
        setOtpMessage("Offline demo mode — phone marked as verified.");
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) {
      setError("Full name must be at least 2 characters");
      return;
    }
    if (phone.trim().length < 7) {
      setError("Phone number must be at least 7 digits");
      return;
    }
    if (!phoneVerified) {
      setError("Verify your phone number with the OTP before creating the account");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    // The browser enforces this too, but only while the input is rendered
    // and reachable; the check belongs where the submit actually happens.
    if (!acceptedTerms) {
      setError("Please accept the terms of service to continue");
      return;
    }
    setLoading(true);
    try {
      const user = await register({
        name,
        email,
        phone: phone.replace(/\D/g, ""),
        phoneVerificationToken: phoneVerificationToken ?? undefined,
        password,
        becomeOwner: role === "owner",
        acceptedTerms,
      });
      if (user.role === "admin") {
        router.push(ROUTES.ADMIN);
      } else if (!user.isEmailVerified) {
        router.push(`${ROUTES.VERIFY_EMAIL}?email=${encodeURIComponent(user.email)}`);
      } else {
        router.push(ROUTES.HOME);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-card">
      <div className="mx-auto grid min-h-screen max-w-7xl px-4 py-6 sm:px-6 lg:grid-cols-[0.88fr_1fr] lg:gap-12 lg:py-10">
        <section className="hidden flex-col justify-between rounded-2xl bg-primary-50 p-8 lg:flex">
          <Link href={ROUTES.HOME} className="w-fit">
            <BrandLockup size={36} wordmarkClassName="text-xl text-foreground" />
          </Link>

          <div className="py-10">
            <Badge className="border-primary-200 bg-card text-primary-700">New user registration</Badge>
            <h1 className="mt-5 max-w-xl text-5xl font-bold leading-tight text-foreground">
              Create your IdleX account and start renting smarter.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">
              Register once with your initial details, then rent products nearby or become an
              owner and list items from your home.
            </p>

            <div className="mt-8 grid gap-3">
              {[
                { icon: <ShieldCheck size={18} />, label: "Verified profiles for safer rentals" },
                { icon: <Package size={18} />, label: "Book, extend, and return from one dashboard" },
                { icon: <Wallet size={18} />, label: "Clear payments, deposits, and owner payouts" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3 rounded-xl bg-card px-4 py-3 text-sm font-medium shadow-sm">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary-50 text-primary">
                    {item.icon}
                  </span>
                  {item.label}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-[1fr_0.8fr] gap-4">
            <div className="overflow-hidden rounded-2xl bg-card shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=80"
                alt="Camera available for rent"
                className="h-44 w-full object-cover"
              />
            </div>
            <div className="rounded-2xl bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <Camera className="text-primary" />
                <Badge variant="success">Trusted</Badge>
              </div>
              <p className="mt-6 text-sm font-semibold">Camera kit rental</p>
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin size={13} />
                Bhimavaram
              </p>
              <p className="mt-4 flex items-center gap-1 text-sm font-bold text-accent-700">
                <Star size={15} />
                4.9 rating
              </p>
            </div>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center py-6 lg:min-h-0">
          <div className="w-full max-w-xl">
            <div className="mb-8 flex items-center justify-between">
              <Link href={ROUTES.HOME} className="lg:hidden">
                <BrandLockup size={36} wordmarkClassName="text-xl" />
              </Link>
              <Link href={ROUTES.LOGIN} className="ml-auto text-sm font-semibold text-primary">
                Already registered? Sign in
              </Link>
            </div>

            <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
              <Badge className="border-primary-200 bg-primary-50 text-primary-700">Register</Badge>
              <h2 className="mt-4 text-3xl font-bold text-foreground">Tell us your initial details</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                These details create your basic IdleX account. You can complete KYC and owner setup later.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3">
                {roles.map(({ id, title, copy, Icon }) => {
                  const selected = role === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setRole(id)}
                      className={`rounded-xl border p-4 text-left transition ${
                        selected
                          ? "border-primary bg-primary-50 shadow-sm"
                          : "border-border bg-card hover:border-primary"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <Icon className="text-primary" />
                        {selected && <CheckCircle size={18} className="text-primary" />}
                      </div>
                      <p className="mt-3 font-semibold">{title}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy}</p>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" minLength={2} required />
                <div>
                  <Input
                    label="Phone number"
                    type="tel"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      resetOtp();
                    }}
                    placeholder="10-digit mobile number"
                    minLength={10}
                    required
                  />
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      variant={phoneVerified ? "outline" : "secondary"}
                      size="sm"
                      onClick={sendOtp}
                      loading={otpSending}
                      disabled={phoneVerified}
                      className="transition-transform hover:-translate-y-0.5"
                    >
                      {phoneVerified ? "Verified" : otpSent ? "Resend OTP" : "Send OTP"}
                    </Button>
                    {otpSent && !phoneVerified && (
                      <div className="flex flex-1 gap-2">
                        <Input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                          placeholder="6-digit code"
                          className="h-9"
                        />
                        <Button type="button" variant="outline" size="sm" onClick={verifyOtp} loading={otpVerifying}>
                          Verify
                        </Button>
                      </div>
                    )}
                  </div>
                  {phoneVerified && (
                    <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-success">
                      <CheckCircle size={15} />
                      Phone verified
                    </p>
                  )}
                  {otpMessage && !phoneVerified && <p className="mt-2 text-sm text-muted-foreground">{otpMessage}</p>}
                </div>
                <Input label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
                <Select
                  label="City"
                  name="city"
                  defaultValue="bhimavaram"
                  options={[
                    { value: "bhimavaram", label: "Bhimavaram" },
                    { value: "vijayawada", label: "Vijayawada" },
                    { value: "rajahmundry", label: "Rajahmundry" },
                    { value: "eluru", label: "Eluru" },
                  ]}
                />
                <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create password" minLength={8} hint="At least 8 characters" required />
                <Input label="Confirm password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat password" minLength={8} required />
              </div>

              <input type="hidden" name="role" value={role} />

              <div className="mt-5 rounded-xl bg-primary-50 p-4">
                <Checkbox
                  required
                  checked={acceptedTerms}
                  onChange={(e) => {
                    setAcceptedTerms(e.target.checked);
                    setError(null);
                  }}
                  label={
                    <span className="text-sm leading-6">
                      I agree to IdleX safe rental rules, verification checks, the{" "}
                      {/* stopPropagation because these sit inside the
                          checkbox's <label>: without it, reading the terms
                          also ticks the box you have not read them for. */}
                      <Link
                        href={ROUTES.TERMS}
                        className="font-semibold text-primary"
                        target="_blank"
                        onClick={(e) => e.stopPropagation()}
                      >
                        terms of service
                      </Link>{" "}
                      and the{" "}
                      <Link
                        href={ROUTES.PRIVACY}
                        className="font-semibold text-primary"
                        target="_blank"
                        onClick={(e) => e.stopPropagation()}
                      >
                        privacy policy
                      </Link>.
                    </span>
                  }
                />
              </div>

              {error && <p className="mt-4 rounded-md bg-danger-50 p-3 text-sm text-danger">{error}</p>}

              <Button className="mt-5" fullWidth size="lg" rightIcon={<ArrowRight size={18} />} loading={loading}>
                Register Account
              </Button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
