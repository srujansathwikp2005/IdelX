"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Stepper } from "@/components/ui/stepper";
import { Badge } from "@/components/ui/badge";
import { Checkbox, RadioGroup } from "@/components/ui/form-controls";
import {
  AlertTriangle, Camera, CheckCircle, Clock, IdCard, Lock, Mail, Repeat, ShieldCheck, Upload,
} from "@/components/ui/icons";
import { api, ApiError, getStoredUser, setStoredUser } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import type { Kyc, Listing, User } from "@/lib/api-types";
import { ROUTES } from "@/lib/constants";
import { errorMessage, isNetworkError } from "@/lib/auth";

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="flex animate-[fadeInUp_0.25s_ease-out] items-start gap-3 rounded-lg border border-danger-200 bg-danger-50 p-3">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
      <p className="text-sm text-danger">{message}</p>
    </div>
  );
}

function Notice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="flex animate-[fadeInUp_0.25s_ease-out] items-start gap-3 rounded-lg border border-secondary-200 bg-secondary-50 p-3">
      <CheckCircle size={16} className="mt-0.5 shrink-0 text-secondary-700" />
      <p className="text-sm text-secondary-700">{message}</p>
    </div>
  );
}

type AuthMode = "login" | "sign-up" | "forgot" | "otp";

// useSearchParams opts a route out of static prerendering unless it sits
// inside a Suspense boundary. Wrapping here rather than in each of the five
// auth pages keeps every caller correct by construction — and a missing
// boundary fails the build, not the browser, so it is easy to reintroduce.
export function AuthPanel({ mode }: { mode: AuthMode }) {
  return (
    <React.Suspense fallback={null}>
      <AuthPanelInner mode={mode} />
    </React.Suspense>
  );
}

function AuthPanelInner({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Signing in on the way to the admin console. Registration is offered on
  // the ordinary sign-in screen but not here: self-registration always
  // creates a renter, so advertising it to someone trying to reach /admin
  // only suggests a route to administrator access that does not exist.
  const isAdminEntry = (searchParams.get("next") ?? "").startsWith(ROUTES.ADMIN);
  const { login, register } = useAuth();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [offline, setOffline] = React.useState(false);

  const titles = {
    login: "Welcome back",
    "sign-up": "Create your IdleX account",
    forgot: "Reset your password",
    otp: "Verify your phone",
  };

  const redirectAfterAuth = (user?: { role?: string }) => {
    if (user?.role === "admin") {
      router.replace(ROUTES.ADMIN);
      return;
    }
    const next = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("next");
    if (next && next.startsWith("/")) {
      router.replace(next);
      return;
    }
    router.replace(ROUTES.HOME);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setOffline(false);
    setLoading(true);
    try {
      if (mode === "login") {
        const user = await login(email.trim(), password);
        redirectAfterAuth(user);
      } else if (mode === "sign-up") {
        const user = await register({ name, email: email.trim(), phone: phone.trim(), password });
        redirectAfterAuth(user);
      } else if (mode === "forgot") {
        await api.post<null>("/api/auth/password/reset", { email: email.trim() });
        setNotice("If that email exists, a reset link has been sent.");
      } else if (mode === "otp") {
        if (!code) {
          await api.post<null>("/api/auth/otp/request", { phone: phone.trim() });
          setNotice("OTP sent. Enter the code below.");
        } else {
          await api.post<User>("/api/auth/otp/verify", { phone: phone.trim(), code });
          setNotice("Phone verified successfully.");
        }
      }
    } catch (err) {
      setError(errorMessage(err));
      if (isNetworkError(err)) setOffline(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto w-full max-w-md animate-[fadeInUp_0.4s_ease-out] rounded-xl border border-border bg-card p-7 shadow-lg shadow-black/5"
    >
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Badge variant="default" className="bg-linear-to-r from-primary to-primary-600 text-on-brand">
            Secure access
          </Badge>
          <Lock size={14} className="text-muted-foreground" />
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">{titles[mode]}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "otp" ? "Enter your phone number to receive a code." : "Sign in to your IdleX account."}
        </p>
      </div>
      <div className="space-y-4">
        {mode === "sign-up" && (
          <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" required />
        )}
        {mode === "otp" && (
          <Input label="Phone number" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 XXXXX XXXXX" required />
        )}
        {mode === "login" && (
          // Sign-in accepts either identifier, so this cannot be type="email":
          // the browser would reject a phone number before the form submits.
          <Input
            label="Email or phone number"
            type="text"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com or 10-digit mobile"
            required
          />
        )}
        {(mode === "sign-up" || mode === "forgot") && (
          // Registration and password reset are email-only, so keep the
          // stricter input type and its built-in validation here.
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
        )}
        {mode === "otp" && (
          <Input label="One-time password" value={code} onChange={(e) => setCode(e.target.value)} placeholder="6 digit code" />
        )}
        {(mode === "login" || mode === "sign-up") && (
          <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" required />
        )}
        <FieldError message={error} />
        <Notice message={notice} />
        {mode === "login" && offline && (
          <div className="flex items-start gap-3 rounded-lg border border-primary-200 bg-primary-50 p-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-primary-700" />
            <p className="text-sm text-primary-700">Backend is offline — using built-in demo mode.</p>
          </div>
        )}
        <Button
          fullWidth
          loading={loading}
          className="shadow-sm shadow-primary/20 transition-transform hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/30"
        >
          {mode === "forgot" ? "Send reset link" : mode === "otp" ? (code ? "Verify OTP" : "Send OTP") : "Continue"}
        </Button>
        <div className="flex items-center justify-between text-sm">
          {mode === "login" && (
            <>
              <Link href={ROUTES.FORGOT_PASSWORD} className="font-semibold text-primary transition-colors hover:text-primary-600">
                Forgot password?
              </Link>
              {!isAdminEntry && (
                <Link href={ROUTES.REGISTER} className="font-semibold text-primary transition-colors hover:text-primary-600">
                  Create account
                </Link>
              )}
            </>
          )}
          {mode === "sign-up" && (
            <Link href={ROUTES.LOGIN} className="ml-auto font-semibold text-primary transition-colors hover:text-primary-600">
              Already registered? Sign in
            </Link>
          )}
        </div>
      </div>
      </form>
  );
}

/**
 * Email verification via emailed OTP. Used right after registration and
 * from /verify-email. Two-phase: send the code, then verify it.
 */
export function EmailVerifyPanel({ initialEmail = "" }: { initialEmail?: string }) {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [email, setEmail] = React.useState(initialEmail || user?.email || "");
  const [code, setCode] = React.useState("");
  const [codeSent, setCodeSent] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const sendCode = async () => {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      await api.post<null>("/api/auth/email-otp/request", { email: email.trim() });
      setCodeSent(true);
      setNotice(`A verification code was sent to ${email.trim()}.`);
    } catch (err) {
      if (isNetworkError(err)) {
        setCodeSent(true);
        setNotice("Backend offline — demo mode: enter any 6-digit code to verify.");
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    if (!code.trim() || code.trim().length !== 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      await api.post<User>("/api/auth/email-otp/verify", { email: email.trim(), code: code.trim() });
      await refreshUser().catch(() => undefined);
      setNotice("Email verified successfully.");
      router.push(ROUTES.HOME);
    } catch (err) {
      if (isNetworkError(err)) {
        const stored = getStoredUser<User>();
        if (stored) setStoredUser({ ...stored, isEmailVerified: true });
        setNotice("Demo mode: email verified.");
        router.push(ROUTES.HOME);
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!codeSent) void sendCode();
        else void verify();
      }}
      className="mx-auto w-full max-w-md animate-[fadeInUp_0.4s_ease-out] rounded-xl border border-border bg-card p-7 shadow-lg shadow-black/5"
    >
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Badge variant="default" className="bg-linear-to-r from-primary to-primary-600 text-on-brand">
            Email verification
          </Badge>
        </div>
        <div className="mt-3 flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-50 text-primary">
            <Mail size={17} />
          </span>
          <h1 className="text-2xl font-bold tracking-tight">Verify your email</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          We&apos;ll send a one-time code to this address so we know it&apos;s really you.
        </p>
      </div>
      <div className="space-y-4">
        <Input
          label="Email address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />
        {codeSent && (
          <Input
            label="One-time password"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="6 digit code"
          />
        )}
        <FieldError message={error} />
        <Notice message={notice} />
        <Button
          fullWidth
          loading={loading}
          className="shadow-sm shadow-primary/20 transition-transform hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/30"
        >
          {codeSent ? "Verify Email" : "Send Code"}
        </Button>
        {codeSent && (
          <button
            type="button"
            onClick={() => void sendCode()}
            disabled={loading}
            className="mx-auto block text-sm font-semibold text-primary transition-colors hover:text-primary-600 hover:underline"
          >
            Resend code
          </button>
        )}
        <div className="flex items-center justify-center text-sm">
          <Link href={ROUTES.HOME} className="font-semibold text-primary transition-colors hover:text-primary-600">
            Skip for now
          </Link>
        </div>
      </div>
    </form>
  );
}

export function ListingStepperForm({ edit = false, listingId }: { edit?: boolean; listingId?: string }) {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [title, setTitle] = React.useState("");
  const [category, setCategory] = React.useState("tools");
  const [pricePerDay, setPricePerDay] = React.useState("");
  const [securityDeposit, setSecurityDeposit] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [city, setCity] = React.useState("");
  const [status, setStatus] = React.useState<"draft" | "published" | "paused">("draft");
  const [extensionAllowed, setExtensionAllowed] = React.useState(false);
  const [extensionPricing, setExtensionPricing] = React.useState<"same" | "custom">("same");
  const [extensionRatePercent, setExtensionRatePercent] = React.useState("20");
  const [extensionRequestBefore, setExtensionRequestBefore] = React.useState("12");
  const [extensionMaxDays, setExtensionMaxDays] = React.useState("3");
  const [extensionTouched, setExtensionTouched] = React.useState(false);
  // The backend accepts up to 10 photos per listing (upload.array). Keeping
  // an array here rather than a single file is what makes a gallery possible.
  const [selectedPhotos, setSelectedPhotos] = React.useState<Array<{ id: number; file: File; url: string }>>([]);
  const MAX_PHOTOS = 10;
  const [photoError, setPhotoError] = React.useState<string | null>(null);
  // Conversion is synchronous-feeling but can take a moment on large HEIC
  // files; without feedback the picker looks like it did nothing.
  const [convertingPhotos, setConvertingPhotos] = React.useState(false);
  const nextPhotoId = React.useRef(0);
  const [existingPhotos, setExistingPhotos] = React.useState<Listing["photos"]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [loadingListing, setLoadingListing] = React.useState(edit);
  const [otpSent, setOtpSent] = React.useState(false);
  const [otpCode, setOtpCode] = React.useState("");

  React.useEffect(() => {
    if (!edit || !listingId) return;
    let cancelled = false;
    (async () => {
      try {
        const listing = await api.get<Listing>(`/api/listings/${listingId}`);
        if (cancelled) return;
        setTitle(listing.title);
        setCategory(listing.category);
        setPricePerDay(String(listing.pricePerDay));
        setSecurityDeposit(String(listing.securityDeposit ?? 0));
        setDescription(listing.description);
        setCity(listing.location?.city ?? "");
        setStatus(listing.status);
        setExistingPhotos(listing.photos ?? []);
        setExtensionAllowed(!!listing.extension?.allowed);
        setExtensionPricing(listing.extension?.pricing === "custom" ? "custom" : "same");
        setExtensionRatePercent(String(listing.extension?.ratePercent ?? 20));
        setExtensionRequestBefore(String(listing.extension?.requestBeforeHours ?? 12));
        setExtensionMaxDays(String(listing.extension?.maxExtensionDays ?? 3));
        setExtensionTouched(!!listing.extension);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoadingListing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [edit, listingId]);

  // Returns an error string instead of throwing. The listing is already
  // created by the time this runs, so letting it throw would show "failed"
  // for a listing that actually exists — the owner would try again and
  // create a duplicate.
  const uploadPhotos = async (id: string): Promise<string | null> => {
    if (selectedPhotos.length === 0) return null;
    const form = new FormData();
    // Repeated field name — multer's upload.array collects them into req.files.
    for (const photo of selectedPhotos) form.append("photos", photo.file);
    try {
      await api.post<Listing["photos"]>(`/api/listings/${id}/photos`, form, { headers: {} });
      return null;
    } catch (err) {
      return errorMessage(err);
    }
  };

  React.useEffect(() => {
    return () => {
      // Revoke every preview, not just the last one, or the blobs leak.
      for (const photo of selectedPhotos) URL.revokeObjectURL(photo.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirrors the server's multer config. Rejecting here means the owner finds
  // out at the moment they pick the file, rather than after filling in the
  // whole form and waiting for an OTP.
  const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
  const MAX_FILE_BYTES = 10 * 1024 * 1024;

  // Anything the server will not take is re-encoded to JPEG in the browser.
  // This exists mainly for HEIC: every photo an iPhone takes is HEIC, and
  // rejecting them would block most owners from listing at all.
  //
  // Safari decodes HEIC natively, so a canvas round-trip works there. Other
  // browsers cannot, and the draw produces a blank image — detected by
  // checking the decoded dimensions, in which case the file is rejected with
  // a message that says what to do instead.
  const toUploadableImage = (file: File): Promise<File> =>
    new Promise((resolve, reject) => {
      if (ACCEPTED_TYPES.includes(file.type)) return resolve(file);

      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        if (!img.naturalWidth || !img.naturalHeight) {
          return reject(new Error(`${file.name} could not be read by this browser.`));
        }
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d")?.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error(`${file.name} could not be converted.`));
            resolve(
              new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" })
            );
          },
          "image/jpeg",
          0.9
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`${file.name} is not an image this browser can open.`));
      };
      img.src = url;
    });

  const addPhotos = async (files: FileList) => {
    const rejected: string[] = [];
    // Computed before any await: reading state inside an async loop would use
    // a stale snapshot if the owner picks again while conversion is running.
    const room = MAX_PHOTOS - selectedPhotos.length - existingPhotos.length;

    if (room <= 0) {
      setPhotoError(`You can upload at most ${MAX_PHOTOS} photos.`);
      return;
    }

    setConvertingPhotos(true);
    const usable: Array<{ id: number; file: File; url: string }> = [];

    for (const original of Array.from(files)) {
      if (usable.length >= room) {
        rejected.push(`Only ${room} more photo${room === 1 ? "" : "s"} could be added.`);
        break;
      }
      if (original.size > MAX_FILE_BYTES) {
        rejected.push(`${original.name} is larger than 10MB.`);
        continue;
      }
      try {
        // HEIC and friends become JPEG here; formats the server already
        // accepts pass through untouched.
        const file = await toUploadableImage(original);
        usable.push({ id: nextPhotoId.current++, file, url: URL.createObjectURL(file) });
      } catch (err) {
        rejected.push(err instanceof Error ? err.message : `${original.name} could not be added.`);
      }
    }

    if (usable.length) setSelectedPhotos((prev) => [...prev, ...usable]);
    setConvertingPhotos(false);
    setPhotoError(rejected.length ? rejected.join(" ") : null);
  };

  const removePhoto = (id: number) => {
    setSelectedPhotos((prev) => {
      const gone = prev.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((p) => p.id !== id);
    });
  };

  // Every listing creation is gated by an emailed OTP. This sends (or
  // resends) the code; the create call in `submit` verifies it.
  const sendListingOtp = async () => {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      await api.post<null>("/api/listings/otp/request", {});
      setOtpSent(true);
      setNotice(`A 6-digit code was sent to ${user?.email ?? "your email"}. Enter it below, then click Save again.`);
    } catch (err) {
      if (isNetworkError(err)) {
        setOtpSent(true);
        setNotice("Backend offline — demo mode: enter any 6-digit code to finish creating your listing.");
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const submit = async (publish: boolean) => {
    setError(null);
    if (selectedPhotos.length === 0 && existingPhotos.length === 0) {
      setError("Please add a photo of your item — it's required before saving.");
      return;
    }
    setLoading(true);
    try {
      // Auto-upgrade a renter to owner on first save
      if (!edit && user && !user.isOwner) {
        const updated = await api.patch<User>("/api/auth/me", { becomeOwner: true });
        await refreshUser().catch(() => updated);
      }
      const payload = {
        title,
        category,
        pricePerDay: Number(pricePerDay),
        securityDeposit: Number(securityDeposit || 0),
        description,
        location: city ? { city } : undefined,
        extension: {
          allowed: extensionAllowed,
          pricing: extensionPricing,
          ratePercent: Number(extensionRatePercent) || 0,
          requestBeforeHours: Number(extensionRequestBefore) || 0,
          maxExtensionDays: Number(extensionMaxDays) || 0,
        },
        status: publish ? ("published" as const) : status,
      };
      if (edit && listingId) {
        const listing = await api.put<Listing>(`/api/listings/${listingId}`, payload);
        const uploadFailed = await uploadPhotos(listing._id);
        if (uploadFailed) {
          setError(`Listing saved, but the photos did not upload: ${uploadFailed}`);
          return;
        }
        router.push(ROUTES.MY_LISTINGS);
        return;
      }
      // Every new listing requires an OTP sent to the owner's email and
      // verified here — the backend refuses to create one without it.
      if (!otpSent) {
        await sendListingOtp();
        return;
      }
      if (!otpCode.trim() || otpCode.trim().length !== 6) {
        setError("Enter the 6-digit code we emailed you, then click Save again.");
        return;
      }
      const listing = await api.post<Listing>("/api/listings", { ...payload, otpCode: otpCode.trim() });
      const uploadFailed = await uploadPhotos(listing._id);
      if (uploadFailed) {
        // The listing exists — say so, or the owner submits again and ends
        // up with a duplicate.
        setError(
          `Your listing was created, but the photos did not upload: ${uploadFailed} ` +
            `Open it from My Listings to add them.`
        );
        return;
      }
      router.push(ROUTES.MY_LISTINGS);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const basicsComplete = title.trim().length >= 3 && description.trim().length >= 10;
  const pricingComplete = Number(pricePerDay) > 0;
  const photosComplete = selectedPhotos.length > 0 || existingPhotos.length > 0;

  return (
    <div className="animate-[fadeInUp_0.4s_ease-out] space-y-6">
      <Stepper
        current={
          !basicsComplete
            ? 0
            : !pricingComplete
              ? 1
              : !extensionTouched
                ? 2
                : !photosComplete
                  ? 3
                  : 4
        }
        steps={[
          { id: "basics", title: "Basics" },
          { id: "pricing", title: "Pricing" },
          { id: "extension", title: "Extension" },
          { id: "photos", title: "Photos" },
          { id: "review", title: "Review" },
        ]}
      />
      <div className="grid gap-4 rounded-xl border border-border bg-card p-6 shadow-sm md:grid-cols-2">
        <Input label="Item title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Camera, bike, drill..." required />
        <Select
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          options={[
            { value: "cameras", label: "Cameras" },
            { value: "electronics", label: "Electronics" },
            { value: "tools", label: "Tools" },
            { value: "sports", label: "Sports" },
            { value: "outdoor", label: "Outdoor" },
            { value: "home-appliances", label: "Home Appliances" },
            { value: "vehicles", label: "Vehicles" },
            { value: "books", label: "Books" },
          ]}
        />
        <Input label="Daily price" type="number" value={pricePerDay} onChange={(e) => setPricePerDay(e.target.value)} placeholder="250" required />
        <Input label="Security deposit" type="number" value={securityDeposit} onChange={(e) => setSecurityDeposit(e.target.value)} placeholder="1000" />
        <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Pune" />
        <Textarea className="md:col-span-2" label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Condition, included accessories, pickup notes..." required />
        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium">Photos</label>
          <div className="flex flex-wrap items-start gap-4">
            <label className="inline-flex h-24 w-24 shrink-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border bg-muted/50 px-3 text-center text-xs font-medium text-muted-foreground transition-all duration-200 hover:border-primary hover:bg-primary-50 hover:text-primary hover:shadow-sm">
              <Upload size={18} className="mx-auto" />
              <span>Upload</span>
              <input
                type="file"
                // image/* on purpose. A narrow accept list greys out HEIC in
                // the iOS and macOS photo pickers — which is what every
                // iPhone photo is — so most of the library becomes
                // unselectable and it looks like multi-select is broken.
                // Better to let them be picked and convert on selection.
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) void addPhotos(e.target.files);
                  // Reset so picking the same file twice still fires onChange.
                  e.target.value = "";
                }}
              />
            </label>

            {convertingPhotos && (
              <p className="w-full text-sm text-muted-foreground">Preparing photos…</p>
            )}

            {photoError && (
              <p className="w-full text-sm text-danger" role="alert">
                {photoError}
              </p>
            )}

            {selectedPhotos.length > 0 ? (
              <div className="grid w-full max-w-md grid-cols-3 gap-2">
                {selectedPhotos.map((photo, i) => (
                  <div
                    key={photo.id}
                    className="relative aspect-square overflow-hidden rounded-lg border border-border bg-card shadow-sm"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt={photo.file.name} className="h-full w-full object-cover" />
                    {i === 0 && (
                      // photos[0] is what listing cards render, so say which
                      // one that is rather than leaving the owner to guess.
                      <span className="absolute bottom-1 left-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
                        Main
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label={`Remove ${photo.file.name}`}
                      onClick={() => removePhoto(photo.id)}
                      className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full border border-white/40 bg-black/60 text-xs font-semibold leading-none text-white transition-all hover:scale-110 hover:bg-danger"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : existingPhotos.length > 0 ? (
              <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-md shadow-black/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={existingPhotos[0].url} alt={existingPhotos[0].caption || "listing photo"} className="max-h-80 w-full object-cover" />
                <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
                  Current photo
                </span>
              </div>
            ) : (
              <p className="self-center text-sm text-muted-foreground">
                No photo yet. A photo is required to save your listing.
              </p>
            )}

            {existingPhotos.length > 1 && (
              <div className="flex w-full flex-wrap gap-2">
                {existingPhotos.slice(1).map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={p._id}
                    src={p.url}
                    alt={p.caption || "listing photo"}
                    className="h-16 w-16 rounded-lg border border-border object-cover transition-transform hover:scale-105"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-50 text-primary">
                <Repeat size={16} />
              </span>
              <h2 className="text-lg font-semibold">Rental Extension Setting</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Give renters the flexibility to extend their rental before it ends.
            </p>
          </div>
          <Checkbox
            checked={extensionAllowed}
            onChange={(e) => {
              setExtensionAllowed(e.target.checked);
              setExtensionTouched(true);
            }}
            label="Allow Extension"
          />
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-medium">Extension Pricing</p>
              <RadioGroup
                name="extension-pricing"
                value={extensionPricing}
                onChange={(v) => {
                  setExtensionPricing(v as "same" | "custom");
                  setExtensionTouched(true);
                }}
                options={[
                  { value: "same", label: "Same as normal rate" },
                  { value: "custom", label: "Custom extension rate, higher than normal rate" },
                ]}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Input
                label="Extension Daily Rate"
                type="number"
                min={0}
                value={extensionRatePercent}
                onChange={(e) => {
                  setExtensionRatePercent(e.target.value);
                  setExtensionTouched(true);
                }}
                rightIcon={<span className="text-xs font-semibold">%</span>}
              />
              <Select
                label="Request Before"
                value={extensionRequestBefore}
                onChange={(e) => {
                  setExtensionRequestBefore(e.target.value);
                  setExtensionTouched(true);
                }}
                options={[
                  { value: "6", label: "6 hours before booking ends" },
                  { value: "12", label: "12 hours before booking ends" },
                  { value: "24", label: "24 hours before booking ends" },
                ]}
              />
              <Select
                label="Maximum Extension Period"
                value={extensionMaxDays}
                onChange={(e) => {
                  setExtensionMaxDays(e.target.value);
                  setExtensionTouched(true);
                }}
                options={[
                  { value: "1", label: "1 day" },
                  { value: "3", label: "3 days" },
                  { value: "7", label: "7 days" },
                ]}
              />
            </div>
          </div>
          <div className="rounded-xl bg-linear-to-br from-primary-50 to-primary-50 p-4">
            <div className="flex items-center gap-2 text-primary">
              <Clock size={18} />
              <span className="text-sm font-semibold">Live renter preview</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-primary-900">
              Renters will see extension eligibility before they book and can request extra days from
              their booking detail page.
            </p>
          </div>
        </div>
      </div>
      {otpSent && !edit && (
        <div className="animate-[fadeInUp_0.3s_ease-out] rounded-xl border border-primary-200 bg-linear-to-br from-primary-50 to-primary-50 p-6">
          <div className="flex items-center gap-2 text-primary">
            <Mail size={18} />
            <span className="text-sm font-semibold">Email OTP verification</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-primary-900">
            A verification code was sent to <strong>{user?.email ?? "your email"}</strong>. Every
            listing must be confirmed with this code before it is saved — enter it and click Save
            again.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <Input
              label="6-digit OTP"
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
              placeholder="Enter code"
              className="max-w-52"
            />
            <Button variant="outline" loading={loading} onClick={() => void sendListingOtp()}>
              Resend Code
            </Button>
          </div>
        </div>
      )}
      <FieldError message={error} />
      <Notice message={notice} />
      {loadingListing ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading listing…</p>
        </div>
      ) : (
        <div className="flex justify-end gap-3">
          <Button variant="outline" loading={loading} onClick={() => submit(false)} className="transition-transform hover:-translate-y-0.5">
            {edit ? "Save Changes" : "Save Draft"}
          </Button>
          <Button
            loading={loading}
            onClick={() => submit(true)}
            className="shadow-sm shadow-primary/20 transition-transform hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/30"
          >
            {edit ? "Publish Changes" : "Publish Listing"}
          </Button>
        </div>
      )}
      </div>
  );
}

export function KycStepperForm() {
  const [kyc, setKyc] = React.useState<Kyc | null>(null);
  const [pdfFile, setPdfFile] = React.useState<File | null>(null);
  const [cameraStatus, setCameraStatus] = React.useState<"idle" | "requesting" | "ready" | "unsupported">("idle");
  const [selfieFile, setSelfieFile] = React.useState<File | null>(null);
  const [selfiePreviewUrl, setSelfiePreviewUrl] = React.useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [accountHolderName, setAccountHolderName] = React.useState("");
  const [accountNumber, setAccountNumber] = React.useState("");
  const [ifsc, setIfsc] = React.useState("");
  const [bankName, setBankName] = React.useState("");
  const [upiId, setUpiId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    api
      .get<Kyc>("/api/kyc")
      .then((data) => {
        if (cancelled) return;
        setKyc(data);
        // Pre-fill bank details when resubmitting after a rejection.
        if (data.bankDetails) {
          setAccountHolderName(data.bankDetails.accountHolderName ?? "");
          setAccountNumber(data.bankDetails.accountNumber ?? "");
          setIfsc(data.bankDetails.ifsc ?? "");
          setBankName(data.bankDetails.bankName ?? "");
          setUpiId(data.bankDetails.upiId ?? "");
        }
        setNotice(data.status === "pending" ? "Submitted for review. We'll notify you once it's verified." : null);
      })
      .catch(() => {
        // KYC endpoint requires auth; leave as-is if not logged in.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Camera is only opened when the user clicks "Enable Camera" — never
  // automatically when the form loads.
  const startCamera = async () => {
    if (cameraStatus === "ready" || cameraStatus === "requesting") return;
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("unsupported");
      return;
    }
    setCameraStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });
      streamRef.current = stream;
      setCameraStatus("ready");
    } catch {
      setCameraStatus("unsupported");
    }
  };

  React.useEffect(() => {
    if (cameraStatus === "ready" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraStatus, selfiePreviewUrl]);

  React.useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const captureSelfie = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setError("Camera is not ready yet. Wait for the preview, then capture.");
      return;
    }
    setError(null);
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setError("Could not capture the selfie. Try again.");
        return;
      }
      if (selfiePreviewUrl) URL.revokeObjectURL(selfiePreviewUrl);
      const file = new File([blob], "live-selfie.png", { type: "image/png" });
      setSelfieFile(file);
      setSelfiePreviewUrl(URL.createObjectURL(file));
    }, "image/png");
  };

  const retakeSelfie = () => {
    if (selfiePreviewUrl) URL.revokeObjectURL(selfiePreviewUrl);
    setSelfieFile(null);
    setSelfiePreviewUrl(null);
  };

  React.useEffect(() => {
    return () => {
      if (selfiePreviewUrl) URL.revokeObjectURL(selfiePreviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (!pdfFile) {
      setError("Select your document file (PDF) to upload");
      return;
    }
    if (!selfieFile) {
      setError("Capture a live selfie to complete KYC");
      return;
    }
    if (!accountHolderName.trim() || !accountNumber.trim() || !ifsc.trim() || !bankName.trim()) {
      setError("Bank details are required for payment setup: account holder name, account number, IFSC and bank name");
      return;
    }
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", pdfFile);
      form.append("selfie", selfieFile);
      form.append("accountHolderName", accountHolderName.trim());
      form.append("accountNumber", accountNumber.trim());
      form.append("ifsc", ifsc.trim());
      form.append("bankName", bankName.trim());
      if (upiId.trim()) form.append("upiId", upiId.trim());
      const data = await api.post<Kyc>("/api/kyc/submit", form, { headers: {} });
      setKyc(data);
      setNotice("Submitted for review. We'll notify you once it's verified.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError("Not authenticated. Sign in to complete KYC.");
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-[fadeInUp_0.4s_ease-out] space-y-6">
      {kyc && kyc.status === "approved" && (
        <div className="flex items-start gap-3 rounded-lg border border-secondary-200 bg-secondary-50 p-4">
          <CheckCircle size={18} className="mt-0.5 shrink-0 text-secondary-700" />
          <p className="text-sm text-secondary-700">Your KYC is approved.</p>
        </div>
      )}
      {kyc && kyc.status === "pending" && (
        <div className="flex items-start gap-3 rounded-lg border border-accent-200 bg-accent-50 p-4">
          <Clock size={18} className="mt-0.5 shrink-0 text-accent-700" />
          <p className="text-sm text-accent-700">
            Your document verification is under review. You&apos;ll be able to list items once an admin approves it.
          </p>
        </div>
      )}
      {kyc && kyc.status === "rejected" && (
        <div className="flex items-start gap-3 rounded-lg border border-danger-200 bg-danger-50 p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" />
          <p className="text-sm text-danger">
            KYC rejected: {kyc.rejectionReason || "Please resubmit your details."}
          </p>
        </div>
      )}
      <div className="grid gap-4 rounded-xl border border-border bg-card p-6 shadow-sm md:grid-cols-2">
        <div className="md:col-span-2 flex items-start gap-3 rounded-lg bg-muted/50 p-4">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" />
          <p className="text-sm leading-6 text-muted-foreground">
            Upload your identity document as a <strong>PDF</strong> (e.g. Aadhaar, PAN, passport or
            driving licence) along with a <strong>live selfie</strong> taken right now. Add your{" "}
            <strong>bank details for payment setup</strong> so payouts can be sent to you. Our team
            will review it and approve your KYC, after which you can list and book items.
          </p>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium">Identity document (PDF)</p>
          <label className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-md border-2 border-dashed border-border bg-muted/50 px-3 text-sm font-medium text-muted-foreground transition-all duration-200 hover:border-primary hover:bg-primary-50 hover:text-primary hover:shadow-sm">
            <Upload size={16} className="shrink-0" />
            <span className="truncate">{pdfFile ? pdfFile.name : "Upload PDF file"}</span>
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        <div className="md:col-span-2">
          <div className="mb-2 flex items-center gap-2">
            <IdCard size={16} className="text-muted-foreground" />
            <p className="text-sm font-medium">Live selfie</p>
          </div>
          {cameraStatus === "idle" && (
            <div className="rounded-lg border-2 border-dashed border-border bg-muted/50 p-5">
              <div className="flex items-start gap-3">
                <Camera size={20} className="mt-0.5 shrink-0 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  A live selfie taken with your webcam is required. Your camera stays off until you
                  allow it.
                </p>
              </div>
              <Button variant="outline" className="mt-3 transition-transform hover:-translate-y-0.5" onClick={() => void startCamera()}>
                Enable Camera
              </Button>
            </div>
          )}
          {cameraStatus === "requesting" && (
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-4">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">
                Requesting camera access — allow it in your browser prompt…
              </p>
            </div>
          )}
          {cameraStatus === "unsupported" && (
            <div className="flex items-start gap-3 rounded-lg border border-danger-200 bg-danger-50 p-4">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" />
              <p className="text-sm text-danger">
                Camera not supported — no webcam was detected or access was denied. A live selfie is
                required to complete KYC, so submission is disabled until a camera is available.
              </p>
            </div>
          )}
          {cameraStatus === "ready" && !selfiePreviewUrl && (
            <div className="max-w-md overflow-hidden rounded-xl border border-border bg-black shadow-md">
              <video ref={videoRef} autoPlay playsInline muted className="aspect-video w-full object-cover" />
            </div>
          )}
          {selfiePreviewUrl && (
            <div className="max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-md shadow-black/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selfiePreviewUrl} alt="Captured live selfie" className="max-h-72 w-full object-contain" />
            </div>
          )}
          <div className="mt-3 flex gap-2">
            {cameraStatus === "ready" && !selfieFile && (
              <Button variant="outline" onClick={captureSelfie} className="transition-transform hover:-translate-y-0.5">
                Capture Selfie
              </Button>
            )}
            {selfieFile && (
              <Button variant="outline" onClick={retakeSelfie} className="transition-transform hover:-translate-y-0.5">
                Retake
              </Button>
            )}
          </div>
        </div>
        <div className="md:col-span-2 flex items-start gap-3 rounded-lg bg-muted/50 p-4">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" />
          <p className="text-sm leading-6 text-muted-foreground">
            Payment setup: your bank details are used to receive your rental
            earnings (payouts) once your KYC is approved. Approved payouts
            are sent to this account through the Razorpay gateway.
          </p>
        </div>
        <Input
          label="Account holder name"
          value={accountHolderName}
          onChange={(e) => setAccountHolderName(e.target.value)}
          placeholder="Name as printed on the bank account"
          required
        />
        <Input
          label="Bank name"
          value={bankName}
          onChange={(e) => setBankName(e.target.value)}
          placeholder="e.g. HDFC Bank"
          required
        />
        <Input
          label="Account number"
          type="text"
          inputMode="numeric"
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
          placeholder="Bank account number"
          required
        />
        <Input
          label="IFSC code"
          value={ifsc}
          onChange={(e) => setIfsc(e.target.value.toUpperCase())}
          placeholder="e.g. HDFC0001234"
          required
        />
        <div className="md:col-span-2">
          <Input
            label="UPI ID (optional)"
            value={upiId}
            onChange={(e) => setUpiId(e.target.value)}
            placeholder="yourname@upi"
          />
        </div>
      </div>
      <FieldError message={error} />
      <Notice message={notice} />
      <div className="flex justify-end gap-3">
        <Button
          loading={loading}
          disabled={cameraStatus === "unsupported"}
          onClick={() => submit()}
          className="shadow-sm shadow-primary/20 transition-transform hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/30"
        >
          Submit for Review
        </Button>
      </div>
      </div>
  );
}