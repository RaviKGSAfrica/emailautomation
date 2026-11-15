export interface EmailTemplate {
  id: string;
  label: string;
  subject: string;
  body: string;
}

export interface TemplateContext {
  companyName?: string;
  contactName?: string;
  contactEmail?: string;
  threadSubject?: string;
  standards?: string[];
  mandays?: number;
  totalAmount?: number;
  quoteLink?: string;
  quoteNumber?: string;
}

const TEMPLATES: EmailTemplate[] = [
  {
    id: "recert-outreach",
    label: "Recertification outreach",
    subject: "Recertification audit — {{companyName}}",
    body: `Hi {{contactName}},

I hope this message finds you well. I'm writing regarding the upcoming recertification audit for {{companyName}}.

Based on your current scope{{#standards}} ({{standards}}){{/standards}}, we'd like to schedule the audit at your earliest convenience. Please let me know your preferred dates and the current headcount so we can finalize the quotation.

Looking forward to your reply.

Best regards,
Audit Team
KGS Africa`,
  },
  {
    id: "quote-send",
    label: "Send quotation",
    subject: "Quotation {{quoteNumber}} — {{companyName}}",
    body: `Hi {{contactName}},

Please find below our quotation for the audit engagement:

{{#quoteDetails}}Quote: {{quoteNumber}}{{#mandays}} | {{mandays}} man-days{{/mandays}}{{#totalAmount}} | ${"$"}{{totalAmount}}{{/totalAmount}}
{{/quoteDetails}}{{#quoteLink}}You can review and approve this quotation here:
{{quoteLink}}

{{/quoteLink}}If you have any questions or would like to adjust the scope, just reply to this email.

Best regards,
Audit Team
KGS Africa`,
  },
  {
    id: "quote-followup",
    label: "Quote follow-up",
    subject: "Following up on quotation {{quoteNumber}}",
    body: `Hi {{contactName}},

I wanted to follow up on the quotation we sent over for {{companyName}}. Has your team had a chance to review it?

If everything looks good, you can approve it directly here:
{{quoteLink}}

Happy to jump on a quick call if you'd like to discuss any details.

Best regards,
Audit Team
KGS Africa`,
  },
  {
    id: "audit-scheduled",
    label: "Audit scheduled",
    subject: "Audit scheduled — {{companyName}}",
    body: `Hi {{contactName}},

Great news — your audit for {{companyName}} has been scheduled.

Our lead auditor will reach out shortly with the confirmed date, agenda, and any documentation we need from your side beforehand.

If anything changes on your end, please let us know as soon as possible.

Best regards,
Audit Team
KGS Africa`,
  },
  {
    id: "general-reply",
    label: "General reply",
    subject: "Re: {{threadSubject}}",
    body: `Hi {{contactName}},

Thank you for your email. We'll review the details and get back to you shortly.

Best regards,
Audit Team
KGS Africa`,
  },
];

// Minimal {{var}} / {{#section}}…{{/section}} template renderer (no deps).
function render(template: string, ctx: TemplateContext): string {
  const sections: Record<string, boolean> = {
    "#standards": !!ctx.standards?.length,
    "#quoteDetails": !!(ctx.quoteNumber || ctx.totalAmount),
    "#mandays": ctx.mandays != null,
    "#totalAmount": ctx.totalAmount != null,
    "#quoteLink": !!ctx.quoteLink,
  };

  const vars: Record<string, string> = {
    companyName: ctx.companyName ?? "",
    contactName: ctx.contactName ?? "there",
    contactEmail: ctx.contactEmail ?? "",
    threadSubject: ctx.threadSubject ?? "",
    standards: ctx.standards?.join(", ") ?? "",
    mandays: ctx.mandays != null ? String(ctx.mandays) : "",
    totalAmount: ctx.totalAmount != null ? ctx.totalAmount.toLocaleString() : "",
    quoteLink: ctx.quoteLink ?? "",
    quoteNumber: ctx.quoteNumber ?? "",
  };

  // Resolve sections first (keep inner content only when flag is true)
  let out = template.replace(/\{\{(#|\/)(\w+)\}\}([\s\S]*?)\{\{\/\2\}\}/g, (_m, kind, name, inner) => {
    if (kind === "/") return ""; // stray closer, shouldn't happen with greedy match
    return sections[`#${name}`] ? inner : "";
  });

  // Then simple variables
  out = out.replace(/\{\{(\w+)\}\}/g, (_m, name) => vars[name] ?? "");
  return out.trim();
}

export function getTemplates(): EmailTemplate[] {
  return TEMPLATES;
}

export function renderTemplate(id: string, ctx: TemplateContext): { subject: string; body: string } | null {
  const t = TEMPLATES.find((t) => t.id === id);
  if (!t) return null;
  return { subject: render(t.subject, ctx), body: render(t.body, ctx) };
}
