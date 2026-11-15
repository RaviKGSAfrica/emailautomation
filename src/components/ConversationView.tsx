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
      <section className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="text-center text-slate-400">
          <div className="text-5xl mb-3">✉️</div>
          <p className="text-sm">Select a conversation to read and reply</p>
        </div>
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
    <section className="flex-1 flex flex-col bg-slate-100 min-w-0">
      {/* Conversation header */}
      <header className="px-6 py-4 bg-white border-b border-slate-200">
        <h2 className="text-base font-semibold text-slate-900 truncate">{thread.subject}</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          {lead?.company_name} · {lead?.contact_email}
        </p>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {emails.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-10">No messages in this thread yet</p>
        )}
        {emails.map((email) => {
          const inbound = email.direction === "inbound";
          return (
            <div key={email.id} className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
              <article
                className={`max-w-xl rounded-2xl px-4 py-3 shadow-sm ${
                  inbound
                    ? "bg-white border border-slate-200 text-slate-800 rounded-tl-sm"
                    : "bg-blue-600 text-white rounded-tr-sm"
                }`}
              >
                <div
                  className={`flex items-center gap-2 text-[11px] mb-1.5 ${
                    inbound ? "text-slate-500" : "text-blue-100"
                  }`}
                >
                  <span className="font-semibold">
                    {inbound ? email.sender_email : "You"}
                  </span>
                  <span>→</span>
                  <span className="truncate">{email.recipient_email}</span>
                  <span className="ml-auto shrink-0">
                    {new Date(email.sent_at).toLocaleString()}
                  </span>
                </div>
                <div className="text-sm whitespace-pre-wrap leading-relaxed">
                  {email.body_text ?? email.body_html}
                </div>
              </article>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <footer className="px-6 py-4 bg-white border-t border-slate-200">
        <div className="max-w-3xl mx-auto space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500 shrink-0">Template</label>
            <select
              value=""
              onChange={(e) => e.target.value && applyTemplate(e.target.value)}
              className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 bg-white flex-1"
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
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Write a reply or pick a template above — edit freely before sending…"
            rows={5}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => sendReply("eml")}
              disabled={sending || !reply.trim()}
              className="text-sm px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Download .eml
            </button>
            <button
              onClick={() => sendReply()}
              disabled={sending || !reply.trim() || !subject.trim()}
              className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send email"}
            </button>
          </div>
        </div>
      </footer>
    </section>
  );
}
