"use client";

import { useEffect, useState } from "react";
import type { EmailMessage, EmailThread, Lead, Quotation } from "@/lib/types";
import { getTemplates, renderTemplate, type TemplateContext } from "@/lib/templates";
import { createClient } from "@/lib/supabase";

interface Props {
  thread: EmailThread | null;
  emails: EmailMessage[];
  lead: Lead | null;
  onSent: () => void;
}

export default function ConversationView({ thread, emails, lead, onSent }: Props) {
  const supabase = createClient();
  const [reply, setReply] = useState("");
  const [subject, setSubject] = useState("");
  const [sending, setSending] = useState(false);
  const [latestQuote, setLatestQuote] = useState<Quotation | null>(null);

  const templates = getTemplates();

  useEffect(() => {
    setSubject(thread ? `Re: ${thread.subject}` : "");
    setReply("");
    setLatestQuote(null);
  }, [thread?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!lead) return;
    supabase
      .from("quotations")
      .select("*")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => setLatestQuote(((data as Quotation[] | null) ?? [])[0] ?? null));
  }, [lead, supabase]);

  if (!thread) {
    return (
      <section style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#888" }}>
        Select a thread to view the conversation
      </section>
    );
  }

  const buildContext = (): TemplateContext => ({
    companyName: lead?.company_name,
    contactName: lead?.contact_name ?? undefined,
    contactEmail: lead?.contact_email ?? undefined,
    threadSubject: thread.subject,
    standards: (lead?.specs?.standards as string[] | undefined) ?? undefined,
    mandays: latestQuote?.mandays,
    totalAmount: latestQuote?.total_amount,
    quoteNumber: latestQuote?.quote_number,
    quoteLink: latestQuote?.approval_token
      ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/quotes/accept?token=${latestQuote.approval_token}`
      : undefined,
  });

  const applyTemplate = (id: string) => {
    const rendered = renderTemplate(id, buildContext());
    if (rendered) {
      setSubject(rendered.subject);
      setReply(rendered.body);
    }
  };

  const payload = () => ({
    threadId: thread.id,
    leadId: lead?.id,
    toEmail: lead?.contact_email ?? "",
    subject,
    bodyText: reply,
  });

  const sendReply = async (format?: "eml") => {
    if (!reply.trim() || !lead) return;
    setSending(true);
    try {
      const res = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload(), ...(format ? { format } : {}) }),
      });

      if (format === "eml") {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          alert(`Failed: ${j.error ?? res.status}`);
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `message-${Date.now()}.eml`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }

      const json = await res.json();
      if (!res.ok) {
        alert(`Send failed: ${json.error ?? res.status}`);
        return;
      }
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
        <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
          <label style={{ fontSize: 12, color: "#666" }}>Template:</label>
          <select
            value=""
            onChange={(e) => e.target.value && applyTemplate(e.target.value)}
            style={{ flex: 1 }}
          >
            <option value="">Insert template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          style={{ width: "100%", marginBottom: 8, padding: "6px 8px" }}
        />
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Write a reply or pick a template above — edit freely before sending..."
          rows={6}
          style={{ width: "100%", marginBottom: 8 }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => sendReply("eml")} disabled={sending || !reply.trim()}>
            Download .eml
          </button>
          <button onClick={() => sendReply()} disabled={sending || !reply.trim() || !subject.trim()}>
            {sending ? "Sending..." : "Send email"}
          </button>
        </div>
      </footer>
    </section>
  );
}
