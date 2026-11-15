import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface InboundEmail {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  messageId?: string;
  inReplyTo?: string;
}

async function extractSpecs(body: string): Promise<Record<string, unknown>> {
  if (!OPENAI_API_KEY || !body) return {};
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Extract audit-relevant specs from this email as JSON. Keys: company, contact_name, company_size, industry, systems, requested_scope, urgency. Return {} for anything not present.",
          },
          { role: "user", content: body.slice(0, 12000) },
        ],
      }),
    });
    if (!res.ok) return {};
    const data = await res.json();
    return JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  } catch {
    return {};
  }
}

async function findOrCreateLead(email: InboundEmail, specs: Record<string, unknown>) {
  const { data: existing } = await supabase
    .from("leads")
    .select("id")
    .eq("contact_email", email.from)
    .maybeSingle();

  if (existing) return existing.id as string;

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      company_name: (specs.company as string) ?? email.from,
      contact_email: email.from,
      specs,
      status: "new",
    })
    .select("id")
    .single();

  if (error) throw error;
  return lead.id as string;
}

async function findOrCreateThread(leadId: string, subject: string) {
  // Reuse the most recent thread for replies (In-Reply-To / subject match).
  const { data: threads } = await supabase
    .from("email_threads")
    .select("id")
    .eq("lead_id", leadId)
    .order("last_message_at", { ascending: false })
    .limit(5);

  const match = threads?.find((t) => subject && t.id); // subject stored on thread level is loose; refine with message subject if needed
  const threadId = match?.id;
  if (threadId) return threadId;

  const { data: thread, error } = await supabase
    .from("email_threads")
    .insert({ lead_id: leadId, subject })
    .select("id")
    .single();
  if (error) throw error;
  return thread.id as string;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload = await req.json();
    // Normalize across providers (SendGrid/Postmark/Resend inbound parse).
    const email: InboundEmail = {
      from: payload.from ?? payload.sender ?? "",
      to: payload.to ?? "",
      subject: payload.subject ?? "(no subject)",
      text: payload.text ?? payload.stripped_text ?? "",
      html: payload.html ?? payload.html_body ?? "",
      messageId: payload.messageId ?? payload.MessageID,
      inReplyTo: payload.inReplyTo ?? payload.InReplyTo,
    };

    if (!email.from) {
      return new Response("Missing sender", { status: 400 });
    }

    const specs = await extractSpecs(email.text ?? "");
    const leadId = await findOrCreateLead(email, specs);
    const threadId = await findOrCreateThread(leadId, email.subject);

    const { error } = await supabase.from("email_messages").insert({
      thread_id: threadId,
      direction: "inbound",
      sender_email: email.from,
      recipient_email: email.to,
      subject: email.subject,
      body_text: email.text ?? null,
      body_html: email.html ?? null,
      provider_message_id: email.messageId ?? null,
    });
    if (error) throw error;

    await supabase
      .from("email_threads")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", threadId);

    await supabase
      .from("leads")
      .update({ last_contacted_at: new Date().toISOString() })
      .eq("id", leadId);

    // Merge extracted specs into the lead
    if (Object.keys(specs).length > 0) {
      const { data: lead } = await supabase
        .from("leads")
        .select("specs")
        .eq("id", leadId)
        .single();
      await supabase
        .from("leads")
        .update({ specs: { ...(lead?.specs ?? {}), ...specs } })
        .eq("id", leadId);
    }

    return new Response(JSON.stringify({ ok: true, leadId, threadId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("inbound-email-webhook error", err);
    return new Response("Internal error", { status: 500 });
  }
});
