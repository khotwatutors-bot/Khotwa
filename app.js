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
  const ANALYTICS_CONSENT_KEY = 'khutwa_analytics_consent';
  const VISITOR_KEY = 'khutwa_visitor_id';
  let requestStartedTracked = false;
  let language = 'ar';
  let activeTopicFilter = 'all';
  let activePortfolioTab = 'videos';
  let basket = loadBasket();
  let lastRequest = null;
  let advisorStarted = false;
  let guideHistory = [];
  const aiState = { disabled: false, busy: false };

  function t(value) {
    if (value && typeof value === 'object') return value[language] || value.ar || value.en || '';
    return value == null ? '' : String(value);
  }
  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
  function money(value) {
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
  function updateStaticLanguage() {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.body.dir = language === 'ar' ? 'rtl' : 'ltr';
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
      clientName: { ar:'اكتب اسمك', en:'Your name' },
      clientWhatsApp: { ar:'+20...', en:'+1...' },
      requestGoal: { ar:'كلما كانت التفاصيل أوضح، كان اقتراح خُطوة أدق.', en:'The clearer your details, the more relevant Khutwa’s recommendation can be.' },
      guideInput: { ar:'اكتب مشكلتك باختصار…', en:'Briefly describe your challenge…' }
    };
    Object.entries(placeholders).forEach(([id, values]) => { const el = document.getElementById(id); if (el) el.placeholder = values[language]; });
    renderAll();
    if ($('#guidePanel').classList.contains('open')) resetGuideWelcome(false);
  }
  function renderServices() {
    const host = $('#servicesGrid');
    host.innerHTML = DATA.services.map((service, index) => {
      const includes = (service.includes?.[language] || service.includes?.ar || []).slice(0, 4);
      const priceLabel = service.price == null
        ? `<div class="service-price quote">${language==='ar'?'عرض سعر حسب الاحتياج':'Quote based on scope'}</div>`
        : service.id === 'individual_consultation'
          ? `<div class="service-price">$10–15<small>${escapeHTML(t(DATA.pricing.launchLabel))}</small></div>`
          : `<div class="service-price">${money(service.price)}<small>${escapeHTML(t(DATA.pricing.launchLabel))}</small></div>`;
      const payment = `<div class="detail-meta"><b>${language==='ar'?'المدة':'Timeline'}:</b> ${escapeHTML(t(service.delivery))}</div><div class="detail-meta"><b>${language==='ar'?'الدفع':'Payment'}:</b> ${escapeHTML(t(service.payment))}</div><div class="detail-meta">${escapeHTML(t(service.notes))}</div>`;
      return `<article class="service-card ${service.featured?'featured':''}">
        <div class="service-card-top"><div><div class="service-icon">${['▣','✧','▶','✎','◎','↗','⌕'][index%7]}</div><h3>${escapeHTML(t(service.title))}</h3></div>${priceLabel}</div>
        <p class="service-short">${escapeHTML(t(service.short))}</p>
        <ul class="service-mini-list">${includes.map(item=>`<li>${escapeHTML(item)}</li>`).join('')}</ul>
        <details class="service-details"><summary>${language==='ar'?'تفاصيل الخدمة والتسليمات':'Full scope and deliverables'}</summary><div class="details-content"><ul>${(service.includes?.[language]||service.includes.ar).map(item=>`<li>${escapeHTML(item)}</li>`).join('')}</ul>${payment}</div></details>
        <div class="service-action">${service.id==='individual_consultation'?`<select class="consultation-duration" aria-label="${language==='ar'?'مدة الجلسة':'Session duration'}"><option value="30">${language==='ar'?'30 دقيقة · $10':'30 min · $10'}</option><option value="60">${language==='ar'?'60 دقيقة · $15':'60 min · $15'}</option></select>`:''}<small>${service.price==null?(language==='ar'?'السعر بعد مراجعة النطاق':'Price after scope review'):(language==='ar'?'سعر إطلاق':'Launch price')}</small><button class="button button-soft" type="button" data-add-service="${escapeHTML(service.id)}">${language==='ar'?'أضف إلى السلة':'Add to basket'}</button></div>
      </article>`;
    }).join('');
  }
  function renderPaths() {
    const host = $('#pathGrid');
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
        return `<div class="topic-row"><input type="checkbox" id="select-${escapeHTML(topic.id)}" data-topic-check="${escapeHTML(topic.id)}" ${selected?'checked':''}><label for="select-${escapeHTML(topic.id)}">${escapeHTML(t(topic))}<small>${escapeHTML(t(topic.outcome))}</small></label><button type="button" data-add-topic="${escapeHTML(topic.id)}">${money(DATA.pricing.topicPrice)}</button></div>`;
      }).join('');
      return `<article class="path-card" data-category="${path.category}"><div class="path-card-head"><span class="path-number">${String(index+1).padStart(2,'0')}</span><div><h3>${escapeHTML(t(path.title))}</h3><p>${escapeHTML(t(path.short))}</p></div></div><div class="path-topics">${topicsMarkup}</div><div class="path-card-foot"><small>${path.topics.length} ${language==='ar'?'موضوعات':'topics'} · ${money(DATA.pricing.topicPrice*path.topics.length)} ${language==='ar'?'قبل أي عرض خاص':'before any special offer'}</small><button class="button button-outline" type="button" data-add-path="${escapeHTML(path.id)}">${language==='ar'?'أضف المسار':'Add path'}</button></div></article>`;
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
      return `<article class="package-card ${index===1?'recommended':''}"><span class="package-label">${index===1?(language==='ar'?'اختيار مقترح':'Suggested choice'):(language==='ar'?'تجميعة مقترحة':'Suggested combination')}</span><h3>${escapeHTML(t(pkg.title))}</h3><p>${escapeHTML(t(pkg.audience))}</p><div class="package-items">${names.map(name=>`<span>${escapeHTML(name)}</span>`).join('')}</div><div class="package-quote">${language==='ar'?'عرض خاص حسب مكونات طلبك':'Custom offer based on your selection'}</div><button class="button button-outline" type="button" data-add-package="${escapeHTML(pkg.id)}">${language==='ar'?'أضف التجميعة إلى السلة':'Add combination to basket'}</button></article>`;
    }).join('');
  }
  function basketLabel(entry) {
    const item = getBasketItem(entry);
    if (!item) return '';
    if (item.kind==='service') return t(item.data.title) + (entry.id==='individual_consultation' ? (language==='ar' ? ` (${entry.duration==='60'?'60':'30'} دقيقة)` : ` (${entry.duration==='60'?'60':'30'} min)`) : '');
    if (item.kind==='topic') return t(item.data);
    if (item.kind==='custom') return language==='ar'?'طلب موضوع مخصص':'Custom topic request';
    if (item.kind==='package') return t(item.data.title);
    return '';
  }
  function basketPrice(entry) {
    const item = getBasketItem(entry);
    if (!item) return null;
    if (item.kind==='service') { if(entry.id==='individual_consultation') return entry.duration==='60'?15:10; return item.data.price; }
    if (item.kind==='topic') return DATA.pricing.topicPrice;
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
      const subtitle = item.kind==='topic' ? t(item.data.pathTitle) : item.kind==='custom' ? entry.text : item.kind==='package' ? (language==='ar'?'تجميعة مخصصة':'Custom combination') : (price==null?(language==='ar'?'يحدد بعد مراجعة النطاق':'Quoted after scope review'):(language==='ar'?'سعر إطلاق':'Launch price'));
      return `<div class="cart-item"><div class="cart-item-main"><span>✦</span><div><b>${escapeHTML(basketLabel(entry))}</b><small>${escapeHTML(subtitle)}</small></div></div><div style="display:flex;align-items:center;gap:12px"><span class="cart-item-price">${price==null?(language==='ar'?'عرض سعر':'Quote'):`$${(price*(entry.qty||1)).toFixed(2)}`}</span><button type="button" data-remove-item="${index}">${language==='ar'?'حذف':'Remove'}</button></div></div>`;
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
    pkg.items.forEach(id=>{
      if(getService(id)) { if(!basket.some(item=>item.type==='service'&&item.id===id)) basket.push({type:'service',id}); }
      else if(getTopic(id)) { if(!basket.some(item=>item.type==='topic'&&item.id===id)) basket.push({type:'topic',id}); }
    });
    if(!basket.some(item=>item.type==='package'&&item.id===pkg.id)) basket.push({type:'package',id:pkg.id,title:pkg.title,qty:1});
    trackEvent('add_to_cart',{item_id:`package:${packageId}`});
    renderBasket();
    showToast(language==='ar'?'أضفنا مكونات التجميعة. اسأل عن عرض الباقة.':'Combination added. Ask about your package offer.');
    $('#cartPanel').scrollIntoView({behavior:'smooth',block:'center'});
  }
  function currentCategories() {
    const serviceIds = basket.filter(x=>x.type==='service').map(x=>x.id);
    const services = serviceIds.map(getService).filter(Boolean);
    return {
      profile:services.some(x=>x.category==='profile'),
      video:services.some(x=>x.category==='video'),
      market:services.some(x=>x.category==='market') || serviceIds.includes('profile_creation'),
      promotion:services.some(x=>x.category==='promotion'),
      topics:basket.some(x=>x.type==='topic'||x.type==='custom')
    };
  }
  function updateConditionalFields() {
    const cats = currentCategories();
    $$('[data-condition]').forEach(el=>{el.hidden=!cats[el.dataset.condition];});
    const needsVideo = cats.video;
    $('#videoType').required = needsVideo && basket.some(x=>x.type==='service' && ['video_creation','video_bundle'].includes(x.id));
  }
  function renderPortfolio() {
    const items = DATA.portfolio[activePortfolioTab] || [];
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
    renderServices(); renderPaths(); renderPackages(); renderBasket(); renderPortfolio(); renderFaq(); renderVision(); renderVideoTypes();
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
  function switchLanguage() { language = language==='ar'?'en':'ar'; updateStaticLanguage(); }

  // Preliminary market discovery. Search links are external; final analysis remains human-led.
  function buildSearchLinks() {
    const subject=$('#marketSubject').value.trim();
    if(!subject) { $('#marketSubject').focus(); showToast(language==='ar'?'اكتب التخصص أولًا.':'Enter a subject first.'); return; }
    const learner=$('#marketLearnerLang').value;
    const country=$('#marketCountry').value.trim();
    const audience=$('#marketAudience').value;
    const query=[subject,learner,country,audience].filter(Boolean).join(' ');
    const platforms=[['Preply','preply.com'],['italki','italki.com'],['Verbling','verbling.com'],['AmazingTalker','amazingtalker.com'],['Superprof','superprof.com'],['TeacherOn','teacheron.com'],['Classgap','classgap.com'],['51Talk','51talk.com']];
    const host=$('#marketResults');
    host.innerHTML=platforms.map(([name,domain])=>{
      const url='https://www.google.com/search?q='+encodeURIComponent(`site:${domain} ${query} tutor teacher lessons`);
      return `<a class="market-result" href="${url}" target="_blank" rel="noopener noreferrer"><b>${name}</b><small>${language==='ar'?'افتح نتائج البحث الأولي ↗':'Open preliminary search ↗'}</small></a>`;
    }).join('');
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
      goal:fields.goal||'',consent:$('#requestConsent').checked,website:fields.website||''
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
    guideHistory=[];
    addGuideMessage(language==='ar'?'أهلًا بيك في خُطوة. أنا مساعد آلي، هسألك كام سؤال بسيط عشان أفهم وضعك وأقترح عليك الأنسب، والقرار في الآخر ليك. من فضلك متكتبش كلمات مرور أو بيانات حساسة. إيه أقرب حاجة لوضعك؟':'Welcome to Khutwa. I am an automated assistant: I will ask a few simple questions to understand your situation and suggest what fits best, and the decision stays yours. Please do not share passwords or sensitive data. Which option best describes your situation?');
    quickChips([
      {label:language==='ar'?'عايز أبدأ بروفايل':'I need a new profile',value:'أريد إنشاء بروفايل واختيار منصة مناسبة'},
      {label:language==='ar'?'عندي بروفايل محتاج تطوير':'Improve my profile',value:'عندي بروفايل وأريد تطويره وتحسين ظهوره'},
      {label:language==='ar'?'محتاج فيديو':'I need a video',value:'أحتاج إنشاء فيديو أو تطوير فيديو موجود'},
      {label:language==='ar'?'أطور طريقة تدريسي':'Improve my teaching',value:'أريد تحسين الشرح والحصة التجريبية وإدارة الدرس'},
      {label:language==='ar'?'أوصل لطلاب أكثر':'Reach more learners',value:'أريد الوصول إلى طلاب وعملاء محتملين أكثر'},
      {label:language==='ar'?'مش عارف أبدأ منين':'Not sure where to start',value:'لا أعرف ما الخدمة المناسبة لي'}
    ]);
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
  async function askAssistant(text) {
    if(aiState.busy) return;
    aiState.busy=true;
    const typing=addGuideMessage(language==='ar'?'ثواني بكتب لك…':'One moment…');
    typing.style.opacity='.65';
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),20000);
    try {
      const res=await fetch('/api/assistant',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({language,messages:guideHistory.slice(-8)}),signal:controller.signal});
      const data=await res.json().catch(()=>null);
      typing.remove();
      if(!res.ok || !data || !data.ok || !data.reply) {
        if(res.status===503) aiState.disabled=true;
        recommendForText(text);
        return;
      }
      guideHistory.push({role:'assistant',content:String(data.reply).slice(0,600)});
      addGuideMessage(data.reply);
      const shown=renderGuideCards(data.serviceIds,data.topicIds,data.packageIds);
      const chips=Array.isArray(data.chips)?data.chips.filter(c=>c&&c.label&&c.value):[];
      if(chips.length) quickChips(chips);
      else if(shown) quickChips([{label:language==='ar'?'افتح السلة':'Open basket',value:'Open basket'},{label:language==='ar'?'عندي احتياج آخر':'Another need',value:language==='ar'?'لدي احتياج آخر':'I have another need'}]);
    } catch {
      typing.remove();
      recommendForText(text);
    } finally {
      clearTimeout(timer);
      aiState.busy=false;
    }
  }
  function handleGuideInput(text) {
    const clean=String(text||'').trim(); if(!clean) return;
    if(aiState.busy) return;
    addGuideMessage(clean,'user');
    if(['افتح السلة','open basket','show basket','view basket'].includes(clean.toLocaleLowerCase())) { closeGuide();$('#cartPanel').scrollIntoView({behavior:'smooth',block:'center'});return; }
    guideHistory.push({role:'user',content:clean.slice(0,600)});
    if(guideDirectAnswer(clean.toLocaleLowerCase())) { guideHistory.push({role:'assistant',content:'(Answered with the official price and offer information.)'}); return; }
    if(aiState.disabled) { recommendForText(clean); return; }
    askAssistant(clean);
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
  $('#runMarketSearch').addEventListener('click',buildSearchLinks);
  $('#requestMarketAnalysis').addEventListener('click',()=>{
    addItem('service','market_review');
    $('#marketCountryRequest').value=$('#marketCountry').value;
    $('#marketLanguageRequest').value=$('#marketLearnerLang').value;
    $('#request').scrollIntoView({behavior:'smooth'});
  });
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
  renderAll();
})();
