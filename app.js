(() => {
  'use strict';
  const DATA = window.KHUTWA_DATA;
  if (!DATA) {
    document.body.innerHTML = '<main style="padding:2rem;color:#fff;background:#080c20;font-family:Arial">تعذر تحميل بيانات خُطوة. تأكد من وجود الملف assets/content.js بجوار index.html.</main>';
    return;
  }
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const STORAGE_KEY = 'khutwa_v4_basket';
  const LANG_STORAGE_KEY = 'khutwa_lang';
  const ANALYTICS_CONSENT_KEY = 'khutwa_analytics_consent';
  const VISITOR_KEY = 'khutwa_visitor_id';
  function detectInitialLanguage() {
    try {
      const param = new URLSearchParams(window.location.search).get('lang');
      if (param) {
        const norm = param.trim().toLowerCase();
        if (norm === 'ar' || norm === 'en') return norm;
      }
    } catch {}
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved === 'ar' || saved === 'en') return saved;
    } catch {}
    try {
      const browserLang = String((navigator.languages && navigator.languages[0]) || navigator.language || '').toLowerCase();
      if (browserLang.startsWith('ar')) return 'ar';
      if (browserLang) return 'en';
    } catch {}
    return 'ar';
  }
  let requestStartedTracked = false;
  let language = detectInitialLanguage();
  let activeTopicFilter = 'all';
  let activePortfolioTab = 'videos';
  let basket = loadBasket();
  let lastRequest = null;
  let advisorStarted = false;
  let marketState = null;
  const ATTR_KEY = 'khutwa_attribution';
  let liveConfig = null;
  let deepLinkApplied = false;

  function captureAttribution() {
    let existing = {};
    try { existing = JSON.parse(sessionStorage.getItem(ATTR_KEY) || '{}'); } catch {}
    try {
      const p = new URLSearchParams(window.location.search);
      const next = {
        utmSource: (p.get('utm_source') || existing.utmSource || '').trim().slice(0, 100),
        utmMedium: (p.get('utm_medium') || existing.utmMedium || '').trim().slice(0, 100),
        utmCampaign: (p.get('utm_campaign') || existing.utmCampaign || '').trim().slice(0, 140),
        referralCode: (p.get('ref') || existing.referralCode || '').trim().toUpperCase().slice(0, 40),
        landingPath: existing.landingPath || (location.pathname + location.search).slice(0, 240)
      };
      try { sessionStorage.setItem(ATTR_KEY, JSON.stringify(next)); } catch {}
      return next;
    } catch { return existing; }
  }
  const attributionState = captureAttribution();

  function isLaunchActiveClient() {
    if (liveConfig?.pricing) return Boolean(liveConfig.pricing.launchActive);
    const ends = DATA.pricing?.launchEnds || '2027-05-26';
    const today = new Date().toISOString().slice(0, 10);
    return today <= ends;
  }

  function activeTopicPrice() {
    if (liveConfig?.pricing) return Number(liveConfig.pricing.topicPrice || 3);
    const reg = Number(DATA.pricing?.topicRegularPrice || 5);
    const launch = Number(DATA.pricing?.topicPrice || 3);
    return isLaunchActiveClient() ? launch : reg;
  }

  function regularTopicPrice() {
    if (liveConfig?.pricing) return Number(liveConfig.pricing.topicRegularPrice || 5);
    return Number(DATA.pricing?.topicRegularPrice || 5);
  }

  function servicePricePair(service, duration = '30') {
    if (!service) return { active: null, regular: null };
    if (service.id === 'individual_consultation') {
      const key = String(duration) === '60' ? 'consultation_60' : 'consultation_30';
      if (liveConfig?.pricing?.services?.[key]) return liveConfig.pricing.services[key];
      const ic = DATA.pricing?.individualConsultation || {};
      const launch = key === 'consultation_60' ? (ic.minutes60 ?? 15) : (ic.minutes30 ?? 10);
      const regular = key === 'consultation_60' ? (ic.regularMinutes60 ?? 20) : (ic.regularMinutes30 ?? 15);
      return { active: isLaunchActiveClient() ? launch : regular, regular, launch };
    }
    if (liveConfig?.pricing?.services?.[service.id]) return liveConfig.pricing.services[service.id];
    const launch = service.price;
    const regular = service.regularPrice ?? service.price;
    return { active: isLaunchActiveClient() ? launch : regular, regular, launch };
  }

  function activePackagePricing(pkg) {
    if (!pkg) return { active: 0, regularSum: 0, savingsVsRegular: 0 };
    if (liveConfig?.pricing?.packages?.[pkg.id]) return liveConfig.pricing.packages[pkg.id];
    const topicP = activeTopicPrice();
    const topicReg = regularTopicPrice();
    let activeSum = 0;
    let regularSum = 0;
    (pkg.items || []).forEach(id => {
      if (id.startsWith('topic_')) { activeSum += topicP; regularSum += topicReg; }
      else {
        const pair = servicePricePair(getService(id));
        activeSum += pair.active || 0;
        regularSum += pair.regular || 0;
      }
    });
    const pct = Number(DATA.pricing?.packageDiscountPercent ?? 15);
    const active = Math.round(activeSum * (1 - pct / 100));
    return { active, itemsSum: activeSum, regularSum, savingsVsRegular: Math.max(0, regularSum - active) };
  }

  function renderBatchBanners() {
    const batch = liveConfig?.batch || {
      activeWeek: 1,
      weeklyCapacity: DATA.pricing?.weeklyCapacity || 10,
      seatsUsed: 0,
      seatsRemaining: DATA.pricing?.weeklyCapacity || 10,
      week1Full: false,
      showCapacityBar: DATA.pricing?.showCapacityBar !== false,
      showExactSeatsCount: DATA.pricing?.showExactSeatsCount !== false
    };
    const show = batch.showCapacityBar !== false;
    const exact = batch.showExactSeatsCount !== false;
    const heroPill = $('#heroCapacityPill');
    const svcBanner = $('#servicesBatchBanner');
    const reqBanner = $('#requestBatchNote');
    const verifiedCount = liveConfig?.publicVerifiedCount;

    if (!show) {
      [heroPill, svcBanner, reqBanner].forEach(el => el && el.classList.add('hidden'));
      return;
    }

    const weekLabelAr = batch.activeWeek === 1 ? 'مجموعة الأسبوع الحالي (المجموعة 1)' : `المجموعة ${batch.activeWeek} (الأسبوع القادم)`;
    const weekLabelEn = batch.activeWeek === 1 ? 'Current Week Cohort (Batch 1)' : `Batch ${batch.activeWeek} (Next Open Week)`;
    const seatsTextAr = exact ? `متاح ${batch.seatsRemaining} من ${batch.weeklyCapacity} مقاعد مؤكدة` : 'الحجز مفتوح ضمن الطاقة الاستيعابية الأسبوعية';
    const seatsTextEn = exact ? `${batch.seatsRemaining} of ${batch.weeklyCapacity} confirmed slots open` : 'Accepting confirmed orders for the open weekly cohort';
    const verifiedTag = verifiedCount ? (language === 'ar' ? ` · ✓ ${verifiedCount} طلب مكتمل` : ` · ✓ ${verifiedCount} completed`) : '';

    if (heroPill) {
      heroPill.classList.remove('hidden');
      heroPill.classList.toggle('overflow', Boolean(batch.week1Full));
      heroPill.textContent = language === 'ar' ? `${weekLabelAr} · ${seatsTextAr}${verifiedTag}` : `${weekLabelEn} · ${seatsTextEn}${verifiedTag}`;
    }

    const bannerHtml = `<div class="batch-banner-main"><span class="batch-dot"></span><div><b>${escapeHTML(language === 'ar' ? weekLabelAr + ' — ' + seatsTextAr : weekLabelEn + ' — ' + seatsTextEn)}</b><small>${escapeHTML(language === 'ar' ? 'نحدّد عدد المقاعد المؤكدة أسبوعيًا لضمان جودة التنفيذ الفردي؛ موضوعات المكتبة ودراسة الحالة المجانية لا تستهلك مقعدًا من طاقة التنفيذ.' : 'Weekly confirmed service slots are capped to protect 1-on-1 quality; library topics and free case studies do not consume a production slot.')}</small></div></div><span class="batch-badge">${escapeHTML(language === 'ar' ? (isLaunchActiveClient() ? 'أسعار الإطلاق فعالة' : 'الأسعار الأساسية') : (isLaunchActiveClient() ? 'Launch Pricing Active' : 'Standard Pricing'))}${escapeHTML(verifiedTag)}</span>`;

    [svcBanner, reqBanner].forEach(el => {
      if (!el) return;
      el.classList.remove('hidden');
      el.classList.toggle('overflow', Boolean(batch.week1Full));
      el.innerHTML = bannerHtml;
    });
  }

  function renderReferralBanner() {
    const el = $('#referralBanner');
    if (!el) return;
    const ref = liveConfig?.referral;
    const code = ref?.code || attributionState.referralCode;
    if (!code || !ref) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = `<span>✦ ${escapeHTML(language === 'ar' ? `تم ربط طلبك بكود الإحالة ${ref.code}${ref.discountPercent > 0 ? ` (خصم إضافي ${ref.discountPercent}% يُؤكد عند المراجعة)` : ''}` : `Referral code ${ref.code} applied${ref.discountPercent > 0 ? ` (${ref.discountPercent}% partner discount confirmed on review)` : ''}`)}</span>`;
  }


  function t(value) {
    if (value && typeof value === 'object') return value[language] || value.ar || value.en || '';
    return value == null ? '' : String(value);
  }
  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
  function money(value) {
    if (value === 0) return language === 'ar' ? 'مجاني' : 'Free';
    return value == null ? (language === 'ar' ? 'حسب نطاق الطلب' : 'Quoted by scope') : `$${Number(value).toFixed(Number(value)%1 ? 2 : 0)}`;
  }
  function loadBasket() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(stored) ? stored.filter(item => item && typeof item.id === 'string' && ['service','topic','custom','package'].includes(item.type)) : [];
    } catch { return []; }
  }
  function persistBasket() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(basket)); } catch { /* Private browsing may block storage; basket remains active for this page. */ }
  }
  function getService(id) { return DATA.services.find(item => item.id === id); }
  function getTopic(id) {
    for (const path of DATA.paths) {
      const found = path.topics.find(topic => topic.id === id);
      if (found) return { ...found, pathTitle: path.title, category: path.category };
    }
    return null;
  }
  function getBasketItem(entry) {
    if (entry.type === 'service') return getService(entry.id) ? { kind:'service', data:getService(entry.id) } : null;
    if (entry.type === 'topic') return getTopic(entry.id) ? { kind:'topic', data:getTopic(entry.id) } : null;
    if (entry.type === 'custom') return { kind:'custom', data:entry };
    if (entry.type === 'package') return { kind:'package', data:entry };
    return null;
  }
  function showToast(message) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  function setText(selector, value) {
    const el = $(selector);
    if (el) el.textContent = value;
  }
  function syncEmailRequirement() {
    const emailEl = $('#clientEmail');
    const contactEl = $('#preferredContact');
    if (emailEl && contactEl) emailEl.required = contactEl.value === 'Email';
  }
  function updateStaticLanguage() {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.body.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.title = language === 'ar' ? 'خُطوة | نموّك المهني' : 'Khutwa | Tutor Growth & Support';
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', language === 'ar'
        ? 'خُطوة — نموّك المهني. خدمات تطوير البروفايل والفيديو، مكتبة موضوعات للمدرسين، وإرشاد لاختيار الخطوة المناسبة.'
        : 'Khutwa helps online tutors with profile creation and development, intro videos, topic sessions, and a free case study.');
    }
    syncEmailRequirement();
    $$('[data-ar][data-en]').forEach(el => {
      const value = el.dataset[language];
      if (value !== undefined) el.textContent = value;
    });
    $('#langBtn').textContent = language === 'ar' ? 'EN' : 'عربي';
    const placeholders = {
      topicSearch: { ar:'ابحث عن موضوع أو مشكلة…', en:'Search topics or challenges…' },
      customTopic: { ar:'مثال: أريد موضوعات عن الحصة التجريبية، تشخيص المستوى، وتحويل الاستفسار إلى طالب منتظم.', en:'Example: I need topics on trial lessons, level diagnosis, and converting inquiries into regular learners.' },
      marketSubject: { ar:'مثال: تعليم العربية لغير الناطقين بها', en:'e.g. Arabic for non-native speakers' },
      marketCountry: { ar:'مثال: Germany', en:'e.g. Germany' },
      marketResidence: { ar:'مثال: مصر', en:'e.g. Egypt' },
      clientName: { ar:'اكتب اسمك', en:'Your name' },
      clientWhatsApp: { ar:'+20...', en:'+1...' },
      requestGoal: { ar:'كلما كانت التفاصيل أوضح، كان اقتراح خُطوة أدق.', en:'The clearer your details, the more relevant Khutwa’s recommendation can be.' },
      guideInput: { ar:'اكتب مشكلتك باختصار…', en:'Briefly describe your challenge…' }
    };
    Object.entries(placeholders).forEach(([id, values]) => { const el = document.getElementById(id); if (el) el.placeholder = values[language]; });
    renderAll();
    if (marketState) renderMarketResults();
    if ($('#guidePanel').classList.contains('open')) resetGuideWelcome(false);
  }
  function renderServices() {
    const host = $('#servicesGrid');
    const launchActive = isLaunchActiveClient();
    host.innerHTML = DATA.services.map((service, index) => {
      const includes = (service.includes?.[language] || service.includes?.ar || []).slice(0, 4);
      const pair = servicePricePair(service, '30');
      const pair60 = service.id === 'individual_consultation' ? servicePricePair(service, '60') : null;
      const oldHtml = (launchActive && pair.regular != null && pair.active !== pair.regular)
        ? `<del class="old-price">$${pair.regular}</del>` : '';
      const priceLabel = pair.active === 0
        ? `<div class="service-price">${oldHtml}${language==='ar'?'مجاني':'Free'}${launchActive && pair.regular ? `<small>${escapeHTML(t(DATA.pricing.launchLabel))}</small>` : ''}</div>`
        : pair.active == null
        ? `<div class="service-price quote">${language==='ar'?'عرض سعر حسب الاحتياج':'Quote based on scope'}</div>`
        : service.id === 'individual_consultation'
          ? `<div class="service-price">${launchActive?'<del class="old-price">$15–20</del>':''}$${pair.active}–${pair60.active}<small>${escapeHTML(launchActive ? t(DATA.pricing.launchLabel) : t(DATA.pricing.regularLabel))}</small></div>`
          : `<div class="service-price">${oldHtml}${money(pair.active)}<small>${escapeHTML(launchActive ? t(DATA.pricing.launchLabel) : t(DATA.pricing.regularLabel))}</small></div>`;
      const payment = `<div class="detail-meta"><b>${language==='ar'?'المدة':'Timeline'}:</b> ${escapeHTML(t(service.delivery))}</div><div class="detail-meta"><b>${language==='ar'?'الدفع':'Payment'}:</b> ${escapeHTML(t(service.payment))}</div><div class="detail-meta">${escapeHTML(t(service.notes))}</div>`;
      return `<article class="service-card ${service.featured?'featured':''}" data-service-card="${escapeHTML(service.id)}">
        <div class="service-card-top"><div><div class="service-icon">${['▣','✧','▶','✎','◎','↗','⌕'][index%7]}</div><h3>${escapeHTML(t(service.title))}</h3></div>${priceLabel}</div>
        <p class="service-short">${escapeHTML(t(service.short))}</p>
        <ul class="service-mini-list">${includes.map(item=>`<li>${escapeHTML(item)}</li>`).join('')}</ul>
        <details class="service-details"><summary>${language==='ar'?'تفاصيل الخدمة والتسليمات':'Full scope and deliverables'}</summary><div class="details-content"><ul>${(service.includes?.[language]||service.includes.ar).map(item=>`<li>${escapeHTML(item)}</li>`).join('')}</ul>${payment}</div></details>
        <div class="service-action">${service.id==='individual_consultation'?`<select class="consultation-duration" aria-label="${language==='ar'?'مدة الجلسة':'Session duration'}"><option value="30">${language==='ar'?`30 دقيقة · $${pair.active}`:`30 min · $${pair.active}`}</option><option value="60">${language==='ar'?`60 دقيقة · $${pair60.active}`:`60 min · $${pair60.active}`}</option></select>`:''}<button class="share-link-btn" type="button" data-share-link="service:${escapeHTML(service.id)}" title="${language==='ar'?'نسخ رابط الخدمة المباشر':'Copy direct link'}">↗</button><button class="button button-soft" type="button" data-add-service="${escapeHTML(service.id)}">${language==='ar'?'أضف إلى السلة':'Add to basket'}</button></div>
      </article>`;
    }).join('');
  }
  function renderPaths() {
    const host = $('#pathGrid');
    const topicP = activeTopicPrice();
    const regTopicP = regularTopicPrice();
    const priceEl = $('#libraryPriceValue');
    if (priceEl) {
      priceEl.innerHTML = (isLaunchActiveClient() && regTopicP > topicP)
        ? `<del class="old-price">$${regTopicP}</del> $${topicP}`
        : `$${topicP}`;
    }
    const search = ($('#topicSearch').value || '').trim().toLocaleLowerCase();
    const visiblePaths = DATA.paths.filter(path => {
      if (activeTopicFilter !== 'all' && path.category !== activeTopicFilter) return false;
      if (!search) return true;
      const haystack = [t(path.title),t(path.short),...path.topics.flatMap(topic=>[t(topic.ar),t(topic.en),t(topic.outcome)])].join(' ').toLocaleLowerCase();
      return haystack.includes(search);
    });
    host.innerHTML = visiblePaths.map((path, index) => {
      const topicsMarkup = path.topics.map(topic => {
        const selected = basket.some(item => item.type==='topic' && item.id===topic.id);
        return `<div class="topic-row" data-topic-row="${escapeHTML(topic.id)}"><input type="checkbox" id="select-${escapeHTML(topic.id)}" data-topic-check="${escapeHTML(topic.id)}" ${selected?'checked':''}><label for="select-${escapeHTML(topic.id)}">${escapeHTML(t(topic))}<small>${escapeHTML(t(topic.outcome))}</small></label><button type="button" data-add-topic="${escapeHTML(topic.id)}">${money(topicP)}</button></div>`;
      }).join('');
      return `<article class="path-card" data-category="${path.category}"><div class="path-card-head"><span class="path-number">${String(index+1).padStart(2,'0')}</span><div><h3>${escapeHTML(t(path.title))}</h3><p>${escapeHTML(t(path.short))}</p></div></div><div class="path-topics">${topicsMarkup}</div><div class="path-card-foot"><small>${path.topics.length} ${language==='ar'?'موضوعات':'topics'} · ${money(topicP*path.topics.length)}</small><button class="button button-outline" type="button" data-add-path="${escapeHTML(path.id)}">${language==='ar'?'أضف المسار':'Add path'}</button></div></article>`;
    }).join('');
    $('#topicEmpty').classList.toggle('hidden', visiblePaths.length > 0);
  }
  function renderPackages() {
    const host = $('#packageGrid');
    host.innerHTML = DATA.packages.map((pkg,index) => {
      const names = pkg.items.map(id => {
        const service = getService(id);
        const topic = getTopic(id);
        return service ? t(service.title) : topic ? t(topic) : id;
      });
      const pp = activePackagePricing(pkg);
      const saveText = pp.savingsVsRegular > 0 ? (language==='ar'?`توفير $${pp.savingsVsRegular}`:`Save $${pp.savingsVsRegular}`) : '';
      return `<article class="package-card ${index===1?'recommended':''}" data-package-card="${escapeHTML(pkg.id)}"><span class="package-label">${index===1?(language==='ar'?'اختيار مقترح':'Suggested choice'):(language==='ar'?'تجميعة مقترحة':'Suggested combination')}</span><h3>${escapeHTML(t(pkg.title))}</h3><div class="package-price-row"><strong>$${pp.active}</strong>${pp.regularSum > pp.active ? `<del class="old-price">$${pp.regularSum}</del>` : ''}${saveText ? `<span class="savings-pill">${escapeHTML(saveText)}</span>` : ''}</div><p>${escapeHTML(t(pkg.audience))}</p><div class="package-items">${names.map(name=>`<span>${escapeHTML(name)}</span>`).join('')}</div><div style="display:flex;gap:8px;align-items:center;margin-top:auto"><button class="share-link-btn" type="button" data-share-link="package:${escapeHTML(pkg.id)}" title="${language==='ar'?'نسخ رابط الباقة':'Copy link'}">↗</button><button class="button button-outline" style="flex:1" type="button" data-add-package="${escapeHTML(pkg.id)}">${language==='ar'?'أضف التجميعة إلى السلة':'Add combination to basket'}</button></div></article>`;
    }).join('');
  }
  function basketLabel(entry) {
    const item = getBasketItem(entry);
    if (!item) return '';
    if (item.kind==='service') return t(item.data.title) + (entry.id==='individual_consultation' ? (language==='ar' ? ` (${entry.duration==='60'?'60':'30'} دقيقة)` : ` (${entry.duration==='60'?'60':'30'} min)`) : '');
    if (item.kind==='topic') return t(item.data);
    if (item.kind==='custom') return language==='ar'?'طلب موضوع مخصص':'Custom topic request';
    if (item.kind==='package') {
      const pkg = DATA.packages.find(p => p.id === entry.id) || entry;
      return t(pkg.title);
    }
    return '';
  }
  function basketPrice(entry) {
    const item = getBasketItem(entry);
    if (!item) return null;
    if (item.kind==='service') return servicePricePair(item.data, entry.duration || '30').active;
    if (item.kind==='topic') return activeTopicPrice();
    if (item.kind==='package') {
      const pkg = DATA.packages.find(p => p.id === entry.id);
      return pkg ? activePackagePricing(pkg).active : null;
    }
    return null;
  }
  const CROSS_SELL = {
    profile_creation: ['topic_trial_opening','topic_positioning_niche','topic_search_terms'],
    profile_development: ['topic_profile_audit','topic_search_terms','video_development'],
    video_creation: ['topic_brand_message','topic_referrals_communities','campaign_review'],
    video_development: ['topic_brand_message','topic_search_terms','campaign_review'],
    campaign_review: ['topic_referrals_communities','topic_landing_tracking','topic_linkedin_presence'],
    individual_consultation: ['topic_situation_diagnosis','topic_growth_goals','topic_growth_review'],
    market_review: ['topic_platform_models','topic_platform_requirements','topic_platform_test']
  };
  function crossSellReason(serviceId, topicId) {
    const ar = {
      profile_creation:'يساعدك على تحويل تجهيز البروفايل إلى تجربة تدريس واضحة واستعداد أفضل لأول طالب.',
      profile_development:'يكمل تحسين الملف بتوضيح التخصص وطريقة الظهور أمام الطالب.',
      video_creation:'يربط الفيديو برسالة مهنية وجمهور وقناة مناسبة بدل أن يكون مجرد فيديو جميل.',
      video_development:'يساعد على توحيد الفيديو مع رسالتك المهنية وطريقة تقديم خدماتك.',
      campaign_review:'يساعد على تحويل الوصول إلى مسار واضح للزيارة والاستفسار.',
      individual_consultation:'يحوّل النقاش إلى أهداف وخطوات ومؤشرات متابعة.',
      market_review:'يساعدك على مقارنة الخيارات ووضع خطة اختبار قبل اختيار المنصة.'
    };
    const en = {
      profile_creation:'Connect profile setup to a clear teaching experience and a stronger first-lesson plan.',
      profile_development:'Complement profile improvements with clearer positioning and visibility.',
      video_creation:'Connect the video to a clear message, audience, and channel—not just attractive editing.',
      video_development:'Align the video with your professional message and service presentation.',
      campaign_review:'Create a clearer path from reach to profile visits and inquiries.',
      individual_consultation:'Turn discussion into goals, next steps, and review indicators.',
      market_review:'Compare options and create a testing plan before choosing a platform.'
    };
    return language==='ar' ? ar[serviceId] || 'موضوع مكمل قد يساعدك على الاستفادة من الخدمة.' : en[serviceId] || 'A complementary topic that may help you get more from this service.';
  }
  function renderBasketRecommendations() {
    const host=$('#basketRecommendations');
    const selected=new Set(basket.map(x=>`${x.type}:${x.id}`));
    const options=[];
    basket.filter(x=>x.type==='service').forEach(entry=>(CROSS_SELL[entry.id]||[]).forEach(id=>options.push({id,source:entry.id})));
    const unique=[]; const seen=new Set();
    options.forEach(option=>{const item=getTopic(option.id)||getService(option.id);const key=`${getTopic(option.id)?'topic':'service'}:${option.id}`;if(item&&!selected.has(key)&&!seen.has(key)){seen.add(key);unique.push({...option,item});}});
    const selectedOptions=unique.slice(0,4);
    if(!basket.length||!selectedOptions.length){host.innerHTML='';host.hidden=true;return;}
    host.hidden=false;
    host.innerHTML=`<div class="basket-recommendation-heading" style="grid-column:1/-1;color:#cfc8ff;font-size:10px;font-weight:900">${language==='ar'?'قد يفيدك أيضًا — اقتراحات مرتبطة باختياراتك':'You may also need — suggestions related to your selection'}</div>`+selectedOptions.map(option=>{
      const item=option.item; const id=option.id; const isTopic=!!getTopic(id); const title=isTopic?t(item):t(item.title);
      const outcome=isTopic?t(item.outcome):t(item.short);
      return `<div class="basket-recommendation"><small>${language==='ar'?'لماذا نقترحها؟':'Why this suggestion?'}</small><b>${escapeHTML(title)} · ${isTopic?`$${DATA.pricing.topicPrice}`:escapeHTML(money(item.price))}</b><p>${escapeHTML(crossSellReason(option.source,id))} ${escapeHTML(outcome)}</p><button type="button" data-add-${isTopic?'topic':'service'}="${escapeHTML(id)}">${language==='ar'?'أضف إلى الطلب':'Add to request'} +</button></div>`;
    }).join('');
  }
  function renderBasket() {
    const host = $('#cartItems');
    const entries = basket.map((entry,index)=>({entry,index,item:getBasketItem(entry)})).filter(x=>x.item);
    $('#cartEmpty').classList.toggle('hidden', entries.length>0);
    host.innerHTML = entries.map(({entry,index,item}) => {
      const price = basketPrice(entry);
      const subtitle = item.kind==='topic' ? t(item.data.pathTitle) : item.kind==='custom' ? entry.text : item.kind==='package' ? (language==='ar'?'تجميعة مخصصة':'Custom combination') : (price===0?(language==='ar'?'مجانية':'Free'):price==null?(language==='ar'?'يحدد بعد مراجعة النطاق':'Quoted after scope review'):(language==='ar'?'سعر إطلاق':'Launch price'));
      return `<div class="cart-item"><div class="cart-item-main"><span>✦</span><div><b>${escapeHTML(basketLabel(entry))}</b><small>${escapeHTML(subtitle)}</small></div></div><div style="display:flex;align-items:center;gap:12px"><span class="cart-item-price">${price===0?(language==='ar'?'مجاني':'Free'):price==null?(language==='ar'?'عرض سعر':'Quote'):`$${(price*(entry.qty||1)).toFixed(2)}`}</span><button type="button" data-remove-item="${index}">${language==='ar'?'حذف':'Remove'}</button></div></div>`;
    }).join('');
    const subtotal = entries.reduce((sum,row)=>sum+(basketPrice(row.entry)||0)*(row.entry.qty||1),0);
    const hasQuote = entries.some(row=>basketPrice(row.entry)==null);
    $('#cartTotal').textContent = `$${subtotal.toFixed(2)}`;
    $('#cartCount').textContent = String(entries.reduce((sum,row)=>sum+(row.entry.qty||1),0));
    $('#cartQuoteNote').textContent = hasQuote ? (language==='ar'?'الإجمالي لا يشمل العناصر التي تحتاج عرض سعر. الخصم النهائي يؤكد بعد مراجعة الطلب.':'Subtotal excludes quote-based items. Any final offer is confirmed after request review.') : (language==='ar'?'الإجمالي مبدئي قبل أي عرض خاص. السعر النهائي يؤكد كتابةً.':'Subtotal is before any special offer. Final pricing is confirmed in writing.');
    const names = entries.map(row=>basketLabel(row.entry));
    $('#requestSelectedItems').textContent = names.length ? names.join(' • ') : (language==='ar'?'لم تتم إضافة خدمات بعد.':'No services added yet.');
    persistBasket();
    updateConditionalFields();
    renderBasketRecommendations();
  }
  function addItem(type,id,extra={}) {
    if (type==='topic' && basket.some(item=>item.type==='topic'&&item.id===id)) {
      showToast(language==='ar'?'الموضوع موجود بالفعل في السلة.':'This topic is already in your basket.'); return;
    }
    if (type==='service' && id==='individual_consultation' && basket.some(item=>item.type==='service'&&item.id===id&&item.duration===(extra.duration||'30'))) { showToast(language==='ar'?'هذه المدة موجودة بالفعل في السلة.':'This duration is already in your basket.'); return; }
    if (type==='service' && id!=='individual_consultation' && basket.some(item=>item.type==='service'&&item.id===id)) {
      showToast(language==='ar'?'الخدمة موجودة بالفعل في السلة.':'This service is already in your basket.'); return;
    }
    basket.push({type,id,...extra});
    trackEvent('add_to_cart',{item_id:`${type}:${id}`});
    renderBasket();
    showToast(language==='ar'?'تمت الإضافة إلى سلتك.':'Added to your basket.');
  }
  function addPath(pathId) {
    const path = DATA.paths.find(item=>item.id===pathId); if(!path) return;
    path.topics.forEach(topic=>{ if(!basket.some(item=>item.type==='topic'&&item.id===topic.id)) basket.push({type:'topic',id:topic.id}); });
    trackEvent('add_to_cart',{item_id:`path:${pathId}`});
    renderBasket();
    showToast(language==='ar'?'تمت إضافة موضوعات المسار إلى السلة.':'Path topics added to basket.');
  }
  function addPackage(packageId) {
    const pkg = DATA.packages.find(item=>item.id===packageId); if(!pkg) return;
    if (basket.some(item=>item.type==='package'&&item.id===pkg.id)) {
      showToast(language==='ar'?'الباقة موجودة بالفعل في السلة.':'This package is already in your basket.'); return;
    }
    const pkgSet = new Set(pkg.items || []);
    basket = basket.filter(item => !((item.type==='service' || item.type==='topic') && pkgSet.has(item.id)));
    basket.push({type:'package',id:pkg.id,title:pkg.title,qty:1});
    trackEvent('add_to_cart',{item_id:`package:${packageId}`});
    renderBasket();
    showToast(language==='ar'?'تمت إضافة الباقة بسعر الخصم التلقائي!':'Package added with bundle discount!');
    $('#cartPanel').scrollIntoView({behavior:'smooth',block:'center'});
  }
  function currentCategories() {
    const pkgItemIds = basket.filter(x=>x.type==='package').flatMap(x=>(DATA.packages.find(p=>p.id===x.id)?.items||[]));
    const serviceIds = [...basket.filter(x=>x.type==='service').map(x=>x.id), ...pkgItemIds.filter(id=>getService(id))];
    const services = serviceIds.map(getService).filter(Boolean);
    return {
      profile:services.some(x=>x.category==='profile'),
      video:services.some(x=>x.category==='video'),
      market:services.some(x=>x.category==='market') || serviceIds.includes('profile_creation'),
      promotion:services.some(x=>x.category==='promotion'),
      topics:basket.some(x=>x.type==='topic'||x.type==='custom') || pkgItemIds.some(id=>id.startsWith('topic_'))
    };
  }
  function updateConditionalFields() {
    const cats = currentCategories();
    $$('[data-condition]').forEach(el=>{el.hidden=!cats[el.dataset.condition];});
    const needsVideo = cats.video;
    $('#videoType').required = needsVideo && basket.some(x=>x.type==='service' && ['video_creation','video_bundle'].includes(x.id));
  }
  function renderPortfolio() {
    const items = (DATA.portfolio[activePortfolioTab] || []).filter(item => item && item.url && !item.pendingLink);
    $('#portfolioGrid').innerHTML = items.map((item,index)=>`<article class="portfolio-card"><span class="portfolio-index">${activePortfolioTab==='videos'?'VIDEO':'PROFILE'} · ${String(index+1).padStart(2,'0')}</span><h3>${escapeHTML(t(item.title))}</h3><p>${language==='ar'?'نموذج ضمن بورتفوليو خُطوة':'A sample from Khutwa portfolio'}</p><a class="button button-outline" href="${escapeHTML(item.url)}" target="_blank" rel="noopener noreferrer">${language==='ar'?'فتح النموذج':'Open sample'} ↗</a></article>`).join('');
    $$('[data-portfolio-tab]').forEach(btn=>btn.classList.toggle('active',btn.dataset.portfolioTab===activePortfolioTab));
  }
  function renderFaq() {
    $('#faqList').innerHTML = DATA.faqs.map(item=>`<details class="faq-item"><summary>${escapeHTML(t(item.q))}</summary><p>${escapeHTML(t(item.a))}</p></details>`).join('');
  }
  function renderVision() {
    setText('#visionTitle',t(DATA.vision.title)); setText('#visionBody',t(DATA.vision.body));
    $('#visionFeatures').innerHTML=DATA.vision.features.map((item,index)=>`<div class="future-feature"><span>${['◎','✦','↗'][index%3]}</span><p>${escapeHTML(t(item))}</p></div>`).join('');
  }
  function renderVideoTypes() {
    const el=$('#videoType');
    const keep=el.value;
    el.innerHTML=`<option value="">${language==='ar'?'اختر النوع':'Choose a type'}</option>`+DATA.videoTypes.map(item=>`<option value="${escapeHTML(item.id)}">${escapeHTML(t(item))}</option>`).join('');
    if(keep) el.value=keep;
  }
  function renderAll() {
    renderServices(); renderPaths(); renderPackages(); renderBasket(); renderBatchBanners(); renderReferralBanner(); renderPortfolio(); renderFaq(); renderVision(); renderVideoTypes();
    $('#heroEyebrow').textContent=t(DATA.hero.eyebrow);
    $('#heroTitle').textContent=t(DATA.hero.title);
    $('#heroSubtitle').textContent=t(DATA.hero.subtitle);
    $('#heroPrimary').childNodes[0].textContent=t(DATA.hero.primaryCta)+' ';
    $('#heroGuide').textContent=language==='ar'?'اسأل مرشد خُطوة':'Ask Khutwa Guide';
    $('#catalogLink').href=DATA.integrations.catalogUrl || `https://wa.me/${DATA.contact.whatsapp}?text=${encodeURIComponent(DATA.contact.catalogRequestMessage)}`;
    $('#footerCatalog').href=$('#catalogLink').href;
    $('#whatsappContact').href=`https://wa.me/${DATA.contact.whatsapp}`;
    $('#emailContact').href=`mailto:${DATA.contact.email}`; $('#emailContact').textContent=DATA.contact.email;
    $('#linkedinContact').href=DATA.contact.linkedin;
  }
  function switchLanguage() {
    language = language==='ar'?'en':'ar';
    try { localStorage.setItem(LANG_STORAGE_KEY, language); } catch {}
    updateStaticLanguage();
  }

  // Preliminary market discovery. Search links are external; final analysis remains human-led.
  /* ---------- Platform finder v2 (rules based, preliminary, no live data) ---------- */
  const MARKET_PLATFORMS = [
    { id:'preply', name:'Preply', domain:'preply.com', fit:{language:3,academic:2,skill:1,quran:1}, note:{ar:'سوق دروس خاصة معروف، وأقوى حضورًا في اللغات.',en:'A well-known private-lesson marketplace, strongest for languages.'} },
    { id:'italki', name:'italki', domain:'italki.com', fit:{language:3,academic:0,skill:0,quran:0}, note:{ar:'سوق متخصص أساسًا في تعلّم اللغات.',en:'A marketplace focused mainly at language learning.'} },
    { id:'verbling', name:'Verbling', domain:'verbling.com', fit:{language:3,academic:0,skill:0,quran:0}, note:{ar:'منصة موجهة للغات.',en:'A platform aimed at language learning.'} },
    { id:'amazingtalker', name:'AmazingTalker', domain:'amazingtalker.com', fit:{language:3,academic:1,skill:1,quran:0}, note:{ar:'منصة لغات حضورها قوي بين متعلمين من آسيا.',en:'A language platform with a strong presence among learners in Asia.'} },
    { id:'superprof', name:'Superprof', domain:'superprof.com', fit:{language:2,academic:3,skill:3,quran:1}, note:{ar:'دليل مدرسين لمواد متنوعة.',en:'A tutor directory covering many subjects.'} },
    { id:'teacheron', name:'TeacherOn', domain:'teacheron.com', fit:{language:2,academic:3,skill:2,quran:1}, note:{ar:'منصة لمواد متنوعة.',en:'A platform for many subjects.'} },
    { id:'classgap', name:'Classgap', domain:'classgap.com', fit:{language:2,academic:2,skill:1,quran:0}, note:{ar:'منصة دروس لعدة مواد.',en:'A lessons platform for several subjects.'} },
    { id:'51talk', name:'51Talk', domain:'51talk.com', fit:{language:0,academic:0,skill:0,quran:0}, special:true, note:{ar:'تركّز على تعليم الإنجليزية لمتعلمين ناطقين بالصينية.',en:'Focused on English lessons for Chinese-speaking learners.'} }
  ];
  const MARKET_GOAL_TIPS = {
    extra:{ar:'لدخل إضافي: ابدأ بمنصة واحدة أو اتنين وجرّبهم عدة أسابيع قبل ما تضيف غيرهم.',en:'For extra income: start with one or two platforms and test them for a few weeks before adding more.'},
    full:{ar:'لدخل أساسي: وزّع على منصة رئيسية وواحدة احتياطية، وما تعتمدش على مصدر واحد.',en:'For a main income: use one main platform and one backup, and do not depend on a single source.'},
    switch:{ar:'لو هتنتقل: قارن العمولة وسياسات التواصل مع الطلاب خارج المنصة قبل ما تنقل أي طلاب.',en:'If you are switching: compare commission and off-platform contact policies before moving any learners.'},
    start:{ar:'لو بتبدأ أونلاين: جهّز بروفايل واضح وفيديو تعريفي قبل التسجيل، فالانطباع الأول بيفرق.',en:'If you are starting online: prepare a clear profile and intro video before registering; first impressions matter.'}
  };
  function enhanceMarketForm() {
    const grid=document.querySelector('.market-form-grid'); if(!grid || $('#marketSubjectType')) return;
    const lang=$('#marketLearnerLang'); if(lang && ![...lang.options].some(o=>o.value==='Chinese')) { const opt=document.createElement('option'); opt.value='Chinese'; opt.textContent='中文'; lang.insertBefore(opt,lang.querySelector('option[value="Other"]')); }
    const mk=(html)=>{ const d=document.createElement('div'); d.className='form-field'; d.innerHTML=html; grid.appendChild(d); };
    mk(`<label for="marketSubjectType" data-ar="نوع المادة" data-en="Subject type">نوع المادة</label><select id="marketSubjectType"><option value="language" data-ar="لغة" data-en="A language">لغة</option><option value="academic" data-ar="مادة دراسية" data-en="School/academic subject">مادة دراسية</option><option value="skill" data-ar="مهارة مهنية" data-en="Professional skill">مهارة مهنية</option><option value="quran" data-ar="قرآن وعلوم شرعية" data-en="Quran / Islamic studies">قرآن وعلوم شرعية</option></select>`);
    mk(`<label for="marketGoal" data-ar="هدفك" data-en="Your goal">هدفك</label><select id="marketGoal"><option value="extra" data-ar="دخل إضافي" data-en="Extra income">دخل إضافي</option><option value="full" data-ar="دخل أساسي" data-en="Main income">دخل أساسي</option><option value="switch" data-ar="الانتقال من منصة" data-en="Switching platform">الانتقال من منصة</option><option value="start" data-ar="أبدأ أونلاين من الصفر" data-en="Starting online">أبدأ أونلاين من الصفر</option></select>`);
    mk(`<label for="marketResidence" data-ar="بلد إقامتك" data-en="Your country">بلد إقامتك</label><input id="marketResidence" placeholder="${language==='ar'?'مثال: مصر':'e.g. Egypt'}">`);
    const reqBtn=$('#requestMarketAnalysis');
    if(reqBtn) { reqBtn.dataset.ar='اطلب دراسة حالة مجانية'; reqBtn.dataset.en='Request a free case study'; }
    updateStaticLanguage();
  }
  function marketScore(p, type, learner, subject) {
    let score = p.fit[type] || 0;
    if(p.special) {
      const english=/english|انجليز|إنجليز/i.test(subject);
      return (learner==='Chinese' && type==='language' && english) ? 5 : 0;
    }
    if(learner==='Chinese' && p.id==='amazingtalker') score+=2;
    if(['Spanish','French','German'].includes(learner) && (p.id==='italki'||p.id==='verbling') && type==='language') score+=1;
    return score;
  }
  function marketLevel(score, top) {
    if(score>=3 && score>=top) return {ar:'ملاءمة مبدئية عالية',en:'High preliminary fit',color:'#7ee2b8'};
    if(score>=2) return {ar:'ملاءمة مبدئية متوسطة',en:'Medium preliminary fit',color:'#ffd27a'};
    return {ar:'ملاءمة منخفضة، تحتاج تحقق',en:'Low fit, needs checking',color:'#b9c0d6'};
  }
  function marketSummaryText() {
    if(!marketState) return '';
    const s=marketState;
    const lines=language==='ar'
      ? [`ملخص بحث المنصات (أولي):`,`المادة: ${s.subject} (${s.typeLabel})`,`لغة الطلاب: ${s.learner} | الفئة: ${s.audienceLabel}`,`البلد المستهدف: ${s.country||'-'} | بلد الإقامة: ${s.residence||'-'}`,`الهدف: ${s.goalLabel}`,`أعلى ملاءمة مبدئية: ${s.top.map(x=>x.name).join('، ')||'-'}`]
      : [`Platform search summary (preliminary):`,`Subject: ${s.subject} (${s.typeLabel})`,`Learner language: ${s.learner} | Audience: ${s.audienceLabel}`,`Target country: ${s.country||'-'} | My country: ${s.residence||'-'}`,`Goal: ${s.goalLabel}`,`Top preliminary fit: ${s.top.map(x=>x.name).join(', ')||'-'}`];
    return lines.join('\n');
  }
  function renderMarketResults() {
    const host=$('#marketResults'); if(!host || !marketState) return;
    const s=marketState;
    const google=q=>'https://www.google.com/search?q='+encodeURIComponent(q);
    const linkStyle='style="display:inline-block;margin:6px 6px 0 0;padding:4px 9px;border:1px solid var(--line);border-radius:999px;font-size:9px;color:#dfe6ff;text-decoration:none"';
    const cards=s.ranked.map(item=>{
      const p=item.p, lvl=marketLevel(item.score, s.ranked[0].score), q=[s.subject,s.learner,s.country].filter(Boolean).join(' ');
      return `<div class="market-result"><b>${escapeHTML(p.name)} <span style="font-size:9px;font-weight:400;color:${lvl.color}">· ${escapeHTML(t(lvl))}</span></b><small>${escapeHTML(t(p.note))}</small><div>
        <a ${linkStyle} href="https://${p.domain}/" target="_blank" rel="noopener noreferrer">${language==='ar'?'الموقع الرسمي ↗':'Official site ↗'}</a>
        <a ${linkStyle} href="${google(`site:${p.domain} ${q} tutor`)}" target="_blank" rel="noopener noreferrer">${language==='ar'?'مدرسين مشابهين ↗':'Similar tutors ↗'}</a>
        <a ${linkStyle} href="${google(`site:${p.domain} become a tutor apply requirements`)}" target="_blank" rel="noopener noreferrer">${language==='ar'?'شروط التقديم ↗':'How to apply ↗'}</a></div></div>`;
    }).join('');
    const quranNote=s.type==='quran'?`<div class="market-result"><small>${language==='ar'?'ملاحظة: القرآن والعلوم الشرعية قد لا تناسبها المنصات العامة. يحتاج بحثًا عن منصات متخصصة، وده بيتم في المراجعة البشرية.':'Note: general platforms may not suit Quran or Islamic studies. Specialised platforms need to be researched, which the human review covers.'}</small></div>`:'';
    const hidden=s.hiddenCount>0?`<div class="market-result"><small>${language==='ar'?`تم إخفاء ${s.hiddenCount} منصة/منصات ملاءمتها المبدئية ضعيفة لمادتك.`:`${s.hiddenCount} platform(s) with weak preliminary fit for your subject are hidden.`}</small></div>`:'';
    const checklist=language==='ar'
      ? ['العمولة أو رسوم الاشتراك الحالية','شروط القبول وخطوات المراجعة','طرق السحب المتاحة في بلدك','سياسات البروفايل والفيديو والتواصل خارج المنصة','عدد المنافسين في تخصصك وأسعارهم الظاهرة']
      : ['Current commission or subscription fees','Acceptance requirements and review steps','Payout methods available in your country','Rules for profiles, videos and off-platform contact','Number of competitors in your subject and their visible prices'];
    host.innerHTML=`<div class="market-result"><b>${language==='ar'?'ملخص مبدئي':'Preliminary summary'}</b><small>${escapeHTML(t(MARKET_GOAL_TIPS[s.goal]))}</small></div>${cards}${quranNote}${hidden}
      <div class="market-result"><b>${language==='ar'?'تحقق منها قبل التسجيل':'Verify before registering'}</b><small>${checklist.map(x=>'• '+escapeHTML(x)).join('<br>')}</small></div>
      <div class="market-result"><small>${language==='ar'?'الترتيب تقديري مبني على قواعد عامة، وليس بيانات حالية من المنصات ولا توصية نهائية. التقرير البشري يؤكد المصادر وتاريخ البحث.':'The ranking is an estimate from general rules, not live platform data or a final recommendation. The human report confirms sources and the research date.'}</small>
      <button type="button" id="copyMarketSummary" class="button button-outline full-button" style="margin-top:8px">${language==='ar'?'انسخ الملخص':'Copy summary'}</button></div>`;
    const copyBtn=$('#copyMarketSummary');
    if(copyBtn) copyBtn.addEventListener('click',async()=>{ try { await navigator.clipboard.writeText(marketSummaryText()); showToast(language==='ar'?'تم نسخ الملخص.':'Summary copied.'); } catch { showToast(language==='ar'?'تعذر النسخ، انسخه يدويًا.':'Could not copy; please copy manually.'); } });
  }
  function buildSearchLinks() {
    const subject=$('#marketSubject').value.trim();
    if(!subject) { $('#marketSubject').focus(); showToast(language==='ar'?'اكتب التخصص أولًا.':'Enter a subject first.'); return; }
    const type=($('#marketSubjectType')||{}).value||'language';
    const goal=($('#marketGoal')||{}).value||'extra';
    const learner=$('#marketLearnerLang').value;
    const country=$('#marketCountry').value.trim();
    const residence=(($('#marketResidence')||{}).value||'').trim();
    const audienceEl=$('#marketAudience');
    const scored=MARKET_PLATFORMS.map(p=>({p,score:marketScore(p,type,learner,subject)})).sort((a,b)=>b.score-a.score);
    const visible=scored.filter(x=>x.score>=1);
    const ranked=visible.length?visible:scored.slice(0,3);
    const pick=(el)=>el&&el.selectedOptions&&el.selectedOptions[0]?el.selectedOptions[0].textContent:'';
    marketState={subject,type,goal,learner,country,residence,ranked,hiddenCount:scored.length-ranked.length,
      top:ranked.slice(0,3).map(x=>x.p),typeLabel:pick($('#marketSubjectType')),goalLabel:pick($('#marketGoal')),audienceLabel:pick(audienceEl)};
    renderMarketResults();
  }
  function fillMarketRequest() {
    if(!marketState) return;
    const goalField=$('#requestGoal');
    if(goalField && !goalField.value.trim()) goalField.value=marketSummaryText();
    const c=$('#clientCountry'); if(c && !c.value.trim() && marketState.residence) c.value=marketState.residence;
  }

  function collectRequest() {
    const form=$('#requestForm');
    const fields=Object.fromEntries(new FormData(form).entries());
    const selection=basket.map(entry=>{
      const item=getBasketItem(entry);
      return {type:entry.type,id:entry.id,label:basketLabel(entry),price:basketPrice(entry),text:entry.text||'',qty:entry.qty||1};
    });
    return {
      schema:'khutwa-request-v1',createdAt:new Date().toISOString(),language,
      customer:{name:fields.name||'',whatsapp:fields.whatsapp||'',email:fields.email||'',country:fields.country||'',subject:fields.subject||'',experience:fields.experience||'',preferredContact:fields.preferredContact||''},
      platforms:{current:fields.currentPlatform||'',target:fields.targetPlatform||'',profileLink:fields.profileLink||''},
      video:{type:fields.videoType||'',platform:fields.videoPlatform||'',duration:fields.videoDuration||'',footage:fields.footage||''},
      market:{country:fields.marketCountry||'',learnerLanguage:fields.marketLearnerLanguage||''},
      promotion:{budget:fields.campaignBudget||'',channels:fields.preferredChannel||''},
      selectedItems:selection,selectedTopics:selection.filter(x=>x.type==='topic').map(x=>x.label),
      customTopics:fields.customTopics||basket.filter(x=>x.type==='custom').map(x=>x.text).join('\n'),
      goal:fields.goal||'',consent:$('#requestConsent').checked,website:fields.website||'',attribution:attributionState
    };
  }
  async function submitRequest(event) {
    event.preventDefault();
    const form=$('#requestForm');
    if(!form.reportValidity()) return;
    if(!basket.length) { setText('#formStatus',language==='ar'?'أضف خدمة واحدة على الأقل أو موضوعًا قبل إرسال الطلب.':'Add at least one service or topic before continuing.'); $('#cartPanel').scrollIntoView({behavior:'smooth'}); return; }
    lastRequest=collectRequest();
    let consent=false; try { consent=localStorage.getItem(ANALYTICS_CONSENT_KEY)==='accepted'; } catch {}
    lastRequest.analytics = consent ? {consent:true, visitorId:getVisitorId()} : {consent:false};
    const submitButton=form.querySelector('button[type="submit"]');
    if(submitButton){submitButton.disabled=true;submitButton.dataset.originalText=submitButton.textContent;submitButton.textContent=language==='ar'?'جارٍ إرسال الطلب وحفظه…':'Sending and saving your request…';}
    setText('#formStatus',language==='ar'?'جارٍ إرسال الطلب إلى نظام خُطوة المركزي…':'Sending your request to Khutwa…');
    try {
      const response=await fetch('/api/requests',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(lastRequest),credentials:'same-origin',cache:'no-store'});
      const result=await response.json().catch(()=>({}));
      if(!response.ok || !result.ok || !result.requestId) throw new Error(result.error || (language==='ar'?'لم نتمكن من حفظ الطلب. حاول مرة أخرى.':'We could not save your request. Please try again.'));
      const requestId=result.requestId;
      setText('#formStatus',language==='ar'?`تم استلام طلبك وحفظه في نظام خُطوة بنجاح. رقم طلبك: ${requestId}. سنراجع التفاصيل ونتواصل معك.`:`Your request has been received and saved securely. Request ID: ${requestId}. Khutwa will review it and contact you.`);
      form.reset();
      basket=[];
      renderBasket();
      lastRequest=null;
      requestStartedTracked=false;
    } catch(error) {
      setText('#formStatus',language==='ar'?`تعذر إرسال الطلب: ${error.message} — لم نؤكد استلامه. حاول مرة أخرى أو تواصل معنا عبر واتساب.`:`Could not submit the request: ${error.message}. It has not been confirmed. Please try again or contact us on WhatsApp.`);
    } finally {
      if(submitButton){submitButton.disabled=false;submitButton.textContent=submitButton.dataset.originalText || (language==='ar'?'إرسال طلبك إلى خُطوة':'Submit your request to Khutwa');}
    }
  }

  // Lightweight, local guided recommender. It does not call an AI API or send messages externally.
  function openGuide() {
    const panel=$('#guidePanel');
    panel.style.zIndex='1100'; // keep the assistant above the cookie banner on small screens
    panel.classList.add('open'); panel.setAttribute('aria-hidden','false');
    if(!advisorStarted) resetGuideWelcome(true);
    setTimeout(()=>$('#guideInput').focus(),80);
  }
  function closeGuide() { $('#guidePanel').classList.remove('open'); $('#guidePanel').setAttribute('aria-hidden','true'); }
  function addGuideMessage(text, role='bot', extra='') {
    const el=document.createElement('div');el.className=`guide-message ${role}`;el.textContent=text;
    if(extra) el.insertAdjacentHTML('beforeend',extra);
    $('#guideMessages').appendChild(el);$('#guideMessages').scrollTop=$('#guideMessages').scrollHeight;
    return el;
  }
  function quickChips(items) {
    $('#guideQuickActions').innerHTML=items.map(item=>`<button class="guide-chip" type="button" data-guide-choice="${escapeHTML(item.value)}">${escapeHTML(item.label)}</button>`).join('');
  }
  function resetGuideWelcome(push=true) {
    if(push) $('#guideMessages').innerHTML='';
    advisorStarted=true;
    addGuideMessage(language==='ar'?'أهلًا بيك في خُطوة. أنا مساعد آلي، هسألك كام سؤال بسيط عشان أفهم وضعك وأقترح عليك الأنسب، والقرار في الآخر ليك. من فضلك متكتبش كلمات مرور أو بيانات حساسة. إيه أقرب حاجة لوضعك؟':'Welcome to Khutwa. I am an automated assistant: I will ask a few simple questions to understand your situation and suggest what fits best, and the decision stays yours. Please do not share passwords or sensitive data. Which option best describes your situation?');
    flowStart();
  }
  function guideDirectAnswer(text) {
    const value=String(text||'').toLocaleLowerCase();
    const isPrice=/(سعر|الأسعار|بكام|كم|تكلفة|price|pricing|cost|how much)/i.test(value);
    const isDiscount=/(خصم|خصومات|discount|offer|offers|deal)/i.test(value);
    const isPackage=/(باقة|باقات|package|bundle|combination)/i.test(value);
    const isTopic=/(موضوع|موضوعات|جلسة|جلسات|كبسولة|topic|session|capsule)/i.test(value);
    if(isPrice && isTopic && !isPackage){
      addGuideMessage(language==='ar'
        ? `سعر الإطلاق للموضوع الواحد ${money(DATA.pricing.topicPrice)}. لما تختار عدة موضوعات، خُطوة تراجع العدد وطبيعة الموضوعات وتقدم لك عرضًا مناسبًا قبل تأكيد الطلب. الجلسة الفردية المباشرة منتج مختلف عن المحتوى الموضوعي.`
        : `The launch price is ${money(DATA.pricing.topicPrice)} per topic. For multiple topics, Khutwa reviews the number and complexity, then confirms a suitable offer before you proceed. A live individual consultation is a separate product.`);
      quickChips([
        {label:language==='ar'?'استكشف الموضوعات':'Explore topics',value:'أريد استكشاف الموضوعات التعليمية'},
        {label:language==='ar'?'كوّن جلسة خاصة':'Build a custom session',value:'أريد تكوين جلسة من موضوعات مختلفة'},
        {label:language==='ar'?'اسأل عن باقة':'Ask about a package',value:'أريد معرفة الباقات والعروض'}
      ]);
      return true;
    }
    if(isDiscount || isPackage){
      addGuideMessage(language==='ar'
        ? 'خُطوة توفر عروضًا خاصة على بعض التجميعات، لكن الخصم لا يُحسب تلقائيًا لكل سلة. اختَر الخدمات والموضوعات التي تحتاجها، وسيراجع الفريق مكونات طلبك ويؤكد السعر والعرض كتابةً قبل موافقتك.'
        : 'Khutwa offers tailored deals on selected combinations, but discounts are not automatically applied to every basket. Choose the services and topics you need; the team will review your selection and confirm any offer in writing before you accept.');
      quickChips([
        {label:language==='ar'?'شوف الباقات':'View combinations',value:'أريد باقة مناسبة لاحتياجي'},
        {label:language==='ar'?'أختار بنفسي':'Choose my own items',value:'أريد اختيار الخدمات والموضوعات بنفسي'},
        {label:language==='ar'?'افتح السلة':'Open basket',value:'افتح السلة'}
      ]);
      return true;
    }
    return false;
  }
  function recommendForText(text) {
    const normalized=String(text||'').trim().toLocaleLowerCase();
    if(guideDirectAnswer(normalized)) return;
    const scored=DATA.recommendationRules.map(rule=>{
      const matches=(rule.match||[]).filter(term=>normalized.includes(String(term).toLocaleLowerCase()));
      return {...rule,score:matches.reduce((sum,term)=>sum+Math.min(4,String(term).length/3),0),matched:matches};
    }).filter(rule=>rule.score>0).sort((a,b)=>b.score-a.score).slice(0,2);
    if(!scored.length) {
      addGuideMessage(language==='ar'?'ممكن توضح لي المشكلة أو النتيجة اللي عايز توصل لها؟ ولو مش لاقي الموضوع في المكتبة، تقدر تطلب تركيبة خاصة من الموضوعات اللي تحتاجها.':'Could you describe the challenge or the outcome you want? If the library does not cover it, you can request a custom topic combination.');
      quickChips([
        {label:language==='ar'?'إنشاء أو تطوير بروفايل':'Create or improve a profile',value:'أريد إنشاء أو تطوير البروفايل'},
        {label:language==='ar'?'فيديو':'Video',value:'أحتاج فيديو تعريفي أو ترويجي'},
        {label:language==='ar'?'مهارات التدريس':'Teaching skills',value:'أريد تطوير مهارات التدريس'},
        {label:language==='ar'?'اختيار منصة':'Choose a platform',value:'أريد اختيار منصة مناسبة لتخصصي'},
        {label:language==='ar'?'تكوين موضوعات مخصصة':'Custom topics',value:'أريد موضوعات خاصة بمشكلتي'}
      ]);
      const host=document.createElement('div');host.className='guide-recommendations';
      const custom=document.createElement('div');custom.className='guide-recommendation';
      custom.innerHTML=`<b>${language==='ar'?'اطلب تركيبة خاصة':'Request a custom combination'}</b><p>${language==='ar'?'سنراجع احتياجك ونقترح الموضوعات والتكلفة قبل التأكيد.':'We will review your need and suggest relevant topics and pricing before confirmation.'}</p><button type="button" data-guide-custom="${escapeHTML(text)}">${language==='ar'?'أضف احتياجي إلى السلة':'Add my need to the basket'}</button>`;
      host.appendChild(custom);$('#guideMessages').appendChild(host);$('#guideMessages').scrollTop=$('#guideMessages').scrollHeight;
      return;
    }
    const serviceIds=[...new Set(scored.flatMap(x=>x.serviceIds||[]))].slice(0,2);
    const topicIds=[...new Set(scored.flatMap(x=>x.topicIds||[]))].slice(0,4);
    const packageIds=[...new Set(scored.flatMap(x=>x.packageIds||[]))].slice(0,2);
    const services=serviceIds.map(getService).filter(Boolean);
    const topics=topicIds.map(getTopic).filter(Boolean);
    const packages=packageIds.map(id=>DATA.packages.find(p=>p.id===id)).filter(Boolean);
    const why=scored.map(x=>t(x.why)).filter(Boolean).join(' ');
    addGuideMessage((language==='ar'?'من وصفك، دي بداية مناسبة، ودي أسباب الترشيح: ':'Based on your description, here is a useful starting point and why: ')+why);
    const host=document.createElement('div');host.className='guide-recommendations';
    services.forEach(service=>{
      const box=document.createElement('div');box.className='guide-recommendation';
      box.innerHTML=`<b>${escapeHTML(t(service.title))} · ${escapeHTML(money(service.price))}</b><p>${escapeHTML(t(service.short))}</p><button type="button" data-guide-add-service="${escapeHTML(service.id)}">${language==='ar'?'أضف الخدمة للسلة':'Add service to basket'}</button>`;
      host.appendChild(box);
    });
    topics.forEach(topic=>{
      const box=document.createElement('div');box.className='guide-recommendation';
      box.innerHTML=`<b>${escapeHTML(t(topic))} · $${DATA.pricing.topicPrice}</b><p>${escapeHTML(t(topic.outcome))}</p><button type="button" data-guide-add-topic="${escapeHTML(topic.id)}">${language==='ar'?'أضف الموضوع':'Add topic'}</button>`;
      host.appendChild(box);
    });
    packages.forEach(pkg=>{
      const box=document.createElement('div');box.className='guide-recommendation guide-package-recommendation';
      box.innerHTML=`<b>${language==='ar'?'تجميعة مقترحة: ':'Suggested combination: '}${escapeHTML(t(pkg.title))}</b><p>${escapeHTML(t(pkg.audience))} ${language==='ar'?'يمكنك سؤال خُطوة عن عرض التجميعة.':'Ask Khutwa about a tailored package offer.'}</p><button type="button" data-guide-add-package="${escapeHTML(pkg.id)}">${language==='ar'?'أضف التجميعة':'Add combination'}</button>`;
      host.appendChild(box);
    });
    const custom=document.createElement('div');custom.className='guide-recommendation';
    custom.innerHTML=`<b>${language==='ar'?'عايز تركيبة مختلفة؟':'Want a different combination?'}</b><p>${language==='ar'?'اطلب موضوعات مخصصة وسيتم مراجعة نطاقها وسعرها.':'Request custom topics; scope and pricing will be reviewed.'}</p><button type="button" data-guide-custom="${escapeHTML(text)}">${language==='ar'?'اطلب تركيبة خاصة':'Request a custom combination'}</button>`;
    host.appendChild(custom);
    $('#guideMessages').appendChild(host);$('#guideMessages').scrollTop=$('#guideMessages').scrollHeight;
    addGuideMessage(language==='ar'?'تقدر تضيف خدمة أو موضوعًا أو تجميعة إلى السلة، وبعدها تكمل طلبًا واحدًا. الأسعار النهائية والعروض الخاصة يؤكدها فريق خُطوة قبل التنفيذ.':'Add a service, topic, or combination to your basket and submit one request. Final pricing and any special offer are confirmed by Khutwa before work begins.');
    quickChips([{label:language==='ar'?'عندي احتياج آخر':'Another need',value:'لدي احتياج آخر وأريد اقتراحًا مختلفًا'},{label:language==='ar'?'افتح السلة':'Open basket',value:'Open basket'}]);
  }
  /* ---------- Guided advisor (rules based, no external AI) ---------- */
  const FLOW_SITUATIONS = [
    { id:'new', label:{ar:'عايز أبدأ كمدرس جديد',en:'I am starting as a new tutor'} },
    { id:'profile', label:{ar:'عندي بروفايل ومحتاج أحسنه',en:'I have a profile to improve'} },
    { id:'video', label:{ar:'محتاج فيديو',en:'I need a video'} },
    { id:'reach', label:{ar:'عايز طلاب أكتر',en:'I want more learners'} },
    { id:'teaching', label:{ar:'عايز أحسّن طريقة تدريسي',en:'I want to improve my teaching'} },
    { id:'notsure', label:{ar:'مش عارف أبدأ منين',en:'I am not sure where to start'} }
  ];
  const FLOW_OBSTACLES = {
    new: [
      { id:'platform', label:{ar:'مش عارف أختار منصة',en:'I cannot choose a platform'} },
      { id:'build', label:{ar:'مش عارف أبني بروفايلي',en:'I do not know how to build my profile'} },
      { id:'trial', label:{ar:'قلقان من الحصة التجريبية',en:'I am worried about the trial lesson'} }
    ],
    profile: [
      { id:'search', label:{ar:'مش بيظهر في البحث',en:'It does not show up in search'} },
      { id:'position', label:{ar:'تخصصي مش واضح للطالب',en:'My niche is not clear to learners'} },
      { id:'price', label:{ar:'مش متأكد من السعر',en:'I am unsure about my price'} }
    ],
    video: [
      { id:'vnew', label:{ar:'معنديش فيديو',en:'I do not have a video'} },
      { id:'vdev', label:{ar:'عندي فيديو ومش راضي عنه',en:'I have a video I am not happy with'} },
      { id:'vmsg', label:{ar:'مش عارف أقول إيه فيه',en:'I do not know what to say in it'} }
    ],
    reach: [
      { id:'external', label:{ar:'عايز طلاب من خارج المنصة',en:'I want learners outside the platform'} },
      { id:'brand', label:{ar:'عايز أبني اسم ومحتوى',en:'I want to build a name and content'} },
      { id:'campaign', label:{ar:'عندي أو ناوي أعمل حملة إعلانية',en:'I have or plan an ad campaign'} }
    ],
    teaching: [
      { id:'trial2', label:{ar:'الحصة التجريبية',en:'The trial lesson'} },
      { id:'levels', label:{ar:'مستويات مختلفة وإدارة الفصل',en:'Mixed levels and class management'} },
      { id:'assess', label:{ar:'التقييم والمتابعة',en:'Assessment and follow-up'} }
    ]
  };
  const FLOW_OUTCOMES = {
    'new.platform': { s:['market_review'], t:['topic_platform_models','topic_platform_requirements','topic_platform_test'], p:'package_start',
      why:{ar:'اختيار منصة غلط بيضيّع وقت وعمولة، فالأفضل تقارن الخيارات قبل ما تلتزم.',en:'A wrong platform choice wastes time and commission, so compare options before committing.'},
      res:{ar:'مقارنة واضحة بين خيارات مناسبة لتخصصك وخطة اختبار عملية قبل القرار.',en:'A clear comparison of options that suit your subject and a practical test plan before you decide.'} },
    'new.build': { s:['profile_creation'], t:['topic_platform_requirements','topic_positioning_niche','topic_trial_opening'], p:'package_start',
      why:{ar:'البداية المنظمة بتوفر عليك تجربة وغلط، وأول انطباع للطالب بيبدأ من البروفايل.',en:'An organised start saves trial and error, and a learner’s first impression starts with your profile.'},
      res:{ar:'بروفايل مكتوب ومرتب (عنوان ونبذة وخبرات وتخصصات) وجاهز للنشر.',en:'A written, organised profile (headline, bio, experience, subjects) ready to publish.'} },
    'new.trial': { s:[], t:['topic_trial_opening','topic_level_diagnosis','topic_trial_close'], p:null,
      why:{ar:'الحصة التجريبية هي أول لقاء، ومعرفة تفتح الحوار وتشخّص المستوى وتختم بخطوة واضحة بتفرق.',en:'The trial lesson is the first meeting; opening well, diagnosing level and closing with a clear next step matters.'},
      res:{ar:'خطة جاهزة للدقائق الأولى والتشخيص والختام، تقدر تطبقها في أول حصة.',en:'A ready plan for the opening, diagnosis and close that you can use in your first lesson.'} },
    'profile.search': { s:['profile_development'], t:['topic_search_terms','topic_profile_completeness','topic_platform_activity'], p:'package_refresh',
      why:{ar:'الظهور في البحث بيتأثر باكتمال الملف وبالكلمات اللي الطالب بيبحث بيها.',en:'Search visibility is affected by profile completeness and the words learners search with.'},
      res:{ar:'ملف أكمل وأوضح وكلمات أنسب لتخصصك. الظهور الفعلي بيتأثر كمان بقرارات المنصة والمنافسة.',en:'A more complete, clearer profile with better keywords. Actual visibility also depends on platform decisions and competition.'} },
    'profile.position': { s:['profile_development'], t:['topic_positioning_niche','topic_profile_audit','topic_improvement_priorities'], p:'package_refresh',
      why:{ar:'لما التخصص مش واضح، الطالب مش بيعرف ليه يختارك أنت.',en:'When your niche is unclear, learners do not know why they should choose you.'},
      res:{ar:'تخصص فرعي وقيمة مميزة مكتوبين بوضوح، مع ترتيب أولويات التحسين.',en:'A clearly written niche and value, with ordered improvement priorities.'} },
    'profile.price': { s:['individual_consultation'], t:['topic_price_competition','topic_net_income','topic_lesson_packages'], p:null,
      why:{ar:'التسعير محتاج حسبة صافي بعد العمولات ومقارنة بالمنافسين، مش تخمين.',en:'Pricing needs a net-income calculation after commission and a look at competitors, not guessing.'},
      res:{ar:'سعر مبني على حسابك وسوقك، وحزم دروس واضحة.',en:'A price based on your numbers and market, with clear lesson packages.'} },
    'video.vnew': { s:['video_creation'], t:['topic_brand_message','topic_content_plan'], p:'package_visibility',
      why:{ar:'الفيديو الأقوى هو اللي ليه رسالة وجمهور واضحين، مش مونتاج حلو بس.',en:'The strongest video has a clear message and audience, not just nice editing.'},
      res:{ar:'فيديو جديد مبني على رسالتك المهنية، حسب النوع اللي تختاره.',en:'A new video built on your professional message, in the type you choose.'} },
    'video.vdev': { s:['video_development'], t:['topic_brand_message','topic_portfolio_selection'], p:'package_refresh',
      why:{ar:'تحسين فيديو موجود ممكن يوفر عليك البدء من الصفر.',en:'Improving an existing video can save you starting from scratch.'},
      res:{ar:'نسخة محسّنة من الفيديو وموحّدة مع رسالتك المهنية.',en:'An improved version of the video aligned with your professional message.'} },
    'video.vmsg': { s:['video_creation'], t:['topic_brand_message','topic_portfolio_selection','topic_content_plan'], p:null,
      why:{ar:'قبل التصوير لازم نحدد هتقول إيه ولمين، وده بيوفر وقت وتعديلات.',en:'Before filming you need to decide what to say and to whom, which saves time and rework.'},
      res:{ar:'رسالة وجمهور ونبرة واضحة قبل ما تصوّر أو تعدّل.',en:'A clear message, audience and tone before you film or edit.'} },
    'reach.external': { s:[], t:['topic_referrals_communities','topic_linkedin_presence','topic_landing_tracking'], p:'package_visibility',
      why:{ar:'الوصول خارج المنصة محتاج مكان واضح يوصّل الطالب ويتابع الاستفسارات.',en:'Reaching learners outside a platform needs a clear place that leads them to you and tracks enquiries.'},
      res:{ar:'خطة وصول عملية وتتبع بسيط للاستفسارات، من غير وعد بعدد طلاب.',en:'A practical outreach plan and simple enquiry tracking, with no promise of learner numbers.'} },
    'reach.brand': { s:['video_creation'], t:['topic_brand_message','topic_portfolio_selection','topic_content_plan'], p:'package_visibility',
      why:{ar:'الاسم المهني بيتبني برسالة واضحة وأعمال مختارة بعناية.',en:'A professional name is built with a clear message and carefully chosen work.'},
      res:{ar:'رسالة ونبرة مهنية وأعمال مرتبة وخطة محتوى.',en:'A professional message and tone, organised work samples and a content plan.'} },
    'reach.campaign': { s:['campaign_review'], t:['topic_landing_tracking','topic_brand_message'], p:null,
      why:{ar:'قبل ما تصرف على إعلان لازم المسار من الإعلان للاستفسار يكون واضح.',en:'Before spending on ads, the path from ad to enquiry should be clear.'},
      res:{ar:'مراجعة حملتك وتنظيمها بخطوات وتتبع. السعر بيتحدد بعد المراجعة.',en:'A review and structure for your campaign with tracking. Pricing is set after the review.'} },
    'teaching.trial2': { s:[], t:['topic_trial_opening','topic_level_diagnosis','topic_trial_close'], p:'package_teaching',
      why:{ar:'تحسين الحصة التجريبية بيأثر على انطباع الطالب وقراره.',en:'A better trial lesson shapes the learner’s impression and decision.'},
      res:{ar:'نموذج تطبقه في أول دقيقة، وتشخيص مرتب، وختام بخطوة تالية.',en:'A model you can apply from the first minute, an orderly diagnosis and a close with a next step.'} },
    'teaching.levels': { s:[], t:['topic_level_mapping','topic_scaffolding','topic_individual_differences'], p:'package_teaching',
      why:{ar:'التعامل مع المستويات المختلفة بيخلي الشرح يناسب كل طالب.',en:'Handling mixed levels makes your teaching fit each learner.'},
      res:{ar:'طرق عملية لتمييز المستوى وتبسيط المهام ومراعاة الفروق.',en:'Practical ways to identify level, simplify tasks and respect individual differences.'} },
    'teaching.assess': { s:[], t:['topic_quick_checks','topic_correct_errors','topic_homework_progress'], p:'package_teaching',
      why:{ar:'التقييم الصح بيوضح التقدم ويحافظ على دافعية الطالب.',en:'Good assessment shows progress and keeps the learner motivated.'},
      res:{ar:'أسئلة تحقق قصيرة وتصحيح بدون إحباط ومتابعة واضحة للتقدم.',en:'Short checks, correction without discouragement and clear progress tracking.'} },
    'notsure.main': { s:['individual_consultation'], t:['topic_situation_diagnosis','topic_growth_goals'], p:'package_growth', sm:{ s:['individual_consultation'], t:[] },
      why:{ar:'لو مش واضح تبدأ منين، أفضل بداية إن حد يسمعك ويرتب الأولويات معاك.',en:'If you are not sure where to start, the best first step is someone listening and ordering priorities with you.'},
      res:{ar:'خطة بخطوات وأولويات واضحة، وبعدها تعرف أنهي خدمة محتاجها فعلًا.',en:'A plan with clear steps and priorities, so you know which service you actually need.'} }
  };
  let guideFlow = { sit:null, obs:null };
  function flowLabel(list, id) { const found=list.find(x=>x.id===id); return found?t(found.label):''; }
  function flowStart() {
    guideFlow={sit:null,obs:null};
    quickChips(FLOW_SITUATIONS.map(x=>({label:t(x.label),value:`flow:s:${x.id}`})));
  }
  function flowAsk(kind, withRestart) {
    if(kind==='obs') {
      addGuideMessage(language==='ar'?'تمام. إيه أكبر حاجة مضايقاك في ده؟':'Got it. What is the biggest obstacle for you here?');
      quickChips(FLOW_OBSTACLES[guideFlow.sit].map(x=>({label:t(x.label),value:`flow:o:${x.id}`})));
    } else {
      addGuideMessage(language==='ar'?'وتحب تبدأ إزاي؟':'How would you like to start?');
      const chips=[
        {label:language==='ar'?'خطوة صغيرة أجرّب بيها':'A small first step',value:'flow:z:small'},
        {label:language==='ar'?'حل كامل لمشكلتي':'A complete solution',value:'flow:z:full'},
        {label:language==='ar'?'أتكلم مع حد الأول':'Talk to someone first',value:'flow:z:talk'}
      ];
      if(withRestart) chips.push({label:language==='ar'?'مش ده قصدي':'Not what I meant',value:'flow:restart'});
      quickChips(chips);
    }
  }
  function flowWhatsAppLink(topicText) {
    const number=String(DATA.contact?.whatsapp||'').replace(/\D/g,'');
    if(!number) return '';
    const msg=language==='ar'?`أهلًا خُطوة، محتاج أسأل عن: ${topicText}`:`Hello Khutwa, I would like to ask about: ${topicText}`;
    return `<a class="guide-chip" style="display:inline-block;margin-top:8px;text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/${number}?text=${encodeURIComponent(msg)}">${language==='ar'?'كلّم خُطوة على واتساب':'Message Khutwa on WhatsApp'}</a>`;
  }
  /* ---------- Free-text understanding (rules based, Arabic-aware) ---------- */
  function normText(value) {
    return String(value||'').toLowerCase()
      .replace(/[\u064B-\u065F\u0670\u0640]/g,'')
      .replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/ؤ/g,'و').replace(/ئ/g,'ي')
      .replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
  }
  const FLOW_KEYWORDS = {
    'new.platform': ['منصه','اي منصه','انهي منصه','اختار منصه','اختيار منصه','مقارنه المنصات','قارن المنصات','بريبلي ولا','which platform','choose a platform','compare platforms','best platform','what platform'],
    'new.build': ['ابني بروفايل','اعمل بروفايل','انشاء بروفايل','اكتب بروفايل','بروفايل جديد','اول بروفايل','معنديش بروفايل','مفيش عندي بروفايل','create a profile','build my profile','new profile','no profile','write my profile'],
    'new.trial': ['خايف من الحصه','قلقان من الحصه','اول حصه','اول حصه تجريبيه','نفسي في حصه تجريبيه','first lesson','nervous about the trial'],
    'profile.search': ['مش بيظهر','ما بيظهرش','مش بظهر','ظهور','نتايج البحث','نتائج البحث','ترتيب','الكلمات المفتاحيه','ما حدش بيلاقيني','search results','not showing','visibility','ranking','keywords','cannot be found'],
    'profile.position': ['تخصص','تخصصي','نيش','مش واضح','اتميز','اميز نفسي','مميز','بروفايلي ضعيف','بروفايل ضعيف','مش جايب طلاب','حجوزات قليله','niche','stand out','weak profile','positioning','no bookings'],
    'profile.price': ['سعر','اسعر','تسعير','السعر','اغلي','ارخص','سعر الساعه','pricing','price','rate','hourly','how much to charge','how much should','per hour','an hour','charge'],
    'video.vnew': ['عايز فيديو','محتاج فيديو','معنديش فيديو','اعمل فيديو','فيديو تعريفي','فيديو ترويجي','make a video','need a video','intro video','promo video','no video'],
    'video.vdev': ['فيديو قديم','عندي فيديو','فيديو موجود','مش راضي عن الفيديو','تطوير الفيديو','تحسين الفيديو','improve my video','existing video','my video is','edit my video'],
    'video.vmsg': ['اقول ايه','مش عارف اقول','فكره الفيديو','سكربت','نص الفيديو','اتكلم عن ايه','what to say','script','what should i say'],
    'reach.external': ['خارج المنصه','من برا المنصه','طلاب من برا','لينكدان','لينكد','linkedin','فيسبوك','facebook','جروبات','مجتمعات','outside the platform','outside platform','social media','communities'],
    'reach.brand': ['براند','personal brand','محتوي','صناعه المحتوي','ريلز','يوتيوب','youtube','انستجرام','instagram','تيك توك','tiktok','content','اسم مهني','build a name'],
    'reach.campaign': ['حمله','حمله اعلانيه','اعلان','اعلانات','ممول','ممولين','ads','advertising','campaign','sponsored','promote'],
    'teaching.trial2': ['تحسين الحصه التجريبيه','افتتاح الحصه','بدايه الحصه','تحسين حصتي التجريبيه','improve my trial','open the lesson'],
    'teaching.levels': ['مستويات','مستوي مختلف','طلاب مختلفين','ادارة الفصل','ادراه الفصل','مجموعه','فصل','مشتتين','تشتت','mixed levels','class management','different levels','group class','distracted'],
    'teaching.assess': ['تقييم','اختبار','واجب','متابعه','تصحيح','اخطاء','اصحح','assessment','homework','feedback','correct','progress','test'],
    'notsure.main': ['مش عارف ابدا','مش عارف ابدا منين','مش عارف','تايه','محتار','ساعدني','ابدا منين','حاسس ان في مشكله','not sure','where to start','confused','lost','help me','i do not know']
  };
  const FLOW_SIT_HINTS = {
    new: ['جديد','مدرس جديد','مدرسه جديده','ابدا','بدايه','مبتدا','new tutor','beginner','starting','just started'],
    profile: ['بروفايل','ملفي','حسابي','profile','account'],
    video: ['فيديو','تصوير','مونتاج','video','filming'],
    reach: ['طلاب اكتر','طلاب جدد','عملاء','حجوزات','تسويق','students','more learners','bookings','marketing','clients'],
    teaching: ['تدريس','شرح','حصه','حصص','درس','teaching','lesson','teach'],
    notsure: []
  };
  const FLOW_KEYWORDS_NORM = Object.fromEntries(Object.entries(FLOW_KEYWORDS).map(([k,v])=>[k,v.map(normText)]));
  const FLOW_SIT_NORM = Object.fromEntries(Object.entries(FLOW_SIT_HINTS).map(([k,v])=>[k,v.map(normText)]));
  function termScore(text, term) {
    if(!term) return 0;
    const padded=` ${text} `;
    const hit = term.length<=3 ? padded.includes(` ${term} `) : padded.includes(term);
    if(!hit) return 0;
    return term.includes(' ') ? 3 : 2;
  }
  function understandFreeText(raw) {
    const text=normText(raw); if(text.length<3) return false;
    const outcome={}; const sit={};
    Object.entries(FLOW_KEYWORDS_NORM).forEach(([key,terms])=>{
      const score=terms.reduce((sum,term)=>sum+termScore(text,term),0);
      if(score>0) { outcome[key]=score; const s=key.split('.')[0]; sit[s]=(sit[s]||0)+score; }
    });
    Object.entries(FLOW_SIT_NORM).forEach(([s,terms])=>{
      const score=terms.reduce((sum,term)=>sum+termScore(text,term),0);
      if(score>0) sit[s]=(sit[s]||0)+Math.min(score,3);
    });
    const hint={};
    Object.entries(FLOW_SIT_NORM).forEach(([s,terms])=>{ hint[s]=Math.min(2,terms.reduce((sum,term)=>sum+termScore(text,term),0)); });
    const boosted=Object.fromEntries(Object.entries(outcome).map(([key,score])=>[key,score+(hint[key.split('.')[0]]||0)]));
    const ranked=Object.entries(boosted).sort((a,b)=>b[1]-a[1]);
    const ackPrefix=language==='ar'?'فهمت إنك':'I understood that you';
    if(ranked.length && ranked[0][1]>=4 && (!ranked[1] || ranked[0][1]>=ranked[1][1]+1)) {
      const [s,o]=ranked[0][0].split('.');
      guideFlow={sit:s,obs:s==='notsure'?null:o};
      const label=s==='notsure'?flowLabel(FLOW_SITUATIONS,'notsure'):`${flowLabel(FLOW_SITUATIONS,s)} — ${flowLabel(FLOW_OBSTACLES[s]||[],o)}`;
      addGuideMessage(`${ackPrefix}: ${label}.${language==='ar'?' لو ده مش قصدك اضغط «مش ده قصدي».':' If that is not what you meant, tap “Not what I meant”.'}`);
      flowAsk('size',true);
      return true;
    }
    const bestSit=Object.entries(sit).sort((a,b)=>b[1]-a[1]);
    if(bestSit.length && bestSit[0][1]>=2 && (!bestSit[1] || bestSit[0][1]>bestSit[1][1])) {
      const s=bestSit[0][0];
      guideFlow={sit:s,obs:null};
      addGuideMessage(`${ackPrefix}: ${flowLabel(FLOW_SITUATIONS,s)}.`);
      if(s==='notsure') flowAsk('size',true); else flowAsk('obs');
      return true;
    }
    return false;
  }
  function unknownFreeText(text) {
    addGuideMessage(language==='ar'
      ? 'مش متأكد إني فهمت قصدك بالظبط. اختار الأقرب من اللي تحت، أو اكتب مشكلتك بجملة قصيرة فيها كلمة زي: بروفايل، فيديو، سعر، طلاب، منصة.'
      : 'I am not sure I understood exactly. Pick the closest option below, or describe your problem in a short sentence with a word such as: profile, video, price, learners, platform.');
    flowStart();
    const host=document.createElement('div');host.className='guide-recommendations';
    const custom=document.createElement('div');custom.className='guide-recommendation';
    custom.innerHTML=`<b>${language==='ar'?'اطلب تركيبة خاصة':'Request a custom combination'}</b><p>${language==='ar'?'سنراجع احتياجك ونقترح الموضوعات والتكلفة قبل التأكيد.':'We will review your need and suggest relevant topics and pricing before confirmation.'}</p><button type="button" data-guide-custom="${escapeHTML(text)}">${language==='ar'?'أضف احتياجي إلى السلة':'Add my need to the basket'}</button>`;
    host.appendChild(custom);$('#guideMessages').appendChild(host);$('#guideMessages').scrollTop=$('#guideMessages').scrollHeight;
  }
  function flowRecommend(size) {
    const key=guideFlow.sit==='notsure'?'notsure.main':`${guideFlow.sit}.${guideFlow.obs}`;
    const o=FLOW_OUTCOMES[key]; if(!o) { resetGuideWelcome(false); return; }
    const situation=flowLabel(FLOW_SITUATIONS,guideFlow.sit);
    const obstacle=guideFlow.sit==='notsure'?'':flowLabel(FLOW_OBSTACLES[guideFlow.sit]||[],guideFlow.obs);
    const topicText=[situation,obstacle].filter(Boolean).join(' - ');
    if(size==='talk') {
      addGuideMessage(language==='ar'
        ? 'تمام، الأفضل تتكلم مع فريق خُطوة الأول وتشرح موقفك. تقدر كمان تحجز جلسة توجيه فردية لو حابب يتم الكلام بشكل منظم.'
        : 'Of course. Speak with the Khutwa team first and explain your situation. You can also add a one-to-one consultation for a structured conversation.',
        'bot', flowWhatsAppLink(topicText));
      renderGuideCards(['individual_consultation'],[],[]);
      quickChips([{label:language==='ar'?'ابدأ من الأول':'Start over',value:'flow:restart'},{label:language==='ar'?'افتح السلة':'Open basket',value:'Open basket'}]);
      return;
    }
    const pick = size==='small' ? (o.sm || { s:[], t:o.t.slice(0,2) }) : { s:o.s, t:o.t };
    const pkg = size==='small' ? [] : (o.p?[o.p]:[]);
    let total=0, unpriced=false;
    pick.s.forEach(id=>{ const s=getService(id); if(s && typeof s.price==='number') total+=s.price; else if(s) unpriced=true; });
    total += pick.t.length*DATA.pricing.topicPrice;
    const intro=language==='ar'
      ? `من كلامك: ${situation}${obstacle?` — ${obstacle}`:''}.\n${size==='small'?'ابدأ بخطوة صغيرة، ولو استفدت كمّل بعدها. ':'دي الحزمة الأنسب لحالتك. '}السبب: ${t(o.why)}\nالمتوقع: ${t(o.res)}`
      : `From what you said: ${situation}${obstacle?` — ${obstacle}`:''}.\n${size==='small'?'Start with a small step and continue if it helps. ':'This is the best fit for your case. '}Why: ${t(o.why)}\nExpected: ${t(o.res)}`;
    addGuideMessage(intro);
    renderGuideCards(pick.s,pick.t,pkg);
    const priceLine=language==='ar'
      ? `السعر التقريبي حسب الكتالوج: ${money(total)}${unpriced?' + تسعير يتحدد بعد المراجعة':''}. العرض النهائي بيتأكد من فريق خُطوة كتابةً قبل التنفيذ. خُطوة بتقدم شغل محدد قد يحسّن حضورك، لكن قرار الطلاب والمنصات مش مضمون.`
      : `Approximate price from the catalog: ${money(total)}${unpriced?' + pricing confirmed after review':''}. The final offer is confirmed in writing by Khutwa before work starts. Khutwa delivers defined work that may improve your presence, but learner and platform decisions cannot be guaranteed.`;
    addGuideMessage(priceLine);
    quickChips([
      {label:language==='ar'?'افتح السلة':'Open basket',value:'Open basket'},
      {label:language==='ar'?'ابدأ من الأول':'Start over',value:'flow:restart'},
      {label:language==='ar'?'عندي سؤال تاني':'I have another question',value:'flow:talk'}
    ]);
  }
  function handleFlow(value) {
    if(value==='flow:restart') { addGuideMessage(language==='ar'?'ابدأ من الأول':'Start over','user'); addGuideMessage(language==='ar'?'تمام. إيه أقرب حاجة لوضعك؟':'Sure. Which option best describes your situation?'); flowStart(); return; }
    if(value==='flow:talk') { addGuideMessage(language==='ar'?'عندي سؤال تاني':'I have another question','user'); addGuideMessage(language==='ar'?'اكتب سؤالك هنا وهحاول أرد من معلومات خُطوة، ولو محتاج حد من الفريق كلّمنا على واتساب.':'Type your question here and I will answer from Khutwa information. If you need the team, message us on WhatsApp.','bot',flowWhatsAppLink(language==='ar'?'سؤال':'a question')); quickChips([{label:language==='ar'?'ابدأ من الأول':'Start over',value:'flow:restart'}]); return; }
    const [, kind, id]=value.split(':');
    if(kind==='s') {
      addGuideMessage(flowLabel(FLOW_SITUATIONS,id),'user'); guideFlow={sit:id,obs:null};
      if(id==='notsure') flowAsk('size'); else flowAsk('obs');
    } else if(kind==='o') {
      addGuideMessage(flowLabel(FLOW_OBSTACLES[guideFlow.sit]||[],id),'user'); guideFlow.obs=id; flowAsk('size');
    } else if(kind==='z') {
      const labels={small:language==='ar'?'خطوة صغيرة أجرّب بيها':'A small first step',full:language==='ar'?'حل كامل لمشكلتي':'A complete solution',talk:language==='ar'?'أتكلم مع حد الأول':'Talk to someone first'};
      addGuideMessage(labels[id]||id,'user'); flowRecommend(id);
    }
  }
  function renderGuideCards(serviceIds, topicIds, packageIds) {
    const services=(serviceIds||[]).map(getService).filter(Boolean);
    const topics=(topicIds||[]).map(getTopic).filter(Boolean);
    const packages=(packageIds||[]).map(id=>DATA.packages.find(p=>p.id===id)).filter(Boolean);
    if(!services.length && !topics.length && !packages.length) return false;
    const host=document.createElement('div');host.className='guide-recommendations';
    services.forEach(service=>{
      const box=document.createElement('div');box.className='guide-recommendation';
      const price=typeof service.price==='number'?` · ${escapeHTML(money(service.price))}`:'';
      box.innerHTML=`<b>${escapeHTML(t(service.title))}${price}</b><p>${escapeHTML(t(service.short))}</p><button type="button" data-guide-add-service="${escapeHTML(service.id)}">${language==='ar'?'أضف الخدمة للسلة':'Add service to basket'}</button>`;
      host.appendChild(box);
    });
    topics.forEach(topic=>{
      const box=document.createElement('div');box.className='guide-recommendation';
      box.innerHTML=`<b>${escapeHTML(t(topic))} · $${DATA.pricing.topicPrice}</b><p>${escapeHTML(t(topic.outcome))}</p><button type="button" data-guide-add-topic="${escapeHTML(topic.id)}">${language==='ar'?'أضف الموضوع':'Add topic'}</button>`;
      host.appendChild(box);
    });
    packages.forEach(pkg=>{
      const box=document.createElement('div');box.className='guide-recommendation guide-package-recommendation';
      box.innerHTML=`<b>${language==='ar'?'تجميعة مقترحة: ':'Suggested combination: '}${escapeHTML(t(pkg.title))}</b><p>${escapeHTML(t(pkg.audience))} ${language==='ar'?'يمكنك سؤال خُطوة عن عرض التجميعة.':'Ask Khutwa about a tailored package offer.'}</p><button type="button" data-guide-add-package="${escapeHTML(pkg.id)}">${language==='ar'?'أضف التجميعة':'Add combination'}</button>`;
      host.appendChild(box);
    });
    $('#guideMessages').appendChild(host);$('#guideMessages').scrollTop=$('#guideMessages').scrollHeight;
    return true;
  }
  function handleGuideInput(text) {
    const clean=String(text||'').trim(); if(!clean) return;
    if(clean.startsWith('flow:')) { handleFlow(clean); return; }
    addGuideMessage(clean,'user');
    if(['افتح السلة','open basket','show basket','view basket'].includes(clean.toLocaleLowerCase())) { closeGuide();$('#cartPanel').scrollIntoView({behavior:'smooth',block:'center'});return; }
    if(guideDirectAnswer(clean.toLocaleLowerCase())) return;
    if(!understandFreeText(clean)) unknownFreeText(clean);
  }

  function getVisitorId() {
    try {
      let id=localStorage.getItem(VISITOR_KEY);
      if(!id){id=crypto.randomUUID();localStorage.setItem(VISITOR_KEY,id);}
      return id;
    } catch { return crypto.randomUUID(); }
  }
  function trackEvent(name, params={}) {
    let analyticsChoice='declined';
    try { analyticsChoice=localStorage.getItem(ANALYTICS_CONSENT_KEY)||'declined'; } catch {}
    if(analyticsChoice!=='accepted') return;
    const visitorId=getVisitorId();
    const payload={name,visitorId,page:location.pathname+location.hash,itemId:params.item_id||''};
    fetch('/api/events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),credentials:'same-origin',keepalive:true}).catch(()=>{});
    if(typeof window.gtag==='function') window.gtag('event',name,params);
  }
  function initializeSiteAnalytics() {
    let consent='declined'; try { consent=localStorage.getItem(ANALYTICS_CONSENT_KEY)||'unknown'; } catch {}
    const banner=$('#analyticsConsent');
    if(consent!=='accepted' && consent!=='declined' && banner) banner.hidden=false;
    if(consent==='accepted') trackEvent('page_view',{page:location.pathname});
    $('#acceptAnalytics')?.addEventListener('click',()=>{
      try { localStorage.setItem(ANALYTICS_CONSENT_KEY,'accepted'); } catch {}
      if(banner) banner.hidden=true;
      trackEvent('page_view',{page:location.pathname});
    });
    $('#rejectAnalytics')?.addEventListener('click',()=>{
      try { localStorage.setItem(ANALYTICS_CONSENT_KEY,'declined'); } catch {}
      if(banner) banner.hidden=true;
    });
  }

  document.addEventListener('click', event => {
    const shareBtn=event.target.closest('[data-share-link]'); if(shareBtn){const [kind,id]=shareBtn.dataset.shareLink.split(':');const u=new URL(location.origin+location.pathname);u.searchParams.set(kind,id);u.searchParams.set('lang',language);navigator.clipboard?.writeText(u.toString()).then(()=>showToast(language==='ar'?'تم نسخ الرابط المباشر للمشاركة!':'Direct link copied!')).catch(()=>showToast(u.toString()));return;}
    const addService=event.target.closest('[data-add-service]'); if(addService){const duration=addService.closest('.service-card')?.querySelector('.consultation-duration')?.value||'30';addItem('service',addService.dataset.addService,{duration});return;}
    const addTopic=event.target.closest('[data-add-topic]'); if(addTopic){addItem('topic',addTopic.dataset.addTopic);return;}
    const addPathBtn=event.target.closest('[data-add-path]');if(addPathBtn){addPath(addPathBtn.dataset.addPath);return;}
    const addPackageBtn=event.target.closest('[data-add-package]');if(addPackageBtn){addPackage(addPackageBtn.dataset.addPackage);return;}
    const removeBtn=event.target.closest('[data-remove-item]');if(removeBtn){basket.splice(Number(removeBtn.dataset.removeItem),1);renderBasket();return;}
    const choice=event.target.closest('[data-guide-choice]');if(choice){handleGuideInput(choice.dataset.guideChoice);return;}
    const guideService=event.target.closest('[data-guide-add-service]');if(guideService){addItem('service',guideService.dataset.guideAddService);return;}
    const guideTopic=event.target.closest('[data-guide-add-topic]');if(guideTopic){addItem('topic',guideTopic.dataset.guideAddTopic);return;}
    const guidePackage=event.target.closest('[data-guide-add-package]');if(guidePackage){addPackage(guidePackage.dataset.guideAddPackage);return;}
    const guideCustom=event.target.closest('[data-guide-custom]');if(guideCustom){addItem('custom',`guide-${Date.now()}`,{text:guideCustom.dataset.guideCustom});$('#customTopicsInForm').value=guideCustom.dataset.guideCustom;renderBasket();return;}
  });

  document.addEventListener('change', event => {
    const topicCheck=event.target.closest('[data-topic-check]');
    if(topicCheck){const id=topicCheck.dataset.topicCheck;if(topicCheck.checked){if(!basket.some(x=>x.type==='topic'&&x.id===id))basket.push({type:'topic',id});}else{basket=basket.filter(x=>!(x.type==='topic'&&x.id===id));}renderBasket();}
  });

  $('#langBtn').addEventListener('click',switchLanguage);
  $('#menuBtn').addEventListener('click',()=>$('#navlinks').classList.toggle('open'));
  $$('#navlinks a').forEach(a=>a.addEventListener('click',()=>$('#navlinks').classList.remove('open')));
  $('#closeAnnouncement').addEventListener('click',()=>$('#announcement').remove());
  $('#cartShortcut').addEventListener('click',()=>$('#cartPanel').scrollIntoView({behavior:'smooth',block:'center'}));
  $('#clearBasket').addEventListener('click',()=>{basket=[];renderBasket();showToast(language==='ar'?'تم إفراغ السلة.':'Basket cleared.');});
  $('#goToRequest').addEventListener('click',()=>$('#request').scrollIntoView({behavior:'smooth'}));
  $('#topicSearch').addEventListener('input',renderPaths);
  $$('[data-topic-filter]').forEach(btn=>btn.addEventListener('click',()=>{activeTopicFilter=btn.dataset.topicFilter;$$('[data-topic-filter]').forEach(x=>x.classList.toggle('active',x===btn));renderPaths();}));
  $$('[data-portfolio-tab]').forEach(btn=>btn.addEventListener('click',()=>{activePortfolioTab=btn.dataset.portfolioTab;renderPortfolio();}));
  $('#addCustomTopic').addEventListener('click',()=>{
    const text=$('#customTopic').value.trim();
    if(!text){showToast(language==='ar'?'اكتب الموضوع المطلوب أولًا.':'Describe the topic first.');$('#customTopic').focus();return;}
    basket.push({type:'custom',id:`custom-${Date.now()}`,text});trackEvent('add_to_cart',{item_id:'custom-topic'});$('#customTopicsInForm').value=text;renderBasket();$('#customTopic').value='';showToast(language==='ar'?'تمت إضافة طلبك المخصص.':'Your custom topic request was added.');
  });
  enhanceMarketForm();
  $('#runMarketSearch').addEventListener('click',buildSearchLinks);
  $('#requestMarketAnalysis').addEventListener('click',()=>{
    addItem('service','market_review');
    fillMarketRequest();
    $('#marketCountryRequest').value=$('#marketCountry').value;
    $('#marketLanguageRequest').value=$('#marketLearnerLang').value;
    $('#request').scrollIntoView({behavior:'smooth'});
  });
  $('#preferredContact').addEventListener('change',syncEmailRequirement);
  $('#requestForm').addEventListener('submit',submitRequest);
  $('#requestForm').addEventListener('focusin',()=>{if(!requestStartedTracked){requestStartedTracked=true;trackEvent('request_started',{page:'/request'});}});
  $('#futureIdeaBtn').addEventListener('click',()=>{
    const text=language==='ar'?'مرحبًا خُطوة، أود مشاركة فكرة أو اقتراح للمساهمة في تشكيل مستقبل المنصة.':'Hello Khutwa, I would like to share an idea or suggestion to help shape the platform’s future.';
    window.open(`https://wa.me/${DATA.contact.whatsapp}?text=${encodeURIComponent(text)}`,'_blank','noopener,noreferrer');
  });
  $('#guideLauncher').addEventListener('click',openGuide);
  $('#guideClose').addEventListener('click',closeGuide);
  $$('[data-open-guide]').forEach(btn=>btn.addEventListener('click',openGuide));
  $('#guideForm').addEventListener('submit',event=>{event.preventDefault();const input=$('#guideInput');handleGuideInput(input.value);input.value='';});
  initializeSiteAnalytics();
  // Local image fallback keeps the brand visible even if a file was moved or renamed.
  $$('img[data-fallback="mark"]').forEach(img=>img.addEventListener('error',()=>img.closest('.brand-image-wrap')?.classList.add('image-failed'),{once:true}));
  $$('img[data-fallback="banner"]').forEach(img=>img.addEventListener('error',()=>img.closest('.hero-image-frame')?.classList.add('image-failed'),{once:true}));
  // Correct the image-fallback state if an asset is already unavailable when the listener is registered.
  $$('img[data-fallback]').forEach(img=>{if(img.complete&&img.naturalWidth===0)img.dispatchEvent(new Event('error'));});
  function handleDeepLinks() {
    if (deepLinkApplied) return;
    deepLinkApplied = true;
    try {
      const p = new URLSearchParams(location.search);
      const svc = p.get('service');
      const pkg = p.get('package');
      const top = p.get('topic');
      let target = null;
      if (svc) target = document.querySelector(`[data-service-card="${CSS.escape(svc)}"]`);
      else if (pkg) target = document.querySelector(`[data-package-card="${CSS.escape(pkg)}"]`);
      else if (top) target = document.querySelector(`[data-topic-row="${CSS.escape(top)}"]`);
      if (target) {
        target.classList.add('deep-highlight');
        const det = target.querySelector('details.service-details');
        if (det) det.open = true;
        setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 180);
      }
    } catch {}
  }

  async function loadPublicConfig() {
    try {
      const u = new URL('/api/public-config', location.origin);
      if (attributionState.referralCode) u.searchParams.set('ref', attributionState.referralCode);
      const r = await fetch(u.toString(), { cache: 'no-store' });
      const data = await r.json().catch(() => null);
      if (r.ok && data?.ok) {
        liveConfig = data;
        renderServices();
        renderPaths();
        renderPackages();
        renderBasket();
        renderBatchBanners();
        renderReferralBanner();
      }
    } catch {}
  }

  updateStaticLanguage();
  handleDeepLinks();
  loadPublicConfig();
})();
