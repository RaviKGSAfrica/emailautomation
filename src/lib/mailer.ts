import nodemailer from "nodemailer";

export interface OutgoingEmail {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "mail.kgsafrica.com",
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: Number(process.env.SMTP_PORT ?? 465) === 465, // SSL on 465, STARTTLS on 587
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
  });
}

// Sends via SMTP. Returns the provider's message ID when available.
export async function sendSmtpEmail(msg: OutgoingEmail): Promise<{ messageId: string | null }> {
  const info = await createTransport().sendMail(msg);
  return { messageId: info.messageId ?? null };
}

// Composes the same message into a raw RFC-822 string for .eml download,
// without sending anything.
export async function composeRawEmail(msg: OutgoingEmail): Promise<string> {
  const transport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "unix",
  });
  const info = await transport.sendMail(msg);
  return (info.message as Buffer).toString("utf8");
}
