"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PublicShell } from "@/components/marketplace/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/auth";
import { ROUTES } from "@/lib/constants";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Checked here as well as server-side so the user finds out before a
    // round trip, and before the single-use token is spent.
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post<null>("/api/auth/password/reset/confirm", { token, newPassword: password });
      setDone(true);
      setTimeout(() => router.replace(ROUTES.LOGIN), 2500);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <div className="mx-auto w-full max-w-md rounded-xl border border-border bg-card p-7 text-center">
        <h1 className="text-xl font-bold">Link incomplete</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page needs the token from your reset email. Open the link in that email, or{" "}
          <Link href={ROUTES.FORGOT_PASSWORD} className="font-semibold text-primary hover:underline">
            request a new one
          </Link>
          .
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto w-full max-w-md rounded-xl border border-border bg-card p-7 text-center">
        <h1 className="text-xl font-bold">Password updated</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Taking you to sign in…{" "}
          <Link href={ROUTES.LOGIN} className="font-semibold text-primary hover:underline">
            Go now
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-md rounded-xl border border-border bg-card p-7 shadow-lg shadow-black/5">
      <h1 className="text-2xl font-bold tracking-tight">Choose a new password</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Reset links expire 30 minutes after they are sent and work once.
      </p>
      <div className="mt-6 space-y-4">
        <Input
          label="New password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          minLength={8}
          required
        />
        <Input
          label="Confirm new password"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repeat the password"
          minLength={8}
          required
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy || !password || !confirm}>
          {busy ? "Updating…" : "Update password"}
        </Button>
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        {/* useSearchParams needs a Suspense boundary or the route cannot be
            statically prerendered. */}
        <React.Suspense fallback={null}>
          <ResetPasswordForm />
        </React.Suspense>
      </section>
    </PublicShell>
  );
}
