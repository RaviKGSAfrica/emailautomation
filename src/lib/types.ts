export interface Lead {
  id: string;
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
  phone: string | null;
  status: "new" | "qualified" | "quoted" | "won" | "lost";
  stage: "NEW" | "QUOTED" | "AUDIT_SCHEDULED" | "AUDIT_IN_PROGRESS" | "CERTIFIED" | "LOST";
  audit_stage: "intake" | "in_progress" | "review" | "certified" | "expired";
  specs: Record<string, unknown>;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailThread {
  id: string;
  lead_id: string;
  subject: string;
  last_message_at: string;
  created_at: string;
}

export interface AttachmentMeta {
  name: string;
  path: string;
  contentType?: string;
  size?: number;
}

export interface EmailMessage {
  id: string;
  thread_id: string;
  direction: "inbound" | "outbound";
  sender_email: string;
  recipient_email: string | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  attachments: AttachmentMeta[];
  provider_message_id: string | null;
  sent_at: string;
  created_at: string;
}

export interface ThreadNote {
  id: string;
  thread_id: string;
  author: string;
  body: string;
  created_at: string;
}

export interface Quotation {
  id: string;
  lead_id: string;
  quote_number: string;
  approval_token: string;
  currency?: string;
  mandays: number;
  total_amount: number;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";
  is_active?: boolean;
  sent_at: string | null;
  accepted_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Audit {
  id: string;
  lead_id: string;
  type: string;
  status: "scheduled" | "in_progress" | "completed" | "failed";
  scheduled_for: string | null;
  completed_at: string | null;
  recertify_due_at: string | null;
  findings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
