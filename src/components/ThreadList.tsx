"use client";

import type { Lead, EmailThread } from "@/lib/types";

interface Props {
  leads: Lead[];
  threads: EmailThread[];
  selectedLead: Lead | null;
  selectedThread: EmailThread | null;
  onSelectLead: (lead: Lead) => void;
  onSelectThread: (thread: EmailThread) => void;
}

export default function ThreadList({
  leads,
  threads,
  selectedLead,
  selectedThread,
  onSelectLead,
  onSelectThread,
}: Props) {
  return (
    <aside style={{ width: 280, borderRight: "1px solid #ddd", overflowY: "auto" }}>
      <h3 style={{ padding: "12px 16px", margin: 0 }}>Leads</h3>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {leads.map((lead) => (
          <li key={lead.id}>
            <button
              onClick={() => onSelectLead(lead)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 16px",
                border: "none",
                background: selectedLead?.id === lead.id ? "#eef" : "transparent",
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 600 }}>{lead.company_name}</div>
              <div style={{ fontSize: 12, color: "#666" }}>
                {lead.status} · {lead.audit_stage}
              </div>
            </button>
          </li>
        ))}
      </ul>

      {selectedLead && (
        <>
          <h3 style={{ padding: "12px 16px", margin: 0 }}>Threads</h3>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {threads.map((thread) => (
              <li key={thread.id}>
                <button
                  onClick={() => onSelectThread(thread)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 16px",
                    border: "none",
                    background: selectedThread?.id === thread.id ? "#eef" : "transparent",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{thread.subject}</div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {new Date(thread.last_message_at).toLocaleString()}
                  </div>
                </button>
              </li>
            ))}
            {threads.length === 0 && (
              <li style={{ padding: "10px 16px", color: "#888" }}>No threads yet</li>
            )}
          </ul>
        </>
      )}
    </aside>
  );
}
