const SESSION_COOKIE = 'khutwa_admin_session';
const SESSION_SECONDS = 60 * 60 * 12;
const ALLOWED_STATUSES = new Set([
  'new','reviewing','needs_info','offer_sent','awaiting_deposit','confirmed',
  'in_progress','awaiting_client_review','awaiting_balance','completed','paused','cancelled','overdue'
]);
const ALLOWED_PAYMENT = new Set([
  'not_requested','requested','proof_received_pending_verification','partial_verified','paid_verified','refunded'
]);
const ALLOWED_EVENTS = new Set(['page_view','add_to_cart','remove_from_cart','request_started']);

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff',
      ...extraHeaders,
    },
  });
}
function text(message, status = 400) {
  return new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}
function base64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function fromBase64url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
async function hmac(value, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign','verify']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}
async function createSession(secret) {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(new TextEncoder().encode(JSON.stringify({ sub: 'khutwa-admin', iat: now, exp: now + SESSION_SECONDS })));
  const signature = base64url(await hmac(payload, secret));
  return `${payload}.${signature}`;
}
async function verifySession(token, secret) {
  if (!token || !secret || token.length > 2048) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const expected = await hmac(parts[0], secret);
  let received;
  try { received = fromBase64url(parts[1]); } catch { return false; }
  if (expected.length !== received.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ received[i];
  if (diff !== 0) return false;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64url(parts[0])));
    return payload.sub === 'khutwa-admin' && Number(payload.exp) > Math.floor(Date.now() / 1000);
  } catch { return false; }
}
function getCookie(request, name) {
  const cookie = request.headers.get('cookie') || '';
  for (const item of cookie.split(';')) {
    const [key, ...value] = item.trim().split('=');
    if (key === name) return value.join('=');
  }
  return '';
}
async function readJson(request, maxBytes = 30000) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > maxBytes) throw new Error('Request too large');
  return JSON.parse(raw || '{}');
}
function clean(value, max = 5000) {
  return String(value ?? '').trim().slice(0, max);
}
function moneyOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1000000 ? number : null;
}
async function sha256(value) {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
}
async function isAdmin(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  return verifySession(token, env.SESSION_SECRET || '');
}
async function enforceLoginLimit(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const key = await sha256(`${ip}:${env.SESSION_SECRET}`);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare('SELECT attempts, window_start FROM admin_login_limits WHERE ip_hash = ?').bind(key).first();
  if (row && now - Number(row.window_start) < 600 && Number(row.attempts) >= 8) return false;
  if (row && now - Number(row.window_start) < 600) {
    await env.DB.prepare('UPDATE admin_login_limits SET attempts = attempts + 1 WHERE ip_hash = ?').bind(key).run();
  } else {
    await env.DB.prepare('INSERT INTO admin_login_limits (ip_hash, attempts, window_start) VALUES (?, 1, ?) ON CONFLICT(ip_hash) DO UPDATE SET attempts=1, window_start=excluded.window_start').bind(key, now).run();
  }
  return true;
}
async function enforcePublicSubmissionLimit(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const salt = env.SESSION_SECRET || 'khutwa-public-intake-v05';
  const key = await sha256(`${ip}:${salt}`);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare('SELECT submissions, window_start FROM public_request_limits WHERE ip_hash = ?').bind(key).first();
  if (row && now - Number(row.window_start) < 900 && Number(row.submissions) >= 5) return false;
  if (row && now - Number(row.window_start) < 900) {
    await env.DB.prepare('UPDATE public_request_limits SET submissions = submissions + 1 WHERE ip_hash = ?').bind(key).run();
  } else {
    await env.DB.prepare('INSERT INTO public_request_limits (ip_hash, submissions, window_start) VALUES (?, 1, ?) ON CONFLICT(ip_hash) DO UPDATE SET submissions=1, window_start=excluded.window_start').bind(key, now).run();
  }
  await env.DB.prepare('DELETE FROM public_request_limits WHERE window_start < ?').bind(now - 86400).run();
  return true;
}
async function recordEvent(env, event) {
  await env.DB.prepare(
    'INSERT INTO site_events (created_at, visitor_hash, event_name, page_path, item_id) VALUES (?, ?, ?, ?, ?)'
  ).bind(new Date().toISOString(), event.visitorHash || null, event.name, event.page || '/', event.itemId || null).run();
}
function normalizeRequest(body) {
  const customer = body.customer || {};
  const selected = Array.isArray(body.selectedItems) ? body.selectedItems : [];
  const name = clean(customer.name, 160);
  const whatsapp = clean(customer.whatsapp, 60);
  const email = clean(customer.email, 200);
  const country = clean(customer.country, 100);
  const subject = clean(customer.subject, 160);
  const goal = clean(body.goal, 5000);
  const contactChoice = clean(customer.preferredContact, 40);
  const preferredContact = contactChoice === 'Email' ? 'Email' : 'WhatsApp';
  if (preferredContact === 'Email' && !email) throw new Error('Please provide your email address for the selected contact method.');
  if (clean(body.website, 200)) throw new Error('spam');
  if (!name || !whatsapp || !country || !subject || !goal || body.consent !== true) throw new Error('Please complete all required fields and consent.');
  if (!selected.length || selected.length > 30) throw new Error('Choose at least one service or topic.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Please enter a valid email address.');
  const items = selected.map(item => ({
    type: clean(item.type, 30),
    id: clean(item.id, 120),
    label: clean(item.label, 240),
    price: moneyOrNull(item.price),
    text: clean(item.text, 1000),
    qty: Math.min(20, Math.max(1, Number(item.qty) || 1)),
  }));
  if (items.some(item => !item.label)) throw new Error('Invalid selected item.');
  const analytics = body.analytics && body.analytics.consent === true
    ? { visitorId: clean(body.analytics.visitorId, 100) }
    : null;
  return {
    schema: 'khutwa-request-v1',
    createdAt: new Date().toISOString(),
    language: body.language === 'en' ? 'en' : 'ar',
    customer: {
      name, whatsapp, email, country, subject,
      experience: clean(customer.experience, 100),
      preferredContact,
    },
    platforms: {
      current: clean(body.platforms?.current, 160),
      target: clean(body.platforms?.target, 160),
      profileLink: clean(body.platforms?.profileLink, 1000),
    },
    video: {
      type: clean(body.video?.type, 160), platform: clean(body.video?.platform, 160),
      duration: clean(body.video?.duration, 100), footage: clean(body.video?.footage, 100),
    },
    market: { country: clean(body.market?.country, 100), learnerLanguage: clean(body.market?.learnerLanguage, 100) },
    promotion: { budget: clean(body.promotion?.budget, 100), channels: clean(body.promotion?.channels, 300) },
    selectedItems: items,
    selectedTopics: Array.isArray(body.selectedTopics) ? body.selectedTopics.slice(0, 30).map(x => clean(x, 200)) : [],
    customTopics: clean(body.customTopics, 3000),
    goal,
    consent: true,
    analytics,
    source: 'Khutwa website',
  };
}
async function notifyGoogle(requestId, record, env) {
  const url = env.GOOGLE_APPS_SCRIPT_URL;
  const secret = env.GOOGLE_APPS_SCRIPT_SECRET;
  if (!url || !secret) {
    await env.DB.prepare("UPDATE requests SET notification_status='not_configured' WHERE id=?").bind(requestId).run();
    return;
  }
  try {
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret, type: 'new_request', requestId, request: record }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.ok === true) {
      await env.DB.prepare("UPDATE requests SET notification_status='sent', notification_error=NULL WHERE id=?").bind(requestId).run();
    } else {
      await env.DB.prepare("UPDATE requests SET notification_status='failed', notification_error=? WHERE id=?").bind(clean(result.error || `Google notification endpoint returned ${response.status}`, 300), requestId).run();
    }
  } catch (error) {
    await env.DB.prepare("UPDATE requests SET notification_status='failed', notification_error=? WHERE id=?").bind(clean(error.message, 300), requestId).run();
  }
}
async function notifyTelegram(requestId, record, adminUrl, env) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    const labels = (record.selectedItems || []).map(item => item.label).join('، ');
    const lines = [
      '🔔 طلب جديد على خُطوة',
      `رقم الطلب: ${requestId}`,
      `الاسم: ${clean(record.customer?.name, 80)}`,
      `الدولة: ${clean(record.customer?.country, 60)}`,
      `التخصص: ${clean(record.customer?.subject, 80)}`,
      `الخدمات: ${clean(labels, 600) || 'غير محدد'}`,
      `لوحة الإدارة: ${adminUrl}`,
    ];
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: lines.join('\n'), disable_web_page_preview: true }),
    });
  } catch { /* The request is already saved; a failed Telegram alert must never affect it. */ }
}
async function createRequest(request, env, ctx) {
  if (!env.DB) return json({ ok: false, error: 'Database is not configured yet.' }, 503);
  let body;
  try { body = await readJson(request); } catch (error) { return json({ ok: false, error: error.message === 'Request too large' ? error.message : 'Invalid request body.' }, 400); }
  let record;
  try { record = normalizeRequest(body); } catch (error) {
    if (error.message === 'spam') return json({ ok: true, requestId: null, accepted: true });
    return json({ ok: false, error: error.message }, 400);
  }
  if (!await enforcePublicSubmissionLimit(request, env)) return json({ ok: false, error: 'تم استلام عدد كبير من المحاولات من هذا الاتصال. حاول بعد قليل.' }, 429);
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const id = `KW-${datePart}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  const selectedLabels = record.selectedItems.map(item => `${item.label}${item.price == null ? '' : ` ($${item.price})`}`).join(' | ');
  const visitorHash = record.analytics?.visitorId ? await sha256(record.analytics.visitorId) : null;
  const storedRecord = { ...record, analytics: null };
  try {
    await env.DB.prepare(`INSERT INTO requests (
      id, created_at, updated_at, status, customer_name, whatsapp, email, country, preferred_contact,
      subject, experience, current_platform, target_platform, profile_link, selected_items,
      selected_labels, custom_topics, goal, language, consent, payload_json, notification_status
    ) VALUES (?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'pending')`)
      .bind(
        id, now, now, record.customer.name, record.customer.whatsapp, record.customer.email,
        record.customer.country, record.customer.preferredContact, record.customer.subject,
        record.customer.experience, record.platforms.current, record.platforms.target,
        record.platforms.profileLink, JSON.stringify(record.selectedItems), selectedLabels,
        record.customTopics, record.goal, record.language, JSON.stringify(storedRecord)
      ).run();
    if (visitorHash) {
      try { await recordEvent(env, { visitorHash, name: 'request_submitted', page: '/#request', itemId: null }); } catch { /* The service request remains saved even if analytics logging fails. */ }
    }
    ctx.waitUntil(notifyGoogle(id, { ...storedRecord, requestId: id, createdAt: now }, env));
    ctx.waitUntil(notifyTelegram(id, storedRecord, `${new URL(request.url).origin}/admin/`, env));
    return json({ ok: true, requestId: id, createdAt: now }, 201);
  } catch (error) {
    return json({ ok: false, error: 'Could not save your request. Please try again.' }, 500);
  }
}
async function adminOverview(env) {
  const results = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS total FROM requests').first(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM requests WHERE created_at >= datetime('now','-30 days')").first(),
    env.DB.prepare("SELECT status, COUNT(*) AS total FROM requests GROUP BY status").all(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM site_events WHERE created_at >= datetime('now','-30 days') AND event_name='page_view'").first(),
    env.DB.prepare("SELECT COUNT(DISTINCT visitor_hash) AS total FROM site_events WHERE created_at >= datetime('now','-30 days') AND visitor_hash IS NOT NULL").first(),
    env.DB.prepare("SELECT event_name, COUNT(*) AS total FROM site_events WHERE created_at >= datetime('now','-30 days') GROUP BY event_name").all(),
    env.DB.prepare("SELECT item_id, COUNT(*) AS total FROM site_events WHERE created_at >= datetime('now','-30 days') AND event_name='add_to_cart' AND item_id IS NOT NULL GROUP BY item_id ORDER BY total DESC LIMIT 8").all(),
    env.DB.prepare("SELECT notification_status, COUNT(*) AS total FROM requests GROUP BY notification_status").all(),
  ]);
  return {
    totalRequests: results[0]?.total || 0,
    requests30d: results[1]?.total || 0,
    statuses: results[2]?.results || [],
    pageViews30d: results[3]?.total || 0,
    visitors30d: results[4]?.total || 0,
    events: results[5]?.results || [],
    popularItems: results[6]?.results || [],
    notifications: results[7]?.results || [],
    googleSyncConfigured: Boolean(env.GOOGLE_APPS_SCRIPT_URL && env.GOOGLE_APPS_SCRIPT_SECRET),
  };
}
function parseRequestRow(row) {
  let payload = {};
  try { payload = JSON.parse(row.payload_json || '{}'); } catch { /* retain base columns */ }
  return { ...row, payload };
}
async function adminRoute(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === '/api/admin/login' && request.method === 'POST') {
    if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) return json({ ok: false, error: 'Admin secrets are not configured.' }, 503);
    if (!await enforceLoginLimit(request, env)) return json({ ok: false, error: 'Too many attempts. Try again in 10 minutes.' }, 429);
    let body;
    try { body = await readJson(request, 3000); } catch { return json({ ok: false, error: 'Invalid login request.' }, 400); }
    const supplied = new TextEncoder().encode(String(body.password || ''));
    const expected = new TextEncoder().encode(env.ADMIN_PASSWORD);
    let diff = supplied.length ^ expected.length;
    const length = Math.max(supplied.length, expected.length);
    for (let i = 0; i < length; i++) diff |= (supplied[i] || 0) ^ (expected[i] || 0);
    if (diff !== 0) return json({ ok: false, error: 'Incorrect password.' }, 401);
    await env.DB.prepare('DELETE FROM admin_login_limits WHERE ip_hash = ?').bind(await sha256(`${request.headers.get('CF-Connecting-IP') || 'unknown'}:${env.SESSION_SECRET}`)).run();
    const token = await createSession(env.SESSION_SECRET);
    const headers = { 'set-cookie': `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/api/admin; Max-Age=${SESSION_SECONDS}` };
    return json({ ok: true }, 200, headers);
  }
  if (path === '/api/admin/logout' && request.method === 'POST') {
    return json({ ok: true }, 200, { 'set-cookie': `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/api/admin; Max-Age=0` });
  }
  if (!await isAdmin(request, env)) return json({ ok: false, error: 'Authentication required.' }, 401);
  if (path === '/api/admin/me' && request.method === 'GET') return json({ ok: true, authenticated: true });
  if (path === '/api/admin/overview' && request.method === 'GET') return json({ ok: true, overview: await adminOverview(env) });
  if (path === '/api/admin/requests' && request.method === 'GET') {
    const status = clean(url.searchParams.get('status'), 40);
    const search = clean(url.searchParams.get('q'), 120);
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 100));
    let query = 'SELECT * FROM requests';
    const where = [];
    const bindings = [];
    if (status && ALLOWED_STATUSES.has(status)) { where.push('status = ?'); bindings.push(status); }
    if (search) { where.push('(id LIKE ? OR customer_name LIKE ? OR whatsapp LIKE ? OR email LIKE ? OR selected_labels LIKE ?)'); const term = `%${search}%`; bindings.push(term, term, term, term, term); }
    if (where.length) query += ` WHERE ${where.join(' AND ')}`;
    query += ' ORDER BY created_at DESC LIMIT ?'; bindings.push(limit);
    const result = await env.DB.prepare(query).bind(...bindings).all();
    return json({ ok: true, requests: (result.results || []).map(parseRequestRow) });
  }
  if (path === '/api/admin/events' && request.method === 'GET') {
    const result = await env.DB.prepare("SELECT page_path, event_name, COUNT(*) AS total FROM site_events WHERE created_at >= datetime('now','-30 days') GROUP BY page_path, event_name ORDER BY total DESC LIMIT 30").all();
    return json({ ok: true, events: result.results || [] });
  }
  const requestMatch = path.match(/^\/api\/admin\/requests\/([A-Za-z0-9_-]+)$/);
  if (requestMatch && request.method === 'PATCH') {
    let body;
    try { body = await readJson(request, 8000); } catch { return json({ ok: false, error: 'Invalid update.' }, 400); }
    const status = clean(body.status, 40);
    const paymentStatus = clean(body.paymentStatus, 50);
    if (!ALLOWED_STATUSES.has(status) || !ALLOWED_PAYMENT.has(paymentStatus)) return json({ ok: false, error: 'Invalid status value.' }, 400);
    const quotedPrice = moneyOrNull(body.quotedPrice);
    const amountReceived = moneyOrNull(body.amountReceived) ?? 0;
    const internalNotes = clean(body.internalNotes, 5000);
    const deadline = clean(body.deadline, 30);
    const nextFollowUp = clean(body.nextFollowUp, 30);
    const result = await env.DB.prepare(`UPDATE requests SET status=?, payment_status=?, quoted_price=?, amount_received=?, internal_notes=?, deadline=?, next_follow_up=?, updated_at=? WHERE id=?`)
      .bind(status, paymentStatus, quotedPrice, amountReceived, internalNotes, deadline || null, nextFollowUp || null, new Date().toISOString(), requestMatch[1]).run();
    if (!result.meta?.changes) return json({ ok: false, error: 'Request not found.' }, 404);
    return json({ ok: true });
  }
  return json({ ok: false, error: 'Not found.' }, 404);
}
async function api(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'allow': 'GET,POST,PATCH,OPTIONS' } });
  if (url.pathname === '/api/health' && request.method === 'GET') {
    if (!env.DB) return json({ ok: false, database: false }, 503);
    try { await env.DB.prepare('SELECT 1').first(); return json({ ok: true, database: true }); }
    catch { return json({ ok: false, database: false }, 503); }
  }
  if (url.pathname === '/api/requests' && request.method === 'POST') return createRequest(request, env, ctx);
  if (url.pathname === '/api/events' && request.method === 'POST') {
    if (!env.DB) return json({ ok: false }, 503);
    let body;
    try { body = await readJson(request, 3000); } catch { return json({ ok: false }, 400); }
    const name = clean(body.name, 40);
    if (!ALLOWED_EVENTS.has(name)) return json({ ok: false }, 400);
    const visitorId = clean(body.visitorId, 100);
    if (!/^[A-Za-z0-9-]{20,100}$/.test(visitorId)) return json({ ok: false }, 400);
    const visitorHash = await sha256(visitorId);
    const recent = await env.DB.prepare("SELECT COUNT(*) AS total FROM site_events WHERE visitor_hash=? AND created_at >= datetime('now','-5 minutes')").bind(visitorHash).first();
    if (Number(recent?.total || 0) >= 100) return json({ ok: false, error: 'Event rate limit reached.' }, 429);
    await recordEvent(env, { visitorHash, name, page: clean(body.page, 160) || '/', itemId: clean(body.itemId, 120) || null });
    return json({ ok: true }, 202);
  }
  if (url.pathname.startsWith('/api/admin/')) return adminRoute(request, env);
  return json({ ok: false, error: 'Not found.' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return api(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
};
