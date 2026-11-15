import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  const { threadId, leadId, toEmail, subject, bodyText, quoteId } = await req.json();

  let finalBody = bodyText;

  // If attaching a quote, append a 1-click acceptance link
  if (quoteId) {
    const { data: quote } = await supabaseAdmin
      .from("quotations")
      .update({ status: "SENT" })
      .eq("id", quoteId)
      .select()
      .single();

    if (quote) {
      const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/quotes/accept?token=${quote.approval_token}`;
      finalBody += `\n\n---\nQuote #${quote.quote_number} (${quote.mandays} Man-Days | $${quote.total_amount})\nClick here to approve quote and initiate audit scheduling: ${acceptUrl}`;
    }

    await supabaseAdmin.from("leads").update({ stage: "QUOTED" }).eq("id", leadId);
  }

  // PLACEHOLDER: Send actual email via Nodemailer SMTP (Port 465) or Gmail/Resend API
  console.log(`[DISPATCHING EMAIL] To: ${toEmail} | Subject: ${subject}\n${finalBody}`);

  // Sync message to Portal DB
  const { data: savedMsg, error } = await supabaseAdmin
    .from("email_messages")
    .insert({
      thread_id: threadId,
      direction: "outbound",
      sender_email: "audits@yourdomain.com",
      body_text: finalBody,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: savedMsg });
}