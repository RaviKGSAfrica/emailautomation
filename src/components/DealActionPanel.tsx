"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { Audit, EmailThread, Lead, Quotation, ThreadNote } from "@/lib/types";

interface Props {
  lead: Lead | null;
  thread: EmailThread | null;
  onLeadUpdated: () => void;
}

const STAGES = ["intake", "in_progress", "review", "certified", "expired"] as const;
const PIPELINE = ["new", "qualified", "quoted", "won", "lost"] as const;

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">
        {title}
      </h4>
      {children}
    </div>
  );
}

export default function DealActionPanel({ lead, thread, onLeadUpdated }: Props) {
  const supabase = createClient();
  const [quotes, setQuotes] = useState<Quotation[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [amount, setAmount] = useState("0");
  const [mandays, setMandays] = useState("1");
  const [notes, setNotes] = useState<ThreadNote[]>([]);
  const [noteBody, setNoteBody] = useState("");

  useEffect(() => {
    if (!lead) {
      setQuotes([]);
      setAudits([]);
      return;
    }
    supabase
      .from("quotations")
      .select("*")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setQuotes((data as Quotation[] | null) ?? []));
    supabase
      .from("audits")
      .select("*")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setAudits((data as Audit[] | null) ?? []));
  }, [lead, supabase]);

  // Team notes for the selected thread (internal only — never emailed)
  useEffect(() => {
    if (!thread) {
      setNotes([]);
      return;
    }
    supabase
      .from("thread_notes")
      .select("*")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setNotes((data as ThreadNote[] | null) ?? []));
  }, [thread, supabase]);

  const addNote = async () => {
    if (!thread || !noteBody.trim()) return;
    const author =
      typeof window !== "undefined"
        ? localStorage.getItem("portal-author") || "team"
        : "team";
    const { data } = await supabase
      .from("thread_notes")
      .insert({ thread_id: thread.id, author, body: noteBody.trim() })
      .select()
      .single();
    if (data) setNotes((prev) => [data as ThreadNote, ...prev]);
    setNoteBody("");
  };

  if (!lead) {
    return (
      <aside className="w-80 shrink-0 border-l border-slate-200 bg-slate-50 flex items-center justify-center p-6">
        <p className="text-sm text-slate-400 text-center">
          Select a lead to see deal actions
        </p>
      </aside>
    );
  }

  const updateStage = async (stage: Lead["audit_stage"]) => {
    await supabase.from("leads").update({ audit_stage: stage }).eq("id", lead.id);
    onLeadUpdated();
  };

  const updatePipeline = async (status: Lead["status"], stage?: string) => {
    await supabase
      .from("leads")
      .update({ status, ...(stage ? { stage } : {}) })
      .eq("id", lead.id);
    onLeadUpdated();
  };

  // Select which quotation is used for follow-up emails & dashboard analytics
  const selectQuote = async (quoteId: string) => {
    await supabase.from("quotations").update({ is_active: false }).eq("lead_id", lead.id);
    await supabase.from("quotations").update({ is_active: true }).eq("id", quoteId);
    const { data } = await supabase
      .from("quotations")
      .select("*")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false });
    setQuotes((data as Quotation[] | null) ?? []);
  };

  const createQuote = async () => {
    if (!thread) return;
    const quoteNumber = `QT-${new Date().getFullYear()}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`;
    await supabase.from("quotations").insert({
      lead_id: lead.id,
      quote_number: quoteNumber,
      currency: "USD",
      mandays: Number(mandays) || 0,
      total_amount: Number(amount) || 0,
    });
    setAmount("0");
    const { data } = await supabase
      .from("quotations")
      .select("*")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false });
    setQuotes((data as Quotation[] | null) ?? []);
  };

  const specs = lead.specs ?? {};
  const specEntries = Object.entries(specs).filter(([, v]) => v != null && v !== "");

  return (
    <aside className="w-80 shrink-0 border-l border-slate-200 bg-slate-50 overflow-y-auto p-4 space-y-4">
      {/* Lead summary */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="font-semibold text-slate-900 truncate">{lead.company_name}</h3>
        <p className="text-xs text-slate-500 mt-1 truncate">
          {lead.contact_name} · {lead.contact_email}
        </p>
        <div className="flex gap-2 mt-3">
          <span className="text-[11px] font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-600">
            {lead.stage ?? lead.status}
          </span>
          <span className="text-[11px] font-medium px-2 py-1 rounded-full bg-blue-50 text-blue-700">
            {lead.audit_stage}
          </span>
        </div>
      </div>

      <Card title="Pipeline">
        <div className="flex flex-wrap gap-1.5">
          {PIPELINE.map((s) => (
            <button
              key={s}
              onClick={() => updatePipeline(s)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                lead.status === s
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-600 border-slate-300 hover:border-blue-400"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Audit stage">
        <div className="space-y-1.5">
          {STAGES.map((stage) => (
            <button
              key={stage}
              onClick={() => updateStage(stage)}
              className={`w-full text-left text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                lead.audit_stage === stage
                  ? "bg-blue-50 border-blue-300 text-blue-700 font-medium"
                  : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {stage.replace("_", " ")}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Extracted specs">
        {specEntries.length === 0 ? (
          <p className="text-xs text-slate-400">No specs extracted yet</p>
        ) : (
          <dl className="space-y-1.5">
            {specEntries.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 text-xs">
                <dt className="text-slate-500 capitalize">{k.replace(/_/g, " ")}</dt>
                <dd className="text-slate-800 font-medium text-right truncate">
                  {Array.isArray(v) ? v.join(", ") : String(v)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      <Card title="Quotations">
        {quotes.length === 0 && <p className="text-xs text-slate-400">No quotations yet</p>}
        <div className="space-y-2">
          {quotes.map((q) => (
            <div
              key={q.id}
              className="border border-slate-200 rounded-lg p-2.5 text-xs bg-slate-50"
            >
              <div className="flex justify-between items-center">
                <span className="font-mono font-medium text-slate-700">{q.quote_number}</span>
                <div className="flex items-center gap-1.5">
                  {q.is_active && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">
                      ★ follow-up
                    </span>
                  )}
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                      q.status === "ACCEPTED"
                        ? "bg-emerald-100 text-emerald-700"
                        : q.status === "SENT"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {q.status}
                  </span>
                </div>
              </div>
              {!q.is_active && q.status !== "ACCEPTED" && (
                <button
                  onClick={() => selectQuote(q.id)}
                  className="mt-1.5 text-[10px] text-blue-600 hover:underline"
                >
                  Use for follow-up →
                </button>
              )}
              {(q.status === "SENT" || q.status === "DRAFT") && (
                <button
                  onClick={async () => {
                    await supabase
                      .from("quotations")
                      .update({ status: "ACCEPTED", accepted_at: new Date().toISOString() })
                      .eq("id", q.id);
                    const { data } = await supabase
                      .from("quotations")
                      .select("*")
                      .eq("lead_id", lead.id)
                      .order("created_at", { ascending: false });
                    setQuotes((data as Quotation[] | null) ?? []);
                    onLeadUpdated();
                  }}
                  className="mt-1.5 ml-2 text-[10px] text-emerald-600 hover:underline"
                >
                  ✓ Mark accepted (client replied)
                </button>
              )}
              <div className="text-slate-600 mt-1">
                {q.mandays} man-days · ${Number(q.total_amount).toLocaleString()}
              </div>
              {q.status === "SENT" && q.approval_token && (
                <div className="mt-1.5 text-[10px] text-blue-600 break-all font-mono">
                  /api/quotes/track?token={q.approval_token.slice(0, 12)}…&e=click
                </div>
              )}
            </div>
          ))}
        </div>
        {thread && (
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <input
                type="number"
                value={mandays}
                onChange={(e) => setMandays(e.target.value)}
                placeholder="Man-days"
                className="w-1/2 text-xs border border-slate-300 rounded-lg px-2 py-1.5"
              />
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Total $"
                className="w-1/2 text-xs border border-slate-300 rounded-lg px-2 py-1.5"
              />
            </div>
            <button
              onClick={createQuote}
              className="w-full text-xs font-medium px-3 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-700"
            >
              Create quotation
            </button>
          </div>
        )}
      </Card>

      <Card title="Audits">
        {audits.length === 0 && <p className="text-xs text-slate-400">No audits yet</p>}
        <div className="space-y-2">
          {audits.map((a) => (
            <div key={a.id} className="text-xs border-l-2 border-slate-200 pl-2.5 py-0.5">
              <div className="font-medium text-slate-700 capitalize">
                {a.type} — {a.status}
              </div>
              {a.recertify_due_at && (
                <div className="text-slate-400">recertify {a.recertify_due_at}</div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {thread && (
        <Card title="Team notes (internal)">
          <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
            {notes.length === 0 && (
              <p className="text-xs text-slate-400">No internal notes yet</p>
            )}
            {notes.map((n) => (
              <div key={n.id} className="text-xs bg-amber-50 border border-amber-100 rounded-lg p-2">
                <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                  <span className="font-semibold text-amber-700">{n.author}</span>
                  <span>{new Date(n.created_at).toLocaleString()}</span>
                </div>
                <p className="text-slate-700 whitespace-pre-wrap">{n.body}</p>
              </div>
            ))}
          </div>
          <textarea
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            placeholder="Add an internal note (not sent to client)…"
            rows={2}
            className="w-full text-xs border border-slate-300 rounded-lg px-2 py-1.5 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={addNote}
            disabled={!noteBody.trim()}
            className="w-full text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-700 text-white hover:bg-slate-600 disabled:opacity-50"
          >
            Add note
          </button>
        </Card>
      )}
    </aside>
  );
}
