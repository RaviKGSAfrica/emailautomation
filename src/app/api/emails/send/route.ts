import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendSmtpEmail, composeRawEmail } from "@/lib/mailer";

export async function POST(req: Request) {
  const { threadId, leadId, toEmail, subject, bodyText, quoteId, format } = await req.json();

  const from = process.env.SMTP_USER ?? "audits@yourdomain.com";
  let finalBody = bodyText ?? "";

  // If attaching a quote, mark it SENT and append a 1-click acceptance link
  if (quoteId) {
    const { data: quote } = await supabaseAdmin
      .from("quotations")
      .update({ status: "SENT", sent_at: new Date().toISOString() })
      .eq("id", quoteId)
      .select()
      .single();

    if (quote) {
      const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/quotes/accept?token=${quote.approval_token}`;
      finalBody += `\n\n---\nQuote #${quote.quote_number} (${quote.mandays} Man-Days | $${quote.total_amount})\nClick here to approve quote and initiate audit scheduling: ${acceptUrl}`;
    }

    if (leadId) {
      await supabaseAdmin.from("leads").update({ stage: "QUOTED" }).eq("id", leadId);
    }
  }

  // .eml download mode: compose the raw RFC-822 message without sending
  if (format === "eml") {
    const eml = await composeRawEmail({
      from,
      to: toEmail,
      subject,
      text: finalBody,
    });
    return new NextResponse(eml, {
      headers: {
        "Content-Type": "message/rfc822",
        "Content-Disposition": `attachment; filename="message.eml"`,
      },
    });
  }

  // Real send via SMTP (mail.kgsafrica.com:465)
  let providerMessageId: string | null = null;
  try {
    const result = await sendSmtpEmail({
      from,
      to: toEmail,
      subject,
      text: finalBody,
    });
    providerMessageId = result.messageId;
  } catch (err) {
    return NextResponse.json(
      { error: `SMTP send failed: ${(err as Error).message}` },
      { status: 502 }
    );
  }

  // Auto-create a thread if the caller didn't supply one
  let resolvedThreadId = threadId;
  if (!resolvedThreadId && leadId) {
    const { data: thread } = await supabaseAdmin
      .from("email_threads")
      .insert({ lead_id: leadId, subject })
      .select("id")
      .single();
    resolvedThreadId = thread?.id;
  }
  if (!resolvedThreadId) {
    return NextResponse.json({ error: "threadId or leadId is required" }, { status: 400 });
  }

  // Sync message to Portal DB
  const { data: savedMsg, error } = await supabaseAdmin
    .from("email_messages")
    .insert({
      thread_id: resolvedThreadId,
      direction: "outbound",
      sender_email: from,
      recipient_email: toEmail,
      subject,
      body_text: finalBody,
      provider_message_id: providerMessageId,
      sent_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin
    .from("email_threads")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", resolvedThreadId);

  if (leadId) {
    await supabaseAdmin
      .from("leads")
      .update({ last_contacted_at: new Date().toISOString() })
      .eq("id", leadId);
  }

  return NextResponse.json({ message: savedMsg });
}
