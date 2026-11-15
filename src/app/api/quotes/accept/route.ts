import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  // Updating status to ACCEPTED fires the Postgres trigger `trg_quote_accepted`
  // which automatically creates the Audit row and updates the Lead stage.
  const { data: quote, error } = await supabaseAdmin
    .from("quotations")
    .update({ status: "ACCEPTED", accepted_at: new Date().toISOString() })
    .eq("approval_token", token)
    .select("*, leads(company_name)")
    .single();

  if (error || !quote) {
    return NextResponse.json({ error: "Invalid or expired quote token" }, { status: 404 });
  }

  const companyName = (quote.leads as { company_name?: string } | null)?.company_name ?? "";

  return new Response(
    `<html><body style="font-family:sans-serif;padding:40px;">
      <h2>Quote #${quote.quote_number} Approved!</h2>
      <p>Thank you, <strong>${companyName}</strong>. Your audit record has been automatically generated and our lead auditor team will reach out shortly with dates.</p>
    </body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}
