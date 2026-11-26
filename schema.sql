CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  customer_name TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  email TEXT,
  country TEXT NOT NULL,
  preferred_contact TEXT,
  subject TEXT NOT NULL,
  experience TEXT,
  current_platform TEXT,
  target_platform TEXT,
  profile_link TEXT,
  selected_items TEXT NOT NULL,
  selected_labels TEXT NOT NULL,
  custom_topics TEXT,
  goal TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'ar',
  consent INTEGER NOT NULL DEFAULT 1,
  payload_json TEXT NOT NULL,
  quoted_price REAL,
  payment_status TEXT NOT NULL DEFAULT 'not_requested',
  amount_received REAL NOT NULL DEFAULT 0,
  deadline TEXT,
  next_follow_up TEXT,
  internal_notes TEXT,
  notification_status TEXT NOT NULL DEFAULT 'not_configured',
  notification_error TEXT,
  batch_week INTEGER,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  referral_code TEXT,
  ai_notes_json TEXT,
  delivery_links_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_whatsapp ON requests(whatsapp);
CREATE INDEX IF NOT EXISTS idx_requests_batch_week ON requests(batch_week);
CREATE INDEX IF NOT EXISTS idx_requests_referral ON requests(referral_code);

CREATE TABLE IF NOT EXISTS site_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  visitor_hash TEXT,
  event_name TEXT NOT NULL,
  page_path TEXT NOT NULL,
  item_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_created_at ON site_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_name ON site_events(event_name);
CREATE INDEX IF NOT EXISTS idx_events_visitor ON site_events(visitor_hash);

CREATE TABLE IF NOT EXISTS admin_login_limits (
  ip_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS public_request_limits (
  ip_hash TEXT PRIMARY KEY,
  submissions INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS referrals (
  code TEXT PRIMARY KEY,
  partner_name TEXT NOT NULL,
  partner_contact TEXT,
  discount_percent REAL NOT NULL DEFAULT 0,
  commission_percent REAL NOT NULL DEFAULT 10,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS protected_content (
  id TEXT PRIMARY KEY,
  item_key TEXT,
  title_ar TEXT NOT NULL,
  title_en TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'guide',
  media_url TEXT,
  body_markdown TEXT,
  duration_label TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS client_access_tokens (
  token TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  allowed_content_ids TEXT NOT NULL DEFAULT '[]',
  custom_note TEXT,
  expires_at TEXT,
  revoked INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TEXT,
  access_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_access_tokens_request ON client_access_tokens(request_id);
