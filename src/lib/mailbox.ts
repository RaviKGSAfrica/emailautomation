import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

export interface SyncedAttachment {
  filename: string;
  contentType: string;
  size: number;
  content: Buffer;
}

export interface SyncedEmail {
  messageId: string | null;
  fromAddress: string;
  fromName: string | null;
  toAddress: string;
  subject: string;
  date: Date;
  text: string | null;
  html: string | null;
  attachments: SyncedAttachment[];
}

// Connects to the configured IMAP mailbox (mail.kgsafrica.com:993) and returns
// the most recent messages in INBOX.
export async function fetchInboxMessages(limit = 50): Promise<SyncedEmail[]> {
  const client = new ImapFlow({
    host: process.env.IMAP_HOST ?? "mail.kgsafrica.com",
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: true, // SSL/TLS on 993
    auth: {
      user: process.env.IMAP_USER!,
      pass: process.env.IMAP_PASSWORD!,
    },
    logger: false,
  });

  const messages: SyncedEmail[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const status = await client.status("INBOX", { messages: true });
      const total = status ? (status.messages ?? 0) : 0;
      if (total === 0) return [];

      const start = Math.max(1, total - limit + 1);
      for await (const msg of client.fetch(`${start}:*`, { envelope: true, source: true })) {
        if (!msg.source) continue;
        const parsed = await simpleParser(msg.source);

        const fromGroups = parsed.from
          ? Array.isArray(parsed.from)
            ? parsed.from
            : [parsed.from]
          : [];
        const toGroups = parsed.to
          ? Array.isArray(parsed.to)
            ? parsed.to
            : [parsed.to]
          : [];
        const from = fromGroups[0]?.value?.[0];
        const to = toGroups[0]?.value?.[0];
        const date =
          parsed.date instanceof Date
            ? parsed.date
            : parsed.date
              ? new Date(parsed.date)
              : new Date(msg.envelope?.date ?? Date.now());

        messages.push({
          messageId: parsed.messageId ?? null,
          fromAddress: from?.address ?? "",
          fromName: from?.name ?? null,
          toAddress: to?.address ?? "",
          subject: parsed.subject ?? "(no subject)",
          date,
          text: parsed.text ?? null,
          html: typeof parsed.html === "string" ? parsed.html : null,
          attachments: (parsed.attachments ?? [])
            .filter((a) => a.filename && a.content)
            .map((a) => ({
              filename: a.filename!,
              contentType: a.contentType ?? "application/octet-stream",
              size: a.size ?? a.content!.length,
              content: a.content as Buffer,
            })),
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return messages;
}
