"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import type { Lead, Quotation } from "@/lib/types";

interface QuoteEvent {
  id: string;
  quotation_id: string | null;
  approval_token: string;
  event_type: "open" | "click";
  created_at: string;
}

const STALE_DAYS = 7;

const STATUS_OPTIONS = ["new", "qualified", "quoted", "won", "lost"] as const;

const STATUS_STYLES: Record<string, string> = {
  new: "bg-slate-100 text-slate-600",
  qualified: "bg-blue-100 text-blue-700",
  quoted: "bg-amber-100 text-amber-700",
  won: "bg-emerald-100 text-emerald-700",
  lost: "bg-rose-100 text-rose-700",
};

export default function DashboardPage() {
  const supabase = createClient();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [quotes, setQuotes] = useState<Quotation[]>([]);
  const [events, setEvents] = useState<QuoteEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [leadsRes, quotesRes, eventsRes] = await Promise.all([
      supabase
        .from("leads")
        .select("*")
        .order("last_contacted_at", { ascending: false, nullsFirst: false }),
      supabase.from("quotations").select("*").order("created_at", { ascending: false }),
      supabase.from("quote_events").select("*"),
    ]);
    setLeads((leadsRes.data as Lead[] | null) ?? []);
    setQuotes((quotesRes.data as Quotation[] | null) ?? []);
    setEvents((eventsRes.data as QuoteEvent[] | null) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "email_messages" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "quotations" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "quote_events" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, load]);

  const filtered = useMemo(() => {
    const q = clientFilter.trim().toLowerCase();
    return leads.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (
        q &&
        !l.company_name?.toLowerCase().includes(q) &&
        !l.contact_email?.toLowerCase().includes(q) &&
        !l.contact_name?.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [leads, statusFilter, clientFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: leads.length };
    for (const s of STATUS_OPTIONS) c[s] = leads.filter((l) => l.status === s).length;
    return c;
  }, [leads]);

  // The quote that counts per client: explicitly selected (★ follow-up),
  // else the most recent non-draft quotation.
  const chosenQuotes = useMemo(() => {
    const byLead = new Map<string, Quotation[]>();
    for (const q of quotes) {
      const list = byLead.get(q.lead_id) ?? [];
      list.push(q);
      byLead.set(q.lead_id, list);
    }
    const chosen: Quotation[] = [];
    for (const list of byLead.values()) {
      const sorted = [...list].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const sel = sorted.find((q) => q.is_active) ?? sorted.find((q) => q.status !== "DRAFT");
      if (sel) chosen.push(sel);
    }
    return chosen;
  }, [quotes]);

  // ---- Quote analytics ----
  const analytics = useMemo(() => {
    const live = chosenQuotes.filter((q) => q.status !== "DRAFT");
    const totalQuoted = live.reduce((s, q) => s + Number(q.total_amount || 0), 0);
    const decided = chosenQuotes.filter((q) => q.status === "ACCEPTED" || q.status === "REJECTED");
    const accepted = chosenQuotes.filter((q) => q.status === "ACCEPTED");
    const acceptanceRate = decided.length ? Math.round((accepted.length / decided.length) * 100) : null;
    const avgDeal = accepted.length
      ? accepted.reduce((s, q) => s + Number(q.total_amount || 0), 0) / accepted.length
      : null;

    // Pipeline by stage: lead count + open quote value per stage
    const leadById = new Map(leads.map((l) => [l.id, l]));
    const byStage = new Map<string, { count: number; value: number }>();
    for (const l of leads) {
      const stage = l.stage ?? l.status ?? "UNKNOWN";
      const cur = byStage.get(stage) ?? { count: 0, value: 0 };
      cur.count++;
      byStage.set(stage, cur);
    }
    for (const q of live) {
      const lead = leadById.get(q.lead_id);
      const stage = lead?.stage ?? lead?.status ?? "UNKNOWN";
      const cur = byStage.get(stage) ?? { count: 0, value: 0 };
      cur.value += Number(q.total_amount || 0);
      byStage.set(stage, cur);
    }
    const pipeline = [...byStage.entries()]
      .map(([stage, v]) => ({ stage, ...v }))
      .sort((a, b) => b.value - a.value);

    // Engagement per quotation
    const engagement = new Map<string, { opens: number; clicks: number }>();
    for (const e of events) {
      if (!e.quotation_id) continue;
      const cur = engagement.get(e.quotation_id) ?? { opens: 0, clicks: 0 };
      if (e.event_type === "open") cur.opens++;
      else cur.clicks++;
      engagement.set(e.quotation_id, cur);
    }

    return { totalQuoted, acceptanceRate, avgDeal, decidedCount: decided.length, pipeline, engagement };
  }, [chosenQuotes, leads, events]);

  // ---- Follow-up reminders: active leads with no contact in STALE_DAYS ----
  const needsAttention = useMemo(() => {
    const cutoff = Date.now() - STALE_DAYS * 86400000;
    return leads
      .filter((l) => !["won", "lost"].includes(l.status))
      .filter((l) => !l.last_contacted_at || new Date(l.last_contacted_at).getTime() < cutoff)
      .sort(
        (a, b) =>
          new Date(a.last_contacted_at ?? 0).getTime() -
          new Date(b.last_contacted_at ?? 0).getTime()
      );
  }, [leads]);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="flex items-center justify-between px-5 py-3 bg-slate-900 text-white shadow">
        <div className="flex items-center gap-3">
          <span className="text-lg">📊</span>
          <div>
            <h1 className="font-semibold leading-tight">Client Dashboard</h1>
            <p className="text-[11px] text-slate-400">KGS Africa · Audit CRM</p>
          </div>
        </div>
        <Link
          href="/portal"
          className="text-sm font-medium px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors"
        >
          Open inbox →
        </Link>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-5">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {(["all", ...STATUS_OPTIONS] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                statusFilter === s
                  ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="text-2xl font-bold text-slate-900">{counts[s] ?? 0}</div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {s === "all" ? "All clients" : s}
              </div>
            </button>
          ))}
        </div>

        {/* Quote analytics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Total quoted
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              ${analytics.totalQuoted.toLocaleString()}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {chosenQuotes.filter((q) => q.status !== "DRAFT").length} client quotes counted
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Acceptance rate
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {analytics.acceptanceRate != null ? `${analytics.acceptanceRate}%` : "—"}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {analytics.decidedCount} decided quotes
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Avg accepted deal
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {analytics.avgDeal != null ? `$${Math.round(analytics.avgDeal).toLocaleString()}` : "—"}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Open pipeline value
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              ${
                chosenQuotes
                  .filter((q) => q.status === "SENT")
                  .reduce((s, q) => s + Number(q.total_amount || 0), 0)
                  .toLocaleString()
              }
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {chosenQuotes.filter((q) => q.status === "SENT").length} awaiting response
            </div>
          </div>
        </div>

        {/* Pipeline by stage */}
        {analytics.pipeline.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Pipeline by stage
            </h3>
            <div className="space-y-2">
              {analytics.pipeline.map(({ stage, count, value }) => {
                const max = Math.max(...analytics.pipeline.map((p) => p.value), 1);
                return (
                  <div key={stage} className="flex items-center gap-3">
                    <span className="w-36 shrink-0 text-xs font-medium text-slate-600 truncate">
                      {stage} <span className="text-slate-400">({count})</span>
                    </span>
                    <div className="flex-1 h-5 bg-slate-100 rounded-md overflow-hidden">
                      <div
                        className="h-full bg-blue-500/80 rounded-md"
                        style={{ width: `${Math.max((value / max) * 100, value > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right text-xs font-semibold text-slate-700">
                      ${value.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Needs attention */}
        {needsAttention.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 mb-3">
              ⚠ Needs follow-up — no contact in {STALE_DAYS}+ days ({needsAttention.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {needsAttention.slice(0, 12).map((lead) => (
                <Link
                  key={lead.id}
                  href="/portal"
                  className="text-xs bg-white border border-amber-200 rounded-lg px-3 py-1.5 hover:border-amber-400 transition-colors"
                  title={`${lead.company_name} · last contact ${
                    lead.last_contacted_at
                      ? new Date(lead.last_contacted_at).toLocaleDateString()
                      : "never"
                  }`}
                >
                  {lead.company_name || lead.contact_email}
                  <span className="ml-1.5 text-amber-600 font-medium">
                    {lead.last_contacted_at
                      ? `${Math.floor((Date.now() - new Date(lead.last_contacted_at).getTime()) / 86400000)}d`
                      : "never"}
                  </span>
                </Link>
              ))}
              {needsAttention.length > 12 && (
                <span className="text-xs text-amber-700 self-center">
                  +{needsAttention.length - 12} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white"
          >
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            placeholder="Search client, contact or email…"
            className="flex-1 min-w-56 text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-xs text-slate-500">
            {filtered.length} of {leads.length} clients
          </span>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 font-semibold">Client</th>
                <th className="px-4 py-3 font-semibold">Contact</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Stage</th>
                <th className="px-4 py-3 font-semibold">Last communication</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    No clients match the current filters
                  </td>
                </tr>
              )}
              {filtered.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-t border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">
                      {lead.company_name || "—"}
                    </div>
                    <div className="text-xs text-slate-400">{lead.contact_email}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{lead.contact_name || "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-[11px] font-medium px-2 py-1 rounded-full capitalize ${
                        STATUS_STYLES[lead.status] ?? "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-slate-500">{lead.stage ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {lead.last_contacted_at
                      ? new Date(lead.last_contacted_at).toLocaleString()
                      : "Never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Recent quotations with engagement */}
        {quotes.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Recent quotations — email engagement
              </h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-2.5 font-semibold">Quote</th>
                  <th className="px-4 py-2.5 font-semibold">Client</th>
                  <th className="px-4 py-2.5 font-semibold">Amount</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Opens</th>
                  <th className="px-4 py-2.5 font-semibold">Link clicks</th>
                  <th className="px-4 py-2.5 font-semibold">Sent</th>
                </tr>
              </thead>
              <tbody>
                {quotes.slice(0, 10).map((q) => {
                  const lead = leads.find((l) => l.id === q.lead_id);
                  const eng = analytics.engagement.get(q.id) ?? { opens: 0, clicks: 0 };
                  return (
                    <tr key={q.id} className="border-t border-slate-100">
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-700">
                        {q.is_active && <span title="Selected for follow-up">★ </span>}
                        {q.quote_number}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {lead?.company_name ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">
                        ${Number(q.total_amount).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                            q.status === "ACCEPTED"
                              ? "bg-emerald-100 text-emerald-700"
                              : q.status === "SENT"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {q.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{eng.opens}</td>
                      <td className="px-4 py-2.5 text-slate-600">{eng.clicks}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-400">
                        {q.sent_at ? new Date(q.sent_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
