import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EMAIL_API_KEY = Deno.env.get("EMAIL_PROVIDER_API_KEY");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "Audit CRM <noreply@example.com>";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const RECERTIFY_DAYS = 90;   // audits become due 90 days after certification
const FOLLOWUP_DAYS = 60;    // outreach at 60 days
const EXPIRY_DAYS = 90;      // mark expired after 90 days without response

async function sendEmail(to: string, subject: string, text: string) {
  if (!EMAIL_API_KEY) {
    console.log(`[dry-run] would send to ${to}: ${subject}`);
    return;
  }
  // Provider-agnostic placeholder — swap for Resend/SendGrid/Postmark call.
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${EMAIL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, text }),
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const today = new Date();
  const results = { followups: 0, recertifications: 0, expirations: 0 };

  try {
    // 1. 60-day follow-ups: leads not contacted in FOLLOWUP_DAYS
    const followupCutoff = new Date(today);
    followupCutoff.setDate(followupCutoff.getDate() - FOLLOWUP_DAYS);

    const { data: staleLeads } = await supabase
      .from("leads")
      .select("id, company_name, contact_email, last_contacted_at")
      .in("status", ["qualified", "quoted"])
      .or(
        `last_contacted_at.is.null,last_contacted_at.lt.${followupCutoff.toISOString()}`
      );

    for (const lead of staleLeads ?? []) {
      if (!lead.contact_email) continue;
      await sendEmail(
        lead.contact_email,
        "Following up on your audit",
        `Hi,\n\nIt's been a while since we last connected about ${lead.company_name}'s audit. Are you still interested in moving forward?\n\nBest regards`
      );
      await supabase
        .from("leads")
        .update({ last_contacted_at: today.toISOString() })
        .eq("id", lead.id);
      results.followups++;
    }

    // 2. 90-day recertification: audits whose recertify_due_at is today/past
    const { data: dueAudits } = await supabase
      .from("audits")
      .select("id, lead_id, leads(contact_email, company_name)")
      .lte("recertify_due_at", today.toISOString().slice(0, 10))
      .eq("status", "completed");

    for (const audit of dueAudits ?? []) {
      const lead = audit.leads as unknown as {
        contact_email: string | null;
        company_name: string;
      } | null;
      if (!lead?.contact_email) continue;

      await sendEmail(
        lead.contact_email,
        "Your audit certification is due for renewal",
        `Hi,\n\nYour audit certification for ${lead.company_name} is due for recertification. Reply to this email to schedule.\n\nBest regards`
      );

      await supabase
        .from("audits")
        .update({
          status: "scheduled",
          recertify_due_at: new Date(
            today.getTime() + RECERTIFY_DAYS * 86400000
          )
            .toISOString()
            .slice(0, 10),
        })
        .eq("id", audit.id);
      results.recertifications++;
    }

    // 3. Expire quotations past their expires_at
    const { data: expiredQuotes } = await supabase
      .from("quotations")
      .update({ status: "EXPIRED" })
      .in("status", ["SENT", "DRAFT"])
      .lt("expires_at", today.toISOString())
      .select("id");
    results.expirations = expiredQuotes?.length ?? 0;

    return new Response(JSON.stringify({ ok: true, ...results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("recertification-cron error", err);
    return new Response("Internal error", { status: 500 });
  }
});
