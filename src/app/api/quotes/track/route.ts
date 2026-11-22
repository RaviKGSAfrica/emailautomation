import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

// GET /api/quotes/track?token=<approval_token>&e=open|click
// e=open  → records an email-open event and returns a 1x1 tracking pixel
// e=click → records a click event and redirects to the quote approval page
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const event = searchParams.get("e") === "click" ? "click" : "open";

  if (!token) return new NextResponse("Missing token", { status: 400 });

  const userAgent = req.headers.get("user-agent") ?? null;

  const { data: quote } = await supabaseAdmin
    .from("quotations")
    .select("id")
    .eq("approval_token", token)
    .maybeSingle();

  if (quote) {
    await supabaseAdmin.from("quote_events").insert({
      quotation_id: quote.id,
      approval_token: token,
      event_type: event,
      user_agent: userAgent,
    });
  }

  if (event === "click") {
    const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/quotes/accept?token=${token}`;
    return NextResponse.redirect(url, 302);
  }

  return new NextResponse(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
