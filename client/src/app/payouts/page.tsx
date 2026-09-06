"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { DashboardShell } from "@/components/marketplace/dashboard-shell";
import { api } from "@/lib/api-client";
import { RequireAuth, errorMessage } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { useFetchData } from "@/lib/use-fetch-data";
import type { Payout } from "@/lib/api-types";

type PayoutSettings = {
  accountHolderName?: string;
  accountNumber?: string;
  ifscOrRoutingNumber?: string;
  bankName?: string;
  upiId?: string;
};

const UPI_ID = /^[\w.\-]{2,64}@[a-zA-Z]{2,32}$/;

function PayoutsInner() {
  const { data: settings, refetch } = useFetchData<PayoutSettings>("/api/payments/payout-settings", []);
  const { data: history } = useFetchData<Payout[]>("/api/payments/payouts", []);

  const [form, setForm] = React.useState<PayoutSettings>({});
  const [loaded, setLoaded] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    if (!settings || loaded) return;
    setForm({
      accountHolderName: settings.accountHolderName ?? "",
      accountNumber: settings.accountNumber ?? "",
      ifscOrRoutingNumber: settings.ifscOrRoutingNumber ?? "",
      bankName: settings.bankName ?? "",
      upiId: settings.upiId ?? "",
    });
    setLoaded(true);
  }, [settings, loaded]);

  const set = (k: keyof PayoutSettings) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setSaved(false);
  };

  const bankFields = [form.accountHolderName, form.accountNumber, form.ifscOrRoutingNumber, form.bankName]
    .map((v) => (v ?? "").trim());
  const anyBank = bankFields.some(Boolean);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const upi = (form.upiId ?? "").trim();
    if (!upi) return setError("Add your UPI ID — payouts are sent by UPI.");
    if (!UPI_ID.test(upi)) return setError("That does not look like a UPI ID. It should look like name@bank.");
    // All four or none, the same rule the server enforces.
    if (anyBank && !bankFields.every(Boolean)) {
      return setError("Fill in all four bank fields, or leave them all empty.");
    }

    setSaving(true);
    try {
      await api.put("/api/payments/payout-settings", { ...form, upiId: upi });
      setSaved(true);
      refetch();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell title="Payouts">
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Where your earnings go</CardTitle>
            <CardDescription>
              Change these whenever you need to — a UPI ID moves, an account closes. Your
              identity documents stay with the verification you already completed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={save} className="flex max-w-lg flex-col gap-4">
              <Input
                label="UPI ID"
                value={form.upiId ?? ""}
                onChange={set("upiId")}
                placeholder="yourname@upi"
                hint="Payouts are sent here."
                autoComplete="off"
                spellCheck={false}
              />

              <div className="border-t border-border pt-4">
                <p className="text-sm font-medium">Bank account (optional)</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Only used as a fallback if a UPI transfer cannot go through.
                </p>
              </div>

              <Input label="Account holder name" value={form.accountHolderName ?? ""} onChange={set("accountHolderName")} />
              <Input label="Bank name" value={form.bankName ?? ""} onChange={set("bankName")} />
              <Input label="Account number" value={form.accountNumber ?? ""} onChange={set("accountNumber")} inputMode="numeric" />
              <Input label="IFSC code" value={form.ifscOrRoutingNumber ?? ""} onChange={set("ifscOrRoutingNumber")} placeholder="e.g. HDFC0001234" />

              {error && (
                <p className="flex items-start gap-2 text-sm text-danger">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  {error}
                </p>
              )}
              {saved && (
                <p className="flex items-center gap-2 text-sm text-success">
                  <CheckCircle size={16} />
                  Saved. Future payouts use these details.
                </p>
              )}

              <Button type="submit" loading={saving} className="self-start">
                Save changes
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="h-max">
          <CardHeader>
            <CardTitle>Payout history</CardTitle>
          </CardHeader>
          <CardContent>
            {(history ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing paid out yet. Earnings appear here once a rental completes.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {(history ?? []).map((p) => (
                  <li key={p._id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{formatDate(p.createdAt)}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums">{formatCurrency(p.amount)}</span>
                      <Badge variant={p.status === "paid" ? "success" : p.status === "failed" ? "danger" : "warning"}>
                        {p.status}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}

export default function PayoutsPage() {
  return (
    <RequireAuth>
      <PayoutsInner />
    </RequireAuth>
  );
}
