"use client";

import { useCallback, useEffect, useState } from "react";
import ThreadList from "@/components/ThreadList";
import ConversationView from "@/components/ConversationView";
import DealActionPanel from "@/components/DealActionPanel";
import { createClient } from "@/lib/supabase";
import type { Lead, EmailThread, EmailMessage } from "@/lib/types";

export default function AuditCrmPortal() {
  const supabase = createClient();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedThread, setSelectedThread] = useState<EmailThread | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const loadLeads = useCallback(async () => {
    const { data } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });
    setLeads((data as Lead[] | null) ?? []);
  }, [supabase]);

  const loadThreads = useCallback(
    async (leadId: string) => {
      const { data } = await supabase
        .from("email_threads")
        .select("*")
        .eq("lead_id", leadId)
        .order("last_message_at", { ascending: false });
      const list = (data as EmailThread[] | null) ?? [];
      setThreads(list);
      setSelectedThread((prev) =>
        prev && list.some((t) => t.id === prev.id) ? prev : (list[0] ?? null)
      );
    },
    [supabase]
  );

  const loadMessages = useCallback(
    async (threadId: string) => {
      const { data } = await supabase
        .from("email_messages")
        .select("*")
        .eq("thread_id", threadId)
        .order("sent_at", { ascending: true });
      setMessages((data as EmailMessage[] | null) ?? []);
    },
    [supabase]
  );

  const syncInbox = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/emails/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 50 }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSyncResult(`Sync failed: ${json.error ?? res.status}`);
      } else {
        setSyncResult(
          `Synced ${json.inserted} new / ${json.skipped} duplicate of ${json.fetched} fetched`
        );
        await loadLeads();
        if (selectedLead) loadThreads(selectedLead.id);
      }
    } catch (err) {
      setSyncResult(`Sync failed: ${(err as Error).message}`);
    } finally {
      setSyncing(false);
    }
  }, [loadLeads, loadThreads, selectedLead]);

  useEffect(() => {
    loadLeads();

    const channel = supabase
      .channel("portal-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "email_messages" },
        () => {
          if (selectedThread) loadMessages(selectedThread.id);
          loadLeads();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, selectedThread, loadLeads, loadMessages]);

  useEffect(() => {
    if (selectedLead) loadThreads(selectedLead.id);
    else {
      setThreads([]);
      setSelectedThread(null);
    }
  }, [selectedLead, loadThreads]);

  useEffect(() => {
    if (selectedThread) loadMessages(selectedThread.id);
    else setMessages([]);
  }, [selectedThread, loadMessages]);

  const selectLead = (lead: Lead) => {
    setSelectedLead(lead);
    setThreads([]);
    setMessages([]);
    setSelectedThread(null);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-100">
      <header className="flex items-center justify-between px-5 py-3 bg-slate-900 text-white shadow">
        <div className="flex items-center gap-3">
          <span className="text-lg">📬</span>
          <div>
            <h1 className="font-semibold leading-tight">Audit CRM Portal</h1>
            <p className="text-[11px] text-slate-400">KGS Africa · Email automation & audit pipeline</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {syncResult && (
            <span className="text-xs text-slate-300 max-w-xs truncate">{syncResult}</span>
          )}
          <button
            onClick={syncInbox}
            disabled={syncing}
            className="text-sm font-medium px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            {syncing ? "Syncing…" : "⟳ Sync inbox"}
          </button>
        </div>
      </header>
      <div className="flex flex-1 min-h-0">
        <ThreadList
          leads={leads}
          threads={threads}
          selectedLead={selectedLead}
          selectedThread={selectedThread}
          onSelectLead={selectLead}
          onSelectThread={setSelectedThread}
        />
        <ConversationView
          thread={selectedThread}
          emails={messages}
          lead={selectedLead}
          onSent={() => selectedThread && loadMessages(selectedThread.id)}
        />
        <DealActionPanel
          lead={selectedLead}
          thread={selectedThread}
          onLeadUpdated={loadLeads}
        />
      </div>
    </div>
  );
}
