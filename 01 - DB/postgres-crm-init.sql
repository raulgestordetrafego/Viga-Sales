-- Postgres CRM — Viga Sales
-- Migrado do SQLite em 2026-06-22

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    permissions TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    company TEXT,
    tags TEXT DEFAULT '[]',
    notes TEXT,
    avatar TEXT,
    status TEXT DEFAULT 'active',
    pipeline_stage TEXT DEFAULT 'stage_lead',
    pipeline_value NUMERIC DEFAULT 0,
    assigned_to TEXT,
    last_interaction TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);

CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL REFERENCES contacts(id),
    whatsapp_chat_id TEXT,
    status TEXT DEFAULT 'open',
    unread_count INTEGER DEFAULT 0,
    last_message TEXT,
    last_message_at TEXT,
    assigned_to TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    instance_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_id);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    whatsapp_message_id TEXT,
    direction TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    content TEXT,
    media_url TEXT,
    media_type TEXT,
    status TEXT DEFAULT 'sent',
    timestamp TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);

CREATE TABLE IF NOT EXISTS funnels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pipeline_stages (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#6366f1',
    position INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    funnel_id TEXT
);

CREATE TABLE IF NOT EXISTS broadcasts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    message TEXT NOT NULL,
    media_url TEXT,
    media_type TEXT,
    target_tags TEXT DEFAULT '[]',
    target_contacts TEXT DEFAULT '[]',
    status TEXT DEFAULT 'draft',
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    total_count INTEGER DEFAULT 0,
    scheduled_at TEXT,
    started_at TEXT,
    finished_at TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS broadcast_logs (
    id TEXT PRIMARY KEY,
    broadcast_id TEXT NOT NULL REFERENCES broadcasts(id),
    contact_id TEXT NOT NULL,
    phone TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    error TEXT,
    sent_at TEXT
);

CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL REFERENCES contacts(id),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    due_date TEXT,
    completed INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raw_webhooks (
    id SERIAL PRIMARY KEY,
    payload TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY,
    contact_id TEXT,
    phone TEXT NOT NULL,
    message TEXT NOT NULL,
    scheduled_at TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    sent_at TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    user_id TEXT,
    ip TEXT,
    meta TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS custom_fields (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    field_key TEXT UNIQUE NOT NULL,
    type TEXT DEFAULT 'text',
    options TEXT,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_custom_values (
    contact_id TEXT NOT NULL REFERENCES contacts(id),
    field_id TEXT NOT NULL REFERENCES custom_fields(id),
    value TEXT,
    PRIMARY KEY (contact_id, field_id)
);

CREATE TABLE IF NOT EXISTS whatsapp_instances (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    instance_name TEXT NOT NULL,
    api_url TEXT,
    api_key TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_instance_permissions (
    user_id TEXT NOT NULL REFERENCES users(id),
    instance_id TEXT NOT NULL REFERENCES whatsapp_instances(id),
    PRIMARY KEY (user_id, instance_id)
);

CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    plan TEXT DEFAULT 'starter',
    max_users INTEGER DEFAULT 3,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email marketing
CREATE TABLE IF NOT EXISTS email_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    template_id TEXT,
    list_id TEXT,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    sender_name TEXT DEFAULT 'Viga Sales',
    sender_email TEXT DEFAULT 'contato@vigasales.com.br',
    reply_to TEXT,
    status TEXT DEFAULT 'draft',
    daily_limit INTEGER DEFAULT 50,
    time_start TEXT DEFAULT '08:00',
    time_end TEXT DEFAULT '18:00',
    days_of_week TEXT DEFAULT '[1,2,3,4,5]',
    min_delay_sec INTEGER DEFAULT 30,
    max_delay_sec INTEGER DEFAULT 120,
    use_ai_variation INTEGER DEFAULT 0,
    ai_variation_prompt TEXT,
    sent_count INTEGER DEFAULT 0,
    bounced_count INTEGER DEFAULT 0,
    opened_count INTEGER DEFAULT 0,
    clicked_count INTEGER DEFAULT 0,
    total_recipients INTEGER DEFAULT 0,
    last_sent_at TEXT,
    started_at TEXT,
    finished_at TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    sent_today INTEGER DEFAULT 0,
    send_count_reset_date TEXT,
    replied_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS email_send_logs (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL REFERENCES email_campaigns(id),
    recipient_id TEXT NOT NULL,
    smtp_message_id TEXT,
    status TEXT DEFAULT 'pending',
    subject_sent TEXT,
    body_sent TEXT,
    error TEXT,
    sent_at TEXT,
    opened_at TEXT,
    clicked_at TEXT,
    replied_at TEXT,
    bounced_at TEXT,
    complained_at TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
