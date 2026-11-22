import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendSmtpEmail, composeRawEmail } from "@/lib/mailer";
import { uploadAttachment, type AttachmentMeta } from "@/lib/storage";

interface IncomingAttachment {
  name: string;
  contentType?: string;
  data: string; // base64
}

function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.6;white-space:pre-wrap">${escaped}</div>`;
}

export async function POST(req: Request) {
  const {
    threadId,
    leadId,
    toEmail,
    subject,
    bodyText,
    bodyHtml,
    quoteId,
    format,
    attachments,
  } = await req.json();

  const from = process.env.SMTP_USER ?? "audits@yourdomain.com";
  let quoteSuffix = "";

  // If attaching a quote, mark it SENT and append the details.
  // NOTE: no links of any kind are included in outbound emails —
  // clients approve by replying. Nothing in this system is exposed to them.
  if (quoteId) {
    const { data: quote } = await supabaseAdmin
      .from("quotations")
      .update({ status: "SENT", sent_at: new Date().toISOString() })
      .eq("id", quoteId)
      .select()
      .single();

    if (quote) {
      quoteSuffix = `\n\n---\nQuotation ${quote.quote_number}: ${quote.mandays} man-days | $${quote.total_amount}\nTo approve, simply reply to this email and we'll schedule your audit.`;
    }

    if (leadId) {
      await supabaseAdmin.from("leads").update({ stage: "QUOTED" }).eq("id", leadId);
    }
  }

  const finalBody = (bodyText ?? "") + quoteSuffix;
  const html =
    (bodyHtml?.trim() ? bodyHtml : textToHtml(bodyText ?? "")) + textToHtml(quoteSuffix);

  const outgoingAttachments = (attachments as IncomingAttachment[] | undefined)?.map((a) => ({
    filename: a.name,
    content: Buffer.from(a.data, "base64"),
    contentType: a.contentType,
  }));

  // .eml download mode: compose the raw RFC-822 message without sending
  if (format === "eml") {
    const eml = await composeRawEmail({
      from,
      to: toEmail,
      subject,
      text: finalBody,
      html,
      attachments: outgoingAttachments,
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
      html,
      attachments: outgoingAttachments,
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
      body_html: html,
      provider_message_id: providerMessageId,
      sent_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Store copies of outbound attachments in the shared bucket
  if (outgoingAttachments?.length && savedMsg?.id) {
    const metas: AttachmentMeta[] = [];
    for (const att of outgoingAttachments) {
      const meta = await uploadAttachment(
        resolvedThreadId,
        att.filename,
        att.content,
        att.contentType
      );
      if (meta) metas.push(meta);
    }
    if (metas.length) {
      await supabaseAdmin
        .from("email_messages")
        .update({ attachments: metas })
        .eq("id", savedMsg.id);
    }
  }

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
