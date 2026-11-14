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
  notification_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_whatsapp ON requests(whatsapp);

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
