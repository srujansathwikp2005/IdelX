"use client";

import Link from "next/link";
import { DashboardShell } from "@/components/marketplace/dashboard-shell";
import * as React from "react";

import { Avatar } from "@/components/ui/avatar";
import { Trash } from "@/components/ui/icons";
import { api } from "@/lib/api-client";
import { RequireAuth } from "@/lib/auth";
import { useFetchData } from "@/lib/use-fetch-data";
import { timeAgo } from "@/lib/formatters";
import type { Conversation } from "@/lib/api-types";
import { ROUTES } from "@/lib/constants";

function otherParticipant(conversation: Conversation) {
  return conversation.participants.find((p) => typeof p === "object" && p !== null) ?? null;
}

function MessagesInner() {
  const { data, isLoading, error, refetch } = useFetchData<Conversation[]>("/api/chat/conversations", []);
  const [busy, setBusy] = React.useState<string | null>(null);

  // Deleting hides this account's copy; the other participant keeps theirs,
  // and a new message brings it back. Said outright in the prompt, because
  // the obvious worry is that it wipes the other person's record.
  async function remove(id: string, name: string) {
    if (!window.confirm(
      `Delete your chat with ${name}? It disappears from your list. The other person keeps theirs, and if either of you writes again the conversation comes back.`
    )) return;
    setBusy(id);
    try {
      await api.del(`/api/chat/conversations/${id}`);
      refetch();
    } catch {
      // The list is re-read either way; a failure leaves the row in place.
      refetch();
    } finally {
      setBusy(null);
    }
  }

  return (
    <DashboardShell title="Messages">
      <div className="rounded-lg border border-border bg-card">
        {error && <p className="rounded-md bg-danger-50 p-3 text-sm text-danger">{error.message}</p>}
        {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
        {(data ?? []).map((conversation) => {
          const other = otherParticipant(conversation);
          const name = other && typeof other === "object" ? other.name : "Conversation";
          return (
            <div key={conversation._id} className="group flex gap-3 border-b border-border p-4 last:border-0 hover:bg-muted">
              <Link href={ROUTES.MESSAGE_THREAD(conversation._id)} className="flex min-w-0 flex-1 gap-3">
                <Avatar name={name} />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-3">
                    <p className="font-semibold">{name}</p>
                    <span className="text-xs text-muted-foreground">{timeAgo(conversation.lastMessageAt)}</span>
                  </div>
                  {conversation.listing && typeof conversation.listing === "object" && (
                    <p className="text-sm text-muted-foreground">{conversation.listing.title}</p>
                  )}
                  <p className="mt-1 truncate text-sm">{conversation.lastMessage || "Start the conversation"}</p>
                </div>
              </Link>
              {/* Appears on hover and on keyboard focus: deleting a chat is
                  rare, and a button on every row invites the accident it
                  guards against. */}
              <button
                type="button"
                aria-label={`Delete chat with ${name}`}
                disabled={busy === conversation._id}
                onClick={() => remove(conversation._id, name)}
                className="shrink-0 self-start rounded-md p-2 text-muted-foreground opacity-0 transition-opacity hover:bg-danger-50 hover:text-danger-700 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50"
              >
                <Trash size={16} />
              </button>
            </div>
          );
        })}
        {!isLoading && !error && (data ?? []).length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No conversations yet. Message an owner from a listing to get started.
          </p>
        )}
      </div>
    </DashboardShell>
  );
}

export default function MessagesPage() {
  return (
    <RequireAuth>
      <MessagesInner />
    </RequireAuth>
  );
}
