import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchInboxMessages } from "@/lib/mailbox";

// Pulls recent messages from the IMAP inbox and syncs them into
// email_threads / email_messages, matched to leads by sender address.
export async function POST(req: Request) {
  const { limit } = await req.json().catch(() => ({}));

  if (!process.env.IMAP_USER || !process.env.IMAP_PASSWORD) {
    return NextResponse.json(
      { error: "IMAP_USER and IMAP_PASSWORD must be set in .env.local" },
      { status: 500 }
    );
  }

  let messages;
  try {
    messages = await fetchInboxMessages(limit ?? 50);
  } catch (err) {
    return NextResponse.json(
      { error: `IMAP connection failed: ${(err as Error).message}` },
      { status: 502 }
    );
  }

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const msg of messages) {
    if (!msg.fromAddress) {
      skipped++;
      continue;
    }

    try {
      // Find or create the lead by sender email
      let { data: lead } = await supabaseAdmin
        .from("leads")
        .select("id")
        .eq("contact_email", msg.fromAddress)
        .maybeSingle();

      if (!lead) {
        const { data: created, error: leadErr } = await supabaseAdmin
          .from("leads")
          .insert({
            company_name: msg.fromName || msg.fromAddress,
            contact_name: msg.fromName || msg.fromAddress,
            contact_email: msg.fromAddress,
            specs: {},
          })
          .select("id")
          .single();
        if (leadErr) throw leadErr;
        lead = created;
      }

      // Reuse the lead's most recent thread (replies stay in one conversation)
      const { data: threads } = await supabaseAdmin
        .from("email_threads")
        .select("id")
        .eq("lead_id", lead.id)
        .order("last_message_at", { ascending: false })
        .limit(1);

      let threadId = threads?.[0]?.id;
      if (!threadId) {
        const { data: thread, error: threadErr } = await supabaseAdmin
          .from("email_threads")
          .insert({ lead_id: lead.id, subject: msg.subject })
          .select("id")
          .single();
        if (threadErr) throw threadErr;
        threadId = thread.id;
      }

      const { error: msgErr } = await supabaseAdmin.from("email_messages").insert({
        thread_id: threadId,
        direction: "inbound",
        sender_email: msg.fromAddress,
        recipient_email: msg.toAddress,
        subject: msg.subject,
        body_text: msg.text,
        body_html: msg.html,
        provider_message_id: msg.messageId,
        sent_at: msg.date.toISOString(),
      });

      if (msgErr) {
        // 23505 = unique violation on provider_message_id → already synced
        if (msgErr.code === "23505") skipped++;
        else errors.push(`${msg.fromAddress}: ${msgErr.message}`);
        continue;
      }

      await supabaseAdmin
        .from("email_threads")
        .update({ last_message_at: msg.date.toISOString() })
        .eq("id", threadId);
      await supabaseAdmin
        .from("leads")
        .update({ last_contacted_at: msg.date.toISOString() })
        .eq("id", lead.id);

      inserted++;
    } catch (err) {
      errors.push(`${msg.fromAddress}: ${(err as Error).message}`);
    }
  }

  return NextResponse.json({ ok: true, fetched: messages.length, inserted, skipped, errors });
}
