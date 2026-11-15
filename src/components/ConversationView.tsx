"use client";

import { useState } from "react";
import type { EmailMessage, EmailThread, Lead } from "@/lib/types";

interface Props {
  thread: EmailThread | null;
  emails: EmailMessage[];
  lead: Lead | null;
  onSent: () => void;
}

export default function ConversationView({ thread, emails, lead, onSent }: Props) {
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  if (!thread) {
    return (
      <section style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#888" }}>
        Select a thread to view the conversation
      </section>
    );
  }

  const sendReply = async () => {
    if (!reply.trim() || !lead) return;
    setSending(true);
    try {
      await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: thread.id,
          leadId: lead.id,
          toEmail: lead.contact_email ?? "",
          subject: `Re: ${thread.subject}`,
          bodyText: reply,
        }),
      });
      setReply("");
      onSent();
    } finally {
      setSending(false);
    }
  };

  return (
    <section style={{ flex: 2, display: "flex", flexDirection: "column", borderRight: "1px solid #ddd" }}>
      <header style={{ padding: "12px 16px", borderBottom: "1px solid #ddd" }}>
        <strong>{thread.subject}</strong>
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {emails.map((email) => (
          <article
            key={email.id}
            style={{
              marginBottom: 16,
              padding: 12,
              borderRadius: 8,
              background: email.direction === "inbound" ? "#f4f4f4" : "#eef4ff",
            }}
          >
            <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
              {email.direction === "inbound" ? "←" : "→"} {email.sender_email} →{" "}
              {email.recipient_email} · {new Date(email.sent_at).toLocaleString()}
            </div>
            <div style={{ whiteSpace: "pre-wrap" }}>{email.body_text ?? email.body_html}</div>
          </article>
        ))}
      </div>

      <footer style={{ padding: 12, borderTop: "1px solid #ddd" }}>
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Write a reply..."
          rows={4}
          style={{ width: "100%", marginBottom: 8 }}
        />
        <button onClick={sendReply} disabled={sending || !reply.trim()}>
          {sending ? "Sending..." : "Send reply"}
        </button>
      </footer>
    </section>
  );
}
