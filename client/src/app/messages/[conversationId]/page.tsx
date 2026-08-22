"use client";

import * as React from "react";
import { io, type Socket } from "socket.io-client";
import { DashboardShell } from "@/components/marketplace/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RequireAuth, useAuth, errorMessage } from "@/lib/auth";
import { api, getToken } from "@/lib/api-client";
import { useFetchData } from "@/lib/use-fetch-data";
import { formatDateTime } from "@/lib/formatters";
import type { Conversation, Message } from "@/lib/api-types";

function MessageBubble({ message, mine }: { message: Message; mine: boolean }) {
  return (
    <div className={`max-w-md rounded-lg p-3 text-sm ${mine ? "ml-auto bg-primary text-white" : "bg-muted"}`}>
      <p>{message.text}</p>
      <p className={`mt-1 text-[10px] ${mine ? "text-primary-100" : "text-muted-foreground"}`}>{formatDateTime(message.createdAt)}</p>
    </div>
  );
}

function ThreadInner({ conversationId }: { conversationId: string }) {
  const { user } = useAuth();
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const socketRef = React.useRef<Socket | null>(null);

  const { data: conversation } = useFetchData<Conversation | null>(`/api/chat/conversations/${conversationId}`, [conversationId]);
  const { data: messages, isLoading, refetch } = useFetchData<Message[]>(`/api/chat/conversations/${conversationId}/messages`, [conversationId]);

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages?.length]);

  React.useEffect(() => {
    if (!conversation) return;
    const token = getToken();
    if (!token) return;
    const socket = io({
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;
    socket.on("connect", () => socket.emit("conversation:join", conversationId));
    socket.on("message:new", () => refetch());
    return () => {
      socket.emit("conversation:leave", conversationId);
      socket.disconnect();
    };
  }, [conversation, conversationId, refetch]);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setError(null);
    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit("message:send", { conversationId, text: trimmed }, (ack: { success?: boolean; error?: string }) => {
        if (ack?.error) setError(ack.error);
        else setText("");
      });
    } else {
      // HTTP fallback for when the websocket has not connected — a proxy that
      // blocks upgrades, a flaky network, or simply a socket still handshaking.
      // This previously posted an empty body to a route that did not exist,
      // so the message was silently dropped and the box cleared anyway.
      try {
        await api.post<Message>(`/api/chat/conversations/${conversationId}/messages`, { text: trimmed });
        setText("");
      } catch (err) {
        // Keep the text in the box: clearing it destroys what the user wrote.
        setError(errorMessage(err));
        return;
      }
    }
    setTimeout(refetch, 300);
  };

  const otherName = conversation?.participants
    ?.map((p) => (typeof p === "object" && p !== null && p._id !== user?._id ? p.name : null))
    .find(Boolean) || "Conversation";

  return (
    <DashboardShell title="Conversation">
      <div className="flex min-h-155 flex-col rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4">
          <h1 className="font-semibold">{otherName}</h1>
          {conversation?.listing && typeof conversation.listing === "object" && (
            <p className="text-sm text-muted-foreground">{conversation.listing.title}</p>
          )}
        </div>
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {error && <p className="rounded-md bg-danger-50 p-3 text-sm text-danger">{error}</p>}
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {(messages ?? []).map((message) => (
            <MessageBubble key={message._id} message={message} mine={typeof message.sender === "object" ? message.sender._id === user?._id : message.sender === user?._id} />
          ))}
          {!isLoading && (messages ?? []).length === 0 && (
            <p className="text-center text-sm text-muted-foreground">No messages yet. Say hello!</p>
          )}
        </div>
        <div className="flex gap-2 border-t border-border p-4">
          <Input placeholder="Write a message" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
          <Button onClick={send}>Send</Button>
        </div>
      </div>
    </DashboardShell>
  );
}

export default function MessageThreadPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = React.use(params);
  return (
    <RequireAuth>
      <ThreadInner conversationId={conversationId} />
    </RequireAuth>
  );
}
