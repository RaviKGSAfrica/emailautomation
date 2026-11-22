"use client";

import { useEffect, useRef, useState } from "react";
import type { AttachmentMeta, EmailMessage, EmailThread, Lead, Quotation } from "@/lib/types";
import { getTemplates, renderTemplate, type TemplateContext } from "@/lib/templates";
import { createClient } from "@/lib/supabase";
import RichTextEditor from "@/components/RichTextEditor";

interface Props {
  thread: EmailThread | null;
  emails: EmailMessage[];
  lead: Lead | null;
  onSent: () => void;
}

interface OutgoingAttachment {
  name: string;
  contentType: string;
  data: string; // base64
}

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8 MB per file

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function plainTextToHtml(text: string) {
  return `<div>${escapeHtml(text).replace(/\n/g, "<br>")}</div>`;
}

function htmlToPlainText(html: string) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.innerText || div.textContent || "";
}

function formatSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function ConversationView({ thread, emails, lead, onSent }: Props) {
  const supabase = createClient();
  const [replyHtml, setReplyHtml] = useState("");
  const [subject, setSubject] = useState("");
  const [sending, setSending] = useState(false);
  const [latestQuote, setLatestQuote] = useState<Quotation | null>(null);
  const [outgoingFiles, setOutgoingFiles] = useState<OutgoingAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const templates = getTemplates();

  useEffect(() => {
    setSubject(thread ? `Re: ${thread.subject}` : "");
    setReplyHtml("");
    setLatestQuote(null);
    setOutgoingFiles([]);
  }, [thread?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!lead) return;
    supabase
      .from("quotations")
      .select("*")
      .eq("lead_id", lead.id)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => setLatestQuote(((data as Quotation[] | null) ?? [])[0] ?? null));
  }, [lead, supabase]);

  if (!thread) {
    return (
      <section className="flex-1 flex items-center justify-center bg-slate-100">
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
  });

  const applyTemplate = (id: string) => {
    const rendered = renderTemplate(id, buildContext());
    if (rendered) {
      setSubject(rendered.subject);
      setReplyHtml(plainTextToHtml(rendered.body));
    }
  };

  const onPickFiles = (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        alert(`${file.name} exceeds the 8 MB limit`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setOutgoingFiles((prev) => [
          ...prev,
          {
            name: file.name,
            contentType: file.type || "application/octet-stream",
            data: dataUrl.split(",")[1] ?? "",
          },
        ]);
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const payload = () => ({
    threadId: thread.id,
    leadId: lead?.id,
    toEmail: lead?.contact_email ?? "",
    subject,
    bodyText: htmlToPlainText(replyHtml),
    bodyHtml: replyHtml,
    attachments: outgoingFiles.map(({ name, contentType, data }) => ({
      name,
      contentType,
      data,
    })),
  });

  const sendReply = async (format?: "eml") => {
    const text = htmlToPlainText(replyHtml).trim();
    if (!text || !lead) return;
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
      setReplyHtml("");
      setOutgoingFiles([]);
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
          const attachments = (email.attachments ?? []) as AttachmentMeta[];
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
                {attachments.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-200/60 flex flex-wrap gap-1.5">
                    {attachments.map((a) => (
                      <a
                        key={a.path}
                        href={`/api/attachments?path=${encodeURIComponent(a.path)}`}
                        className={`text-[11px] px-2 py-1 rounded-md border ${
                          inbound
                            ? "border-slate-300 text-slate-600 hover:bg-slate-50"
                            : "border-blue-400 text-blue-50 hover:bg-blue-500"
                        }`}
                        title={a.name}
                      >
                        📎 {a.name} {formatSize(a.size) && `· ${formatSize(a.size)}`}
                      </a>
                    ))}
                  </div>
                )}
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
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 shrink-0"
              title="Attach files"
            >
              📎 Attach
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => onPickFiles(e.target.files)}
            />
          </div>

          {outgoingFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {outgoingFiles.map((f, i) => (
                <span
                  key={`${f.name}-${i}`}
                  className="text-[11px] bg-slate-100 border border-slate-200 rounded-md px-2 py-1 flex items-center gap-1.5"
                >
                  📎 {f.name}
                  <button
                    type="button"
                    className="text-slate-400 hover:text-rose-500"
                    onClick={() => setOutgoingFiles((p) => p.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <RichTextEditor
            value={replyHtml}
            onChange={setReplyHtml}
            placeholder="Write a reply or pick a template above — edit freely before sending…"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => sendReply("eml")}
              disabled={sending || !htmlToPlainText(replyHtml).trim()}
              className="text-sm px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Download .eml
            </button>
            <button
              onClick={() => sendReply()}
              disabled={sending || !htmlToPlainText(replyHtml).trim() || !subject.trim()}
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
