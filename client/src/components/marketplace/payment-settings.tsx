"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/form-controls";
import { AlertTriangle, CheckCircle } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/auth";
import { useFetchData } from "@/lib/use-fetch-data";

type ManualPayment = {
  upiId: string | null;
  payeeName: string | null;
  supportsIntent: boolean;
  note: string | null;
  /** "environment" until someone saves here for the first time. */
  source: "database" | "environment";
};

const UPI_ID = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z][a-zA-Z0-9.-]{1,32}$/;

/**
 * Where renters send money during the manual-payment prototype.
 *
 * This lived in the server's environment, so changing the account meant a
 * redeploy and someone with shell access. It decides where every rupee goes,
 * so the field is validated here and again on the server, and each change is
 * written to the audit log.
 */
export function PaymentSettingsCard() {
  const { data, isLoading, refetch } =
    useFetchData<{ manualPayment: ManualPayment }>("/api/admin/settings", []);

  const [upiId, setUpiId] = React.useState("");
  const [payeeName, setPayeeName] = React.useState("");
  const [supportsIntent, setSupportsIntent] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const current = data?.manualPayment;

  // Fill the form once the current values arrive, and again after a save.
  React.useEffect(() => {
    if (!current) return;
    setUpiId(current.upiId ?? "");
    setPayeeName(current.payeeName ?? "");
    setSupportsIntent(current.supportsIntent);
    setNote(current.note ?? "");
    setTouched(false);
  }, [current]);

  const upiError =
    touched && upiId.trim() && !UPI_ID.test(upiId.trim())
      ? "A UPI ID looks like name@bank."
      : undefined;

  const dirty =
    !!current &&
    (upiId.trim() !== (current.upiId ?? "") ||
      payeeName.trim() !== (current.payeeName ?? "") ||
      supportsIntent !== current.supportsIntent ||
      note.trim() !== (current.note ?? ""));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (upiId.trim() && !UPI_ID.test(upiId.trim())) return;

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.put("/api/admin/settings/manual-payment", {
        upiId: upiId.trim() || null,
        payeeName: payeeName.trim() || null,
        supportsIntent,
        note: note.trim() || null,
      });
      setSaved(true);
      refetch();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Payments</CardTitle>
          {current?.source === "environment" && (
            <Badge variant="secondary">Using the deployed default</Badge>
          )}
        </div>
        <CardDescription>
          The account renters are asked to pay into. Saving here takes effect on the next
          checkout — no release needed.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading current settings…</p>
        ) : (
          <form onSubmit={save} className="flex max-w-xl flex-col gap-5">
            <Input
              label="UPI ID"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="idlex@ybl"
              error={upiError}
              hint="Renters scan this as a QR code and can copy it to pay by hand."
              autoComplete="off"
              spellCheck={false}
            />

            <Input
              label="Name shown to the payer"
              value={payeeName}
              onChange={(e) => setPayeeName(e.target.value)}
              placeholder="IdleX"
              hint="What appears next to the amount in their UPI app."
            />

            <Input
              label="Note on the payment screen"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Payments are verified within 2 hours."
              hint="Optional. Shown under the payment instructions."
              maxLength={280}
            />

            <div className="rounded-lg border border-border bg-muted p-4">
              <Checkbox
                checked={supportsIntent}
                onChange={(e) => setSupportsIntent(e.target.checked)}
                label="This is a merchant account"
              />
              <p className="mt-2 text-sm text-muted-foreground">
                Only tick this for a registered business UPI account. UPI lets an app hand a
                payment straight to PhonePe or GPay only when the payee is a merchant; against a
                personal ID the payment is declined for security reasons, which reads to the
                renter as a broken app. While this is off, the app offers the QR code and the
                copyable ID instead — both work either way.
              </p>
            </div>

            {error && (
              <p className="flex items-start gap-2 text-sm text-danger">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                {error}
              </p>
            )}
            {saved && !dirty && (
              <p className="flex items-center gap-2 text-sm text-success">
                <CheckCircle size={16} />
                Saved. New checkouts will use these details.
              </p>
            )}

            <div className="flex items-center gap-3">
              <Button type="submit" loading={saving} disabled={!dirty}>
                Save changes
              </Button>
              {dirty && <span className="text-sm text-muted-foreground">Unsaved changes</span>}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
