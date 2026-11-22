import { supabaseAdmin } from "@/lib/supabase";

export interface AttachmentMeta {
  name: string;
  path: string;
  contentType?: string;
  size?: number;
}

const BUCKET = "email-attachments";

// Uploads a file to the private email-attachments bucket.
// scope is typically the thread id or message id.
export async function uploadAttachment(
  scope: string,
  filename: string,
  data: Buffer | Uint8Array | string,
  contentType?: string
): Promise<AttachmentMeta | null> {
  const safeName = filename.replace(/[^\w.\-]+/g, "_");
  const path = `${scope}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
  const buffer = typeof data === "string" ? Buffer.from(data, "base64") : Buffer.from(data);

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType, upsert: false });

  if (error) {
    console.error("attachment upload failed:", error.message);
    return null;
  }
  return { name: filename, path, contentType, size: buffer.length };
}

export async function deleteAttachments(metas: AttachmentMeta[] | null | undefined) {
  const paths = (metas ?? []).map((m) => m.path).filter(Boolean);
  if (paths.length) {
    await supabaseAdmin.storage.from(BUCKET).remove(paths);
  }
}
