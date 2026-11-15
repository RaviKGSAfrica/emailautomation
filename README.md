# emailautomation
audit-crm-portal/
├── supabase/
│   ├── migrations/
│   │   └── 20261115000000_init_crm_pipeline.sql   # Core schema & auto-audit trigger
│   └── functions/
│       ├── inbound-email-webhook/
│       │   └── index.ts                          # Receives emails & runs AI extraction
│       └── recertification-cron/
│           └── index.ts                          # Daily cron for 60/90-day outreach
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── emails/send/route.ts              # Outbound SMTP / Provider API sender
│   │   │   └── quotes/accept/route.ts            # Tokenized quote approval endpoint
│   │   ├── portal/
│   │   │   └── page.tsx                          # Main split-pane Inbox + Quote/Audit UI
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ThreadList.tsx                        # Left pane: Lead & email threads
│   │   ├── ConversationView.tsx                  # Center pane: Email history & reply box
│   │   └── DealActionPanel.tsx                   # Right pane: AI specs, Quote builder, Audit status
│   ├── lib/
│   │   ├── supabase.ts                           # Supabase client initialization
│   │   └── types.ts                              # Shared TypeScript interfaces
└── .env.local.example