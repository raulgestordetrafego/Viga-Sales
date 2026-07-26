-- Postgres Leads — Viga Sales
-- Migrado do SQLite em 2026-06-22

CREATE TABLE IF NOT EXISTS prospects (
    id TEXT PRIMARY KEY,
    name TEXT,
    phone TEXT NOT NULL,
    email TEXT,
    company TEXT,
    segment TEXT,
    city TEXT,
    address TEXT,
    website TEXT,
    instagram TEXT,
    rating DECIMAL,
    reviews_count INTEGER,
    source TEXT DEFAULT 'manual',
    raw_data TEXT,
    status TEXT DEFAULT 'novo',
    ai_message TEXT,
    campaign_id TEXT,
    sent_at TEXT,
    follow_up_at TEXT,
    responded_at TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_lead BOOLEAN DEFAULT false,
    cnpj TEXT,
    trade_name TEXT,
    phone2 TEXT,
    state TEXT,
    neighborhood TEXT,
    zip_code TEXT,
    company_size TEXT,
    capital_social TEXT,
    legal_nature TEXT,
    opening_date TEXT,
    cnpj_status TEXT,
    main_activity_code TEXT
);
CREATE INDEX IF NOT EXISTS idx_prospects_phone ON prospects(phone);
CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status);
CREATE INDEX IF NOT EXISTS idx_prospects_is_lead ON prospects(is_lead);

CREATE TABLE IF NOT EXISTS prospecting_campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    segment TEXT,
    city TEXT,
    status TEXT DEFAULT 'active',
    daily_limit INTEGER DEFAULT 40,
    message_template TEXT,
    use_ai INTEGER DEFAULT 1,
    sent_today INTEGER DEFAULT 0,
    last_reset_date TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prospecting_logs (
    id TEXT PRIMARY KEY,
    prospect_id TEXT NOT NULL REFERENCES prospects(id),
    campaign_id TEXT,
    action TEXT NOT NULL,
    message TEXT,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_lists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    file_name TEXT,
    recipient_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_recipients (
    id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL REFERENCES email_lists(id),
    email TEXT NOT NULL,
    name TEXT,
    company TEXT,
    extra_data TEXT DEFAULT '{}',
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_recipients_list ON email_recipients(list_id);
CREATE INDEX IF NOT EXISTS idx_email_recipients_status ON email_recipients(status);
