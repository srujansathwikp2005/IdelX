"use client";

import * as React from "react";
import { DashboardShell } from "@/components/marketplace/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth, errorMessage } from "@/lib/auth";
import { api } from "@/lib/api-client";
import { useFetchData } from "@/lib/use-fetch-data";
import { formatDate } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { SupportTicket } from "@/lib/api-types";

function HelpContent() {
  const { user } = useAuth();
  // Only fetch the caller's tickets when there is a caller.
  const { data: tickets, isLoading, refetch } = useFetchData<SupportTicket[]>(user ? "/api/support/mine" : null, [user?._id]);
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  // Which ticket's thread is expanded; only one at a time keeps the page calm.
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [reply, setReply] = React.useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post<SupportTicket>("/api/support", { subject: subject.trim(), message: message.trim() });
      setSubject("");
      setMessage("");
      setSent(true);
      refetch();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async (id: string) => {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await api.post<SupportTicket>(`/api/support/${id}/replies`, { message: reply.trim() });
      setReply("");
      refetch();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashboardShell title="Help & Support">
      {!user && (
        <div className="mb-6 rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
          <a href="/login?next=/help" className="font-semibold text-primary hover:underline">Sign in</a>{" "}
          to raise a support request and see your previous ones.
        </div>
      )}

      <div className={cn("grid gap-6 lg:grid-cols-[1fr_1.2fr]", !user && "pointer-events-none opacity-50")}>
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-semibold">Raise a request</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tell us what went wrong and our team will reply here.
          </p>
          <form onSubmit={submit} className="mt-4 space-y-4">
            <Input
              label="Subject"
              value={subject}
              onChange={(e) => { setSubject(e.target.value); setSent(false); }}
              placeholder="Deposit not refunded"
              required
            />
            <Textarea
              label="What happened?"
              value={message}
              onChange={(e) => { setMessage(e.target.value); setSent(false); }}
              placeholder="Include the booking or listing involved, and any dates."
              required
            />
            {error && <p className="text-sm text-danger">{error}</p>}
            {sent && !error && (
              <p className="text-sm text-success">Request submitted — we&apos;ll reply below.</p>
            )}
            <Button type="submit" disabled={busy || !subject.trim() || !message.trim()}>
              {busy ? "Submitting…" : "Submit request"}
            </Button>
          </form>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-semibold">Your requests</h2>
          {isLoading ? (
            <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
          ) : (tickets ?? []).length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">You haven&apos;t raised any requests yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {(tickets ?? []).map((t) => (
                <li key={t._id} className="rounded-md border border-border p-4">
                  <button
                    type="button"
                    onClick={() => { setOpenId(openId === t._id ? null : t._id); setReply(""); }}
                    className="flex w-full items-start justify-between gap-3 text-left"
                  >
                    <span>
                      <span className="font-medium">{t.subject}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {formatDate(t.createdAt)} · {t.replies?.length ?? 0} repl
                        {(t.replies?.length ?? 0) === 1 ? "y" : "ies"}
                      </span>
                    </span>
                    <Badge variant={t.status === "answered" ? "success" : t.status === "closed" ? "default" : "warning"}>
                      {t.status}
                    </Badge>
                  </button>

                  {openId === t._id && (
                    <div className="mt-4 space-y-3 border-t border-border pt-4">
                      <div className="rounded-md bg-muted p-3 text-sm">{t.message}</div>
                      {t.replies?.map((r) => (
                        <div
                          key={r._id}
                          className={cn("rounded-md p-3 text-sm", r.isAdmin ? "ml-4 bg-primary-50" : "mr-4 bg-muted")}
                        >
                          <p className="mb-1 text-xs font-semibold text-muted-foreground">
                            {r.isAdmin ? "Support" : "You"} · {formatDate(r.createdAt)}
                          </p>
                          {r.message}
                        </div>
                      ))}
                      {t.status !== "closed" && (
                        <div className="space-y-2">
                          <Textarea
                            label="Add a reply"
                            value={reply}
                            onChange={(e) => setReply(e.target.value)}
                            placeholder="Anything else we should know?"
                          />
                          <Button size="sm" onClick={() => sendReply(t._id)} disabled={busy || !reply.trim()}>
                            Send reply
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}

export default function HelpPage() {
  // Deliberately not wrapped in RequireAuth: /help is a public route, and
  // bouncing a visitor from the help page to a login form is the behaviour
  // we just removed elsewhere. Raising a request needs an account, so the
  // form is gated in place while the page itself stays readable.
  return <HelpContent />;
}
