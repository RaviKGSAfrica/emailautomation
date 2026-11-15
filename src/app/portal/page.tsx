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
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: "1px solid #ddd",
          background: "#fff",
        }}
      >
        <strong>Audit CRM Portal</strong>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {syncResult && <span style={{ fontSize: 12, color: "#666" }}>{syncResult}</span>}
          <button onClick={syncInbox} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync inbox"}
          </button>
        </div>
      </header>
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
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
