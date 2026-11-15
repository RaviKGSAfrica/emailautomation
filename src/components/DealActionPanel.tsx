"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { Audit, EmailThread, Lead, Quotation } from "@/lib/types";

interface Props {
  lead: Lead | null;
  thread: EmailThread | null;
  onLeadUpdated: () => void;
}

const STAGES = ["intake", "in_progress", "review", "certified", "expired"] as const;

export default function DealActionPanel({ lead, thread, onLeadUpdated }: Props) {
  const supabase = createClient();
  const [quotes, setQuotes] = useState<Quotation[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [amount, setAmount] = useState("0");

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
      .then(({ data }) => setAudits(data ?? []));
  }, [lead, supabase]);

  if (!lead) {
    return (
      <aside style={{ width: 320, padding: 16, color: "#888" }}>
        Select a lead to see deal actions
      </aside>
    );
  }

  const updateStage = async (stage: Lead["audit_stage"]) => {
    await supabase.from("leads").update({ audit_stage: stage }).eq("id", lead.id);
    onLeadUpdated();
  };

  const updateStatus = async (status: Lead["status"]) => {
    await supabase.from("leads").update({ status }).eq("id", lead.id);
    onLeadUpdated();
  };

  const createQuote = async () => {
    if (!thread) return;
    await supabase.from("quotations").insert({
      lead_id: lead.id,
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

  return (
    <aside style={{ width: 320, padding: 16, overflowY: "auto" }}>
      <h3>{lead.company_name}</h3>
      <p style={{ color: "#666", fontSize: 13 }}>
        {lead.contact_name} · {lead.contact_email}
      </p>

      <section>
        <h4>Pipeline status</h4>
        <select
          value={lead.status}
          onChange={(e) => updateStatus(e.target.value as Lead["status"])}
        >
          {["new", "qualified", "quoted", "won", "lost"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </section>

      <section>
        <h4>Audit stage</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {STAGES.map((stage) => (
            <button
              key={stage}
              onClick={() => updateStage(stage)}
              style={{
                padding: "6px 10px",
                border: "1px solid #ccc",
                borderRadius: 4,
                background: lead.audit_stage === stage ? "#eef" : "#fff",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              {stage}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h4>AI-extracted specs</h4>
        <pre style={{ fontSize: 12, background: "#f7f7f7", padding: 8, overflowX: "auto" }}>
          {JSON.stringify(specs, null, 2)}
        </pre>
      </section>

      <section>
        <h4>Quotes</h4>
        {quotes.map((q) => (
          <div key={q.id} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 8, marginBottom: 8 }}>
            <div>
              {q.quote_number} — ${q.total_amount} ({q.mandays} man-days) —{" "}
              <strong>{q.status}</strong>
            </div>
            {q.status === "SENT" && q.approval_token && (
              <div style={{ fontSize: 12, wordBreak: "break-all" }}>
                /api/quotes/accept?token={q.approval_token}
              </div>
            )}
          </div>
        ))}
        {thread && (
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
              style={{ width: 100 }}
            />
            <button onClick={createQuote}>Create quote</button>
          </div>
        )}
      </section>

      <section>
        <h4>Audits</h4>
        {audits.map((a) => (
          <div key={a.id} style={{ fontSize: 13, marginBottom: 6 }}>
            {a.type} — {a.status}
            {a.recertify_due_at && ` · recertify ${a.recertify_due_at}`}
          </div>
        ))}
        {audits.length === 0 && <div style={{ color: "#888", fontSize: 13 }}>No audits yet</div>}
      </section>
    </aside>
  );
}
