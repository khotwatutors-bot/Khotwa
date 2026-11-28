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
    `CREATE TABLE IF NOT EXISTS public_ai_limits (ip_hash TEXT PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0, window_start INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS referrals (code TEXT PRIMARY KEY, partner_name TEXT NOT NULL, partner_contact TEXT, discount_percent REAL NOT NULL DEFAULT 0, commission_percent REAL NOT NULL DEFAULT 10, active INTEGER NOT NULL DEFAULT 1, notes TEXT, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS protected_content (id TEXT PRIMARY KEY, item_key TEXT, title_ar TEXT NOT NULL, title_en TEXT NOT NULL, content_type TEXT NOT NULL DEFAULT 'guide', media_url TEXT, body_markdown TEXT, duration_label TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS client_access_tokens (token TEXT PRIMARY KEY, request_id TEXT NOT NULL, customer_name TEXT NOT NULL, allowed_content_ids TEXT NOT NULL DEFAULT '[]', custom_note TEXT, expires_at TEXT, revoked INTEGER NOT NULL DEFAULT 0, last_accessed_at TEXT, access_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS marketing_posts (id TEXT PRIMARY KEY, target_key TEXT, platform TEXT NOT NULL, angle TEXT, title TEXT NOT NULL, body TEXT NOT NULL, cta_url TEXT, status TEXT NOT NULL DEFAULT 'draft', scheduled_date TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`
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
    ['case_study_json', 'TEXT'],
  ];
  for (const [col, type] of additions) {
    if (!existingCols.has(col)) {
      await db.prepare(`ALTER TABLE requests ADD COLUMN ${col} ${type}`).run();
    }
  }
  const mktInfo = await db.prepare('PRAGMA table_info(marketing_posts)').all();
  const mktCols = new Set((mktInfo.results || []).map(c => c.name));
  const mktAdditions = [
    ['category', 'TEXT'],
    ['keywords', 'TEXT'],
    ['summary', 'TEXT'],
    ['cover_url', 'TEXT'],
    ['lang', "TEXT NOT NULL DEFAULT 'ar'"],
  ];
  for (const [col, type] of mktAdditions) {
    if (!mktCols.has(col)) {
      await db.prepare(`ALTER TABLE marketing_posts ADD COLUMN ${col} ${type}`).run();
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

export function buildTelegramReplyMarkup(requestId, adminUrl) {
  return {
    inline_keyboard: [
      [
        { text: '✅ تأكيد ومقعد', callback_data: `confirm:${requestId}` },
        { text: '👁 قيد المراجعة', callback_data: `review:${requestId}` },
      ],
      [
        { text: '🔗 فتح لوحة الإدارة', url: adminUrl },
      ],
    ],
  };
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
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join('\n'),
        disable_web_page_preview: true,
        reply_markup: buildTelegramReplyMarkup(requestId, adminUrl),
      }),
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

export function normalizeCaseStudyReport(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const arr = (list, maxItems = 6, maxLen = 280) => (Array.isArray(list) ? list : [])
    .map(x => clean(x, maxLen)).filter(Boolean).slice(0, maxItems);
  const steps = (Array.isArray(r.prioritySteps) ? r.prioritySteps : [])
    .slice(0, 6)
    .map(st => {
      if (typeof st === 'string') return { title: clean(st, 140), detail: '' };
      return { title: clean(st?.title, 140), detail: clean(st?.detail, 360) };
    })
    .filter(st => st.title);
  return {
    headlineSummary: clean(r.headlineSummary, 500),
    strengths: arr(r.strengths),
    obstacles: arr(r.obstacles),
    platformAssessment: clean(r.platformAssessment, 900),
    prioritySteps: steps,
    honestRecommendation: clean(r.honestRecommendation, 700),
    updatedAt: clean(r.updatedAt, 40) || new Date().toISOString(),
  };
}

function parseRequestRow(row) {
  let payload = {};
  let aiNotes = [];
  let deliveryLinks = {};
  let caseStudy = null;
  let items = [];
  try { payload = JSON.parse(row.payload_json || '{}'); } catch {}
  try { aiNotes = JSON.parse(row.ai_notes_json || '[]'); } catch {}
  try { deliveryLinks = JSON.parse(row.delivery_links_json || '{}'); } catch {}
  try { if (row.case_study_json) caseStudy = normalizeCaseStudyReport(JSON.parse(row.case_study_json)); } catch {}
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
    caseStudy,
    consumesSlot: orderConsumesWeeklySlot(items),
    playbooks,
  };
}

const GEMINI_MODEL_NAME = 'gemini-4-hydrogen';

async function callGemini(prompt, env, { jsonMode = false, thinkingLevel = 'LOW', maxOutputTokens = 2048 } = {}) {
  if (!env?.GEMINI_API_KEY) return { ok: false, reason: 'missing_key' };
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_NAME}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
  const generationConfig = {
    maxOutputTokens,
    thinkingConfig: { thinkingLevel },
    ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
  };
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    }),
  });
  const data = await res.json().catch(() => ({}));
  const output = data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n').trim();
  if (!res.ok || !output) {
    return { ok: false, reason: data?.error?.message || `Gemini API status ${res.status}` };
  }
  return { ok: true, model: GEMINI_MODEL_NAME, output };
}

function buildAdminGeminiPrompt(reqRow, task, customInstruction, lang = 'ar') {
  const p = reqRow.payload || {};
  const tasksMap = {
    audit: 'حلل حالة العميل كاملة: نقاط القوة المتوقعة، النواقص الحرجة في البيانات المطلوب طلبها قبل التنفيذ، والمخاطر أو النقاط التي تستدعي مراجعة بشرية.',
    proposal: 'صغ عرض سعر احترافي وودود وجاهز للإرسال على واتساب يوضح: نطاق العمل بدقة، التوقيت المتوقع، آلية الدفع (50% مقدم و50% بعد المعاينة عند الاقتضاء)، وبدون وعود مضللة بنتائج خارج سيطرة خُطوة.',
    profile_draft: 'اقترح 3 عناوين (Headlines) ومسودة نبذة احترافية (Bio) مرتبة بنقاط قوة واضحة وموجهة للجمهور المستهدف مع كلمات مفتاحية للبحث.',
    video_script: 'اكتب سيناريو فيديو (Video Script) مقسم بالثواني (Hook 0-5s, Value 5-35s, Credibility 35-50s, CTA 50-60s) مع نصائح سريعة للإضاءة والتصوير.',
    market_brief: 'قدّم خطة مراجعة سوق أولية توضح أنسب 3 منصات أو قنوات لهذا التخصص ولماذا، مع قائمة تحقق يدوية للمنسق البشري قبل اعتماد التوصية.',
    case_study_json: `أخرج دراسة حالة مهنية منظمة لهذا العميل بصيغة JSON فقط بدون أي نص خارج JSON وبالمفاتيح التالية حصريًا:
{
  "headlineSummary": "ملخص تنفيذي قصير للحالة",
  "strengths": ["نقطة قوة 1", "نقطة قوة 2", "نقطة قوة 3"],
  "obstacles": ["عائق 1", "عائق 2", "عائق 3"],
  "platformAssessment": "تقييم واقعي للمنصة الحالية والمستهدفة وملاءمة التخصص",
  "prioritySteps": [
    {"title": "الخطوة الأولى", "detail": "تفصيل عملي قابل للتنفيذ"},
    {"title": "الخطوة الثانية", "detail": "تفصيل عملي قابل للتنفيذ"},
    {"title": "الخطوة الثالثة", "detail": "تفصيل عملي قابل للتنفيذ"}
  ],
  "honestRecommendation": "توصية صادقة بالخطوة المناسبة دون وعود مضللة بنتائج أو طلاب"
}`,
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

أخرج الرد منظمًا وواضحًا وجاهزًا للاستخدام المباشر من المنسق البشري.`;
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
    const isJsonTask = task === 'case_study_json';
    const result = await callGemini(prompt, env, { jsonMode: isJsonTask, thinkingLevel: isJsonTask ? 'MEDIUM' : 'LOW' });
    if (!result.ok) {
      return json({
        ok: true,
        mode: 'prompt_fallback',
        prompt,
        error: result.reason,
      });
    }
    let parsedCaseStudy = null;
    if (isJsonTask) {
      try {
        const cleanedJson = result.output.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
        parsedCaseStudy = normalizeCaseStudyReport(JSON.parse(cleanedJson));
        await env.DB.prepare('UPDATE requests SET case_study_json = ?, updated_at = ? WHERE id = ?')
          .bind(JSON.stringify(parsedCaseStudy), new Date().toISOString(), requestId).run();
      } catch { /* keep raw text in notes if JSON parse fails */ }
    }
    const existingNotes = parsed.aiNotes || [];
    const nextNotes = [{ task, at: new Date().toISOString(), output: result.output }, ...existingNotes].slice(0, 10);
    await env.DB.prepare('UPDATE requests SET ai_notes_json = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(nextNotes), new Date().toISOString(), requestId).run();
    return json({ ok: true, mode: 'gemini_api', model: result.model, output: result.output, caseStudy: parsedCaseStudy, prompt, aiNotes: nextNotes });
  } catch (err) {
    return json({ ok: true, mode: 'prompt_fallback', prompt, error: clean(err.message, 200) });
  }
}

/* ==================== Phase 3: SEO & SSR Guides ==================== */
export const SEO_SERVICES = [
  {
    id: 'profile_creation',
    titleAr: 'إنشاء بروفايل مدرس احترافي على المنصات العالمية',
    titleEn: 'Professional Online Tutor Profile Creation',
    priceKey: 'profile_creation',
    summaryAr: 'نساعد المدرس على اختيار المنصة الأنسب لتخصصه وكتابة عنوان ونبذة وبنية دروس احترافية جاهزة للنشر.',
    summaryEn: 'We help educators select a suitable platform and craft an authoritative headline, bio, and lesson structure.',
    freeGuideAr: [
      'قاعدة الـ 3 ثوانٍ في العنوان: اجمع بين (التخصص الدقيق + الفئة المستهدفة + النتيجة العملية) بدل كلمات عامة مثل "أستاذ خبير".',
      'هيكل النبذة المقترح (4 فقرات): جملة خطّاف تفهم مشكلة الطالب، خبرتك العملية بالأرقام الصادقة، كيف تدير الحصة، ودعوة واضحة لحجز حصة تجريبية.',
      'قائمة تحقق ما قبل التقديم: راجع رسوم السحب المتاحة في بلدك وجودة الصورة وإضاءة المقطع التعريفي قبل رفع الحساب.',
    ],
    freeGuideEn: [
      'Headline rule: combine exact niche + target learner + practical focus rather than generic phrases.',
      '4-part Bio structure: learner pain hook, honest experience highlights, how your lesson works, and a clear trial invitation.',
      'Pre-application check: confirm local payout options, lighting, and photo framing before applying.',
    ],
    deliverablesAr: ['دراسة المنصة الأنسب (Market Match)', 'كتابة العنوان والنبذة والخبرات', 'أوصاف الدروس والكلمات المفتاحية', 'إرشاد خطوات التحقق دون طلب كلمة مرور'],
  },
  {
    id: 'profile_development',
    titleAr: 'تطوير بروفايل المدرس الحالي ورفع جاهزيته',
    titleEn: 'Existing Tutor Profile Audit & Development',
    priceKey: 'profile_development',
    summaryAr: 'تشخيص شامل للبروفايل القائم (الصورة، العنوان، النبذة، التسعير، الفيديو) وإعادة صياغته لزيادة وضوح القيمة.',
    summaryEn: 'Structured audit and rewrite of your existing tutor profile across headline, bio, offers, and positioning.',
    freeGuideAr: [
      'أكثر 3 أخطاء تضعف البروفايل القائم: الحديث عن نفسك قبل التحدث عن احتياج الطالب، نبذة طويلة بلا فواصل أو نقاط، وغياب تخصص فرعي واضح.',
      'مراجعة السعر: احسب الصافي بعد عمولة المنصة وتأكد أن وصف البروفايل يبرر السعر أمام المتعلم.',
      'التعديل التدريجي: طبّق التحديثات على البروفايل بنفسك وتابع تغيّر نسبة التحويل من المشاهدة إلى الاستفسار.',
    ],
    freeGuideEn: [
      'Top 3 leaks: focusing on biography before learner goals, dense walls of text, and vague subject focus.',
      'Net-price sanity check: factor platform commissions before adjusting rates.',
      'Apply edits step-by-step yourself and measure view-to-inquiry shifts over 2–3 weeks.',
    ],
    deliverablesAr: ['تقرير نقاط القوة والفجوات', 'إعادة صياغة العنوان والنبذة', 'توصيات تحسين الفيديو والصورة', 'إرشاد تطبيق التعديلات بأمان'],
  },
  {
    id: 'video_creation',
    titleAr: 'إنشاء فيديو تعريفي أو ترويجي للمدرس',
    titleEn: 'New Tutor Intro & Promo Video Production',
    priceKey: 'video_creation',
    summaryAr: 'من الفكرة والسيناريو وإرشادات التصوير المنزلي إلى المونتاج النهائي ونصوص الشاشة الجذابة.',
    summaryEn: 'Concept, timed script, home recording guidance, and clean editing for a standout tutor video.',
    freeGuideAr: [
      'معادلة الـ 60 ثانية: أول 5 ثوانٍ تخاطب الطالب مباشرة، 25 ثانية تشرح أسلوبك، 15 ثانية تثبت خبرتك، و15 ثانية تدعو للحصة التجريبية.',
      'إضاءة مجانية: قف أمام نافذة نهارية واجعل الكاميرا في مستوى العين واستخدم سماعة سلكية قريبة لتقليل الصدى.',
      'تجنّب الموسيقى الصاخبة أو الخلفيات المشتتة لأن المنصات تفضل الصوت الواضح.',
    ],
    freeGuideEn: [
      '60-second formula: 5s learner hook, 25s teaching style, 15s credibility, 15s clear next step.',
      'Lighting tip: face natural daylight with eye-level camera and crisp microphone audio.',
      'Skip loud background music so your voice stays clear and platform-compliant.',
    ],
    deliverablesAr: ['تحديد الرسالة والجمهور', 'كتابة السكربت بالثواني', 'دليل التصوير المنزلي', 'المونتاج وإضافة النصوص التوضيحية'],
  },
  {
    id: 'video_development',
    titleAr: 'تطوير ومونتاج فيديو المدرس الحالي',
    titleEn: 'Existing Tutor Video Improvement',
    priceKey: 'video_development',
    summaryAr: 'إعادة ترتيب المقطع الحالي وحذف التوقفات وتحسين الصوت وإضافة عناوين توضيحية بدل التصوير من الصفر.',
    summaryEn: 'Restructure, tighten pacing, refine audio, and add clean captions to upgrade your existing footage.',
    freeGuideAr: [
      'حذف أول 3 ثوانٍ من التردد أو الترحيب البطىء يرفع استمرار المشاهدة بشكل ملحوظ.',
      'أضف شريط عناوين (Captions) بلون واضح لأن كثيرًا من المتعلمين يشاهدون البروفايلات بصوت منخفض أولًا.',
    ],
    freeGuideEn: [
      'Trim hesitant openings so the viewer hears your core promise in the first 3 seconds.',
      'Include clear on-screen titles for learners browsing with low audio.',
    ],
    deliverablesAr: ['مراجعة الفيديو الحالي', 'قص وتكثيف الإيقاع', 'تحسين وضوح الصوت وإضافة العناوين'],
  },
  {
    id: 'video_bundle',
    titleAr: 'باقة الفيديو المزدوجة (فيديو جديد + تطوير قائم)',
    titleEn: 'Dual Video Package (New + Existing Edit)',
    priceKey: 'video_bundle',
    summaryAr: 'إنتاج فيديو جديد بالكامل مع تطوير فيديو قائم في طلب واحد بهوية بصرية متناسقة وسعر مجمع.',
    summaryEn: 'Produce one new video and upgrade an existing video together with unified branding and bundle pricing.',
    freeGuideAr: [
      'استخدم فيديو المنصة التعريفي للتحويل المباشر، والفيديو القصير الثاني لبناء الثقة على LinkedIn أو YouTube.',
    ],
    freeGuideEn: [
      'Use one main intro video for platform conversions and the second cut for LinkedIn or YouTube credibility.',
    ],
    deliverablesAr: ['فيديو تعريفي جديد كامل النطاق', 'تطوير فيديو قائم', 'توحيد النصوص والشكل البصري'],
  },
  {
    id: 'individual_consultation',
    titleAr: 'جلسة توجيه مهنية فردية للمدرس (30 / 60 دقيقة)',
    titleEn: '1-to-1 Tutor Growth Consultation (30 / 60 Min)',
    priceKey: 'consultation_30',
    summaryAr: 'لقاء مباشر لمناقشة وضعك المهني، التسعير، اختيار التخصص، أو خطة التحول للتدريس المستقل.',
    summaryEn: 'Live structured consultation to align positioning, pricing net margins, or platform transition strategy.',
    freeGuideAr: [
      'قبل أي جلسة استشارية: دوّن صافي دخلك المطلوب بالساعة، عدد ساعاتك المتاحة أسبوعيًا، وأكبر عائق يواجهك حاليًا.',
    ],
    freeGuideEn: [
      'Before your session: list target net hourly earnings, available weekly hours, and your single biggest bottleneck.',
    ],
    deliverablesAr: ['تشخيص مباشر لحالتك', 'ترتيب الأولويات', 'ملخص مكتوب بالخطوات المتفق عليها'],
  },
  {
    id: 'campaign_review',
    titleAr: 'دراسة وتنظيم حملة ترويجية للمدرسين',
    titleEn: 'Educator Promotion Campaign Assessment',
    priceKey: 'campaign_review',
    summaryAr: 'تقييم القنوات والناشرين وربط الإعلانات بروابط قياس استفسارات حقيقية (حملة فردية أو مشتركة).',
    summaryEn: 'Assess channels and publishers with measurable inquiry tracking before allocating any media spend.',
    freeGuideAr: [
      'لا تطلق إعلانًا نحو صفحة عامة دون تحديد التخصص ورابط تتبع UTM لمعرفة مصدر كل استفسار.',
    ],
    freeGuideEn: [
      'Never run paid ads without niche-specific messaging and UTM inquiry tracking.',
    ],
    deliverablesAr: ['تقييم القنوات والجمهور', 'تجهيز روابط التتبع', 'فصل أجر الإدارة عن ميزانية الإعلان'],
  },
  {
    id: 'market_review',
    titleAr: 'دراسة حالة مجانية للمدرس وتحليل المنصات',
    titleEn: 'Free Educator Case Study & Platform Audit',
    priceKey: 'market_review',
    summaryAr: 'تقرير بشري مجاني تمامًا بدون أي التزام: يحلل بروفايلك، نقاط القوة، العوائق، وأنسب المنصات لتخصصك.',
    summaryEn: '100% free, zero-obligation human audit covering your profile strengths, gaps, and best-fit platforms.',
    freeGuideAr: [
      'الفرق بين المنصات المفتوحة والأكاديميات: المنصات تعطي مرونة التسعير مقابل منافسة عالية، بينما الأكاديميات توفر طلابًا مقابل التزام بالمنهج والجدول.',
    ],
    freeGuideEn: [
      'Open marketplaces give rate autonomy with higher competition; academies bring learners with stricter scheduling.',
    ],
    deliverablesAr: ['فحص البروفايل والهدف', 'مراجعة ملاءمة المنصة', 'تقرير مكتوب بخطوات مرتبة بالأولوية'],
  },
];

export const SEO_TOPICS = [
  { id: 'topic_learning_outcome', pathId: 'path_lesson_design', pathAr: 'تصميم حصة لها هدف واضح', titleAr: 'تحديد ناتج التعلم وتقسيم وقت الحصة', titleEn: 'Set learning outcomes and allocate lesson time', outcomeAr: 'خطة حصة لها هدف واضح وتوزيع منطقي للوقت.', freePreviewAr: 'ابدأ كل درس بسؤال واحد: ماذا سيستطيع الطالب أن يفعل بنفسه في نهاية الـ 50 دقيقة مما لم يكن يفعله في بدايتها؟ قسّم الوقت 15% تمهيد، 35% شرح، 40% تطبيق، 10% إغلاق.' },
  { id: 'topic_lesson_flow', pathId: 'path_lesson_design', pathAr: 'تصميم حصة لها هدف واضح', titleAr: 'بناء التمهيد والشرح والتطبيق والإغلاق', titleEn: 'Build the lesson opening, explanation, practice, and close', outcomeAr: 'تسلسل تدريسي مترابط من البداية حتى الإغلاق.', freePreviewAr: 'اجعل الانتقال بين الشرح والتطبيق بمسألة صغيرة نموذجية تحلها أمام الطالب أولًا ثم يشاركك الثانية ثم يحل الثالثة وحده.' },
  { id: 'topic_activity_check', pathId: 'path_lesson_design', pathAr: 'تصميم حصة لها هدف واضح', titleAr: 'اختيار نشاط مناسب ومراجعة الفهم', titleEn: 'Choose suitable activities and check understanding', outcomeAr: 'أنشطة مناسبة وأسئلة تكشف مدى فهم الطالب.', freePreviewAr: 'بدل سؤال "هل فهمت؟" استخدم: "اشرح لي الفكرة بكلماتك" أو "أعطني مثالًا واحدًا من عندك".' },
  { id: 'topic_trial_opening', pathId: 'path_trial_lesson', pathAr: 'الحصة التجريبية من أول دقيقة', titleAr: 'الاستعداد قبل اللقاء وفتح الحوار', titleEn: 'Prepare before the lesson and open the conversation', outcomeAr: 'بداية مهنية مريحة وواضحة للحصة.', freePreviewAr: 'في الدقائق الثلاث الأولى، استمع لهدف الطالب الحقيقي وتجاربه السابقة قبل فتح أي عرض تقديمي — هذا يبني الثقة فورًا.' },
  { id: 'topic_level_diagnosis', pathId: 'path_trial_lesson', pathAr: 'الحصة التجريبية من أول دقيقة', titleAr: 'تشخيص الاحتياج والمستوى دون اختبار مرهق', titleEn: 'Diagnose needs and level without an exhausting test', outcomeAr: 'فهم مستوى الطالب واحتياجاته بأسئلة وأنشطة قصيرة.', freePreviewAr: 'حول التقييم إلى 3 مهام متدرجة (سهل، متوسط، تطبيقي) لمدة 7 دقائق بدل ورقة أسئلة طويلة.' },
  { id: 'topic_trial_close', pathId: 'path_trial_lesson', pathAr: 'الحصة التجريبية من أول دقيقة', titleAr: 'بناء نموذج شرح وختام بخطوة تالية واضحة', titleEn: 'Deliver a sample lesson and close with a clear next step', outcomeAr: 'نموذج شرح مختصر وختام يوضح المسار المقترح.', freePreviewAr: 'خصص آخر 5 دقائق لتلخيص نقطة تقدم واحدة حققها الطالب الآن، وخطة من 3 محطات للحصص الأربع القادمة.' },
  { id: 'topic_level_mapping', pathId: 'path_learner_levels', pathAr: 'التدريس لمستويات مختلفة', titleAr: 'تمييز المبتدئ والمتوسط والمتقدم', titleEn: 'Recognize beginner, intermediate, and advanced levels', outcomeAr: 'اختيار مدخل يناسب المستوى الفعلي للمتعلم.', freePreviewAr: 'فرّق بين معرفة الطالب النظرية للقاعدة وقدرته على استخدامها تلقائيًا أثناء الكلام أو الحل.' },
  { id: 'topic_scaffolding', pathId: 'path_learner_levels', pathAr: 'التدريس لمستويات مختلفة', titleAr: 'تبسيط المدخلات وتدرّج صعوبة المهام', titleEn: 'Scaffold input and gradually increase task difficulty', outcomeAr: 'شرح متدرج يساعد الطالب على التقدم دون إرباك.', freePreviewAr: 'قدّم مهارة واحدة جديدة في كل نشاط مع تذكير مرئي قصير، ثم ارفع الصعوبة تدريجيًا.' },
  { id: 'topic_individual_differences', pathId: 'path_learner_levels', pathAr: 'التدريس لمستويات مختلفة', titleAr: 'التعامل مع الفروق الفردية وإيقاع التعلم', titleEn: 'Respond to individual differences and learning pace', outcomeAr: 'تكييف الأنشطة مع اختلاف احتياجات الطلاب.', freePreviewAr: 'جهّز نشاطًا إضافيًا للمتعلم السريع وبطاقة تبسيط للمتعلم المتردد دون إحراج.' },
  { id: 'topic_time_transitions', pathId: 'path_virtual_class', pathAr: 'إدارة الفصل الافتراضي', titleAr: 'إدارة الوقت والانتقال بين الأنشطة', titleEn: 'Manage time and transitions between activities', outcomeAr: 'انتقالات أكثر سلاسة واستغلال أفضل لوقت الحصة.', freePreviewAr: 'افتح جميع الملفات والروابط في نافذة واحدة قبل دخول الطالب بـ 5 دقائق لتتجنب ضياع الوقت.' },
  { id: 'topic_participation', pathId: 'path_virtual_class', pathAr: 'إدارة الفصل الافتراضي', titleAr: 'تشجيع المشاركة وتنظيم الحوار', titleEn: 'Encourage participation and structure discussion', outcomeAr: 'مشاركة أكثر توازنًا وحوار منظم.', freePreviewAr: 'في المجموعات الافتراضية، خصص أسئلة محددة بالاسم وتبادل الأدوار كل 4 دقائق.' },
  { id: 'topic_distraction_connection', pathId: 'path_virtual_class', pathAr: 'إدارة الفصل الافتراضي', titleAr: 'التعامل مع التأخر والتشتت ومشكلات الاتصال', titleEn: 'Handle lateness, distraction, and connection issues', outcomeAr: 'خطوات عملية لإدارة المواقف الشائعة في الدروس عن بُعد.', freePreviewAr: 'احتفظ بمهمة كتابية قصيرة في الدردشة في حال انقطع الصوت لحظيًا حتى يستمر التعلم.' },
  { id: 'topic_quick_checks', pathId: 'path_assessment', pathAr: 'التقييم والتغذية الراجعة', titleAr: 'أسئلة التحقق والاختبارات القصيرة', titleEn: 'Quick checks and short assessments', outcomeAr: 'أدوات سريعة لقياس الفهم أثناء الدرس.', freePreviewAr: 'استخدم 3 دقائق في نهاية الحصة لتمرين مراجعة سريعة يكشف ما يحتاج تكرارًا المرة القادمة.' },
  { id: 'topic_correct_errors', pathId: 'path_assessment', pathAr: 'التقييم والتغذية الراجعة', titleAr: 'تصحيح الأخطاء دون إحباط المتعلم', titleEn: 'Correct errors without discouraging the learner', outcomeAr: 'تغذية راجعة واضحة ومحفزة.', freePreviewAr: 'ركّز على تصحيح الخطأ المتكرر أو المؤثر على المعنى في لحظته، واترك الأخطاء الثانوية لملخص النهاية.' },
  { id: 'topic_homework_progress', pathId: 'path_assessment', pathAr: 'التقييم والتغذية الراجعة', titleAr: 'الواجبات وقياس التقدم وإبلاغ الطالب به', titleEn: 'Homework, progress tracking, and communicating progress', outcomeAr: 'متابعة تقدم قابلة للملاحظة والتواصل مع الطالب بشأنها.', freePreviewAr: 'اجعل الواجب قابلًا للإنجاز في 15 دقيقة ومرتبطًا مباشرة بما تدرّب عليه في الحصة.' },
  { id: 'topic_whiteboard', pathId: 'path_digital_tools', pathAr: 'أدوات الفصل الرقمي', titleAr: 'السبورة ومشاركة الشاشة والملفات', titleEn: 'Whiteboards, screen sharing, and learning files', outcomeAr: 'تنظيم المواد والعرض البصري داخل الفصل الافتراضي.', freePreviewAr: 'استخدم مساحات منظمة بالألوان على السبورة وصدّرها كملف مراجعة في نهاية الدرس.' },
  { id: 'topic_forms_quizzes', pathId: 'path_digital_tools', pathAr: 'أدوات الفصل الرقمي', titleAr: 'Google Forms وأنشطة واختبارات تفاعلية', titleEn: 'Google Forms, interactive activities, and quizzes', outcomeAr: 'أنشطة قصيرة لجمع الإجابات ومراجعة التعلم.', freePreviewAr: 'اربط نماذج التصحيح التلقائي بنهاية كل وحدة لتتبع تحسن الدرجات مع الطالب وولي الأمر.' },
  { id: 'topic_tool_selection', pathId: 'path_digital_tools', pathAr: 'أدوات الفصل الرقمي', titleAr: 'اختيار أداة مناسبة دون تشتيت الطالب', titleEn: 'Choose useful tools without distracting the learner', outcomeAr: 'اختيار أدوات بسيطة تخدم هدف الحصة.', freePreviewAr: 'أداة واحدة مجربة ومتقنة أفضل من 4 أدوات تربك اتصال الطالب.' },
  { id: 'topic_ai_ideas', pathId: 'path_ai_prep', pathAr: 'التحضير الذكي بالذكاء الاصطناعي', titleAr: 'توليد أفكار وأنشطة وأسئلة أولية', titleEn: 'Generate initial ideas, activities, and questions', outcomeAr: 'مسودات أولية تساعد على تسريع التحضير.', freePreviewAr: 'حدد للنموذج عمر الطالب والمستوى ومدة النشاط والممنوعات لتحصل على مادة جاهزة للتنقيح خلال دقيقتين.' },
  { id: 'topic_ai_adaptation', pathId: 'path_ai_prep', pathAr: 'التحضير الذكي بالذكاء الاصطناعي', titleAr: 'تكييف المحتوى لمستويات مختلفة', titleEn: 'Adapt learning content to different levels', outcomeAr: 'نسخ متدرجة من المحتوى تناسب مستويات متنوعة.', freePreviewAr: 'حوّل نصًا واحدًا إلى 3 مستويات مفردات (A2، B1، B2) لتوفّر ساعات من إعادة الصياغة.' },
  { id: 'topic_ai_safety', pathId: 'path_ai_prep', pathAr: 'التحضير الذكي بالذكاء الاصطناعي', titleAr: 'مراجعة الدقة والخصوصية وعدم الاعتماد الأعمى', titleEn: 'Check accuracy and privacy; avoid blind reliance', outcomeAr: 'استخدام واعٍ يحافظ على الدقة وخصوصية المتعلم.', freePreviewAr: 'لا ترفع بيانات الطلاب الشخصية أو درجاتهم إلى أي نموذج عام، وراجع كل مثال لغوي أو علمي بنفسك.' },
  { id: 'topic_platform_models', pathId: 'path_platform_choice', pathAr: 'اختيار المنصة والمسار المناسب', titleAr: 'المنصات والأكاديميات ونماذج العمل', titleEn: 'Platforms, academies, and business models', outcomeAr: 'فهم الفرق بين طرق العمل المتاحة للمدرس.', freePreviewAr: 'قارن بين 3 نماذج: السوق المفتوح (Preply/italki)، الأكاديميات (التوظيف الجزئي)، والاستقلال المباشر.' },
  { id: 'topic_platform_requirements', pathId: 'path_platform_choice', pathAr: 'اختيار المنصة والمسار المناسب', titleAr: 'متطلبات القبول والعمولات والقيود', titleEn: 'Acceptance requirements, commissions, and restrictions', outcomeAr: 'قائمة تحقق لمقارنة شروط المنصات.', freePreviewAr: 'راجع دائمًا حد السحب الأدنى وطرق التحويل المتاحة في بلدك قبل استثمار وقتك في التسجيل.' },
  { id: 'topic_platform_test', pathId: 'path_platform_choice', pathAr: 'اختيار المنصة والمسار المناسب', titleAr: 'اختيار بدائل وخطة اختبار عملية', titleEn: 'Select alternatives and create a practical testing plan', outcomeAr: 'خطة لتجربة الخيارات قبل الالتزام بمسار واحد.', freePreviewAr: 'امنح كل منصة 6–8 أسابيع من الالتزام بجدول ثابت ومراقبة أرقام الظهور قبل الحكم عليها.' },
  { id: 'topic_profile_audit', pathId: 'path_profile_clinic', pathAr: 'عيادة البروفايل والتموضع', titleAr: 'مراجعة العنوان والنبذة والفيديو والخدمات', titleEn: 'Review the headline, bio, video, and services', outcomeAr: 'تحديد نقاط القوة والفجوات في عرضك المهني.', freePreviewAr: 'افتح بروفايلك وكأنك طالب يراه لأول مرة لمدة 10 ثوانٍ: هل عرفت فورًا ماذا تعلّم ولمن؟' },
  { id: 'topic_positioning_niche', pathId: 'path_profile_clinic', pathAr: 'عيادة البروفايل والتموضع', titleAr: 'تحديد التخصص الفرعي والقيمة المميزة', titleEn: 'Define a niche and a differentiated value proposition', outcomeAr: 'رسالة واضحة تشرح لمن تدرّس وما القيمة التي تقدمها.', freePreviewAr: 'التخصص الدقيق (مثل: العربية للأطباء أو التجويد للمبتدئين) يقلل منافسة السعر مع المدرسين العامين.' },
  { id: 'topic_improvement_priorities', pathId: 'path_profile_clinic', pathAr: 'عيادة البروفايل والتموضع', titleAr: 'ترتيب أولويات التحسين', titleEn: 'Prioritize profile improvements', outcomeAr: 'قائمة تغييرات مرتبة حسب الأثر والجهد.', freePreviewAr: 'ابدأ بالعنوان والصورة وأول 15 ثانية من الفيديو قبل أي تفاصيل ثانوية.' },
  { id: 'topic_price_competition', pathId: 'path_pricing', pathAr: 'التسعير وبناء العروض', titleAr: 'تحليل السعر والمنافسة والعمولات', titleEn: 'Review prices, competition, and commissions', outcomeAr: 'مقارنة سعرية تراعي الرسوم وصافي العائد.', freePreviewAr: 'استخرج متوسط أسعار 10 مدرسين في نفس تخصصك وخبرتك، ولا تسعر بأقل من الحد الذي يرهقك.' },
  { id: 'topic_lesson_packages', pathId: 'path_pricing', pathAr: 'التسعير وبناء العروض', titleAr: 'تصميم حزم الدروس والعروض', titleEn: 'Design lesson packages and offers', outcomeAr: 'عروض واضحة يسهل على الطالب فهمها ومقارنتها.', freePreviewAr: 'قدّم خيارات باقات مرتبطة بأهداف واضحة (باقة 8 حصص لإتقان أساسيات المحادثة).' },
  { id: 'topic_net_income', pathId: 'path_pricing', pathAr: 'التسعير وبناء العروض', titleAr: 'حساب الصافي وتجنب التسعير العشوائي', titleEn: 'Calculate net income and avoid arbitrary pricing', outcomeAr: 'طريقة عملية لتقدير العائد بعد التكاليف.', freePreviewAr: 'احسب وقت التحضير والتصحيح ورسوم التحويل ضمن تكلفة الساعة وليس وقت الحصة فقط.' },
  { id: 'topic_profile_completeness', pathId: 'path_profile_search', pathAr: 'الظهور في بحث المنصات', titleAr: 'اكتمال الملف وتناسق البيانات', titleEn: 'Profile completeness and information consistency', outcomeAr: 'ملف أكثر اكتمالًا واتساقًا مع متطلبات المنصة.', freePreviewAr: 'اجعل تخصص العنوان متطابقًا مع أقسام الشهادات وأسماء الدروس داخل المنصة.' },
  { id: 'topic_search_terms', pathId: 'path_profile_search', pathAr: 'الظهور في بحث المنصات', titleAr: 'التخصص والكلمات التي يستخدمها الطلاب', titleEn: 'Niche and search terms learners use', outcomeAr: 'وصف تخصص أقرب إلى طريقة بحث الطلاب.', freePreviewAr: 'استخدم نفس العبارات التي يكتبها الطالب في مربع البحث داخل عنوانك وأول سطرين في النبذة.' },
  { id: 'topic_platform_activity', pathId: 'path_profile_search', pathAr: 'الظهور في بحث المنصات', titleAr: 'مؤشرات النشاط والاستجابة المنشورة من المنصة', titleEn: 'Platform-published activity and response indicators', outcomeAr: 'فهم المؤشرات المتاحة دون ادعاء معرفة خوارزمية داخلية.', freePreviewAr: 'سرعة الرد على أول رسالة وتحديث ساعات التوافر من أكثر المؤشرات المعلنة تأثيرًا في معظم المنصات.' },
  { id: 'topic_referrals_communities', pathId: 'path_external_leads', pathAr: 'الوصول إلى الطلاب خارج المنصة', titleAr: 'الإحالات والمجتمعات والمحتوى', titleEn: 'Referrals, communities, and useful content', outcomeAr: 'خطة أولية لبناء مصادر إحالة واهتمام.', freePreviewAr: 'اسأل طلابك الراضين عن إحالة أصدقائهم بمزايا واضحة، وشارك نصائح قصيرة في مجموعات مهتمة.' },
  { id: 'topic_linkedin_presence', pathId: 'path_external_leads', pathAr: 'الوصول إلى الطلاب خارج المنصة', titleAr: 'LinkedIn والحضور المهني', titleEn: 'LinkedIn and professional presence', outcomeAr: 'حضور مهني متناسق يدعم الثقة والتواصل.', freePreviewAr: 'حوّل نبذة LinkedIn إلى عرض موجه لجمهورك من المهنيين أو أولياء الأمور بدل مجرد سيرة ذاتية قديمة.' },
  { id: 'topic_landing_tracking', pathId: 'path_external_leads', pathAr: 'الوصول إلى الطلاب خارج المنصة', titleAr: 'صفحات الهبوط وتتبع الاستفسارات', titleEn: 'Landing pages and inquiry tracking', outcomeAr: 'مسار واضح من الإعلان أو المنشور إلى الاستفسار.', freePreviewAr: 'استخدم روابط تتبع UTM لتعرف أي منشور أو منصة جلب لك الاستفسارات الفعلية.' },
  { id: 'topic_brand_message', pathId: 'path_personal_brand', pathAr: 'العلامة المهنية للمدرس', titleAr: 'الرسالة والجمهور والنبرة المهنية', titleEn: 'Brand message, audience, and professional tone', outcomeAr: 'رسالة متماسكة تصل للجمهور المناسب.', freePreviewAr: 'حافظ على نبرة ثابتة ومظهر موحد عبر بروفايلك وفيديوهاتك ومنشوراتك.' },
  { id: 'topic_portfolio_selection', pathId: 'path_personal_brand', pathAr: 'العلامة المهنية للمدرس', titleAr: 'اختيار الأعمال المناسبة للبورتفوليو', titleEn: 'Select relevant work for a portfolio', outcomeAr: 'بورتفوليو يعرض أعمالًا حقيقية ومناسبة بوضوح.', freePreviewAr: 'اعرض 3–4 نماذج قوية ومقصوصة بدقة بدل 10 ملفات مكررة.' },
  { id: 'topic_content_plan', pathId: 'path_personal_brand', pathAr: 'العلامة المهنية للمدرس', titleAr: 'تخطيط حضور LinkedIn والمحتوى', titleEn: 'Plan LinkedIn presence and content', outcomeAr: 'أفكار محتوى وجدول حضور قابل للاستمرار.', freePreviewAr: 'منشوران أسبوعيًا (فكرة تعليمية + قصة موقف تدريسي) كافيان لبناء استمرارية واقعية.' },
  { id: 'topic_first_contact', pathId: 'path_student_journey', pathAr: 'رحلة الطالب والاحتفاظ به', titleAr: 'التواصل الأول وتوقعات التعلم', titleEn: 'First contact and learning expectations', outcomeAr: 'تواصل أول واضح يضبط التوقعات.', freePreviewAr: 'رد على رسالة الطالب الأولى بثلاثة عناصر: ترحيب باسمه، سؤال توضيحي قصير، وموعد مقترح للقاء.' },
  { id: 'topic_followup_rebooking', pathId: 'path_student_journey', pathAr: 'رحلة الطالب والاحتفاظ به', titleAr: 'المتابعة والتغذية الراجعة وإعادة الحجز', titleEn: 'Follow-up, feedback, and rebooking', outcomeAr: 'آلية متابعة تحافظ على التواصل وتوضح التقدم.', freePreviewAr: 'أرسل ملخصًا من 3 سطور بعد كل 4 حصص يوضح ما أُتقن وما تبقّى للحفاظ على استمرار الطالب.' },
  { id: 'topic_cancellations_boundaries', pathId: 'path_student_journey', pathAr: 'رحلة الطالب والاحتفاظ به', titleAr: 'إدارة الإلغاء والغياب والحدود المهنية', titleEn: 'Manage cancellations, absence, and professional boundaries', outcomeAr: 'قواعد تواصل وحدود مهنية أكثر وضوحًا.', freePreviewAr: 'اتفق كتابةً من الحصة الأولى على سياسة الإلغاء قبل 12 أو 24 ساعة بهدوء واحترام.' },
  { id: 'topic_situation_diagnosis', pathId: 'path_growth_plan', pathAr: 'خطة نمو للمدرس', titleAr: 'تشخيص الوضع الحالي والعوائق', titleEn: 'Diagnose the current situation and obstacles', outcomeAr: 'صورة أوضح لنقطة البداية والعوائق الأساسية.', freePreviewAr: 'فرّق بين مشكلة الظهور (لا أحد يزور ملفك) ومشكلة التحويل (يزورون ولا يحجزون) ومشكلة الاستمرار.' },
  { id: 'topic_growth_goals', pathId: 'path_growth_plan', pathAr: 'خطة نمو للمدرس', titleAr: 'اختيار أهداف قصيرة ومتوسطة المدى', titleEn: 'Set short- and medium-term goals', outcomeAr: 'أهداف واقعية مرتبطة بوقت وموارد متاحة.', freePreviewAr: 'اختر هدفًا واحدًا قابلًا للتحكم خلال 30 يومًا (مثل إتمام تجهيز البروفايل أو تصوير الفيديو).' },
  { id: 'topic_growth_review', pathId: 'path_growth_plan', pathAr: 'خطة نمو للمدرس', titleAr: 'خطة تنفيذ ومراجعة مؤشرات التقدم', titleEn: 'Build an action plan and review progress indicators', outcomeAr: 'خطة متابعة تساعد على تعديل المسار عند الحاجة.', freePreviewAr: 'راجع أرقامك أسبوعيًا مرة واحدة فقط لتعديل الخطوات دون توتر يومي.' },
];

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeXml(v) {
  return String(v ?? '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

export function buildRobotsTxt(origin) {
  const base = String(origin || 'https://khotwa.khotwatutors.workers.dev').replace(/\/+$/, '');
  return [
    'User-agent: *',
    'Allow: /',
    'Allow: /guides',
    'Allow: /insights',
    'Allow: /insights/',
    'Allow: /service/',
    'Allow: /topic/',
    'Allow: /llms.txt',
    'Allow: /llms-full.txt',
    'Disallow: /admin',
    'Disallow: /admin/',
    'Disallow: /access',
    'Disallow: /access/',
    'Disallow: /api/',
    '',
    'User-agent: GPTBot',
    'Allow: /',
    '',
    'User-agent: OAI-SearchBot',
    'Allow: /',
    '',
    'User-agent: ChatGPT-User',
    'Allow: /',
    '',
    'User-agent: ClaudeBot',
    'Allow: /',
    '',
    'User-agent: PerplexityBot',
    'Allow: /',
    '',
    'User-agent: Google-Extended',
    'Allow: /',
    '',
    'User-agent: Pinterestbot',
    'Allow: /',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');
}

export const SEO_INSIGHTS = [
  {
    id: 'preply-italki-profile-blueprint',
    lang: 'ar',
    category: 'profile',
    categoryAr: 'تحسين البروفايل',
    categoryEn: 'Profile Optimization',
    title: 'كيف تكتب بروفايل مدرس احترافي على Preply و italki يجذب طلاباً من أوروبا وأمريكا والخليج',
    summary: 'خطوات صياغة العنوان والنبذة بلغة يبحث بها الطلاب فعلياً مع تجنب الأخطاء التي تخفض ترتيبك في نتائج البحث.',
    keywords: ['Preply tutor profile', 'italki teacher bio', 'تحسين بروفايل المدرس', 'تدريس أونلاين عالمي', 'Khutwa'],
    ctaUrl: '/?service=profile_creation',
    coverUrl: '',
    pinHeight: 'tall',
    palette: ['#132357', '#4e6bff'],
    body: `المدرس الخبير قد يخسر نصف فرصه على Preply أو italki لأن أول سطرين في البروفايل يتحدثان عن الشهادات العامة بدل النتيجة التي يبحث عنها الطالب.\n\n1. معادلة العنوان الواضح:\nاجمع بين (التخصص الدقيق + نوع الطالب + المنهج أو الأسلوب). مثال: "Arabic & Quran Tutor for Beginners and Kids | Clear Step-by-Step Method".\n\n2. بنية النبذة المقنعة في 4 فقرات قصيرة:\n- خطّاف سريع يفهم هدف الطالب أو ولي الأمر.\n- خبرتك بالأرقام الواقعية دون وعود مبالغ فيها.\n- ماذا يحدث بالضبط داخل أول حصة.\n- دعوة هادئة لحجز حصة تجريبية.\n\n3. الكلمات المفتاحية داخل النص:\nاستخدم العبارات التي يكتبها المتعلم الأجنبي مثل: Conversational Arabic، Tajweed for beginners، GCSE Math، Business English.\n\nتريد مراجعة مجانية لبروفايلك الحالي؟ اطلب دراسة الحالة المجانية في خُطوة قبل أي تعديل.`,
  },
  {
    id: 'tutor-intro-video-60s-script',
    lang: 'en',
    category: 'video',
    categoryAr: 'الفيديو التعريفي',
    categoryEn: 'Intro Video',
    title: '60-Second Online Tutor Intro Video Script That Converts Trial Bookings Worldwide',
    summary: 'Exact second-by-second structure, daylight home lighting setup, and clean caption tips for Preply, italki, and Superprof tutors.',
    keywords: ['tutor intro video script', 'Preply video tips', 'online teacher video', 'Khutwa'],
    ctaUrl: '/?service=video_creation&lang=en',
    coverUrl: '',
    pinHeight: 'medium',
    palette: ['#1c1549', '#9d5cf4'],
    body: `Learners often decide within 8 seconds whether to watch your full intro video or scroll to the next tutor.\n\nUse this proven 60-second structure:\n- 0:00–0:06 (The Hook): Speak directly to your learner's real goal. Skip slow "Hello my name is..." openings.\n- 0:06–0:30 (How You Teach): Show your method clearly—visual slides, conversation prompts, or structured exercises.\n- 0:30–0:45 (Relevant Proof): Mention years of teaching, learner ages/levels, and languages you speak.\n- 0:45–0:60 (Clear Invitation): Invite them warmly to book a trial session.\n\nTechnical essentials at home:\n- Face a daytime window for clean natural lighting.\n- Keep the camera at eye level and use a wired mic close to your collar.\n- Add concise on-screen captions because many international learners browse with muted audio.`,
  },
  {
    id: 'quran-arabic-online-global-positioning',
    lang: 'ar',
    category: 'platforms',
    categoryAr: 'القرآن والعربية عالمياً',
    categoryEn: 'Quran & Arabic Global',
    title: 'دليل مدرس القرآن والعربية: كيف تصل لطلاب أوروبا وأمريكا وأستراليا بطريقة مهنية',
    summary: 'مقارنة واقعية بين المنصات المفتوحة والأكاديميات وبناء حضور مباشر يحترم خصوصية المتعلمين وأولياء الأمور.',
    keywords: ['تعليم القرآن أونلاين', 'تدريس العربية لغير الناطقين', 'Quran tutor online', 'Arabic tutor worldwide', 'خُطوة'],
    ctaUrl: '/?service=market_review',
    coverUrl: '',
    pinHeight: 'tall',
    palette: ['#0a2a33', '#159c8b'],
    body: `تعليم القرآن الكريم والتجويد واللغة العربية لغير الناطقين بها من أكثر المجالات المطلوبة عالمياً في أمريكا وكندا وبريطانيا وألمانيا وأستراليا، لكن كثيراً من المدرسين يعتمدون على نفس الصياغة التقليدية.\n\nكيف تميز حضورك؟\n1. حدد الفئة بوضوح: أطفال الجاليات، الكبار المبتدئون (من الصفر / النورانية)، أم تصحيح التلاوة والإجازة.\n2. طمئن ولي الأمر: وضّح أسلوب التفاعل مع الأطفال، الصبر، واستخدام لوحة بيضاء مرئية وأنشطة قصيرة.\n3. جهّز نبذة باللغتين العربية والإنجليزية: لأن معظم من يحجز للأطفال في الخارج يبحث باللغة الإنجليزية عن "Quran & Tajweed Teacher for Kids".\n4. لا تضع كل اعتمادك على منصة واحدة: ابنِ بروفايلاً قوياً على TeacherOn أو Superprof مع بورتفوليو فيديو منظم وروابط تواصل احترافية.`,
  },
  {
    id: 'ai-training-tutor-outlier-guide',
    lang: 'en',
    category: 'ai_roles',
    categoryAr: 'أدوار تقييم الذكاء الاصطناعي',
    categoryEn: 'AI Tutor Roles',
    title: 'How Bilingual Teachers & Academics Qualify for Remote AI Tutor Roles (Outlier & DataAnnotation)',
    summary: 'Key English proficiency, rubric accuracy, and CV positioning checkpoints before applying to AI model evaluation platforms.',
    keywords: ['AI tutor remote jobs', 'Outlier tutor tips', 'DataAnnotation bilingual educator', 'Khutwa'],
    ctaUrl: '/?service=profile_creation&lang=en',
    coverUrl: '',
    pinHeight: 'medium',
    palette: ['#181f47', '#3574f2'],
    body: `Qualified teachers, linguists, and STEM specialists are increasingly working remotely evaluating and refining AI model responses.\n\nWhat platforms look for:\n1. Clean English writing & rubric reading (typically B2–C1+): Always follow step-by-step instructions literally rather than guessing.\n2. Subject specialization: Mathematics, Coding, Physics, Chemistry, Arabic-English bilingual nuance, and pedagogy.\n3. Concise, structured CV/LinkedIn summary highlighting analytical writing, grading rubrics, and fact-checking experience.\n\nNote: Khutwa prepares your professional profile, CV framing, and positioning cleanly—without fake credentials or any guaranteed acceptance claims.`,
  },
  {
    id: 'trial-lesson-conversion-blueprint',
    lang: 'ar',
    category: 'teaching',
    categoryAr: 'الحصة التجريبية',
    categoryEn: 'Trial Lessons',
    title: 'أول 5 دقائق في الحصة التجريبية: كيف تحوّل الطالب من زائر إلى اشتراك شهري منتظم',
    summary: 'هيكل عملي للحصة التجريبية أونلاين يجمع بين الاستماع، تشخيص المستوى، تقديم قيمة فورية، وخطة الـ 4 أسابيع.',
    keywords: ['الحصة التجريبية', 'إدارة الدرس أونلاين', 'احتفاظ بالطلاب', 'online trial lesson structure'],
    ctaUrl: '/?topic=topic_trial_opening',
    coverUrl: '',
    pinHeight: 'medium',
    palette: ['#241744', '#7e5bef'],
    body: `كثير من المدرسين يخسرون الطالب بعد الحصة التجريبية لأنهم يحوّلونها إلى امتحان ممل أو محاضرة طويلة بلا خطة واضحة.\n\nاتبع هذا التقسيم البسيط في 30 دقيقة:\n- الدقائق 1–5 (الاستماع): اسأل الطالب عن هدفه المحدد ومتى يحتاج تحقيقه.\n- الدقائق 6–12 (تشخيص سريع غير مرهق): 3 مهام متدرجة (سهل، متوسط، تطبيقي) تكشف مستواه الفعلي.\n- الدقائق 13–24 (شرح عملي مركّز): علّمه مهارة أو قاعدة واحدة صغيرة يطبقها بنفسه فوراً فيشعر بالإنجاز.\n- الدقائق 25–30 (خريطة الطريق): لخّص ما أنجزه اليوم واعرض خطة الحصص الأربع القادمة بهدوء ووضوح.`,
  },
  {
    id: 'pinterest-linkedin-global-tutor-leads',
    lang: 'ar',
    category: 'marketing',
    categoryAr: 'التسويق العالمي',
    categoryEn: 'Global Visibility',
    title: 'كيف تبني مصادر طلاب عالميين عبر Google و Pinterest و LinkedIn دون ملاحقة العملاء يدوياً',
    summary: 'لماذا تجلب المقالات الغنية بالكلمات المفتاحية وبوسترات Pinterest المنظمة عملاء يبحثون عنك على مدار الساعة.',
    keywords: ['تسويق للمدرسين أونلاين', 'Pinterest for tutors', 'LinkedIn teacher brand', 'SEO للمدرسين', 'خُطوة'],
    ctaUrl: '/?service=campaign_review',
    coverUrl: '',
    pinHeight: 'tall',
    palette: ['#102542', '#3d7eff'],
    body: `الاعتماد على البحث اليدوي عن العملاء يستهلك وقتك وطاقتك كل يوم. البديل المستدام هو بناء أصول رقمية تعمل لصالحك:\n\n1. بوسترات تعليمية على Pinterest (2:3): كل بوستر يلخص فكرة أو قاعدة في تخصصك ويربط مباشرة بصفحة مقالة أو دراسة حالة.\n2. مقالات واضحة موجهة لأسئلة الطلاب والمعلمين: عندما تجيب على أسئلة حقيقية بلغة بسيطة ومنظمة (Schema + FAQ)، تبدأ محركات البحث ونماذج الذكاء الاصطناعي باقتراح صفحاتك كمصدر موثوق.\n3. حضور مهني على LinkedIn: حوّل نبذتك إلى عرض لحل مشكلة محددة (مثل Arabic for Diplomats & Medical Staff أو IGCSE Physics Coaching) بدلاً من مجرد سيرة ذاتية قديمة.\n4. تتبع كل رابط بـ UTM: لتعرف أي منصة وأي محتوى يجلب استفسارات حقيقية.`,
  },
  {
    id: 'tutor-search-keywords-seo',
    lang: 'en',
    category: 'profile',
    categoryAr: 'كلمات البحث',
    categoryEn: 'Search Keywords',
    title: 'Tutor Profile SEO: The Exact Keywords International Students Search When Booking Lessons',
    summary: 'Stop writing "passionate experienced teacher". Learn how learners filter tutors by exam, age group, schedule, and outcome.',
    keywords: ['tutor SEO', 'online teacher keywords', 'get more students on Preply', 'Khutwa'],
    ctaUrl: '/?topic=topic_search_terms&lang=en',
    coverUrl: '',
    pinHeight: 'medium',
    palette: ['#0f2b38', '#22b8a6'],
    body: `Students rarely search for "dedicated teacher with 10 years experience". They search for specific goals:\n\n- Exam & Curriculum Terms: IELTS Speaking Band 7+, GCSE Maths Higher, AP Calculus, SAT Prep, IGCSE Chemistry.\n- Audience & Goal Terms: Arabic for Beginners, Tajweed for Kids, Business English for Engineers, German A1-B1.\n- Practical Trust Signals: Structured PDF notes after class, flexible weekend slots, patient step-by-step practice.\n\nAction step: Audit your headline, first 180 characters of your bio, and lesson titles so those exact terms appear naturally—without keyword stuffing.`,
  },
  {
    id: 'free-case-study-before-paying',
    lang: 'ar',
    category: 'profile',
    categoryAr: 'دراسة الحالة المجانية',
    categoryEn: 'Free Audit',
    title: 'لماذا تقدم خُطوة دراسة حالة مجانية قبل أن تدفع دولاراً واحداً؟',
    summary: 'تعرف على ما نفحصه في بروفايلك الحالي والفيديو والمنصة الأنسب لتخصصك بمراجعة بشرية صادقة بدون أي التزام.',
    keywords: ['دراسة حالة مجانية للمدرس', 'مراجعة بروفايل مجانية', 'Khutwa free case study', 'خُطوة'],
    ctaUrl: '/?service=market_review',
    coverUrl: '',
    pinHeight: 'medium',
    palette: ['#1d1c4a', '#c99738'],
    body: `كثير من المدرسين لا يحتاجون إلى دفع مقابل خدمات كثيرة؛ أحياناً يحتاجون فقط إلى تشخيص صادق يوضح: هل المشكلة في المنصة نفسها؟ أم في أول 5 ثوانٍ من الفيديو؟ أم في التسعير والتموضع؟\n\nلذلك تبدأ خُطوة معك بدراسة حالة مجانية تماماً تشمل:\n1. قراءة تخصصك وسنوات خبرتك وهدفك المالي أو المهني.\n2. تحديد نقاط القوة والفجوات الحالية في عرضك المهني.\n3. ترشيح أنسب 2–3 منصات أو مسارات لتخصصك ومستوى لغتك.\n4. خطوات أولوية واضحة—وتقرر بعدها بحرية تامة دون أي ضغط أو كلمات مرور.`,
  },
];

function formatPostForInsights(row) {
  let keywords = [];
  if (Array.isArray(row.keywords)) keywords = row.keywords;
  else if (typeof row.keywords === 'string') {
    keywords = row.keywords.split(/[،,]/).map(s => s.trim()).filter(Boolean);
  }
  const cat = clean(row.category, 40) || 'marketing';
  const catNames = {
    profile: ['تحسين البروفايل', 'Profile Optimization'],
    video: ['الفيديو التعريفي', 'Intro Video'],
    platforms: ['اختيار المنصات', 'Platforms'],
    teaching: ['مهارات التدريس', 'Teaching Craft'],
    ai_roles: ['فرص الذكاء الاصطناعي', 'AI Tutor Roles'],
    marketing: ['التسويق العالمي', 'Global Marketing'],
  };
  const pair = catNames[cat] || ['مقالة وأفكار', 'Insights & Pins'];
  const lang = row.lang === 'en' ? 'en' : 'ar';
  const summary = clean(row.summary, 280) || String(row.body || '').replace(/\s+/g, ' ').slice(0, 155) + '…';
  return {
    id: row.id,
    lang,
    category: cat,
    categoryAr: pair[0],
    categoryEn: pair[1],
    title: row.title,
    summary,
    keywords: keywords.length ? keywords : ['Khutwa', 'خُطوة', 'Online Tutoring'],
    ctaUrl: row.cta_url || '/?service=market_review',
    coverUrl: clean(row.cover_url, 800),
    pinHeight: 'medium',
    palette: ['#132357', '#6c5ce7'],
    body: row.body,
    createdAt: row.created_at || '',
    isDynamic: true,
  };
}

async function getPublishedInsights(env) {
  let dynamicPosts = [];
  if (env?.DB) {
    try {
      await ensurePhase2Schema(env.DB);
      const res = await env.DB.prepare("SELECT * FROM marketing_posts WHERE status = 'published' ORDER BY updated_at DESC LIMIT 80").all();
      dynamicPosts = (res.results || []).map(formatPostForInsights);
    } catch { /* ignore when static */ }
  }
  return [...dynamicPosts, ...SEO_INSIGHTS];
}

export function buildSitemapXml(origin, dynamicPosts = []) {
  const base = String(origin || 'https://khotwa.khotwatutors.workers.dev').replace(/\/+$/, '');
  const now = new Date().toISOString().slice(0, 10);
  const dynamicEntries = (Array.isArray(dynamicPosts) ? dynamicPosts : []).map(p => ({
    loc: `${base}/insights/${encodeURIComponent(p.id)}`,
    priority: '0.85',
    freq: 'weekly',
  }));
  const urls = [
    { loc: `${base}/`, priority: '1.0', freq: 'weekly' },
    { loc: `${base}/insights`, priority: '0.95', freq: 'daily' },
    { loc: `${base}/guides`, priority: '0.9', freq: 'weekly' },
    { loc: `${base}/llms.txt`, priority: '0.7', freq: 'weekly' },
    ...SEO_INSIGHTS.map(p => ({ loc: `${base}/insights/${encodeURIComponent(p.id)}`, priority: '0.85', freq: 'monthly' })),
    ...dynamicEntries,
    ...SEO_SERVICES.map(s => ({ loc: `${base}/service/${encodeURIComponent(s.id)}`, priority: '0.85', freq: 'monthly' })),
    ...SEO_TOPICS.map(t => ({ loc: `${base}/topic/${encodeURIComponent(t.id)}`, priority: '0.75', freq: 'monthly' })),
  ];
  const entries = urls.map(u => `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>${u.freq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`;
}

export function buildLlmsTxt(origin, pricing, insights = SEO_INSIGHTS) {
  const base = String(origin || 'https://khotwa.khotwatutors.workers.dev').replace(/\/+$/, '');
  const svcLines = SEO_SERVICES.map(s => {
    const p = pricing?.services?.[s.priceKey]?.active;
    const priceLabel = p === 0 ? 'Free ($0)' : p == null ? 'Custom Quote' : `$${p} USD`;
    return `- [${s.titleEn} (${s.titleAr})](${base}/service/${s.id}) — ${priceLabel}: ${s.summaryEn}`;
  }).join('\n');
  const insightLines = (insights || []).slice(0, 30).map(p => `- [${p.title}](${base}/insights/${p.id}): ${p.summary}`).join('\n');
  return `# Khutwa (خُطوة) — Tutor Growth, Profile & Video Studio

> Khutwa helps online tutors, Quran & Arabic teachers, academic coaches, and bilingual educators worldwide build credible tutor profiles (Preply, italki, Verbling, Superprof, TeacherOn, LinkedIn), record high-converting 60-second intro videos, structure online lessons, and evaluate remote AI-tutor opportunities. Founded by Abdullah Essam (khotwatutors@gmail.com). Zero password sharing, zero fake income guarantees, and every educator can start with a 100% free human case study.

## Key Public URLs
- [Khutwa Official Platform](${base}/): Bilingual (Arabic & English) service catalog, Market Match explorer, interactive Khutwa Guide, and unified request form.
- [Khutwa Insights & Visual Pins Board](${base}/insights): Pinterest-style educational articles, tutor growth checklists, keyword guides, and actionable tips.
- [Services & Teaching Library Directory](${base}/guides): Complete index of tutor growth services and 36 practical teaching & positioning topics.
- [Full Context for AI Assistants](${base}/llms-full.txt): Detailed Markdown reference of services, pricing, policies, and guides.

## Services & Transparent Pricing
${svcLines}

## Featured Insights & Tutor Guides
${insightLines}

## Trust & Safety Policy
- Khutwa never asks for platform passwords or login tokens.
- Khutwa never sells fake reviews or promises guaranteed platform acceptance or guaranteed income.
- Free Case Study ($0) is reviewed manually before any paid commitment.
`;
}

export function buildLlmsFullTxt(origin, pricing, insights = SEO_INSIGHTS) {
  const base = String(origin || 'https://khotwa.khotwatutors.workers.dev').replace(/\/+$/, '');
  const baseTxt = buildLlmsTxt(origin, pricing, insights);
  const topicLines = SEO_TOPICS.map(t => `- [${t.titleEn} | ${t.titleAr}](${base}/topic/${t.id}): ${t.freePreviewAr}`).join('\n');
  const fullArticles = (insights || []).slice(0, 20).map(p => `### ${p.title}\nURL: ${base}/insights/${p.id}\nKeywords: ${(p.keywords || []).join(', ')}\n\n${p.body}`).join('\n\n---\n\n');
  return `${baseTxt}\n## Micro-Learning Library Topics ($${pricing?.topicPrice ?? 3} launch)\n${topicLines}\n\n## Full Published Articles & Guides\n${fullArticles}\n`;
}

function seoShellStyles() {
  return `<style>
:root{--bg:#080c20;--panel:#101a39;--ink:#f5f6ff;--muted:#aeb9d9;--line:rgba(188,198,255,.18);--blue:#5577ff;--purple:#9d5cf4;--mint:#9ff1df;--gold:#f4d18d;font-family:system-ui,-apple-system,Tahoma,sans-serif}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 12% 10%,rgba(85,119,255,.22),transparent 45%),var(--bg);color:var(--ink);line-height:1.85;min-height:100vh}
a{color:inherit;text-decoration:none}
.wrap{width:min(1040px,calc(100% - 32px));margin-inline:auto}
.top{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:18px 0;border-bottom:1px solid var(--line);flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:10px;font-weight:900;font-size:20px}
.brand small{display:block;font-size:10px;color:var(--muted);font-weight:600}
.btn{display:inline-flex;align-items:center;gap:8px;padding:11px 18px;border-radius:12px;font-weight:800;font-size:13px;border:1px solid var(--line);background:rgba(255,255,255,.05);color:#fff;white-space:nowrap}
.btn-primary{background:linear-gradient(120deg,#4769ff,#9d5cf4);border-color:transparent;box-shadow:0 10px 28px rgba(94,84,255,.25)}
.crumbs{font-size:12px;color:var(--muted);margin:20px 0 10px;display:flex;gap:8px;flex-wrap:wrap}
.hero-box{background:linear-gradient(145deg,rgba(255,255,255,.05),rgba(255,255,255,.02));border:1px solid var(--line);border-radius:22px;padding:28px;margin-bottom:20px}
.kicker{font-size:11px;font-weight:900;color:#aebdff;letter-spacing:.7px;display:block;margin-bottom:6px}
h1{margin:0 0 12px;font-size:clamp(26px,3.8vw,38px);line-height:1.3}
.lead{color:#ced7f2;font-size:15px;margin:0 0 18px}
.price-line{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin:14px 0}
.price-line strong{font-size:26px;color:var(--mint)}
.grid{display:grid;grid-template-columns:1.15fr .85fr;gap:18px;align-items:start}
.card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:22px;margin-bottom:18px}
.card h2{margin:0 0 12px;font-size:19px}
.card ul{margin:0;padding-inline-start:20px;color:#dce4fa;font-size:14px}
.card li{margin:8px 0}
.list-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:14px}
.mini-card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px;display:flex;flex-direction:column;gap:8px}
.mini-card h3{margin:0;font-size:15px}
.mini-card p{margin:0;color:var(--muted);font-size:12px}
.foot{border-top:1px solid var(--line);padding:24px 0;margin-top:32px;font-size:12px;color:var(--muted);display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px}
@media(max-width:820px){.grid,.list-grid{grid-template-columns:1fr}.hero-box{padding:20px}}
</style>`;
}

export function renderGuidesIndexHtml({ pricing, origin, lang = 'ar' }) {
  const isEn = lang === 'en';
  const base = String(origin || 'https://khotwa.khotwatutors.workers.dev').replace(/\/+$/, '');
  const title = isEn ? 'Khutwa Guides & Tutor Services Directory' : 'دليل خدمات وموضوعات خُطوة للمدرسين | Khutwa';
  const desc = isEn ? 'Browse every Khutwa online teaching guide, profile development service, and classroom topic with practical free previews.' : 'تصفح جميع خدمات تطوير بروفايل المدرس وفيديوهات التقديم وأدلة التدريس الأونلاين من منصة خُطوة.';
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description: desc,
    url: `${base}/guides`,
    isPartOf: { '@type': 'WebSite', name: 'خُطوة | Khutwa', url: `${base}/` },
  }).replace(/</g, '\\u003c');

  const svcCards = SEO_SERVICES.map(s => {
    const p = pricing?.services?.[s.priceKey]?.active;
    const priceLabel = p === 0 ? (isEn ? 'Free' : 'مجاني') : p == null ? (isEn ? 'Quote' : 'حسب النطاق') : `$${p}`;
    return `<a class="mini-card" href="/service/${encodeURIComponent(s.id)}?lang=${isEn ? 'en' : 'ar'}"><span class="kicker">${escapeHtml(priceLabel)}</span><h3>${escapeHtml(isEn ? s.titleEn : s.titleAr)}</h3><p>${escapeHtml(isEn ? s.summaryEn : s.summaryAr)}</p></a>`;
  }).join('');

  const topCards = SEO_TOPICS.map(t => `<a class="mini-card" href="/topic/${encodeURIComponent(t.id)}?lang=${isEn ? 'en' : 'ar'}"><span class="kicker">${escapeHtml(t.pathAr)}</span><h3>${escapeHtml(isEn ? t.titleEn : t.titleAr)}</h3><p>${escapeHtml(t.outcomeAr)}</p></a>`).join('');

  return `<!doctype html>
<html lang="${isEn ? 'en' : 'ar'}" dir="${isEn ? 'ltr' : 'rtl'}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}">
<link rel="canonical" href="${escapeHtml(base)}/guides">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:image" content="${escapeHtml(base)}/assets/khutwa-brand-banner.jpg">
<script type="application/ld+json">${jsonLd}</script>
${seoShellStyles()}
</head>
<body>
<div class="wrap">
  <header class="top">
    <a class="brand" href="/?lang=${isEn ? 'en' : 'ar'}">خُطوة <small>KHUTWA · TUTOR GROWTH & SUPPORT</small></a>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <a class="btn" href="/guides?lang=${isEn ? 'ar' : 'en'}">${isEn ? 'العربية' : 'EN'}</a>
      <a class="btn btn-primary" href="/?lang=${isEn ? 'en' : 'ar'}#request">${isEn ? 'Open Unified Request' : 'اطلب خدمتك الآن'}</a>
    </div>
  </header>
  <main style="padding-top:20px">
    <div class="hero-box">
      <span class="kicker">KHUTWA INDEX · SEO &amp; LEARNING DIRECTORY</span>
      <h1>${escapeHtml(title)}</h1>
      <p class="lead">${escapeHtml(desc)}</p>
    </div>
    <h2 style="margin:24px 0 8px">${isEn ? 'Core Tutor Growth Services' : 'الخدمات الأساسية للمدرسين'}</h2>
    <div class="list-grid">${svcCards}</div>
    <h2 style="margin:32px 0 8px">${isEn ? 'Learning Library Topics' : 'موضوعات مكتبة خُطوة التعليمية'} ($${pricing?.topicPrice ?? 3})</h2>
    <div class="list-grid">${topCards}</div>
  </main>
  <footer class="foot"><span>© 2026 Khutwa</span><a href="/">${isEn ? 'Back to Khutwa Home' : 'العودة إلى الرئيسية'}</a></footer>
</div>
</body>
</html>`;
}

export function renderPublicDetailPageHtml({ kind, item, pricing, origin, lang = 'ar' }) {
  const isEn = lang === 'en';
  const base = String(origin || 'https://khotwa.khotwatutors.workers.dev').replace(/\/+$/, '');
  const isService = kind === 'service';
  const title = isEn ? item.titleEn : item.titleAr;
  const pageUrl = `${base}/${isService ? 'service' : 'topic'}/${encodeURIComponent(item.id)}`;
  const activePrice = isService ? pricing?.services?.[item.priceKey]?.active : (pricing?.topicPrice ?? 3);
  const priceText = activePrice === 0 ? (isEn ? 'Free ($0)' : 'مجانية ($0)') : activePrice == null ? (isEn ? 'Custom quote' : 'عرض سعر حسب النطاق') : `$${activePrice}`;
  const desc = isService ? (isEn ? item.summaryEn : item.summaryAr) : `${item.outcomeAr} — ${item.freePreviewAr}`;
  const deepCta = `/?${isService ? 'service' : 'topic'}=${encodeURIComponent(item.id)}&lang=${isEn ? 'en' : 'ar'}`;
  const guides = isService ? (isEn ? item.freeGuideEn : item.freeGuideAr) : [item.freePreviewAr, item.outcomeAr];

  const schemaObj = isService
    ? {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Service',
            name: title,
            description: desc,
            provider: { '@type': 'ProfessionalService', name: 'خُطوة | Khutwa', url: `${base}/` },
            areaServed: 'Worldwide',
            url: pageUrl,
            ...(typeof activePrice === 'number' ? { offers: { '@type': 'Offer', price: String(activePrice), priceCurrency: 'USD', url: `${base}${deepCta}` } } : {}),
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Khutwa', item: `${base}/` },
              { '@type': 'ListItem', position: 2, name: isEn ? 'Guides' : 'الدليل', item: `${base}/guides` },
              { '@type': 'ListItem', position: 3, name: title, item: pageUrl },
            ],
          },
        ],
      }
    : {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Article',
            headline: title,
            description: desc,
            mainEntityOfPage: pageUrl,
            author: { '@type': 'Organization', name: 'خُطوة | Khutwa' },
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Khutwa', item: `${base}/` },
              { '@type': 'ListItem', position: 2, name: item.pathAr, item: `${base}/guides` },
              { '@type': 'ListItem', position: 3, name: title, item: pageUrl },
            ],
          },
        ],
      };

  const jsonLd = JSON.stringify(schemaObj).replace(/</g, '\\u003c');
  const waMsg = encodeURIComponent(`مرحبًا خُطوة، أود الاستفسار عن: ${item.titleAr}`);

  return `<!doctype html>
<html lang="${isEn ? 'en' : 'ar'}" dir="${isEn ? 'ltr' : 'rtl'}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} | خُطوة Khutwa</title>
<meta name="description" content="${escapeHtml(desc)}">
<link rel="canonical" href="${escapeHtml(pageUrl)}">
<meta property="og:type" content="${isService ? 'website' : 'article'}">
<meta property="og:title" content="${escapeHtml(title)} | Khutwa">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:url" content="${escapeHtml(pageUrl)}">
<meta property="og:image" content="${escapeHtml(base)}/assets/khutwa-brand-banner.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)} | Khutwa">
<meta name="twitter:description" content="${escapeHtml(desc)}">
<script type="application/ld+json">${jsonLd}</script>
${seoShellStyles()}
</head>
<body>
<div class="wrap">
  <header class="top">
    <a class="brand" href="/?lang=${isEn ? 'en' : 'ar'}">خُطوة <small>KHUTWA · TUTOR GROWTH & SUPPORT</small></a>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <a class="btn" href="/guides?lang=${isEn ? 'en' : 'ar'}">${isEn ? 'All Guides' : 'كل الأدلة'}</a>
      <a class="btn" href="${escapeHtml(pageUrl)}?lang=${isEn ? 'ar' : 'en'}">${isEn ? 'العربية' : 'EN'}</a>
    </div>
  </header>

  <nav class="crumbs" aria-label="Breadcrumb">
    <a href="/">${isEn ? 'Home' : 'الرئيسية'}</a> /
    <a href="/guides">${isEn ? 'Guides & Services' : 'الخدمات والأدلة'}</a> /
    <span>${escapeHtml(title)}</span>
  </nav>

  <article class="hero-box">
    <span class="kicker">${isService ? (isEn ? 'KHUTWA SERVICE GUIDE' : 'دليل خدمة خُطوة') : escapeHtml(item.pathAr)}</span>
    <h1>${escapeHtml(title)}</h1>
    <p class="lead">${escapeHtml(desc)}</p>
    <div class="price-line">
      <strong>${escapeHtml(priceText)}</strong>
      <span style="color:var(--muted);font-size:13px">${isEn ? 'Transparent scope & written agreement before work starts.' : 'نطاق عمل واضح واتفاق مكتوب قبل البدء دون وعود مضللة.'}</span>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
      <a class="btn btn-primary" href="${escapeHtml(deepCta)}">${isEn ? 'Select & Request in Khutwa ↗' : 'اطلبها الآن وأضفها للسلة في خُطوة ↗'}</a>
      <a class="btn" target="_blank" rel="noopener" href="https://wa.me/201557898203?text=${waMsg}">${isEn ? 'Ask on WhatsApp' : 'اسأل على واتساب'}</a>
    </div>
  </article>

  <div class="grid">
    <section class="card">
      <h2>${isEn ? 'Practical Free Framework (~30% Actionable Value)' : 'خلاصة عملية مجانية يمكنك تطبيقها فورًا'}</h2>
      <ul>${guides.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
    </section>
    <aside class="card">
      <h2>${isService ? (isEn ? 'What You Receive in This Service' : 'ماذا تستلم داخل هذه الخدمة؟') : (isEn ? 'Included Learning Outcome' : 'المخرج العملي للموضوع')}</h2>
      <ul>${(isService ? item.deliverablesAr : [item.outcomeAr, 'مادة مركزة مخصصة لاحتياجك ضمن طلب واحد أو باقة مرنة', 'إمكانية دمجها مع مراجعة البروفايل أو الفيديو بسعر موفر']).map(d => `<li>${escapeHtml(d)}</li>`).join('')}</ul>
    </aside>
  </div>

  <footer class="foot"><span>© 2026 Khutwa · Tutor Growth &amp; Support</span><a href="${escapeHtml(deepCta)}">${isEn ? 'Go to Request Form' : 'انتقل لنموذج الطلب الموحد'}</a></footer>
</div>
</body>
</html>`;
}

export function renderInsightsIndexHtml({ posts = SEO_INSIGHTS, origin, lang = 'ar', activeCategory = 'all', query = '' }) {
  const isEn = lang === 'en';
  const base = String(origin || 'https://khotwa.khotwatutors.workers.dev').replace(/\/+$/, '');
  const title = isEn ? 'Khutwa Insights & Visual Pins — Global Tutor Growth Articles' : 'لوحة المقالات والأفكار | خُطوة للمدرسين عالمياً';
  const desc = isEn
    ? 'Pinterest-style visual guides, tutor profile SEO tips, intro video scripts, and global online teaching strategies by Khutwa.'
    : 'مقالات تعليمية وأفكار بصرية بنظام اللوحات، كلمات مفتاحية، وأدلة عملية لتطوير بروفايل المدرس والوصول لطلاب عالميين عبر جوجل والمنصات.';

  const cats = [
    { id: 'all', ar: 'الكل', en: 'All' },
    { id: 'profile', ar: 'تحسين البروفايل', en: 'Profiles' },
    { id: 'video', ar: 'الفيديو التعريفي', en: 'Intro Video' },
    { id: 'platforms', ar: 'المنصات والقرآن', en: 'Platforms' },
    { id: 'teaching', ar: 'مهارات التدريس', en: 'Teaching' },
    { id: 'ai_roles', ar: 'تقييم الذكاء الاصطناعي', en: 'AI Roles' },
    { id: 'marketing', ar: 'التسويق العالمي', en: 'Global Marketing' },
  ];

  const qLower = String(query || '').trim().toLowerCase();
  const filtered = (posts || []).filter(p => {
    if (activeCategory !== 'all' && p.category !== activeCategory) return false;
    if (!qLower) return true;
    const hay = `${p.title} ${p.summary} ${(p.keywords || []).join(' ')} ${p.categoryAr} ${p.categoryEn}`.toLowerCase();
    return hay.includes(qLower);
  });

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description: desc,
    url: `${base}/insights`,
    isPartOf: { '@type': 'WebSite', name: 'خُطوة | Khutwa', url: `${base}/` },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: filtered.slice(0, 20).map((p, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        url: `${base}/insights/${encodeURIComponent(p.id)}`,
        name: p.title,
      })),
    },
  }).replace(/</g, '\\u003c');

  const cardsHtml = filtered.length
    ? filtered.map(p => {
        const pal = p.palette || ['#132357', '#5577ff'];
        const postUrl = `/insights/${encodeURIComponent(p.id)}?lang=${isEn ? 'en' : 'ar'}`;
        const cover = p.coverUrl
          ? `<img class="pin-img" src="${escapeHtml(p.coverUrl)}" alt="${escapeHtml(p.title)}" loading="lazy">`
          : `<div class="pin-cover ${p.pinHeight === 'tall' ? 'tall' : ''}" style="background:linear-gradient(145deg,${pal[0]},${pal[1]})"><span class="pin-lang">${p.lang === 'en' ? 'EN' : 'AR'}</span><strong>${escapeHtml(isEn ? p.categoryEn : p.categoryAr)}</strong><h3>${escapeHtml(p.title)}</h3><small>khotwa.khotwatutors.workers.dev</small></div>`;
        const tags = (p.keywords || []).slice(0, 4).map(k => `<span class="kw">#${escapeHtml(k)}</span>`).join('');
        return `<article class="pin-card"><a class="pin-link" href="${escapeHtml(postUrl)}">${cover}<div class="pin-body"><div class="pin-meta"><span>${escapeHtml(isEn ? p.categoryEn : p.categoryAr)}</span><span>${p.isDynamic ? (isEn ? 'Published Pin' : 'منشور مضاف') : (isEn ? 'Evergreen Guide' : 'دليل مرجعي')}</span></div><h4>${escapeHtml(p.title)}</h4><p>${escapeHtml(p.summary)}</p><div class="kw-row">${tags}</div></div></a></article>`;
      }).join('')
    : `<div class="card" style="grid-column:1/-1;text-align:center"><p>${isEn ? 'No articles match this filter yet.' : 'لا توجد مقالات مطابقة لهذا البحث حالياً.'}</p><a class="btn btn-primary" href="/insights">${isEn ? 'Reset Filters' : 'عرض كل المقالات'}</a></div>`;

  const catLinks = cats.map(c => `<a class="pill-tab ${activeCategory === c.id ? 'active' : ''}" href="/insights?cat=${encodeURIComponent(c.id)}&lang=${isEn ? 'en' : 'ar'}${qLower ? '&q=' + encodeURIComponent(query) : ''}">${escapeHtml(isEn ? c.en : c.ar)}</a>`).join('');

  return `<!doctype html>
<html lang="${isEn ? 'en' : 'ar'}" dir="${isEn ? 'ltr' : 'rtl'}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}">
<link rel="canonical" href="${escapeHtml(base)}/insights">
<link rel="alternate" type="text/plain" title="LLMs Context" href="${escapeHtml(base)}/llms.txt">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:url" content="${escapeHtml(base)}/insights">
<meta property="og:image" content="${escapeHtml(base)}/assets/khutwa-brand-banner.jpg">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${jsonLd}</script>
${seoShellStyles()}
<style>
.masonry{column-count:3;column-gap:16px;margin-top:18px}
@media(max-width:960px){.masonry{column-count:2}}
@media(max-width:620px){.masonry{column-count:1}}
.pin-card{break-inside:avoid;margin-bottom:16px;background:var(--panel);border:1px solid var(--line);border-radius:18px;overflow:hidden;transition:transform .2s,border-color .2s}
.pin-card:hover{transform:translateY(-3px);border-color:rgba(159,241,223,.48)}
.pin-link{display:block}
.pin-img{width:100%;max-height:360px;object-fit:cover;display:block}
.pin-cover{padding:22px 20px;min-height:170px;display:flex;flex-direction:column;justify-content:space-between;gap:10px;position:relative;color:#fff}
.pin-cover.tall{min-height:225px}
.pin-cover strong{font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:#d6e4ff;opacity:.92}
.pin-cover h3{margin:0;font-size:18px;line-height:1.42}
.pin-cover small{font-size:11px;opacity:.75;font-family:monospace}
.pin-lang{position:absolute;top:14px;inset-inline-end:14px;background:rgba(8,12,32,.65);border:1px solid rgba(255,255,255,.22);border-radius:7px;padding:2px 8px;font-size:10px;font-weight:800}
.pin-body{padding:16px 18px;display:flex;flex-direction:column;gap:8px}
.pin-meta{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:var(--mint);font-weight:700}
.pin-body h4{margin:0;font-size:15px;line-height:1.45}
.pin-body p{margin:0;font-size:12.5px;color:var(--muted);line-height:1.7}
.kw-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
.kw{font-size:10.5px;color:#cbd7ff;background:rgba(255,255,255,.06);border:1px solid rgba(188,198,255,.15);padding:2px 8px;border-radius:6px}
.toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-top:14px}
.pills{display:flex;flex-wrap:wrap;gap:7px}
.pill-tab{padding:7px 12px;border-radius:9px;border:1px solid var(--line);font-size:12px;font-weight:700;color:#cbd7ff;background:rgba(255,255,255,.03)}
.pill-tab.active{background:linear-gradient(120deg,#4769ff,#9d5cf4);border-color:transparent;color:#fff}
.search-box{display:flex;gap:8px;flex:1;max-width:360px}
.search-box input{flex:1;min-width:140px;padding:9px 12px;border-radius:10px;border:1px solid var(--line);background:#0c1330;color:#fff;font-size:13px}
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <a class="brand" href="/?lang=${isEn ? 'en' : 'ar'}">خُطوة <small>KHUTWA · GLOBAL TUTOR INSIGHTS</small></a>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <a class="btn" href="/guides?lang=${isEn ? 'en' : 'ar'}">${isEn ? 'Services & Guides' : 'دليل الخدمات'}</a>
      <a class="btn" href="/insights?lang=${isEn ? 'ar' : 'en'}">${isEn ? 'العربية' : 'EN'}</a>
      <a class="btn btn-primary" href="/?service=market_review&lang=${isEn ? 'en' : 'ar'}">${isEn ? 'Free Case Study' : 'دراسة حالة مجانية'}</a>
    </div>
  </header>
  <main style="padding-top:20px">
    <div class="hero-box">
      <span class="kicker">KHUTWA PINS &amp; ARTICLES · SEO + AI DISCOVERY</span>
      <h1>${escapeHtml(title)}</h1>
      <p class="lead">${escapeHtml(desc)}</p>
      <div class="toolbar">
        <div class="pills">${catLinks}</div>
        <form class="search-box" method="GET" action="/insights">
          <input type="hidden" name="cat" value="${escapeHtml(activeCategory)}">
          <input type="hidden" name="lang" value="${isEn ? 'en' : 'ar'}">
          <input type="search" name="q" value="${escapeHtml(query)}" placeholder="${isEn ? 'Search topic or keyword...' : 'ابحث بكلمة مفتاحية (Preply، فيديو، قرآن)...'}">
          <button class="btn" type="submit">${isEn ? 'Search' : 'بحث'}</button>
        </form>
      </div>
    </div>
    <div class="masonry">${cardsHtml}</div>
  </main>
  <footer class="foot"><span>© 2026 Khutwa · Global Tutor Growth</span><div style="display:flex;gap:14px"><a href="/llms.txt">AI Index (llms.txt)</a><a href="/sitemap.xml">Sitemap</a><a href="/">${isEn ? 'Back to Home' : 'الرئيسية'}</a></div></footer>
</div>
</body>
</html>`;
}

export function renderInsightDetailHtml({ post, origin, lang = 'ar' }) {
  const isEn = lang === 'en' || post.lang === 'en';
  const base = String(origin || 'https://khotwa.khotwatutors.workers.dev').replace(/\/+$/, '');
  const pageUrl = `${base}/insights/${encodeURIComponent(post.id)}`;
  const pal = post.palette || ['#132357', '#5577ff'];
  const ogImg = post.coverUrl || `${base}/assets/khutwa-brand-banner.jpg`;
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: post.title,
        description: post.summary,
        keywords: (post.keywords || []).join(', '),
        inLanguage: post.lang === 'en' ? 'en' : 'ar',
        image: ogImg,
        mainEntityOfPage: pageUrl,
        author: { '@type': 'Organization', name: 'خُطوة | Khutwa', url: `${base}/` },
        publisher: { '@type': 'Organization', name: 'خُطوة | Khutwa', url: `${base}/` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Khutwa', item: `${base}/` },
          { '@type': 'ListItem', position: 2, name: isEn ? 'Insights' : 'المقالات والأفكار', item: `${base}/insights` },
          { '@type': 'ListItem', position: 3, name: post.title, item: pageUrl },
        ],
      },
    ],
  }).replace(/</g, '\\u003c');

  const paragraphs = String(post.body || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map(p => `<p style="white-space:pre-line;margin:0 0 16px;color:#e3ebff;font-size:15px">${escapeHtml(p)}</p>`).join('');
  const ctaHref = post.ctaUrl || '/?service=market_review';
  const waText = encodeURIComponent(`مرحبًا خُطوة، قرأت مقالة: ${post.title}`);

  return `<!doctype html>
<html lang="${post.lang === 'en' ? 'en' : 'ar'}" dir="${post.lang === 'en' ? 'ltr' : 'rtl'}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(post.title)} | خُطوة Khutwa</title>
<meta name="description" content="${escapeHtml(post.summary)}">
<meta name="keywords" content="${escapeHtml((post.keywords || []).join(', '))}">
<link rel="canonical" href="${escapeHtml(pageUrl)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="خُطوة | Khutwa">
<meta property="og:title" content="${escapeHtml(post.title)}">
<meta property="og:description" content="${escapeHtml(post.summary)}">
<meta property="og:url" content="${escapeHtml(pageUrl)}">
<meta property="og:image" content="${escapeHtml(ogImg)}">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${jsonLd}</script>
${seoShellStyles()}
</head>
<body>
<div class="wrap">
  <header class="top">
    <a class="brand" href="/">خُطوة <small>KHUTWA · TUTOR GROWTH & SUPPORT</small></a>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <a class="btn" href="/insights">${isEn ? 'All Insights' : 'كل المقالات والأفكار'}</a>
      <a class="btn btn-primary" href="${escapeHtml(ctaHref)}">${isEn ? 'Take Action in Khutwa ↗' : 'اطلب خدمتك أو دراسة الحالة ↗'}</a>
    </div>
  </header>
  <nav class="crumbs" aria-label="Breadcrumb">
    <a href="/">${isEn ? 'Home' : 'الرئيسية'}</a> /
    <a href="/insights">${isEn ? 'Insights & Pins' : 'المقالات والأفكار'}</a> /
    <span>${escapeHtml(isEn ? post.categoryEn : post.categoryAr)}</span>
  </nav>
  <article class="hero-box" style="background:linear-gradient(155deg,${pal[0]},rgba(16,26,57,.96))">
    <span class="kicker">${escapeHtml(isEn ? post.categoryEn : post.categoryAr)} · KHUTWA INSIGHT</span>
    <h1>${escapeHtml(post.title)}</h1>
    <p class="lead">${escapeHtml(post.summary)}</p>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:12px">
      ${(post.keywords || []).map(k => `<span style="font-size:11px;padding:3px 9px;border-radius:7px;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.16)">#${escapeHtml(k)}</span>`).join('')}
    </div>
  </article>
  <div class="grid">
    <section class="card">
      ${post.coverUrl ? `<img src="${escapeHtml(post.coverUrl)}" alt="${escapeHtml(post.title)}" style="width:100%;max-height:420px;object-fit:cover;border-radius:14px;margin-bottom:16px">` : ''}
      ${paragraphs}
    </section>
    <aside class="card">
      <h2>${isEn ? 'Apply This With Khutwa' : 'طبّق هذه الخطوة مع خُطوة'}</h2>
      <p style="font-size:13.5px;color:#ced7f2;margin:0 0 16px">${isEn ? 'Start with a 100% free human case study or choose the exact profile/video service that fits your goal.' : 'ابدأ بدراسة حالة مجانية 100% لتشخيص بروفايلك ومنصتك الأنسب قبل أي التزام مالي.'}</p>
      <div style="display:flex;flex-direction:column;gap:10px">
        <a class="btn btn-primary" href="${escapeHtml(ctaHref)}">${isEn ? 'Open Khutwa Request ↗' : 'اطلب الخدمة / دراسة الحالة المجانية ↗'}</a>
        <a class="btn" href="/guides">${isEn ? 'Browse All Services & Topics' : 'تصفح كل الخدمات والموضوعات'}</a>
        <a class="btn" target="_blank" rel="noopener" href="https://wa.me/201557898203?text=${waText}">${isEn ? 'Ask Abdullah on WhatsApp' : 'اسأل عبر واتساب'}</a>
      </div>
    </aside>
  </div>
  <footer class="foot"><span>© 2026 Khutwa · Better Profiles. Bigger Opportunities.</span><a href="/insights">${isEn ? '← Back to Insights Board' : '← العودة إلى لوحة المقالات'}</a></footer>
</div>
</body>
</html>`;
}

/* ==================== Phase 3: Deep Platform Explorer ==================== */
const EXPLORER_CATALOG = [
  { id: 'preply', name: 'Preply', domain: 'preply.com', minEng: 'A2', fit: { language: 3, academic: 2, skill: 1, quran: 1, ai_training: 0 }, mode: 'remote', noteAr: 'سوق عالمي مرن للغات والمواد؛ المنافسة عالية ويستفيد من بروفايل وفيديو محكمين.', noteEn: 'Global 1-to-1 marketplace; strong for languages when paired with a crisp bio and video.' },
  { id: 'italki', name: 'italki', domain: 'italki.com', minEng: 'B1', fit: { language: 3, academic: 0, skill: 0, quran: 0, ai_training: 0 }, mode: 'remote', noteAr: 'ممتازة للغات والمحادثة مع جمهور عالمي، وتتطلب توافر مواعيد ووضوح العرض.', noteEn: 'Language-focused marketplace valuing conversational structure and tutor consistency.' },
  { id: 'verbling', name: 'Verbling', domain: 'verbling.com', minEng: 'B1', fit: { language: 3, academic: 0, skill: 0, quran: 0, ai_training: 0 }, mode: 'remote', noteAr: 'منصة لغات رسمية تهتم بالخبرة التدريسية والشهادات المهنية.', noteEn: 'Language platform emphasizing certified experience and clear qualifications.' },
  { id: 'amazingtalker', name: 'AmazingTalker', domain: 'amazingtalker.com', minEng: 'A2', fit: { language: 3, academic: 1, skill: 1, quran: 0, ai_training: 0 }, mode: 'remote', noteAr: 'حضور قوي بين متعلمي شرق آسيا ومرونة في تسعير الحزم.', noteEn: 'Strong presence with East Asian learners and flexible bundle structures.' },
  { id: 'superprof', name: 'Superprof', domain: 'superprof.com', minEng: 'A2', fit: { language: 2, academic: 3, skill: 3, quran: 1, ai_training: 0 }, mode: 'both', noteAr: 'دليل مدرسين متعدد المواد؛ مناسب للتخصصات الأكاديمية والمهنية والبحث المحلي.', noteEn: 'Multi-subject tutor directory good for academic, skill, and local/remote visibility.' },
  { id: 'teacheron', name: 'TeacherOn', domain: 'teacheron.com', minEng: 'A2', fit: { language: 2, academic: 3, skill: 2, quran: 2, ai_training: 0 }, mode: 'both', noteAr: 'سوق طلبات مباشرة لمواد متنوعة بما فيها العربية والمواد الدراسية.', noteEn: 'Direct-lead marketplace for academic, Arabic, and international tutoring.' },
  { id: 'classgap', name: 'Classgap', domain: 'classgap.com', minEng: 'B1', fit: { language: 2, academic: 2, skill: 1, quran: 0, ai_training: 0 }, mode: 'remote', noteAr: 'مناسبة للطلاب الأوروبيين الناطقين بالإسبانية والإنجليزية.', noteEn: 'Good European student reach for languages and school subjects.' },
  { id: 'quran_academies', name: 'أكاديميات القرآن والعربية المتخصصة', domain: 'google.com', minEng: 'A2', fit: { language: 2, academic: 0, skill: 0, quran: 3, ai_training: 0 }, mode: 'both', noteAr: 'خيار عملي لمدرسي التجويد والقرآن والعربية للأطفال والجاليات — تحتاج تقييم الشروط والأجور لكل أكاديمية.', noteEn: 'Dedicated Quran and Arabic academies fit Tajweed/Islamic educators better than general marketplaces.' },
  { id: 'outlier_ai', name: 'Outlier / DataAnnotation (AI Tutor)', domain: 'outlier.ai', minEng: 'B2', fit: { language: 2, academic: 2, skill: 2, quran: 0, ai_training: 3 }, mode: 'remote', noteAr: 'مهام تقييم وتدريب نماذج الذكاء الاصطناعي للمعلمين واللغويين — تشترط إنجليزية جيدة ودقة في التعليمات.', noteEn: 'AI training and evaluation tasks for linguists/educators; requires strong B2+ English and rubric accuracy.' },
  { id: 'gulf_relocation', name: 'مدارس ومعاهد الخليج (استقرار/سفر)', domain: 'linkedin.com', minEng: 'B1', fit: { language: 2, academic: 3, skill: 2, quran: 2, ai_training: 0 }, mode: 'relocation', noteAr: 'مسار التقديم للمدارس والمعاهد في الخليج وأوروبا يتطلب سيرة ذاتية أكاديمية وبورتفوليو فيديو منظم.', noteEn: 'On-site/relocation applications to academies and schools require a crisp CV, credential summary, and sample teaching video.' },
  { id: '51talk', name: '51Talk', domain: '51talk.com', minEng: 'B2', fit: { language: 0, academic: 0, skill: 0, quran: 0, ai_training: 0 }, special: 'chinese_english', mode: 'remote', noteAr: 'متخصصة في تعليم الإنجليزية لمتعلمين ناطقين بالصينية.', noteEn: 'Focused on teaching English to Chinese-speaking learners.' },
];

const ENG_LEVEL_ORDER = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

export function explorePlatformsPure(input = {}) {
  const type = clean(input.type, 30) || 'language';
  const learnerLang = clean(input.learnerLang, 40) || 'English';
  const englishLevel = ENG_LEVEL_ORDER[String(input.englishLevel || 'B1').toUpperCase()] ? String(input.englishLevel).toUpperCase() : 'B1';
  const engRank = ENG_LEVEL_ORDER[englishLevel];
  const workMode = clean(input.workMode, 30) || 'remote';
  const subject = clean(input.subject, 140);
  const expYears = clean(input.experienceYears, 30) || '1-3';

  const ranked = EXPLORER_CATALOG.map(p => {
    let score = p.fit[type] || 0;
    if (p.special === 'chinese_english') {
      const teachesEng = /english|انجليز|إنجليز/i.test(subject);
      score = (learnerLang === 'Chinese' && type === 'language' && teachesEng) ? 5 : 0;
    }
    if (learnerLang === 'Chinese' && p.id === 'amazingtalker') score += 2;
    if (['Spanish', 'French', 'German'].includes(learnerLang) && (p.id === 'italki' || p.id === 'verbling') && type === 'language') score += 1;
    if (learnerLang === 'Arabic' && (p.id === 'quran_academies' || p.id === 'teacheron')) score += 2;
    if (workMode === 'relocation' && p.mode === 'relocation') score += 4;
    if (workMode === 'remote' && p.mode === 'relocation') score = Math.max(0, score - 2);
    const minRank = ENG_LEVEL_ORDER[p.minEng] || 1;
    const engWarning = engRank < minRank;
    if (engWarning && score > 0) score = Math.max(1, score - 1);
    if ((expYears === '4-7' || expYears === '7+') && (p.id === 'verbling' || p.id === 'gulf_relocation')) score += 1;
    return { ...p, score, engWarning };
  }).filter(x => x.score >= 1).sort((a, b) => b.score - a.score);

  const advisories = [];
  if (engRank <= 2) {
    advisories.push({
      ar: 'مستوى الإنجليزية الحالي (A1–A2): يُنصح بالتركيز أولًا على الجمهور العربي أو الأكاديميات العربية أو تجهيز بروفايل مترجم بدقة قبل التنافس في المنصات ذات الواجهة الإنجليزية الصارمة.',
      en: 'Current English level (A1–A2): prioritize Arabic-speaking learners/academies or use a carefully edited bilingual profile before competing on English-heavy platforms.',
    });
  }
  if (type === 'ai_training') {
    advisories.push({
      ar: 'مهام تقييم الذكاء الاصطناعي لا تشبه الدروس التقليدية: تعتمد على اختبارات التأهيل الأولية والدقة في اتباع معايير التقييم (Rubrics).',
      en: 'AI training tasks depend on passing onboarding assessments and strict rubric adherence rather than hourly student acquisition.',
    });
  }
  return { ranked: ranked.slice(0, 6), advisories };
}

/* ==================== Phase 3: Marketing Studio ==================== */
export function buildUtmUrl(origin, { targetKey = '', utmSource = '', utmCampaign = '', referralCode = '', lang = 'ar' } = {}) {
  const base = String(origin || 'https://khotwa.khotwatutors.workers.dev').replace(/\/+$/, '');
  const u = new URL(`${base}/`);
  if (targetKey && targetKey.includes(':')) {
    const [k, v] = targetKey.split(':');
    if (k && v) u.searchParams.set(k, v);
  }
  if (utmSource) u.searchParams.set('utm_source', clean(utmSource, 60));
  if (utmCampaign) u.searchParams.set('utm_campaign', clean(utmCampaign, 80));
  if (referralCode) u.searchParams.set('ref', clean(referralCode, 40).toUpperCase());
  if (lang === 'en') u.searchParams.set('lang', 'en');
  return u.toString();
}

export function buildMarketingPrompt({ targetKey = '', platform = 'linkedin', angle = 'pain_to_solution', ctaUrl = '', lang = 'ar' }) {
  const svc = SEO_SERVICES.find(s => `service:${s.id}` === targetKey);
  const top = SEO_TOPICS.find(t => `topic:${t.id}` === targetKey);
  const subjectName = svc ? svc.titleAr : top ? top.titleAr : 'منصة خُطوة لدعم وتطوير المدرسين أونلاين';
  return `أنت خبير تسويق محتوى تعليمي لمنصة "خُطوة (Khutwa)" الموجهة للمدرسين أونلاين.
صغ منشورًا احترافيًا غير مبالغ فيه ولا يَعِد بأرقام طلاب مضمونة.
- المنصة المستهدفة: ${platform}
- الهدف/الخدمة: ${subjectName}
- زاوية المحتوى: ${angle}
- اللغة: ${lang === 'en' ? 'English' : 'العربية السلسة الواضحة'}
- رابط التحويل المدمج: ${ctaUrl}

المطلوب تحديدًا حسب المنصة:
1) إذا كانت المنصة Pinterest: أخرج (عنوان الـ Pin الجذاب في 60 حرفًا + نص على التصميم لا يتجاوز 5 كلمات + وصف غني بكلمات بحث المدرسين + 5 وسوم + رابط الـ CTA).
2) إذا كانت LinkedIn أو Facebook: أخرج (خطاف افتتاحي قوي + 3 نقاط قيمة عملية مجانية يتعلمها المدرس فورًا + دعوة هادئة للتجربة أو دراسة الحالة المجانية عبر الرابط).
3) إذا كانت YouTube Shorts / TikTok: أخرج (نص 35 ثانية مقسم لـ Hook و 3 خطوات و CTA بصري للرابط).`;
}

export function buildDeterministicMarketingDraft({ targetKey = '', platform = 'linkedin', angle = 'pain_to_solution', ctaUrl = '' }) {
  const svc = SEO_SERVICES.find(s => `service:${s.id}` === targetKey);
  const top = SEO_TOPICS.find(t => `topic:${t.id}` === targetKey);
  const title = svc ? svc.titleAr : top ? top.titleAr : 'حضورك المهني كمدرس أونلاين';
  const tip = svc ? svc.freeGuideAr[0] : top ? top.freePreviewAr : 'ابدأ بتوضيح تخصصك الدقيق والجمهور الذي تخدمه في أول سطرين من بروفايلك.';
  if (platform === 'pinterest') {
    return {
      title: `دليل المدرس: ${title}`,
      overlayHeadline: svc ? 'طوّر حضورك التدريسي' : 'تعلّم خطوة بخطوة',
      body: `📌 ${title}\n\n💡 نصيحة سريعة يمكنك تطبيقها اليوم:\n${tip}\n\n🔗 اكتشف التفاصيل وابدأ خطوتك على خُطوة:\n${ctaUrl}\n\n#تدريس_اونلاين #تطوير_المعلمين #خُطوة #Khutwa`,
    };
  }
  if (platform === 'tiktok_shorts') {
    return {
      title: `سكربت 35 ثانية — ${title}`,
      overlayHeadline: title,
      body: `🎬 [0-5s Hook]: لو بتدرّس أونلاين وحاسس إن خبرتك تستاهل حضور أوضح، ركّز في النقطة دي!\n\n📌 [5-25s الفكرة]: ${tip}\n\n✅ [25-35s CTA]: في "خُطوة" بنساعدك ترتب ده عمليًا وبدون وعود وهمية — الرابط جاهز ليك:\n${ctaUrl}`,
    };
  }
  return {
    title: `${title} | نصيحة عملية للمدرسين`,
    overlayHeadline: title,
    body: `كثير من المدرسين المتميزين أونلاين مشكلتهم مش في الشرح… المشكلة في طريقة عرض الخبرة للطالب من أول نظرة.\n\n🎯 نقطة تطبيقية بخصوص (${title}):\n${tip}\n\nفي منصة خُطوة بنساعدك تحوّل خبرتك لبروفايل أو فيديو أو جلسة موضوعية واضحة النطاق — وتقدر كمان تبدأ بدراسة حالة مجانية قبل أي التزام.\n\nاكتشف التفاصيل من هنا:\n${ctaUrl}`,
  };
}

/* ==================== Phase 3: Teleprompter & Telegram Bot 2.0 ==================== */
export function parseTeleprompterScript(rawText = '') {
  const lines = String(rawText || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  return lines.map((line, idx) => {
    const m = line.match(/^\[(\d{1,3})\s*s?\]\s*(.+)$/i);
    if (m) {
      return { index: idx, pauseSec: Math.min(120, Math.max(2, Number(m[1]) || 5)), text: m[2].trim() };
    }
    const words = line.split(/\s+/).filter(Boolean).length;
    const autoSec = Math.min(45, Math.max(4, Math.ceil(words * 0.65) + 2));
    return { index: idx, pauseSec: autoSec, text: line };
  });
}

export function verifyTelegramWebhookAuth(secretHeader, expectedSecret) {
  const exp = String(expectedSecret || '');
  const got = String(secretHeader || '');
  if (!exp || exp.length < 16 || !got) return false;
  const a = new TextEncoder().encode(got);
  const b = new TextEncoder().encode(exp);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function sendTelegramText(token, chatId, text, replyMarkup = null) {
  if (!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });
}

async function handleTelegramWebhook(request, env) {
  if (!env.TELEGRAM_WEBHOOK_SECRET || !env.TELEGRAM_CHAT_ID || !env.TELEGRAM_BOT_TOKEN) {
    return json({ ok: false, error: 'Telegram webhook is not configured.' }, 503);
  }
  const secretHdr = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
  if (!verifyTelegramWebhookAuth(secretHdr, env.TELEGRAM_WEBHOOK_SECRET)) {
    return json({ ok: false, error: 'Unauthorized webhook secret.' }, 401);
  }
  await ensurePhase2Schema(env.DB);
  let update;
  try { update = await readJson(request, 25000); } catch { return json({ ok: false }, 400); }
  const allowedChat = String(env.TELEGRAM_CHAT_ID).trim();

  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = String(cq.message?.chat?.id ?? '');
    if (chatId !== allowedChat) return json({ ok: false, error: 'Forbidden chat.' }, 403);
    const dataStr = String(cq.data || '');
    const [action, reqId] = dataStr.split(':');
    let feedback = 'تم التحديث';
    if (reqId && (action === 'confirm' || action === 'review')) {
      const existing = await env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(reqId).first();
      if (!existing) {
        feedback = 'الطلب غير موجود';
      } else if (action === 'confirm') {
        let items = [];
        try { items = JSON.parse(existing.selected_items || '[]'); } catch {}
        let batchWeek = existing.batch_week ?? null;
        if (orderConsumesWeeklySlot(items) && !batchWeek) {
          const settings = await getRuntimeSettings(env.DB);
          const counts = await getConfirmedBatchCounts(env.DB);
          batchWeek = findNextAvailableBatchWeek(counts, settings.weeklyCapacity, 1);
        }
        await env.DB.prepare("UPDATE requests SET status = 'confirmed', batch_week = ?, updated_at = ? WHERE id = ?")
          .bind(batchWeek, new Date().toISOString(), reqId).run();
        feedback = batchWeek ? `✅ تم تأكيد ${reqId} (المجموعة ${batchWeek})` : `✅ تم تأكيد ${reqId}`;
      } else {
        await env.DB.prepare("UPDATE requests SET status = 'reviewing', updated_at = ? WHERE id = ?")
          .bind(new Date().toISOString(), reqId).run();
        feedback = `👁 تم نقل ${reqId} لقيد المراجعة`;
      }
      await sendTelegramText(env.TELEGRAM_BOT_TOKEN, allowedChat, feedback);
    }
    try {
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ callback_query_id: cq.id, text: feedback }),
      });
    } catch { /* non-fatal */ }
    return json({ ok: true, feedback });
  }

  const msg = update.message;
  if (msg && msg.text) {
    const chatId = String(msg.chat?.id ?? '');
    if (chatId !== allowedChat) return json({ ok: false, error: 'Forbidden chat.' }, 403);
    const txt = msg.text.trim();
    let reply = '';
    if (txt === '/stats') {
      const ov = await adminOverview(env);
      reply = `📊 ملخص خُطوة الآن:\n- إجمالي الطلبات: ${ov.totalRequests}\n- بانتظار المراجعة: ${ov.pendingReviews}\n- المجموعة النشطة (${ov.batch.activeWeek}): ${ov.batch.seatsUsed}/${ov.batch.weeklyCapacity}\n- الإيراد المحقق: $${ov.verifiedRevenue}`;
    } else if (txt === '/new') {
      const rows = await env.DB.prepare("SELECT id, customer_name, subject, created_at FROM requests WHERE status = 'new' ORDER BY created_at DESC LIMIT 6").all();
      const list = rows.results || [];
      reply = list.length
        ? `🆕 أحدث الطلبات الجديدة:\n${list.map(r => `• ${r.id} — ${r.customer_name} (${r.subject})`).join('\n')}`
        : 'لا توجد طلبات جديدة غير مراجعة حاليًا ✓';
    } else if (txt === '/due') {
      const today = new Date().toISOString().slice(0, 10);
      const rows = await env.DB.prepare("SELECT id, customer_name, next_follow_up FROM requests WHERE next_follow_up IS NOT NULL AND next_follow_up <= ? AND status NOT IN ('completed','cancelled') ORDER BY next_follow_up ASC LIMIT 8").bind(today).all();
      const list = rows.results || [];
      reply = list.length
        ? `⏰ متابعات مستحقة اليوم/متأخرة:\n${list.map(r => `• ${r.id} — ${r.customer_name} (${r.next_follow_up})`).join('\n')}`
        : 'لا توجد متابعات متأخرة اليوم ✓';
    } else if (txt.startsWith('/req ')) {
      const qId = clean(txt.slice(5), 60).toUpperCase();
      const r = await env.DB.prepare('SELECT * FROM requests WHERE UPPER(id) = ?').bind(qId).first();
      reply = r
        ? `📄 تفاصيل ${r.id}:\nالاسم: ${r.customer_name} (${r.country})\nالتخصص: ${r.subject}\nالحالة: ${r.status} | الدفع: ${r.payment_status}\nالسعر: $${r.quoted_price ?? 0}\nالخدمات: ${r.selected_labels}`
        : `لم يتم العثور على طلب برقم ${qId}`;
    } else {
      reply = 'أوامر بوت خُطوة المتاحة:\n/stats — إحصائيات سريعة\n/new — أحدث الطلبات الجديدة\n/due — المتابعات المستحقة\n/req KW-... — تفاصيل طلب معين';
    }
    await sendTelegramText(env.TELEGRAM_BOT_TOKEN, allowedChat, reply);
    return json({ ok: true, replied: true });
  }

  return json({ ok: true });
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
    ...(contentRow.content_type === 'teleprompter' ? { cues: parseTeleprompterScript(contentRow.body_markdown || '') } : {}),
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
.btn-primary{background:linear-gradient(120deg,#4769ff,#9d5cf4);border-color:transparent}
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
.book-frame{border:2px solid rgba(244,209,141,.42);background:linear-gradient(155deg,#121d3b,#0a1228);border-radius:20px;padding:24px;margin-bottom:18px;box-shadow:0 18px 46px rgba(0,0,0,.4)}
.book-cover{border-bottom:1px solid rgba(244,209,141,.25);padding-bottom:14px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.book-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:14px 0}
.book-box{background:rgba(7,12,27,.65);border:1px solid rgba(188,198,255,.15);border-radius:14px;padding:14px}
.book-box h3{margin:0 0 8px;font-size:14px;color:#f4d18d}
.book-box ul{margin:0;padding-inline-start:18px;font-size:13px}
.prompter-box{background:#050915;border:1px solid rgba(159,241,223,.3);border-radius:16px;padding:20px;margin-top:12px;text-align:center}
.prompter-cue{font-size:clamp(20px,3vw,26px);font-weight:800;line-height:1.65;color:#fff;margin:14px 0;min-height:84px;display:grid;place-items:center;padding:14px;background:rgba(255,255,255,.03);border-radius:14px}
.prompter-track{height:6px;background:rgba(255,255,255,.08);border-radius:999px;overflow:hidden;margin:10px 0 4px}.prompter-fill{height:100%;background:linear-gradient(90deg,#4769ff,#9ff1df);transition:width .25s}
.prompter-controls{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:12px}
.btn-speed.active{background:#1d3560;border-color:#9ff1df;color:#9ff1df}
.err{background:#341320;border:1px solid #8a3550;color:#ffd8e2;padding:18px;border-radius:14px;text-align:center}
@media print{body{background:#fff;color:#111}.top,.btn,.prompter-controls{display:none!important}.book-frame,.card{box-shadow:none;background:#fff;color:#111;border:1px solid #bbb}.book-box{background:#f7f8fb;color:#111;border-color:#ddd}.book-box h3{color:#223}}
@media(max-width:650px){.top{flex-direction:column;align-items:flex-start}.item-head{flex-direction:column;align-items:flex-start}.book-grid{grid-template-columns:1fr}}
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
const prompterTimers = {};
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function renderCaseStudyBook(cs, data){
  if(!cs) return '';
  const stepsHtml = (cs.prioritySteps||[]).map((st,i)=>'<div style="margin:6px 0;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.04)"><b>' + (i+1) + '. ' + esc(st.title) + '</b>' + (st.detail ? '<div style="font-size:12px;color:#c9d6f2;margin-top:2px">' + esc(st.detail) + '</div>' : '') + '</div>').join('');
  return '<section class="book-frame" data-testid="case-study-book">'
    + '<div class="book-cover"><div><small style="color:#f4d18d;font-weight:800">' + esc(lang==='ar'?'تقرير دراسة الحالة المعتمد — خُطوة':'KHUTWA CASE STUDY REPORT') + '</small><h2 style="margin:4px 0 0;font-size:20px">' + esc(data.customerName) + (data.subject ? ' · ' + esc(data.subject) : '') + '</h2></div>'
    + '<button type="button" class="btn btn-primary" onclick="window.print()">' + esc(lang==='ar'?'طباعة / حفظ التقرير PDF':'Print / Save PDF') + '</button></div>'
    + (cs.headlineSummary ? '<p style="font-size:15px;color:#e8eeff;margin:0 0 12px">' + esc(cs.headlineSummary) + '</p>' : '')
    + '<div class="book-grid">'
    + '<div class="book-box"><h3>' + esc(lang==='ar'?'نقاط القوة':'Strengths') + '</h3><ul>' + (cs.strengths||[]).map(x=>'<li>'+esc(x)+'</li>').join('') + '</ul></div>'
    + '<div class="book-box"><h3>' + esc(lang==='ar'?'العوائق والفجوات':'Obstacles &amp; Gaps') + '</h3><ul>' + (cs.obstacles||[]).map(x=>'<li>'+esc(x)+'</li>').join('') + '</ul></div>'
    + '</div>'
    + (cs.platformAssessment ? '<div class="book-box" style="margin-bottom:12px"><h3>' + esc(lang==='ar'?'تقييم المنصة والملاءمة':'Platform Assessment') + '</h3><div style="font-size:13px">' + esc(cs.platformAssessment) + '</div></div>' : '')
    + (stepsHtml ? '<div class="book-box" style="margin-bottom:12px"><h3>' + esc(lang==='ar'?'خطة الخطوات ذات الأولوية':'Priority Action Plan') + '</h3>' + stepsHtml + '</div>' : '')
    + (cs.honestRecommendation ? '<div style="padding:12px 14px;border-radius:12px;background:rgba(159,241,223,.1);border:1px solid rgba(159,241,223,.25);font-size:13px"><b>' + esc(lang==='ar'?'التوصية الصادقة: ':'Recommendation: ') + '</b>' + esc(cs.honestRecommendation) + '</div>' : '')
    + '</section>';
}

function initTeleprompters(){
  (portalData?.items || []).forEach(item => {
    if(item.contentType !== 'teleprompter') return;
    const cues = Array.isArray(item.cues) ? item.cues : [];
    const box = document.getElementById('prompter-' + item.id);
    if(!box || !cues.length) return;
    let idx = 0, remaining = cues[0].pauseSec, playing = false, speed = 1;
    const cueEl = box.querySelector('[data-cue-text]');
    const metaEl = box.querySelector('[data-cue-meta]');
    const fillEl = box.querySelector('[data-cue-fill]');
    const playBtn = box.querySelector('[data-cue-play]');
    function drawCue(){
      const c = cues[idx] || cues[0];
      cueEl.textContent = c.text;
      metaEl.textContent = (lang==='ar' ? 'جملة ' + (idx+1) + ' من ' + cues.length + ' · المؤقت: ' + remaining + ' ث · السرعة ' + speed + 'x' : 'Line ' + (idx+1) + '/' + cues.length + ' · Timer: ' + remaining + 's · ' + speed + 'x');
      if(fillEl) fillEl.style.width = Math.round(((idx + 1) / cues.length) * 100) + '%';
    }
    function stopTimer(){ playing = false; clearInterval(prompterTimers[item.id]); playBtn.textContent = lang==='ar' ? '▶ تشغيل التلقين' : '▶ Start Prompter'; }
    function tick(){
      remaining -= 1;
      if(remaining <= 0){
        if(idx < cues.length - 1){ idx += 1; remaining = Math.max(2, Math.round(cues[idx].pauseSec / speed)); }
        else { stopTimer(); remaining = 0; }
      }
      drawCue();
    }
    playBtn.addEventListener('click', ()=>{
      if(playing){ stopTimer(); return; }
      playing = true;
      if(remaining <= 0){ idx = 0; remaining = Math.max(2, Math.round(cues[0].pauseSec / speed)); }
      playBtn.textContent = lang==='ar' ? '⏸ إيقاف مؤقت' : '⏸ Pause';
      prompterTimers[item.id] = setInterval(tick, 1000);
    });
    box.querySelectorAll('[data-cue-speed]').forEach(sb => sb.addEventListener('click', ()=>{
      speed = Number(sb.dataset.cueSpeed) || 1;
      box.querySelectorAll('[data-cue-speed]').forEach(b => b.classList.toggle('active', b === sb));
      remaining = Math.max(2, Math.round(cues[idx].pauseSec / speed));
      drawCue();
    }));
    box.querySelector('[data-cue-prev]')?.addEventListener('click', ()=>{ stopTimer(); idx = Math.max(0, idx-1); remaining = Math.max(2, Math.round(cues[idx].pauseSec / speed)); drawCue(); });
    box.querySelector('[data-cue-next]')?.addEventListener('click', ()=>{ stopTimer(); idx = Math.min(cues.length-1, idx+1); remaining = Math.max(2, Math.round(cues[idx].pauseSec / speed)); drawCue(); });
    box.querySelector('[data-cue-speak]')?.addEventListener('click', ()=>{
      if(!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(cues[idx].text);
      u.lang = /[\\u0600-\\u06FF]/.test(cues[idx].text) ? 'ar-EG' : 'en-US';
      u.rate = speed;
      window.speechSynthesis.speak(u);
    });
    drawCue();
  });
}

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
  const caseBook = renderCaseStudyBook(portalData.caseStudy, portalData);
  const itemsHtml = (portalData.items || []).map(item => {
    const title = lang === 'ar' ? item.titleAr : item.titleEn;
    let mediaHtml = '';
    if(item.playerMode === 'stream'){
      mediaHtml = '<div class="player-wrap"><video controls controlsList="nodownload" disablePictureInPicture src="' + esc(item.streamUrl) + '"></video><div class="watermark"><span>' + esc(portalData.customerName) + ' · ' + esc(portalData.requestId) + '</span><span>Khutwa Private Viewing</span></div></div>';
    } else if(item.playerMode === 'frame'){
      mediaHtml = '<div class="player-wrap"><iframe src="' + esc(item.frameUrl) + '" allow="autoplay; encrypted-media" allowfullscreen></iframe><div class="drive-shield" aria-hidden="true">🔒 خُطوة</div><div class="watermark"><span>' + esc(portalData.customerName) + ' · ' + esc(portalData.requestId) + '</span><span>Khutwa Private Viewing</span></div></div>';
    }
    if(item.contentType === 'teleprompter' && Array.isArray(item.cues) && item.cues.length){
      mediaHtml += '<div class="prompter-box" id="prompter-' + esc(item.id) + '" data-testid="teleprompter-coach">'
        + '<div style="font-size:12px;color:#9ff1df;font-weight:800" data-cue-meta></div>'
        + '<div class="prompter-track"><div class="prompter-fill" data-cue-fill style="width:0%"></div></div>'
        + '<div class="prompter-cue" data-cue-text></div>'
        + '<div class="prompter-controls">'
        + '<button type="button" class="btn" data-cue-prev>' + esc(lang==='ar'?'السابق':'Prev') + '</button>'
        + '<button type="button" class="btn btn-primary" data-cue-play>' + esc(lang==='ar'?'▶ تشغيل التلقين':'▶ Start Prompter') + '</button>'
        + '<button type="button" class="btn" data-cue-speak>' + esc(lang==='ar'?'🔊 استمع للنبرة':'🔊 Voice Cue') + '</button>'
        + '<button type="button" class="btn" data-cue-next>' + esc(lang==='ar'?'التالي':'Next') + '</button>'
        + '<button type="button" class="btn btn-speed" data-cue-speed="0.75">0.75x</button>'
        + '<button type="button" class="btn btn-speed active" data-cue-speed="1">1x</button>'
        + '<button type="button" class="btn btn-speed" data-cue-speed="1.25">1.25x</button>'
        + '</div></div>';
    }
    const bodyHtml = item.bodyMarkdown && item.contentType !== 'teleprompter' ? '<div class="guide-body">' + esc(item.bodyMarkdown) + '</div>' : '';
    return '<article class="card"><div class="item-head"><h2>' + esc(title) + '</h2><span class="pill">' + esc(item.contentType) + (item.durationLabel ? ' · ' + esc(item.durationLabel) : '') + '</span></div>' + mediaHtml + bodyHtml + '</article>';
  }).join('') || (caseBook ? '' : '<div class="card">' + esc(lang==='ar'?'لا توجد ملفات مرفقة لهذا الرابط حاليًا.':'No content items attached to this access link yet.') + '</div>');
  root.innerHTML = head + caseBook + itemsHtml;
  initTeleprompters();
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
    const [contentRes, reqRow] = await Promise.all([
      env.DB.prepare('SELECT * FROM protected_content ORDER BY created_at DESC').all(),
      env.DB.prepare('SELECT subject, target_platform, case_study_json FROM requests WHERE id = ?').bind(row.request_id).first(),
    ]);
    const allowedSet = new Set(Array.isArray(allowedIds) ? allowedIds : []);
    const matched = (contentRes.results || [])
      .filter(c => allowedSet.has(c.id) || (c.item_key && allowedSet.has(c.item_key)))
      .map(c => toSafeMediaDescriptor(c, token));
    let caseStudy = null;
    try { if (reqRow?.case_study_json) caseStudy = normalizeCaseStudyReport(JSON.parse(reqRow.case_study_json)); } catch {}
    return json({
      ok: true,
      requestId: row.request_id,
      customerName: row.customer_name,
      subject: reqRow?.subject || '',
      targetPlatform: reqRow?.target_platform || '',
      caseStudy,
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
    try { body = await readJson(request, 48000); } catch { return json({ ok: false, error: 'Invalid update.' }, 400); }
    const reqId = requestMatch[1];
    const existing = await env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(reqId).first();
    if (!existing) return json({ ok: false, error: 'Request not found.' }, 404);

    const status = clean(body.status, 40) || existing.status;
    const paymentStatus = clean(body.paymentStatus, 50) || existing.payment_status;
    if (!ALLOWED_STATUSES.has(status) || !ALLOWED_PAYMENT.has(paymentStatus)) return json({ ok: false, error: 'Invalid status value.' }, 400);

    const quotedPrice = body.quotedPrice !== undefined ? moneyOrNull(body.quotedPrice) : existing.quoted_price;
    const amountReceived = body.amountReceived !== undefined ? (moneyOrNull(body.amountReceived) ?? 0) : existing.amount_received;
    const internalNotes = body.internalNotes !== undefined ? clean(body.internalNotes, 5000) : (existing.internal_notes || '');
    const deadline = body.deadline !== undefined ? clean(body.deadline, 30) : (existing.deadline || '');
    const nextFollowUp = body.nextFollowUp !== undefined ? clean(body.nextFollowUp, 30) : (existing.next_follow_up || '');

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
    const caseStudyJson = body.caseStudy !== undefined
      ? (body.caseStudy ? JSON.stringify(normalizeCaseStudyReport(body.caseStudy)) : null)
      : existing.case_study_json;

    await env.DB.prepare(`UPDATE requests SET
      status=?, payment_status=?, quoted_price=?, amount_received=?, internal_notes=?,
      deadline=?, next_follow_up=?, batch_week=?, delivery_links_json=?, case_study_json=?, updated_at=?
      WHERE id=?`)
      .bind(
        status, paymentStatus, quotedPrice, amountReceived, internalNotes,
        deadline || null, nextFollowUp || null, batchWeek, deliveryLinksJson || null, caseStudyJson || null,
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

  if (path === '/api/admin/marketing-studio' && request.method === 'POST') {
    let body;
    try { body = await readJson(request, 10000); } catch { return json({ ok: false, error: 'Invalid marketing studio payload.' }, 400); }
    const targetKey = clean(body.targetKey, 80);
    const platform = ['linkedin', 'facebook', 'pinterest', 'tiktok_shorts', 'google_post'].includes(body.platform) ? body.platform : 'linkedin';
    const angle = clean(body.angle, 60) || 'pain_to_solution';
    const lang = body.lang === 'en' ? 'en' : 'ar';
    const ctaUrl = buildUtmUrl(url.origin, {
      targetKey,
      utmSource: clean(body.utmSource, 60) || platform,
      utmCampaign: clean(body.utmCampaign, 80) || 'studio_content',
      referralCode: clean(body.referralCode, 40),
      lang,
    });
    const prompt = buildMarketingPrompt({ targetKey, platform, angle, ctaUrl, lang });
    const draft = buildDeterministicMarketingDraft({ targetKey, platform, angle, ctaUrl });
    if (env.GEMINI_API_KEY) {
      try {
        const res = await callGemini(prompt, env, { thinkingLevel: 'LOW', maxOutputTokens: 1400 });
        if (res.ok && res.output) {
          return json({ ok: true, mode: 'gemini_api', model: res.model, ctaUrl, prompt, title: draft.title, overlayHeadline: draft.overlayHeadline, body: res.output });
        }
      } catch { /* fallback below */ }
    }
    return json({ ok: true, mode: env.GEMINI_API_KEY ? 'prompt_fallback' : 'template_builder', ctaUrl, prompt, ...draft });
  }

  if (path === '/api/admin/marketing-posts' && request.method === 'GET') {
    const res = await env.DB.prepare('SELECT * FROM marketing_posts ORDER BY updated_at DESC LIMIT 120').all();
    return json({ ok: true, posts: res.results || [] });
  }
  if (path === '/api/admin/marketing-posts' && request.method === 'POST') {
    let body;
    try { body = await readJson(request, 25000); } catch { return json({ ok: false, error: 'Invalid marketing post.' }, 400); }
    const id = clean(body.id, 60) || `mkt_${crypto.randomUUID().slice(0, 8)}`;
    const title = clean(body.title, 200);
    const bodyTxt = clean(body.body, 8000);
    if (!title || !bodyTxt) return json({ ok: false, error: 'Title and post content are required.' }, 400);
    const platform = clean(body.platform, 40) || 'linkedin';
    const status = ['draft', 'ready', 'published'].includes(body.status) ? body.status : 'draft';
    const category = clean(body.category, 40) || 'marketing';
    const keywords = clean(body.keywords, 300) || '';
    const summary = clean(body.summary, 280) || bodyTxt.replace(/\s+/g, ' ').slice(0, 155);
    const coverUrl = clean(body.coverUrl, 800) || '';
    const lang = body.lang === 'en' ? 'en' : 'ar';
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO marketing_posts (id, target_key, platform, angle, category, keywords, summary, cover_url, lang, title, body, cta_url, status, scheduled_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET target_key=excluded.target_key, platform=excluded.platform, angle=excluded.angle,
      category=excluded.category, keywords=excluded.keywords, summary=excluded.summary, cover_url=excluded.cover_url, lang=excluded.lang,
      title=excluded.title, body=excluded.body, cta_url=excluded.cta_url, status=excluded.status, scheduled_date=excluded.scheduled_date, updated_at=excluded.updated_at`)
      .bind(id, clean(body.targetKey, 80) || null, platform, clean(body.angle, 60) || null, category, keywords, summary, coverUrl, lang, title, bodyTxt, clean(body.ctaUrl, 600) || null, status, clean(body.scheduledDate, 30) || null, now, now).run();
    return json({ ok: true, id, publicUrl: status === 'published' ? `${url.origin}/insights/${encodeURIComponent(id)}` : null });
  }
  const mktPatchDel = path.match(/^\/api\/admin\/marketing-posts\/([A-Za-z0-9_-]+)$/);
  if (mktPatchDel && request.method === 'PATCH') {
    let body;
    try { body = await readJson(request, 4000); } catch { return json({ ok: false }, 400); }
    const status = ['draft', 'ready', 'published'].includes(body.status) ? body.status : 'draft';
    await env.DB.prepare('UPDATE marketing_posts SET status = ?, updated_at = ? WHERE id = ?')
      .bind(status, new Date().toISOString(), mktPatchDel[1]).run();
    return json({ ok: true });
  }
  if (mktPatchDel && request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM marketing_posts WHERE id = ?').bind(mktPatchDel[1]).run();
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
    const contentType = ['video', 'guide', 'checklist', 'pdf', 'teleprompter'].includes(body.contentType) ? body.contentType : 'guide';
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

async function handlePublicExplore(request, env) {
  let body;
  try { body = await readJson(request, 6000); } catch { return json({ ok: false, error: 'Invalid explorer request.' }, 400); }
  const subject = clean(body.subject, 140);
  if (!subject) return json({ ok: false, error: 'Subject is required.' }, 400);
  const det = explorePlatformsPure(body);
  const wantAi = body.deepAi === true;
  if (!wantAi || !env.GEMINI_API_KEY) {
    return json({ ok: true, mode: 'deterministic', ...det });
  }
  if (env.DB) {
    await ensurePhase2Schema(env.DB);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const key = await sha256(`exp:${ip}:${env.SESSION_SECRET || 'khutwa-explore'}`);
    const now = Math.floor(Date.now() / 1000);
    const row = await env.DB.prepare('SELECT calls, window_start FROM public_ai_limits WHERE ip_hash = ?').bind(key).first();
    if (row && now - Number(row.window_start) < 3600 && Number(row.calls) >= 12) {
      return json({ ok: true, mode: 'deterministic', rateLimited: true, ...det });
    }
    if (row && now - Number(row.window_start) < 3600) {
      await env.DB.prepare('UPDATE public_ai_limits SET calls = calls + 1 WHERE ip_hash = ?').bind(key).run();
    } else {
      await env.DB.prepare('INSERT INTO public_ai_limits (ip_hash, calls, window_start) VALUES (?, 1, ?) ON CONFLICT(ip_hash) DO UPDATE SET calls=1, window_start=excluded.window_start').bind(key, now).run();
    }
  }
  const lang = body.lang === 'en' ? 'English' : 'Arabic';
  const prompt = `أنت مستشار اختيار المنصات في منصة خُطوة.
قدّم تحليلًا واقعيًا موجزًا (4 نقاط واضحة) لمدرس بالمواصفات التالية دون أي وعود بالقبول أو الدخل المضمون:
- التخصص: ${subject} (${clean(body.type, 30)})
- لغة الطلاب: ${clean(body.learnerLang, 40)}
- مستوى الإنجليزية لدى المدرس: ${clean(body.englishLevel, 10)}
- نوع العمل المطلوب: ${clean(body.workMode, 30)} | الخبرة: ${clean(body.experienceYears, 20)}
- بلد الإقامة: ${clean(body.residence, 60)} | الهدف المستهدف: ${clean(body.targetCountry, 60)}
لغة الرد: ${lang}. اذكر التحدي الأهم + الخطوة التحضيرية قبل التقديم.`;
  try {
    const ai = await callGemini(prompt, env, { thinkingLevel: 'LOW', maxOutputTokens: 700 });
    return json({ ok: true, mode: ai.ok ? 'gemini_api' : 'deterministic', aiBrief: ai.ok ? ai.output : null, ...det });
  } catch {
    return json({ ok: true, mode: 'deterministic', ...det });
  }
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
  if (url.pathname === '/api/public/explore' && request.method === 'POST') return handlePublicExplore(request, env);
  if (url.pathname === '/api/requests' && request.method === 'POST') return createRequest(request, env, ctx);
  if (url.pathname === '/api/telegram/webhook' && request.method === 'POST') return handleTelegramWebhook(request, env);
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
    const origin = url.origin;
    const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'ar';

    if (url.pathname === '/robots.txt') {
      return new Response(buildRobotsTxt(origin), { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
    }
    if (url.pathname === '/llms.txt' || url.pathname === '/llms-full.txt') {
      const settings = env.DB ? await getRuntimeSettings(env.DB) : mergeSettings({});
      const pricing = resolveCatalogPricing(settings);
      const insights = await getPublishedInsights(env);
      const bodyTxt = url.pathname === '/llms-full.txt'
        ? buildLlmsFullTxt(origin, pricing, insights)
        : buildLlmsTxt(origin, pricing, insights);
      return new Response(bodyTxt, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=1800' } });
    }
    if (url.pathname === '/sitemap.xml') {
      let dynamicPosts = [];
      if (env.DB) {
        try {
          await ensurePhase2Schema(env.DB);
          const res = await env.DB.prepare("SELECT id FROM marketing_posts WHERE status = 'published' ORDER BY updated_at DESC LIMIT 80").all();
          dynamicPosts = res.results || [];
        } catch {}
      }
      return new Response(buildSitemapXml(origin, dynamicPosts), { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=1800' } });
    }
    if (url.pathname === '/insights' || url.pathname === '/insights/') {
      const insights = await getPublishedInsights(env);
      const activeCategory = clean(url.searchParams.get('cat'), 40) || 'all';
      const query = clean(url.searchParams.get('q'), 120) || '';
      return new Response(renderInsightsIndexHtml({ posts: insights, origin, lang, activeCategory, query }), {
        headers: { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'public, max-age=300' },
      });
    }
    const insMatch = url.pathname.match(/^\/insights\/([A-Za-z0-9_-]+)\/?$/);
    if (insMatch) {
      const insights = await getPublishedInsights(env);
      const post = insights.find(p => p.id === insMatch[1]);
      if (post) {
        return new Response(renderInsightDetailHtml({ post, origin, lang }), {
          headers: { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'public, max-age=600' },
        });
      }
    }
    if (url.pathname === '/guides' || url.pathname === '/guides/') {
      const settings = env.DB ? await getRuntimeSettings(env.DB) : mergeSettings({});
      const pricing = resolveCatalogPricing(settings);
      return new Response(renderGuidesIndexHtml({ pricing, origin, lang }), {
        headers: { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'public, max-age=600' },
      });
    }
    const svcMatch = url.pathname.match(/^\/service\/([A-Za-z0-9_-]+)\/?$/);
    if (svcMatch) {
      const item = SEO_SERVICES.find(s => s.id === svcMatch[1]);
      if (item) {
        const settings = env.DB ? await getRuntimeSettings(env.DB) : mergeSettings({});
        const pricing = resolveCatalogPricing(settings);
        return new Response(renderPublicDetailPageHtml({ kind: 'service', item, pricing, origin, lang }), {
          headers: { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'public, max-age=600' },
        });
      }
    }
    const topMatch = url.pathname.match(/^\/topic\/([A-Za-z0-9_-]+)\/?$/);
    if (topMatch) {
      const item = SEO_TOPICS.find(t => t.id === topMatch[1]);
      if (item) {
        const settings = env.DB ? await getRuntimeSettings(env.DB) : mergeSettings({});
        const pricing = resolveCatalogPricing(settings);
        return new Response(renderPublicDetailPageHtml({ kind: 'topic', item, pricing, origin, lang }), {
          headers: { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'public, max-age=600' },
        });
      }
    }

    if (url.pathname === '/access' || url.pathname === '/access/') return handleAccessRoutes(request, env);
    if (url.pathname.startsWith('/api/')) return api(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
};

