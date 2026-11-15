"use client";

import React, { useState } from "react";

// Mock initial state for prototype demonstration
const MOCK_THREADS = [
  {
    id: "t-1",
    leadId: "l-1",
    company: "Apex Precision Mfg",
    email: "quality@apexmfg.com",
    subject: "Re: Annual Recertification Requirements - ISO 9001",
    stage: "REQS_RECEIVED",
    headcount: 110,
    standards: ["ISO 9001:2015", "ISO 45001:2018"],
    messages: [
      {
        id: "m-1",
        direction: "outbound",
        text: "Hello, your annual recertification is due in 60 days. Please confirm headcount and scope.",
        time: "Nov 12, 09:00 AM",
      },
      {
        id: "m-2",
        direction: "inbound",
        text: "Hi team, we currently have 110 employees across 2 shifts. No changes to scope. Please send the quote for ISO 9001 & 45001.",
        time: "Nov 14, 02:15 PM",
      },
    ],
  },
];

export default function AuditCrmPortal() {
  const [threads, setThreads] = useState(MOCK_THREADS);
  const [selectedId, setSelectedId] = useState(MOCK_THREADS[0].id);
  const [replyText, setReplyText] = useState("");
  const [mandays, setMandays] = useState(4.5);
  const [ratePerDay, setRatePerDay] = useState(800);
  const [auditCreated, setAuditCreated] = useState(false);

  const activeThread = threads.find((t) => t.id === selectedId)!;
  const totalQuoteAmount = mandays * ratePerDay;

  const handleSendQuoteEmail = () => {
    const quoteSummary = `Please find our quotation for ${activeThread.standards.join(" & ")} (${mandays} Man-Days): $${totalQuoteAmount.toLocaleString()}. Click [Approve Quote] to confirm.`;
    
    setThreads((prev) =>
      prev.map((t) =>
        t.id === activeThread.id
          ? {
              ...t,
              stage: "QUOTED",
              messages: [
                ...t.messages,
                { id: `m-${Date.now()}`, direction: "outbound", text: replyText || quoteSummary, time: "Just now" },
              ],
            }
          : t
      )
    );
    setReplyText("");
  };

  const handleManualCloseDeal = () => {
    setThreads((prev) =>
      prev.map((t) => (t.id === activeThread.id ? { ...t, stage: "WON" } : t))
    );
    setAuditCreated(true);
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans">
      {/* LEFT PANE: Lead Email Threads */}
      <aside className="w-1/4 border-r border-slate-200 bg-white flex flex-col">
        <div className="p-4 border-b border-slate-200 font-bold text-lg">
          Lead & Recert Inbox
        </div>
        <div className="overflow-y-auto flex-1">
          {threads.map((t) => (
            <div
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              className={`p-4 border-b border-slate-100 cursor-pointer hover:bg-slate-50 ${
                t.id === selectedId ? "bg-blue-50/60 border-l-4 border-l-blue-600" : ""
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="font-semibold text-sm">{t.company}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200 font-medium">
                  {t.stage}
                </span>
              </div>
              <p className="text-xs text-slate-600 truncate">{t.subject}</p>
            </div>
          ))}
        </div>
      </aside>

      {/* CENTER PANE: Email Sync Thread & Composer */}
      <main className="w-2/4 flex flex-col bg-slate-50">
        <header className="p-4 bg-white border-b border-slate-200">
          <h2 className="font-bold text-base">{activeThread.subject}</h2>
          <p className="text-xs text-slate-500">{activeThread.email}</p>
        </header>

        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {activeThread.messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-lg p-4 rounded-lg text-sm shadow-sm ${
                m.direction === "outbound"
                  ? "ml-auto bg-blue-600 text-white"
                  : "bg-white border border-slate-200 text-slate-800"
              }`}
            >
              <p>{m.text}</p>
              <span className="block text-[10px] mt-2 opacity-75">{m.time}</span>
            </div>
          ))}
        </div>

        <div className="p-4 bg-white border-t border-slate-200">
          <textarea
            rows={3}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Write a reply or leave blank to send auto-formatted quotation..."
            className="w-full border border-slate-300 rounded-md p-2 text-sm mb-2"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={handleSendQuoteEmail}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-md"
            >
              Send Email & Attach Quote
            </button>
          </div>
        </div>
      </main>

      {/* RIGHT PANE: AI Extracted Specs, Quotation Builder & Audit Trigger */}
      <aside className="w-1/4 border-l border-slate-200 bg-white p-5 overflow-y-auto space-y-6">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
            Extracted Requirements
          </h3>
          <div className="bg-slate-50 p-3 rounded-md border border-slate-200 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Employees:</span>
              <span className="font-semibold">{activeThread.headcount}</span>
            </div>
            <div>
              <span className="text-slate-500 block mb-1">Standards:</span>
              <div className="flex flex-wrap gap-1">
                {activeThread.standards.map((std) => (
                  <span key={std} className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                    {std}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
            Quotation Calculator
          </h3>
          <div className="space-y-3 text-sm">
            <div>
              <label className="block text-slate-600 mb-1">Audit Man-Days</label>
              <input
                type="number"
                step="0.5"
                value={mandays}
                onChange={(e) => setMandays(Number(e.target.value))}
                className="w-full border border-slate-300 rounded px-2 py-1.5"
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1">Rate / Man-Day ($)</label>
              <input
                type="number"
                value={ratePerDay}
                onChange={(e) => setRatePerDay(Number(e.target.value))}
                className="w-full border border-slate-300 rounded px-2 py-1.5"
              />
            </div>
            <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-base">
              <span>Total Quote:</span>
              <span>${totalQuoteAmount.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
            Deal Closure & Audit Sync
          </h3>
          {auditCreated || activeThread.stage === "WON" ? (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-800 text-xs space-y-1">
              <p className="font-bold">Deal Closed — Audit Created!</p>
              <p>Audit record provisioned in scheduling queue and recertification date extended by 1 year.</p>
            </div>
          ) : (
            <button
              onClick={handleManualCloseDeal}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm py-2.5 rounded-md"
            >
              Mark Quote Accepted & Create Audit
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}