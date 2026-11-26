const SESSION_COOKIE = 'khutwa_admin_session';
const SESSION_SECONDS = 60 * 60 * 12;
const ALLOWED_STATUSES = new Set([
  'new', 'reviewing', 'needs_info', 'offer_sent', 'awaiting_deposit', 'confirmed',
  'in_progress', 'awaiting_client_review', 'awaiting_balance', 'completed', 'paused', 'cancelled', 'overdue'
]);
const CONFIRMED_SLOT_STATUSES = new Set([
  'confirmed', 'in_progress', 'awaiting_client_review', 'awaiting_balance', 'completed'
]);
const CORE_SERVICE_IDS = new Set([
  'profile_creation', 'profile_development', 'video_creation',
  'video_development', 'video_bundle', 'individual_consultation', 'campaign_review'
]);
const ALLOWED_PAYMENT = new Set([
  'not_requested', 'requested', 'proof_received_pending_verification', 'partial_verified', 'paid_verified', 'refunded'
]);
const ALLOWED_EVENTS = new Set(['page_view', 'add_to_cart', 'remove_from_cart', 'request_started']);

export const PACKAGE_ITEMS = {
  package_start: ['profile_creation', 'topic_trial_opening', 'topic_level_diagnosis', 'topic_trial_close'],
  package_refresh: ['profile_development', 'video_development', 'topic_profile_audit', 'topic_positioning_niche', 'topic_search_terms'],
  package_teaching: ['topic_learning_outcome', 'topic_lesson_flow', 'topic_activity_check', 'topic_quick_checks', 'topic_homework_progress'],
  package_visibility: ['video_creation', 'topic_brand_message', 'topic_referrals_communities', 'topic_landing_tracking'],
  package_growth: ['profile_development', 'topic_profile_audit', 'topic_trial_opening', 'topic_growth_goals', 'topic_first_contact'],
};

export const DEFAULT_SETTINGS = {
  weeklyCapacity: 10,
  activeWeekStart: '2026-11-23',
  showCapacityBar: true,
  showExactSeatsCount: true,
  publicStatsThreshold: 5,
  launchEnds: '2027-05-26',
  forceRegularPricing: false,
  topicLaunchPrice: 3,
  topicRegularPrice: 5,
  packageDiscountPercent: 15,
  servicePrices: {
    profile_creation: { launch: 25, regular: 30 },
    profile_development: { launch: 15, regular: 20 },
    video_creation: { launch: 10, regular: 15 },
    video_development: { launch: 7, regular: 10 },
    video_bundle: { launch: 15, regular: 25 },
    consultation_30: { launch: 10, regular: 15 },
    consultation_60: { launch: 15, regular: 20 },
    market_review: { launch: 0, regular: 10 },
    campaign_review: { launch: null, regular: null },
  },
};

export function mergeSettings(raw = {}) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const sp = {};
  for (const [k, def] of Object.entries(DEFAULT_SETTINGS.servicePrices)) {
    const inc = s.servicePrices?.[k] || {};
    sp[k] = {
      launch: inc.launch === null ? null : (Number.isFinite(Number(inc.launch)) ? Number(inc.launch) : def.launch),
      regular: inc.regular === null ? null : (Number.isFinite(Number(inc.regular)) ? Number(inc.regular) : def.regular),
    };
  }
  return {
    weeklyCapacity: Math.min(200, Math.max(1, Math.round(Number(s.weeklyCapacity) || DEFAULT_SETTINGS.weeklyCapacity))),
    activeWeekStart: /^\d{4}-\d{2}-\d{2}$/.test(String(s.activeWeekStart || '')) ? String(s.activeWeekStart) : DEFAULT_SETTINGS.activeWeekStart,
    showCapacityBar: s.showCapacityBar !== false,
    showExactSeatsCount: s.showExactSeatsCount !== false,
    publicStatsThreshold: Math.max(0, Math.min(500, Math.round(Number(s.publicStatsThreshold ?? DEFAULT_SETTINGS.publicStatsThreshold)))),
    launchEnds: /^\d{4}-\d{2}-\d{2}$/.test(String(s.launchEnds || '')) ? String(s.launchEnds) : DEFAULT_SETTINGS.launchEnds,
    forceRegularPricing: s.forceRegularPricing === true,
    topicLaunchPrice: Math.max(1, Number(s.topicLaunchPrice) || DEFAULT_SETTINGS.topicLaunchPrice),
    topicRegularPrice: Math.max(1, Number(s.topicRegularPrice) || DEFAULT_SETTINGS.topicRegularPrice),
    packageDiscountPercent: Math.min(60, Math.max(0, Number(s.packageDiscountPercent ?? DEFAULT_SETTINGS.packageDiscountPercent))),
    servicePrices: sp,
  };
}

export function isLaunchActive(settings, nowDateStr = new Date().toISOString().slice(0, 10)) {
  if (settings?.forceRegularPricing) return false;
  const end = settings?.launchEnds || DEFAULT_SETTINGS.launchEnds;
  return String(nowDateStr).slice(0, 10) <= String(end).slice(0, 10);
}

export function resolveCatalogPricing(settingsInput, nowDateStr = new Date().toISOString().slice(0, 10)) {
  const settings = mergeSettings(settingsInput);
  const launch = isLaunchActive(settings, nowDateStr);
  const services = {};
  for (const [id, pair] of Object.entries(settings.servicePrices)) {
    services[id] = {
      active: launch ? pair.launch : pair.regular,
      launch: pair.launch,
      regular: pair.regular,
    };
  }
  const topicPrice = launch ? settings.topicLaunchPrice : settings.topicRegularPrice;
  const packages = {};
  for (const [pkgId, itemIds] of Object.entries(PACKAGE_ITEMS)) {
    let activeItemsSum = 0;
    let regularItemsSum = 0;
    for (const itemId of itemIds) {
      if (itemId.startsWith('topic_')) {
        activeItemsSum += topicPrice;
        regularItemsSum += settings.topicRegularPrice;
      } else {
        const sp = services[itemId];
        activeItemsSum += sp?.active || 0;
        regularItemsSum += sp?.regular || 0;
      }
    }
    const factor = 1 - (settings.packageDiscountPercent / 100);
    const discounted = Math.round(activeItemsSum * factor);
    packages[pkgId] = {
      active: discounted,
      itemsSum: activeItemsSum,
      regularSum: regularItemsSum,
      savingsVsRegular: Math.max(0, regularItemsSum - discounted),
      savingsVsLaunch: Math.max(0, activeItemsSum - discounted),
    };
  }
  return {
    launchActive: launch,
    launchEnds: settings.launchEnds,
    topicPrice,
    topicRegularPrice: settings.topicRegularPrice,
    packageDiscountPercent: settings.packageDiscountPercent,
    services,
    packages,
  };
}

export function orderConsumesWeeklySlot(selectedItems = []) {
  if (!Array.isArray(selectedItems)) return false;
  for (const item of selectedItems) {
    if (!item) continue;
    if (item.type === 'service' && CORE_SERVICE_IDS.has(item.id)) return true;
    if (item.type === 'package') {
      const members = PACKAGE_ITEMS[item.id] || [];
      if (members.some(id => CORE_SERVICE_IDS.has(id))) return true;
    }
  }
  return false;
}

export function findNextAvailableBatchWeek(countsByWeek = {}, weeklyCapacity = 10, minWeek = 1) {
  const cap = Math.max(1, Number(weeklyCapacity) || 10);
  for (let week = Math.max(1, minWeek); week <= 104; week++) {
    const used = Number(countsByWeek[week] || 0);
    if (used < cap) return week;
  }
  return minWeek;
}

export function computePublicBatchState(countsByWeek = {}, settingsInput = {}) {
  const settings = mergeSettings(settingsInput);
  const cap = settings.weeklyCapacity;
  const activeWeek = findNextAvailableBatchWeek(countsByWeek, cap, 1);
  const used = Number(countsByWeek[activeWeek] || 0);
  const remaining = Math.max(0, cap - used);
  return {
    activeWeek,
    weeklyCapacity: cap,
    seatsUsed: used,
    seatsRemaining: remaining,
    week1Full: Number(countsByWeek[1] || 0) >= cap,
    showCapacityBar: settings.showCapacityBar,
    showExactSeatsCount: settings.showExactSeatsCount,
  };
}

export function priceSelectedItemsServerSide(selectedItems = [], settingsInput = {}, nowDateStr = new Date().toISOString().slice(0, 10)) {
  const pricing = resolveCatalogPricing(settingsInput, nowDateStr);
  let subtotal = 0;
  let regularSubtotal = 0;
  let hasQuoteOnly = false;
  const pricedItems = (Array.isArray(selectedItems) ? selectedItems : []).map(item => {
    const qty = Math.min(20, Math.max(1, Number(item.qty) || 1));
    let unitPrice = null;
    let regularPrice = null;
    if (item.type === 'service') {
      if (item.id === 'individual_consultation') {
        const key = String(item.duration || '') === '60' || /\b60\b/.test(String(item.label || '')) ? 'consultation_60' : 'consultation_30';
        unitPrice = pricing.services[key]?.active ?? 10;
        regularPrice = pricing.services[key]?.regular ?? 15;
      } else if (pricing.services[item.id]) {
        unitPrice = pricing.services[item.id].active;
        regularPrice = pricing.services[item.id].regular;
      }
    } else if (item.type === 'topic') {
      unitPrice = pricing.topicPrice;
      regularPrice = pricing.topicRegularPrice;
    } else if (item.type === 'package' && pricing.packages[item.id]) {
      unitPrice = pricing.packages[item.id].active;
      regularPrice = pricing.packages[item.id].regularSum;
    }
    if (unitPrice === null) {
      hasQuoteOnly = true;
    } else {
      subtotal += unitPrice * qty;
      regularSubtotal += (regularPrice ?? unitPrice) * qty;
    }
    return {
      ...item,
      qty,
      price: unitPrice,
      regularPrice,
    };
  });
  return {
    items: pricedItems,
    subtotal: Math.round(subtotal * 100) / 100,
    regularSubtotal: Math.round(regularSubtotal * 100) / 100,
    hasQuoteOnly,
    launchActive: pricing.launchActive,
  };
}

export function summarizeReferralStats(requestsRows = [], referralsRows = []) {
  const refMap = new Map();
  for (const r of referralsRows) {
    refMap.set(String(r.code || '').toUpperCase(), {
      code: String(r.code || '').toUpperCase(),
      partner_name: r.partner_name || '',
      partner_contact: r.partner_contact || '',
      discount_percent: Number(r.discount_percent || 0),
      commission_percent: Number(r.commission_percent || 0),
      active: Number(r.active) === 1,
      notes: r.notes || '',
      created_at: r.created_at || '',
      total_requests: 0,
      verified_paid_requests: 0,
      verified_revenue: 0,
      commission_owed: 0,
    });
  }
  for (const req of requestsRows) {
    const code = String(req.referral_code || '').trim().toUpperCase();
    if (!code) continue;
    if (!refMap.has(code)) {
      refMap.set(code, {
        code, partner_name: '(غير مسجل)', partner_contact: '', discount_percent: 0,
        commission_percent: 10, active: false, notes: '', created_at: '',
        total_requests: 0, verified_paid_requests: 0, verified_revenue: 0, commission_owed: 0,
      });
    }
    const entry = refMap.get(code);
    entry.total_requests += 1;
    if (req.payment_status === 'paid_verified' || req.payment_status === 'partial_verified') {
      const received = Math.max(0, Number(req.amount_received || 0));
      entry.verified_paid_requests += 1;
      entry.verified_revenue = Math.round((entry.verified_revenue + received) * 100) / 100;
      entry.commission_owed = Math.round((entry.commission_owed + (received * (entry.commission_percent / 100))) * 100) / 100;
    }
  }
  return Array.from(refMap.values());
}

const SERVICE_ROLE_PLAYBOOKS = {
  profile_creation: {
    titleAr: 'إنشاء بروفايل احترافي',
    human: [
      'مراجعة المؤهلات والخبرات الحقيقية للمدرس وعدم المبالغة أو كتابة وعود مضللة.',
      'تحديد المنصة الأنسب بعد فحص رسومها وطرق السحب المتاحة في بلد المدرس.',
      'توجيه المدرس لرفع الملف والتحقق من الهوية وإعداد وسيلة السحب بنفسه (بدون مشاركة كلمات مرور).',
    ],
    ai: [
      'اقتراح 3 صيغ للعنوان الترويجي (Headline) والنبذة التعريفية بالعربية والإنجليزية.',
      'توليد مسودة الكلمات المفتاحية وأوصاف الدروس بناءً على بيانات العميل.',
      'كتابة ملخص تحليل المنافسين ونقاط التميز من الروابط المتاحة.',
    ],
  },
  profile_development: {
    titleAr: 'تطوير بروفايل موجود',
    human: [
      'فحص البروفايل الفعلي (الصورة، التسعير، المراجعات، وتوقعات المنصة الحالية).',
      'تقييم الفجوات الحقيقية وترتيب الأولويات حسب حالة المدرس.',
      'مراجعة الصياغة النهائية وضبط نبرة العرض لتناسب جمهور المنصة.',
    ],
    ai: [
      'مقارنة النبذة الحالية بصيغ أوضح وأكثر إقناعًا للطلاب.',
      'تلخيص نقاط الضعف في عرض القيمة واقتراح عناوين فرعية جذابة.',
      'تجهيز مسودة تقرير نقاط القوة والفجوات قبل المراجعة البشرية.',
    ],
  },
  video_creation: {
    titleAr: 'إنشاء فيديو جديد',
    human: [
      'مراجعة الإضاءة والصوت والزاوية في المقاطع الخام التي يرسلها العميل.',
      'اتخاذ قرارات المونتاج والإيقاع النهائية والتحقق من مطابقة شروط المنصة.',
      'التأكد من عدم استخدام مواد محمية بحقوق طبع أو موسيقى مخالفة.',
    ],
    ai: [
      'كتابة سيناريو Video Script مقسم بالثواني مع Hook افتتاحي قوي.',
      'توليد نصوص العناوين الفرعية (Captions / On-screen text).',
      'اقتراح لقطات إضافية أو تعليمات تصوير مبسطة للعميل.',
    ],
  },
  video_development: {
    titleAr: 'تطوير فيديو موجود',
    human: [
      'مشاهدة الفيديو بالكامل وتحديد أجزاء القص وتحسين الإيقاع والصوت.',
      'تنفيذ التعديل النهائي ومراجعة جودة التصدير.',
    ],
    ai: [
      'كتابة قائمة ملاحظات مرتبة زمنيًا لإعادة ترتيب المقاطع وإضافة نصوص توضيحية.',
    ],
  },
  video_bundle: {
    titleAr: 'باقة الفيديو المزدوجة (جديد + تطوير)',
    human: [
      'فحص الفيديو القائم وتحديد توحيد الهوية البصرية مع الفيديو الجديد.',
      'توجيه العميل لتصوير المقطع الجديد وتنفيذ المونتاج النهائي للفيديوهين.',
    ],
    ai: [
      'توحيد الرسالة والسيناريو بين الفيديوهين واقتراح نصوص الشاشة.',
    ],
  },
  individual_consultation: {
    titleAr: 'جلسة توجيه فردية',
    human: [
      'إدارة الحوار المباشر والاستماع لتحديات المدرس وتحديد الأولويات الواقعية.',
      'اعتماد خطة المتابعة بعد الجلسة.',
    ],
    ai: [
      'تلخيص ملف العميل قبل الجلسة وتحضير قائمة أسئلة تشخيصية وملخص ما بعد الجلسة.',
    ],
  },
  market_review: {
    titleAr: 'دراسة حالة مجانية',
    human: [
      'تأكيد مصادر السوق وتاريخ المراجعة والقيود الفعلية لكل منصة.',
      'الحكم النهائي على جاهزية المدرس وما إذا كان يحتاج خدمة مدفوعة أم نصيحة مجانية فقط.',
    ],
    ai: [
      'تجميع مسودة تقرير دراسة الحالة (نقاط القوة، العوائق، خطوات الأولوية) لمراجعتك.',
    ],
  },
  campaign_review: {
    titleAr: 'دراسة حملة ترويجية',
    human: [
      'التحقق من ملاءمة الناشرين والقنوات والالتزام بسياسات المنصات والحصول على موافقة العميل قبل الإنفاق.',
    ],
    ai: [
      'توليد زوايا إعلانية مقترحة، هيكلة روابط UTM، وقوالب متابعة الاستفسارات.',
    ],
  },
};

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

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-robots-tag': 'noindex, nofollow',
      'x-content-type-options': 'nosniff',
    },
  });
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
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
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

async function readJson(request, maxBytes = 40000) {
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

const ensuredDbs = new WeakSet();

export async function ensurePhase2Schema(db) {
  if (!db || ensuredDbs.has(db)) return;
  const ddl = [
    `CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new',
      customer_name TEXT NOT NULL, whatsapp TEXT NOT NULL, email TEXT, country TEXT NOT NULL, preferred_contact TEXT,
      subject TEXT NOT NULL, experience TEXT, current_platform TEXT, target_platform TEXT, profile_link TEXT,
      selected_items TEXT NOT NULL, selected_labels TEXT NOT NULL, custom_topics TEXT, goal TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'ar', consent INTEGER NOT NULL DEFAULT 1, payload_json TEXT NOT NULL,
      quoted_price REAL, payment_status TEXT NOT NULL DEFAULT 'not_requested', amount_received REAL NOT NULL DEFAULT 0,
      deadline TEXT, next_follow_up TEXT, internal_notes TEXT,
      notification_status TEXT NOT NULL DEFAULT 'not_configured', notification_error TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS site_events (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, visitor_hash TEXT, event_name TEXT NOT NULL, page_path TEXT NOT NULL, item_id TEXT)`,
    `CREATE TABLE IF NOT EXISTS admin_login_limits (ip_hash TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, window_start INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS public_request_limits (ip_hash TEXT PRIMARY KEY, submissions INTEGER NOT NULL DEFAULT 0, window_start INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS referrals (code TEXT PRIMARY KEY, partner_name TEXT NOT NULL, partner_contact TEXT, discount_percent REAL NOT NULL DEFAULT 0, commission_percent REAL NOT NULL DEFAULT 10, active INTEGER NOT NULL DEFAULT 1, notes TEXT, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS protected_content (id TEXT PRIMARY KEY, item_key TEXT, title_ar TEXT NOT NULL, title_en TEXT NOT NULL, content_type TEXT NOT NULL DEFAULT 'guide', media_url TEXT, body_markdown TEXT, duration_label TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS client_access_tokens (token TEXT PRIMARY KEY, request_id TEXT NOT NULL, customer_name TEXT NOT NULL, allowed_content_ids TEXT NOT NULL DEFAULT '[]', custom_note TEXT, expires_at TEXT, revoked INTEGER NOT NULL DEFAULT 0, last_accessed_at TEXT, access_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`
  ];
  for (const stmt of ddl) {
    await db.prepare(stmt).run();
  }
  const colsInfo = await db.prepare('PRAGMA table_info(requests)').all();
  const existingCols = new Set((colsInfo.results || []).map(c => c.name));
  const additions = [
    ['batch_week', 'INTEGER'],
    ['utm_source', 'TEXT'],
    ['utm_medium', 'TEXT'],
    ['utm_campaign', 'TEXT'],
    ['referral_code', 'TEXT'],
    ['ai_notes_json', 'TEXT'],
    ['delivery_links_json', 'TEXT'],
  ];
  for (const [col, type] of additions) {
    if (!existingCols.has(col)) {
      await db.prepare(`ALTER TABLE requests ADD COLUMN ${col} ${type}`).run();
    }
  }
  ensuredDbs.add(db);
}

async function getRuntimeSettings(db) {
  await ensurePhase2Schema(db);
  const row = await db.prepare("SELECT value_json FROM site_settings WHERE key = 'khutwa_config'").first();
  if (!row?.value_json) return mergeSettings({});
  try {
    return mergeSettings(JSON.parse(row.value_json));
  } catch {
    return mergeSettings({});
  }
}

async function getConfirmedBatchCounts(db) {
  await ensurePhase2Schema(db);
  const rows = await db.prepare(`
    SELECT batch_week, selected_items, status
    FROM requests
    WHERE batch_week IS NOT NULL AND status IN ('confirmed','in_progress','awaiting_client_review','awaiting_balance','completed')
  `).all();
  const counts = {};
  for (const row of (rows.results || [])) {
    const w = Number(row.batch_week);
    if (!Number.isInteger(w) || w < 1) continue;
    counts[w] = (counts[w] || 0) + 1;
  }
  return counts;
}

async function enforceLoginLimit(request, env) {
  await ensurePhase2Schema(env.DB);
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
  await ensurePhase2Schema(env.DB);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const salt = env.SESSION_SECRET || 'khutwa-public-intake-v05';
  const key = await sha256(`${ip}:${salt}`);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare('SELECT submissions, window_start FROM public_request_limits WHERE ip_hash = ?').bind(key).first();
  if (row && now - Number(row.window_start) < 900 && Number(row.submissions) >= 8) return false;
  if (row && now - Number(row.window_start) < 900) {
    await env.DB.prepare('UPDATE public_request_limits SET submissions = submissions + 1 WHERE ip_hash = ?').bind(key).run();
  } else {
    await env.DB.prepare('INSERT INTO public_request_limits (ip_hash, submissions, window_start) VALUES (?, 1, ?) ON CONFLICT(ip_hash) DO UPDATE SET submissions=1, window_start=excluded.window_start').bind(key, now).run();
  }
  await env.DB.prepare('DELETE FROM public_request_limits WHERE window_start < ?').bind(now - 86400).run();
  return true;
}

async function recordEvent(env, event) {
  await ensurePhase2Schema(env.DB);
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
    duration: clean(item.duration, 10),
    price: moneyOrNull(item.price),
    text: clean(item.text, 1000),
    qty: Math.min(20, Math.max(1, Number(item.qty) || 1)),
  }));
  if (items.some(item => !item.label)) throw new Error('Invalid selected item.');
  const analytics = body.analytics && body.analytics.consent === true
    ? { visitorId: clean(body.analytics.visitorId, 100) }
    : null;
  const attribution = body.attribution && typeof body.attribution === 'object' ? {
    utmSource: clean(body.attribution.utmSource, 100),
    utmMedium: clean(body.attribution.utmMedium, 100),
    utmCampaign: clean(body.attribution.utmCampaign, 140),
    referralCode: clean(body.attribution.referralCode, 40).toUpperCase(),
    landingPath: clean(body.attribution.landingPath, 240),
  } : { utmSource: '', utmMedium: '', utmCampaign: '', referralCode: '', landingPath: '' };

  return {
    schema: 'khutwa-request-v2',
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
    attribution,
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
    const refTag = record.attribution?.referralCode ? ` | إحالة: ${record.attribution.referralCode}` : '';
    const utmTag = record.attribution?.utmSource ? ` | مصدر: ${record.attribution.utmSource}` : '';
    const lines = [
      '🔔 طلب جديد على خُطوة',
      `رقم الطلب: ${requestId}`,
      `الاسم: ${clean(record.customer?.name, 80)}`,
      `الدولة: ${clean(record.customer?.country, 60)} | التخصص: ${clean(record.customer?.subject, 80)}`,
      `الإجمالي التقديري: $${record.serverPricing?.subtotal ?? 0}${refTag}${utmTag}`,
      `الخدمات: ${clean(labels, 600) || 'غير محدد'}`,
      `لوحة الإدارة: ${adminUrl}`,
    ];
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: lines.join('\n'), disable_web_page_preview: true }),
    });
  } catch { /* non-fatal */ }
}

async function createRequest(request, env, ctx) {
  if (!env.DB) return json({ ok: false, error: 'Database is not configured yet.' }, 503);
  await ensurePhase2Schema(env.DB);
  let body;
  try { body = await readJson(request); } catch (error) { return json({ ok: false, error: error.message === 'Request too large' ? error.message : 'Invalid request body.' }, 400); }
  let record;
  try { record = normalizeRequest(body); } catch (error) {
    if (error.message === 'spam') return json({ ok: true, requestId: null, accepted: true });
    return json({ ok: false, error: error.message }, 400);
  }
  if (!await enforcePublicSubmissionLimit(request, env)) return json({ ok: false, error: 'تم استلام عدد كبير من المحاولات من هذا الاتصال. حاول بعد قليل.' }, 429);

  const settings = await getRuntimeSettings(env.DB);
  const priced = priceSelectedItemsServerSide(record.selectedItems, settings);
  record.selectedItems = priced.items;
  record.serverPricing = { subtotal: priced.subtotal, regularSubtotal: priced.regularSubtotal, hasQuoteOnly: priced.hasQuoteOnly, launchActive: priced.launchActive };

  let validRefCode = '';
  if (record.attribution?.referralCode) {
    const refRow = await env.DB.prepare('SELECT code FROM referrals WHERE UPPER(code) = ? AND active = 1').bind(record.attribution.referralCode).first();
    if (refRow?.code) validRefCode = refRow.code;
  }

  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const id = `KW-${datePart}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  const selectedLabels = record.selectedItems.map(item => `${item.label}${item.price == null ? '' : ` ($${item.price})`}`).join(' | ');
  const visitorHash = record.analytics?.visitorId ? await sha256(record.analytics.visitorId) : null;
  const storedRecord = { ...record, analytics: null };
  const initialQuote = priced.subtotal > 0 || !priced.hasQuoteOnly ? priced.subtotal : null;

  try {
    await env.DB.prepare(`INSERT INTO requests (
      id, created_at, updated_at, status, customer_name, whatsapp, email, country, preferred_contact,
      subject, experience, current_platform, target_platform, profile_link, selected_items,
      selected_labels, custom_topics, goal, language, consent, payload_json, quoted_price,
      notification_status, batch_week, utm_source, utm_medium, utm_campaign, referral_code
    ) VALUES (?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'pending', NULL, ?, ?, ?, ?)`)
      .bind(
        id, now, now, record.customer.name, record.customer.whatsapp, record.customer.email,
        record.customer.country, record.customer.preferredContact, record.customer.subject,
        record.customer.experience, record.platforms.current, record.platforms.target,
        record.platforms.profileLink, JSON.stringify(record.selectedItems), selectedLabels,
        record.customTopics, record.goal, record.language, JSON.stringify(storedRecord), initialQuote,
        record.attribution.utmSource || null, record.attribution.utmMedium || null,
        record.attribution.utmCampaign || null, validRefCode || null
      ).run();
    if (visitorHash) {
      try { await recordEvent(env, { visitorHash, name: 'request_submitted', page: '/#request', itemId: null }); } catch { /* non-fatal */ }
    }
    if (ctx?.waitUntil) {
      ctx.waitUntil(notifyGoogle(id, { ...storedRecord, requestId: id, createdAt: now }, env));
      ctx.waitUntil(notifyTelegram(id, storedRecord, `${new URL(request.url).origin}/admin/`, env));
    }
    return json({ ok: true, requestId: id, createdAt: now, quotedPrice: initialQuote, consumesSlot: orderConsumesWeeklySlot(record.selectedItems) }, 201);
  } catch {
    return json({ ok: false, error: 'Could not save your request. Please try again.' }, 500);
  }
}

async function handlePublicConfig(request, env) {
  if (!env.DB) return json({ ok: false, error: 'Database not configured.' }, 503);
  const url = new URL(request.url);
  const settings = await getRuntimeSettings(env.DB);
  const pricing = resolveCatalogPricing(settings);
  const counts = await getConfirmedBatchCounts(env.DB);
  const batch = computePublicBatchState(counts, settings);
  const refParam = clean(url.searchParams.get('ref'), 40).toUpperCase();
  let referral = null;
  if (refParam) {
    const r = await env.DB.prepare('SELECT code, partner_name, discount_percent FROM referrals WHERE UPPER(code) = ? AND active = 1').bind(refParam).first();
    if (r) referral = { code: r.code, partnerName: r.partner_name, discountPercent: Number(r.discount_percent || 0) };
  }
  const completedRow = await env.DB.prepare("SELECT COUNT(*) AS total FROM requests WHERE status = 'completed'").first();
  const completedTotal = Number(completedRow?.total || 0);
  const publicVerifiedCount = settings.publicStatsThreshold > 0 && completedTotal >= settings.publicStatsThreshold ? completedTotal : null;

  return json({
    ok: true,
    pricing,
    batch,
    referral,
    publicVerifiedCount,
  });
}

async function adminOverview(env) {
  await ensurePhase2Schema(env.DB);
  const settings = await getRuntimeSettings(env.DB);
  const batchCounts = await getConfirmedBatchCounts(env.DB);
  const batch = computePublicBatchState(batchCounts, settings);
  const results = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS total FROM requests').first(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM requests WHERE created_at >= datetime('now','-30 days')").first(),
    env.DB.prepare("SELECT status, COUNT(*) AS total FROM requests GROUP BY status").all(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM site_events WHERE created_at >= datetime('now','-30 days') AND event_name='page_view'").first(),
    env.DB.prepare("SELECT COUNT(DISTINCT visitor_hash) AS total FROM site_events WHERE created_at >= datetime('now','-30 days') AND visitor_hash IS NOT NULL").first(),
    env.DB.prepare("SELECT event_name, COUNT(*) AS total FROM site_events WHERE created_at >= datetime('now','-30 days') GROUP BY event_name").all(),
    env.DB.prepare("SELECT item_id, COUNT(*) AS total FROM site_events WHERE created_at >= datetime('now','-30 days') AND event_name='add_to_cart' AND item_id IS NOT NULL GROUP BY item_id ORDER BY total DESC LIMIT 8").all(),
    env.DB.prepare("SELECT COALESCE(SUM(amount_received), 0) AS total FROM requests WHERE payment_status IN ('paid_verified', 'partial_verified')").first(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM requests WHERE status IN ('new', 'reviewing', 'needs_info')").first(),
    env.DB.prepare("SELECT COALESCE(utm_source, 'direct') AS source, COUNT(*) AS total, SUM(CASE WHEN status IN ('confirmed','in_progress','completed') THEN 1 ELSE 0 END) AS confirmed FROM requests GROUP BY COALESCE(utm_source, 'direct') ORDER BY total DESC LIMIT 12").all(),
  ]);
  return {
    totalRequests: results[0]?.total || 0,
    requests30d: results[1]?.total || 0,
    statuses: results[2]?.results || [],
    pageViews30d: results[3]?.total || 0,
    visitors30d: results[4]?.total || 0,
    events: results[5]?.results || [],
    popularItems: results[6]?.results || [],
    verifiedRevenue: Math.round(Number(results[7]?.total || 0) * 100) / 100,
    pendingReviews: results[8]?.total || 0,
    attribution: results[9]?.results || [],
    batchCounts,
    batch,
    googleSyncConfigured: Boolean(env.GOOGLE_APPS_SCRIPT_URL && env.GOOGLE_APPS_SCRIPT_SECRET),
    geminiConfigured: Boolean(env.GEMINI_API_KEY),
  };
}

function parseRequestRow(row) {
  let payload = {};
  let aiNotes = [];
  let deliveryLinks = {};
  let items = [];
  try { payload = JSON.parse(row.payload_json || '{}'); } catch {}
  try { aiNotes = JSON.parse(row.ai_notes_json || '[]'); } catch {}
  try { deliveryLinks = JSON.parse(row.delivery_links_json || '{}'); } catch {}
  try { items = JSON.parse(row.selected_items || '[]'); } catch {}
  const serviceIds = items.filter(x => x.type === 'service').map(x => x.id);
  const packageServiceIds = items.filter(x => x.type === 'package').flatMap(x => PACKAGE_ITEMS[x.id] || []).filter(id => !id.startsWith('topic_'));
  const allServices = [...new Set([...serviceIds, ...packageServiceIds])];
  const playbooks = allServices.map(id => SERVICE_ROLE_PLAYBOOKS[id]).filter(Boolean);
  return {
    ...row,
    payload,
    aiNotes: Array.isArray(aiNotes) ? aiNotes : [],
    deliveryLinks: deliveryLinks && typeof deliveryLinks === 'object' ? deliveryLinks : {},
    consumesSlot: orderConsumesWeeklySlot(items),
    playbooks,
  };
}

function buildAdminGeminiPrompt(reqRow, task, customInstruction, lang = 'ar') {
  const p = reqRow.payload || {};
  const tasksMap = {
    audit: 'حلل حالة العميل كاملة: نقاط القوة المتوقعة، النواقص الحرجة في البيانات المطلوب طلبها قبل التنفيذ، والمخاطر أو النقاط التي تستدعي مراجعة بشرية.',
    proposal: 'صغ عرض سعر احترافي وودود وجاهز للإرسال على واتساب يوضح: نطاق العمل بدقة، التوقيت المتوقع، آلية الدفع (50% مقدم و50% بعد المعاينة عند الاقتضاء)، وبدون وعود مضللة بنتائج خارج سيطرة خُطوة.',
    profile_draft: 'اقترح 3 عناوين (Headlines) ومسودة نبذة احترافية (Bio) مرتبة بنقاط قوة واضحة وموجهة للجمهور المستهدف مع كلمات مفتاحية للبحث.',
    video_script: 'اكتب سيناريو فيديو (Video Script) مقسم بالثواني (Hook 0-5s, Value 5-35s, Credibility 35-50s, CTA 50-60s) مع نصائح سريعة للإضاءة والتصوير.',
    market_brief: 'قدّم خطة مراجعة سوق أولية توضح أنسب 3 منصات أو قنوات لهذا التخصص ولماذا، مع قائمة تحقق يدوية للمنسق البشري قبل اعتماد التوصية.',
    custom: customInstruction || 'ساعد المنسق في تحليل هذا الطلب وإعداد خطوة التنفيذ التالية.',
  };
  const taskDirective = tasksMap[task] || tasksMap.custom;
  const outputLang = lang === 'en' ? 'English' : 'Arabic (واضحة ومهنية)';
  return `أنت مستشار العمليات الخبير في منصة "خُطوة (Khutwa)" لدعم وتطوير المدرسين أونلاين.
التزم بمبادئ خُطوة الصارمة: واقعية تامة، لا وعود مضمونة بعدد طلاب أو قبول منصات أو أرباح، شفافية في النطاق، ولغة مهنية دافئة.

المهمة المطلوبة (${task}):
${taskDirective}
${customInstruction && task !== 'custom' ? `\nتعليمات إضافية من المنسق البشري:\n${customInstruction}` : ''}

لغة المخرج المطلوبة: ${outputLang}

=== بيانات طلب العميل (${reqRow.id}) ===
- الاسم: ${reqRow.customer_name} | البلد: ${reqRow.country}
- التخصص: ${reqRow.subject} | الخبرة: ${reqRow.experience || 'غير محدد'}
- المنصة الحالية: ${reqRow.current_platform || 'لا توجد'} | المنصة المستهدفة: ${reqRow.target_platform || 'غير محددة'}
- رابط البروفايل: ${reqRow.profile_link || 'غير مرفق'}
- الخدمات/الموضوعات المطلوبة: ${reqRow.selected_labels}
- موضوعات مخصصة: ${reqRow.custom_topics || 'لا يوجد'}
- تفاصيل الفيديو (إن وجدت): ${JSON.stringify(p.video || {})}
- تفاصيل السوق والترويج: ${JSON.stringify({ market: p.market || {}, promotion: p.promotion || {} })}
- هدف العميل وشرحه: ${reqRow.goal}
- ملاحظات المنسق الداخلية الحالية: ${reqRow.internal_notes || 'لا توجد'}

أخرج الرد منظمًا بعناوين واضحة وجاهزًا للاستخدام المباشر من المنسق البشري.`;
}

async function handleAiAssist(request, env) {
  let body;
  try { body = await readJson(request, 20000); } catch { return json({ ok: false, error: 'Invalid AI request.' }, 400); }
  const requestId = clean(body.requestId, 60);
  const task = clean(body.task, 40) || 'audit';
  const customInstruction = clean(body.instruction, 2000);
  const lang = body.lang === 'en' ? 'en' : 'ar';
  const row = await env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(requestId).first();
  if (!row) return json({ ok: false, error: 'Request not found.' }, 404);
  const parsed = parseRequestRow(row);
  const prompt = buildAdminGeminiPrompt(parsed, task, customInstruction, lang);

  if (!env.GEMINI_API_KEY) {
    return json({
      ok: true,
      mode: 'prompt_builder',
      prompt,
      message: 'مفتاح GEMINI_API_KEY غير مضاف في إعدادات Cloudflare بعد — يمكنك نسخ البرومبت الجاهز أدناه ولصقه مباشرة في Gemini، أو إضافة المفتاح للتشغيل التلقائي داخل اللوحة.',
    });
  }

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
      }),
    });
    const data = await res.json().catch(() => ({}));
    const output = data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n').trim();
    if (!res.ok || !output) {
      return json({
        ok: true,
        mode: 'prompt_fallback',
        prompt,
        error: data?.error?.message || `Gemini API status ${res.status}`,
      });
    }
    const existingNotes = parsed.aiNotes || [];
    const nextNotes = [{ task, at: new Date().toISOString(), output }, ...existingNotes].slice(0, 10);
    await env.DB.prepare('UPDATE requests SET ai_notes_json = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(nextNotes), new Date().toISOString(), requestId).run();
    return json({ ok: true, mode: 'gemini_api', model: 'gemini-2.5-flash', output, prompt, aiNotes: nextNotes });
  } catch (err) {
    return json({ ok: true, mode: 'prompt_fallback', prompt, error: clean(err.message, 200) });
  }
}

function toSafeMediaDescriptor(contentRow, token) {
  const url = String(contentRow.media_url || '').trim();
  const base = {
    id: contentRow.id,
    itemKey: contentRow.item_key || '',
    titleAr: contentRow.title_ar,
    titleEn: contentRow.title_en,
    contentType: contentRow.content_type,
    durationLabel: contentRow.duration_label || '',
    bodyMarkdown: contentRow.body_markdown || '',
  };
  if (!url) return { ...base, playerMode: 'text_only' };
  const isDirectMedia = /\.(mp4|webm|m4v|mp3|ogg)(\?|$)/i.test(url);
  if (isDirectMedia) {
    return {
      ...base,
      playerMode: 'stream',
      streamUrl: `/api/access/stream?token=${encodeURIComponent(token)}&id=${encodeURIComponent(contentRow.id)}`,
    };
  }
  return {
    ...base,
    playerMode: 'frame',
    frameUrl: `/api/access/frame?token=${encodeURIComponent(token)}&id=${encodeURIComponent(contentRow.id)}`,
  };
}

function convertToEmbedUrl(rawUrl) {
  const url = String(rawUrl || '').trim();
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/);
  if (driveMatch) return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  if (ytMatch) return `https://www.youtube-nocookie.com/embed/${ytMatch[1]}?rel=0&modestbranding=1`;
  return url;
}

function renderAccessPortalHtml() {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>بوابة محتوى خُطوة الخاص | Khutwa Client Portal</title>
<style>
:root{font-family:system-ui,-apple-system,Tahoma,sans-serif;color:#eef3ff;background:#070c1b}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top right,#16254d 0,#070c1b 55%);min-height:100vh;line-height:1.8}
.wrap{max-width:980px;margin:auto;padding:24px 16px}.top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:22px;padding-bottom:14px;border-bottom:1px solid rgba(188,198,255,.15)}
.brand{font-weight:900;font-size:20px}.brand small{display:block;font-size:11px;color:#9fb1d3;font-weight:500}
.btn{border:1px solid rgba(188,198,255,.22);background:rgba(255,255,255,.06);color:#fff;padding:8px 14px;border-radius:10px;cursor:pointer;font-weight:700;font-size:13px;text-decoration:none}
.card{background:#0f1933;border:1px solid rgba(188,198,255,.16);border-radius:18px;padding:20px;margin-bottom:16px;box-shadow:0 14px 36px rgba(0,0,0,.3)}
.meta-row{display:flex;flex-wrap:wrap;gap:10px;font-size:12px;color:#b8c7e4;margin-top:8px}
.pill{background:#1c2c52;border:1px solid rgba(188,198,255,.2);border-radius:999px;padding:4px 10px;font-size:11px;color:#dbe6ff}
.item-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px}
.item-head h2{margin:0;font-size:18px}
.player-wrap{position:relative;border-radius:14px;overflow:hidden;background:#040814;border:1px solid rgba(188,198,255,.16);margin:12px 0}
.player-wrap iframe{width:100%;aspect-ratio:16/9;border:0;display:block}
.drive-shield{position:absolute;top:0;right:0;width:82px;height:62px;z-index:5;background:#040814;border-bottom-left-radius:12px;pointer-events:auto;display:flex;align-items:center;justify-content:center;color:#95a8cc;font-size:11px}
.player-wrap video{width:100%;max-height:480px;display:block;background:#000}
.watermark{padding:8px 12px;background:rgba(13,22,48,.75);border-top:1px solid rgba(188,198,255,.1);font-size:11px;color:#95a8cc;display:flex;justify-content:space-between}
.guide-body{background:#091126;border:1px solid rgba(188,198,255,.12);border-radius:12px;padding:16px;white-space:pre-wrap;font-size:14px;color:#e5ecff;user-select:none}
.err{background:#341320;border:1px solid #8a3550;color:#ffd8e2;padding:18px;border-radius:14px;text-align:center}
@media(max-width:600px){.top{flex-direction:column;align-items:flex-start}.item-head{flex-direction:column;align-items:flex-start}}
</style>
</head>
<body oncontextmenu="return false">
<div class="wrap">
  <header class="top">
    <div class="brand">خُطوة <small id="subBrand">بوابة التسليم والمحتوى الخاص · Khutwa Protected Access</small></div>
    <div style="display:flex;gap:8px;align-items:center">
      <button id="langToggle" class="btn" type="button">EN</button>
      <a href="/" class="btn" id="homeLink">الموقع الرئيسي ↗</a>
    </div>
  </header>
  <main id="portalRoot"><div class="card" id="loadingCard">جارٍ التحقق من صلاحية رابط الوصول…</div></main>
</div>
<script>
const params = new URLSearchParams(location.search);
const token = (params.get('token') || '').trim();
let lang = params.get('lang') === 'en' ? 'en' : 'ar';
let portalData = null;
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function render(){
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.getElementById('langToggle').textContent = lang === 'ar' ? 'EN' : 'عربي';
  document.getElementById('homeLink').textContent = lang === 'ar' ? 'الموقع الرئيسي ↗' : 'Main Site ↗';
  const root = document.getElementById('portalRoot');
  if(!portalData) return;
  if(!portalData.ok){
    root.innerHTML = '<div class="err"><b>' + esc(lang==='ar'?'تعذر فتح رابط الوصول':'Access Unavailable') + '</b><p>' + esc(portalData.error || '') + '</p></div>';
    return;
  }
  const head = '<div class="card"><h1 style="margin:0 0 6px;font-size:21px">' + esc(lang==='ar'?'مرحبًا ':'Welcome ') + esc(portalData.customerName) + '</h1>'
    + '<div class="meta-row"><span class="pill">' + esc(lang==='ar'?'رقم الطلب: ':'Request: ') + esc(portalData.requestId) + '</span>'
    + (portalData.expiresAt ? '<span class="pill">' + esc(lang==='ar'?'صالح حتى: ':'Valid until: ') + esc(portalData.expiresAt.slice(0,10)) + '</span>' : '')
    + '</div>'
    + (portalData.customNote ? '<p style="margin:12px 0 0;color:#d6e0f7;font-size:14px">' + esc(portalData.customNote) + '</p>' : '')
    + '</div>';
  const itemsHtml = (portalData.items || []).map(item => {
    const title = lang === 'ar' ? item.titleAr : item.titleEn;
    let mediaHtml = '';
    if(item.playerMode === 'stream'){
      mediaHtml = '<div class="player-wrap"><video controls controlsList="nodownload" disablePictureInPicture src="' + esc(item.streamUrl) + '"></video><div class="watermark"><span>' + esc(portalData.customerName) + ' · ' + esc(portalData.requestId) + '</span><span>Khutwa Private Viewing</span></div></div>';
    } else if(item.playerMode === 'frame'){
      mediaHtml = '<div class="player-wrap"><iframe src="' + esc(item.frameUrl) + '" allow="autoplay; encrypted-media" allowfullscreen></iframe><div class="drive-shield" aria-hidden="true">🔒 خُطوة</div><div class="watermark"><span>' + esc(portalData.customerName) + ' · ' + esc(portalData.requestId) + '</span><span>Khutwa Private Viewing</span></div></div>';
    }
    const bodyHtml = item.bodyMarkdown ? '<div class="guide-body">' + esc(item.bodyMarkdown) + '</div>' : '';
    return '<article class="card"><div class="item-head"><h2>' + esc(title) + '</h2><span class="pill">' + esc(item.contentType) + (item.durationLabel ? ' · ' + esc(item.durationLabel) : '') + '</span></div>' + mediaHtml + bodyHtml + '</article>';
  }).join('') || '<div class="card">' + esc(lang==='ar'?'لا توجد ملفات مرفقة لهذا الرابط حاليًا.':'No content items attached to this access link yet.') + '</div>';
  root.innerHTML = head + itemsHtml;
}
document.getElementById('langToggle').addEventListener('click', ()=>{ lang = lang==='ar'?'en':'ar'; render(); });
(async ()=>{
  if(!token){ portalData = { ok:false, error: lang==='ar'?'لم يتم توفير رمز وصول صالح في الرابط.':'Missing access token in URL.' }; render(); return; }
  try{
    const r = await fetch('/api/access?token=' + encodeURIComponent(token), { cache:'no-store' });
    portalData = await r.json();
  }catch{ portalData = { ok:false, error: 'Network error loading portal.' }; }
  render();
})();
</script>
</body>
</html>`;
}

async function handleAccessRoutes(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === '/access' || path === '/access/') {
    return htmlResponse(renderAccessPortalHtml());
  }
  if (!env.DB) return json({ ok: false, error: 'Database unavailable.' }, 503);
  await ensurePhase2Schema(env.DB);
  const token = clean(url.searchParams.get('token'), 120);
  if (!token) return json({ ok: false, error: 'Access token required.' }, 400);
  const row = await env.DB.prepare('SELECT * FROM client_access_tokens WHERE token = ?').bind(token).first();
  if (!row || Number(row.revoked) === 1) return json({ ok: false, error: 'رابط الوصول غير صالح أو تم إيقافه.' }, 403);
  if (row.expires_at && row.expires_at < new Date().toISOString()) {
    return json({ ok: false, error: 'انتهت صلاحية رابط الوصول الخاص بك.' }, 403);
  }
  let allowedIds = [];
  try { allowedIds = JSON.parse(row.allowed_content_ids || '[]'); } catch {}

  if (path === '/api/access' && request.method === 'GET') {
    await env.DB.prepare('UPDATE client_access_tokens SET access_count = access_count + 1, last_accessed_at = ? WHERE token = ?')
      .bind(new Date().toISOString(), token).run();
    const contentRes = await env.DB.prepare('SELECT * FROM protected_content ORDER BY created_at DESC').all();
    const allowedSet = new Set(Array.isArray(allowedIds) ? allowedIds : []);
    const matched = (contentRes.results || [])
      .filter(c => allowedSet.has(c.id) || (c.item_key && allowedSet.has(c.item_key)))
      .map(c => toSafeMediaDescriptor(c, token));
    return json({
      ok: true,
      requestId: row.request_id,
      customerName: row.customer_name,
      customNote: row.custom_note || '',
      expiresAt: row.expires_at || null,
      items: matched,
    });
  }

  const itemId = clean(url.searchParams.get('id'), 80);
  const contentRow = await env.DB.prepare('SELECT * FROM protected_content WHERE id = ?').bind(itemId).first();
  const allowedSet = new Set(Array.isArray(allowedIds) ? allowedIds : []);
  if (!contentRow || (!allowedSet.has(contentRow.id) && !(contentRow.item_key && allowedSet.has(contentRow.item_key)))) {
    return json({ ok: false, error: 'Content item not permitted for this token.' }, 403);
  }

  if (path === '/api/access/frame') {
    const embedUrl = convertToEmbedUrl(contentRow.media_url);
    return htmlResponse(`<!doctype html><html><body style="margin:0;background:#000"><iframe src="${embedUrl.replace(/"/g, '&quot;')}" style="width:100vw;height:100vh;border:0" allow="autoplay; encrypted-media" allowfullscreen></iframe></body></html>`);
  }

  if (path === '/api/access/stream') {
    const targetUrl = String(contentRow.media_url || '').trim();
    if (!/^https?:\/\//i.test(targetUrl)) return json({ ok: false, error: 'Invalid media source.' }, 400);
    const range = request.headers.get('range');
    const upstream = await fetch(targetUrl, { headers: range ? { range } : {} });
    const headers = new Headers(upstream.headers);
    headers.set('content-disposition', 'inline');
    headers.set('cache-control', 'no-store');
    headers.set('x-robots-tag', 'noindex, nofollow');
    return new Response(upstream.body, { status: upstream.status, headers });
  }

  return json({ ok: false, error: 'Not found.' }, 404);
}

async function adminRoute(request, env) {
  await ensurePhase2Schema(env.DB);
  const url = new URL(request.url);
  const path = url.pathname;
  const isHttps = url.protocol === 'https:';
  const secureFlag = isHttps ? '; Secure' : '';

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
    const headers = { 'set-cookie': `${SESSION_COOKIE}=${token}; HttpOnly${secureFlag}; SameSite=Strict; Path=/api/admin; Max-Age=${SESSION_SECONDS}` };
    return json({ ok: true }, 200, headers);
  }
  if (path === '/api/admin/logout' && request.method === 'POST') {
    return json({ ok: true }, 200, { 'set-cookie': `${SESSION_COOKIE}=; HttpOnly${secureFlag}; SameSite=Strict; Path=/api/admin; Max-Age=0` });
  }
  if (!await isAdmin(request, env)) return json({ ok: false, error: 'Authentication required.' }, 401);

  if (path === '/api/admin/me' && request.method === 'GET') return json({ ok: true, authenticated: true });
  if (path === '/api/admin/overview' && request.method === 'GET') return json({ ok: true, overview: await adminOverview(env) });

  if (path === '/api/admin/requests' && request.method === 'GET') {
    const status = clean(url.searchParams.get('status'), 40);
    const batch = clean(url.searchParams.get('batch'), 10);
    const search = clean(url.searchParams.get('q'), 120);
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 100));
    let query = 'SELECT * FROM requests';
    const where = [];
    const bindings = [];
    if (status && ALLOWED_STATUSES.has(status)) { where.push('status = ?'); bindings.push(status); }
    if (batch && /^\d+$/.test(batch)) { where.push('batch_week = ?'); bindings.push(Number(batch)); }
    if (search) { where.push('(id LIKE ? OR customer_name LIKE ? OR whatsapp LIKE ? OR email LIKE ? OR selected_labels LIKE ? OR COALESCE(referral_code, "") LIKE ?)'); const term = `%${search}%`; bindings.push(term, term, term, term, term, term); }
    if (where.length) query += ` WHERE ${where.join(' AND ')}`;
    query += ' ORDER BY created_at DESC LIMIT ?'; bindings.push(limit);
    const result = await env.DB.prepare(query).bind(...bindings).all();
    return json({ ok: true, requests: (result.results || []).map(parseRequestRow) });
  }

  const requestMatch = path.match(/^\/api\/admin\/requests\/([A-Za-z0-9_-]+)$/);
  if (requestMatch && request.method === 'PATCH') {
    let body;
    try { body = await readJson(request, 24000); } catch { return json({ ok: false, error: 'Invalid update.' }, 400); }
    const reqId = requestMatch[1];
    const existing = await env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(reqId).first();
    if (!existing) return json({ ok: false, error: 'Request not found.' }, 404);

    const status = clean(body.status, 40);
    const paymentStatus = clean(body.paymentStatus, 50);
    if (!ALLOWED_STATUSES.has(status) || !ALLOWED_PAYMENT.has(paymentStatus)) return json({ ok: false, error: 'Invalid status value.' }, 400);

    const quotedPrice = moneyOrNull(body.quotedPrice);
    const amountReceived = moneyOrNull(body.amountReceived) ?? 0;
    const internalNotes = clean(body.internalNotes, 5000);
    const deadline = clean(body.deadline, 30);
    const nextFollowUp = clean(body.nextFollowUp, 30);

    let batchWeek = body.batchWeek === null || body.batchWeek === '' ? null : Math.max(1, Math.min(104, Number(body.batchWeek)));
    if (body.batchWeek !== undefined && body.batchWeek !== null && body.batchWeek !== '' && !Number.isFinite(batchWeek)) batchWeek = null;

    if (status === 'cancelled') {
      batchWeek = null;
    } else if (CONFIRMED_SLOT_STATUSES.has(status) && (body.autoAssignBatch === true || (batchWeek === null && existing.batch_week == null))) {
      let items = [];
      try { items = JSON.parse(existing.selected_items || '[]'); } catch {}
      if (body.autoAssignBatch === true || orderConsumesWeeklySlot(items)) {
        const settings = await getRuntimeSettings(env.DB);
        const counts = await getConfirmedBatchCounts(env.DB);
        batchWeek = findNextAvailableBatchWeek(counts, settings.weeklyCapacity, 1);
      }
    } else if (body.batchWeek === undefined) {
      batchWeek = existing.batch_week ?? null;
    }

    const deliveryLinksJson = body.deliveryLinks !== undefined ? JSON.stringify(body.deliveryLinks) : existing.delivery_links_json;

    await env.DB.prepare(`UPDATE requests SET
      status=?, payment_status=?, quoted_price=?, amount_received=?, internal_notes=?,
      deadline=?, next_follow_up=?, batch_week=?, delivery_links_json=?, updated_at=?
      WHERE id=?`)
      .bind(
        status, paymentStatus, quotedPrice, amountReceived, internalNotes,
        deadline || null, nextFollowUp || null, batchWeek, deliveryLinksJson || null,
        new Date().toISOString(), reqId
      ).run();
    return json({ ok: true, batchWeek });
  }

  if (path === '/api/admin/settings' && request.method === 'GET') {
    return json({ ok: true, settings: await getRuntimeSettings(env.DB) });
  }
  if (path === '/api/admin/settings' && request.method === 'PUT') {
    let body;
    try { body = await readJson(request, 12000); } catch { return json({ ok: false, error: 'Invalid settings payload.' }, 400); }
    const merged = mergeSettings(body);
    await env.DB.prepare(`INSERT INTO site_settings (key, value_json, updated_at) VALUES ('khutwa_config', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at`)
      .bind(JSON.stringify(merged), new Date().toISOString()).run();
    return json({ ok: true, settings: merged });
  }

  if (path === '/api/admin/referrals' && request.method === 'GET') {
    const [refs, reqs] = await Promise.all([
      env.DB.prepare('SELECT * FROM referrals ORDER BY created_at DESC').all(),
      env.DB.prepare('SELECT referral_code, payment_status, amount_received FROM requests WHERE referral_code IS NOT NULL').all(),
    ]);
    return json({ ok: true, referrals: summarizeReferralStats(reqs.results || [], refs.results || []) });
  }
  if (path === '/api/admin/referrals' && request.method === 'POST') {
    let body;
    try { body = await readJson(request, 6000); } catch { return json({ ok: false, error: 'Invalid referral payload.' }, 400); }
    const code = clean(body.code, 30).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const partnerName = clean(body.partnerName, 120);
    if (!code || !partnerName) return json({ ok: false, error: 'Code and partner name are required.' }, 400);
    const discountPercent = Math.min(50, Math.max(0, Number(body.discountPercent) || 0));
    const commissionPercent = Math.min(50, Math.max(0, Number(body.commissionPercent ?? 10)));
    const active = body.active === false ? 0 : 1;
    await env.DB.prepare(`INSERT INTO referrals (code, partner_name, partner_contact, discount_percent, commission_percent, active, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET partner_name=excluded.partner_name, partner_contact=excluded.partner_contact,
      discount_percent=excluded.discount_percent, commission_percent=excluded.commission_percent, active=excluded.active, notes=excluded.notes`)
      .bind(code, partnerName, clean(body.partnerContact, 120), discountPercent, commissionPercent, active, clean(body.notes, 400), new Date().toISOString()).run();
    return json({ ok: true, code });
  }
  const refDelMatch = path.match(/^\/api\/admin\/referrals\/([A-Za-z0-9_-]+)$/);
  if (refDelMatch && request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM referrals WHERE UPPER(code) = ?').bind(refDelMatch[1].toUpperCase()).run();
    return json({ ok: true });
  }

  if (path === '/api/admin/content' && request.method === 'GET') {
    const res = await env.DB.prepare('SELECT * FROM protected_content ORDER BY updated_at DESC').all();
    return json({ ok: true, items: res.results || [] });
  }
  if (path === '/api/admin/content' && request.method === 'POST') {
    let body;
    try { body = await readJson(request, 40000); } catch { return json({ ok: false, error: 'Invalid content payload.' }, 400); }
    const id = clean(body.id, 60) || `cnt_${crypto.randomUUID().slice(0, 8)}`;
    const titleAr = clean(body.titleAr, 200);
    const titleEn = clean(body.titleEn, 200) || titleAr;
    if (!titleAr) return json({ ok: false, error: 'Title is required.' }, 400);
    const contentType = ['video', 'guide', 'checklist', 'pdf'].includes(body.contentType) ? body.contentType : 'guide';
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO protected_content (id, item_key, title_ar, title_en, content_type, media_url, body_markdown, duration_label, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET item_key=excluded.item_key, title_ar=excluded.title_ar, title_en=excluded.title_en,
      content_type=excluded.content_type, media_url=excluded.media_url, body_markdown=excluded.body_markdown, duration_label=excluded.duration_label, updated_at=excluded.updated_at`)
      .bind(id, clean(body.itemKey, 80) || null, titleAr, titleEn, contentType, clean(body.mediaUrl, 1000) || null, clean(body.bodyMarkdown, 25000) || null, clean(body.durationLabel, 60) || null, now, now).run();
    return json({ ok: true, id });
  }
  const contentDelMatch = path.match(/^\/api\/admin\/content\/([A-Za-z0-9_-]+)$/);
  if (contentDelMatch && request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM protected_content WHERE id = ?').bind(contentDelMatch[1]).run();
    return json({ ok: true });
  }

  if (path === '/api/admin/access-tokens' && request.method === 'GET') {
    const res = await env.DB.prepare('SELECT * FROM client_access_tokens ORDER BY created_at DESC LIMIT 100').all();
    return json({ ok: true, tokens: res.results || [] });
  }
  if (path === '/api/admin/access-tokens' && request.method === 'POST') {
    let body;
    try { body = await readJson(request, 8000); } catch { return json({ ok: false, error: 'Invalid token payload.' }, 400); }
    const requestId = clean(body.requestId, 60);
    const customerName = clean(body.customerName, 160);
    const allowedContentIds = Array.isArray(body.allowedContentIds) ? body.allowedContentIds.map(x => clean(x, 80)).filter(Boolean) : [];
    if (!requestId || !customerName) return json({ ok: false, error: 'Request ID and customer name are required.' }, 400);
    const token = `KWACC_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const days = Math.min(365, Math.max(1, Number(body.validDays) || 30));
    const expiresAt = new Date(Date.now() + days * 86400 * 1000).toISOString();
    await env.DB.prepare(`INSERT INTO client_access_tokens (token, request_id, customer_name, allowed_content_ids, custom_note, expires_at, revoked, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)`)
      .bind(token, requestId, customerName, JSON.stringify(allowedContentIds), clean(body.customNote, 1000) || null, expiresAt, new Date().toISOString()).run();
    return json({ ok: true, token, accessUrl: `${url.origin}/access/?token=${token}`, expiresAt });
  }
  const tokPatchMatch = path.match(/^\/api\/admin\/access-tokens\/([A-Za-z0-9_-]+)$/);
  if (tokPatchMatch && request.method === 'PATCH') {
    let body;
    try { body = await readJson(request, 2000); } catch { return json({ ok: false }, 400); }
    const revoked = body.revoked === true ? 1 : 0;
    await env.DB.prepare('UPDATE client_access_tokens SET revoked = ? WHERE token = ?').bind(revoked, tokPatchMatch[1]).run();
    return json({ ok: true });
  }

  if (path === '/api/admin/ai-assist' && request.method === 'POST') return handleAiAssist(request, env);

  if (path === '/api/admin/events' && request.method === 'GET') {
    const result = await env.DB.prepare("SELECT page_path, event_name, COUNT(*) AS total FROM site_events WHERE created_at >= datetime('now','-30 days') GROUP BY page_path, event_name ORDER BY total DESC LIMIT 30").all();
    return json({ ok: true, events: result.results || [] });
  }
  return json({ ok: false, error: 'Not found.' }, 404);
}

async function api(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'allow': 'GET,POST,PATCH,PUT,DELETE,OPTIONS' } });
  if (url.pathname === '/api/health' && request.method === 'GET') {
    if (!env.DB) return json({ ok: false, database: false }, 503);
    try { await env.DB.prepare('SELECT 1').first(); return json({ ok: true, database: true }); }
    catch { return json({ ok: false, database: false }, 503); }
  }
  if (url.pathname === '/api/public-config' && request.method === 'GET') return handlePublicConfig(request, env);
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
  if (url.pathname.startsWith('/api/access')) return handleAccessRoutes(request, env);
  if (url.pathname.startsWith('/api/admin/')) return adminRoute(request, env);
  return json({ ok: false, error: 'Not found.' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/access' || url.pathname === '/access/') return handleAccessRoutes(request, env);
    if (url.pathname.startsWith('/api/')) return api(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
};
