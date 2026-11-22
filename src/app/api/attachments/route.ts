import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// GET /api/attachments?path=<storage path> → redirect to a short-lived signed URL
export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get("path");
  if (!path) return NextResponse.json({ error: "Missing path" }, { status: 400 });

  const { data, error } = await supabaseAdmin.storage
    .from("email-attachments")
    .createSignedUrl(path, 3600);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Could not sign URL" }, { status: 404 });
  }
  return NextResponse.redirect(data.signedUrl, 302);
}
