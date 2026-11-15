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

const STAGE_COLORS: Record<string, string> = {
  new: "bg-slate-100 text-slate-600",
  qualified: "bg-blue-100 text-blue-700",
  quoted: "bg-amber-100 text-amber-700",
  won: "bg-emerald-100 text-emerald-700",
  lost: "bg-rose-100 text-rose-700",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const AVATAR_COLORS = [
  "bg-indigo-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-sky-500",
  "bg-violet-500",
];

function avatarColor(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
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
    <aside className="w-80 shrink-0 border-r border-slate-200 bg-white flex flex-col">
      {/* Leads folder */}
      <div className="px-4 py-3 border-b border-slate-100">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Leads & Inboxes
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {leads.length === 0 && (
          <p className="px-4 py-6 text-sm text-slate-400">
            No leads yet — click <strong>Sync inbox</strong> to pull emails.
          </p>
        )}
        {leads.map((lead) => {
          const active = selectedLead?.id === lead.id;
          return (
            <button
              key={lead.id}
              onClick={() => onSelectLead(lead)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-slate-50 transition-colors ${
                active ? "bg-blue-50" : "hover:bg-slate-50"
              }`}
            >
              <span
                className={`h-9 w-9 shrink-0 rounded-full ${avatarColor(
                  lead.company_name
                )} text-white text-xs font-bold flex items-center justify-center`}
              >
                {initials(lead.company_name || lead.contact_email || "?")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span
                    className={`truncate text-sm ${
                      active ? "font-semibold text-slate-900" : "font-medium text-slate-700"
                    }`}
                  >
                    {lead.company_name || lead.contact_email}
                  </span>
                  <span
                    className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                      STAGE_COLORS[lead.status] ?? "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {lead.stage ?? lead.status}
                  </span>
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {lead.contact_email}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Threads folder */}
      {selectedLead && (
        <>
          <div className="px-4 py-3 border-y border-slate-100 bg-slate-50">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Conversations
            </h2>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {threads.length === 0 && (
              <p className="px-4 py-4 text-xs text-slate-400">No conversations yet</p>
            )}
            {threads.map((thread) => {
              const active = selectedThread?.id === thread.id;
              return (
                <button
                  key={thread.id}
                  onClick={() => onSelectThread(thread)}
                  className={`w-full px-4 py-2.5 text-left border-b border-slate-50 ${
                    active ? "bg-blue-50 border-l-2 border-l-blue-600" : "hover:bg-slate-50"
                  }`}
                >
                  <span className="block truncate text-sm font-medium text-slate-800">
                    {thread.subject}
                  </span>
                  <span className="block text-[11px] text-slate-400">
                    {new Date(thread.last_message_at).toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
}
