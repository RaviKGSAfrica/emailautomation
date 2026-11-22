"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import type { Lead } from "@/lib/types";

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
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("leads")
      .select("*")
      .order("last_contacted_at", { ascending: false, nullsFirst: false });
    setLeads((data as Lead[] | null) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "email_messages" }, load)
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
      </main>
    </div>
  );
}
