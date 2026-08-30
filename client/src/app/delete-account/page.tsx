"use client";

import Link from "next/link";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { errorMessage, useAuth } from "@/lib/auth";
import { ROUTES } from "@/lib/constants";

type DeletionStatus = { canDelete: boolean; reasons: string[] };

/**
 * Deleting an IdleX account, from a browser.
 *
 * Google Play requires this to exist somewhere a person can reach without
 * installing anything, which is why it is a public page rather than a screen
 * behind the dashboard. It is also simply the fairer place for it: somebody
 * who has already uninstalled the app should not have to reinstall it to
 * leave.
 */
export default function DeleteAccountPage() {
  const { user, logout } = useAuth();
  const [status, setStatus] = React.useState<DeletionStatus | null>(null);
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    if (!user) return;
    api
      .get<DeletionStatus>("/api/auth/me/deletion")
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [user]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/me/delete", { password });
      setDone(true);
      logout();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Delete your IdleX account</h1>
      <p className="mt-3 text-muted-foreground">
        This cannot be undone. Read what happens to your information before you confirm.
      </p>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>What is deleted</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
            <li>Your name, email address and phone number</li>
            <li>Your identity documents and the selfie taken during KYC, removed from storage</li>
            <li>Your payout details, including any UPI ID or bank account</li>
            <li>Your profile photo, saved items and notifications</li>
            <li>Your listings, which are taken down and stop accepting bookings</li>
          </ul>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>What is kept, and why</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Records of completed rentals — bookings, payments, deposits and refunds — stay in
            our books. Each of those involved somebody else, who has their own record of it, and
            we are required to be able to account for money that moved. They are no longer
            attached to your name: reviews and messages you wrote show as{" "}
            <span className="font-medium text-foreground">Deleted user</span>, and nothing in
            them points back to you.
          </p>
        </CardContent>
      </Card>

      {done ? (
        <Card className="mt-4">
          <CardContent>
            <p className="flex items-center gap-2 font-medium text-success">
              <CheckCircle size={18} />
              Your account has been deleted.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              You have been signed out. Thank you for trying IdleX.
            </p>
            <Link href={ROUTES.HOME} className="mt-4 inline-block">
              <Button variant="outline">Back to IdleX</Button>
            </Link>
          </CardContent>
        </Card>
      ) : !user ? (
        <Card className="mt-4">
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Sign in first, so we know which account to delete.
            </p>
            <Link
              href={`${ROUTES.LOGIN}?next=${encodeURIComponent("/delete-account")}`}
              className="mt-4 inline-block"
            >
              <Button>Sign in to continue</Button>
            </Link>
            <p className="mt-4 text-sm text-muted-foreground">
              Cannot sign in? Email{" "}
              <a href="mailto:idlexsupport@gmail.com" className="font-medium text-primary">
                idlexsupport@gmail.com
              </a>{" "}
              from the address on the account and we will delete it for you.
            </p>
          </CardContent>
        </Card>
      ) : status && !status.canDelete ? (
        <Card className="mt-4">
          <CardContent>
            <p className="flex items-start gap-2 font-medium text-warning">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              Finish these first
            </p>
            <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
              {status.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">
              Somebody is on the other side of each of these. Once they are done, come back here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Confirm</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="flex max-w-sm flex-col gap-4">
              <Input
                type="password"
                label="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                hint={`Deleting ${user.email}.`}
                required
              />
              {error && (
                <p className="flex items-start gap-2 text-sm text-danger">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  {error}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" variant="danger" loading={busy} disabled={!password}>
                  Delete my account
                </Button>
                <Link href={ROUTES.HOME}>
                  <Button type="button" variant="ghost">
                    Keep my account
                  </Button>
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
