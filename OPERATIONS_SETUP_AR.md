# خُطوة — ترقية نظام التشغيل v0.5

## ما الذي تضيفه هذه الترقية؟

1. إرسال طلب الخدمة من نفس موقع خُطوة مباشرة إلى قاعدة بيانات Cloudflare D1.
2. رقم طلب مرجعي لا يظهر للعميل إلا بعد نجاح الحفظ.
3. لوحة مدير داخل الموقع على `/admin/` مع تسجيل دخول.
4. عرض الطلبات والعملاء والخدمات المختارة، وتحديث الحالة والسعر والدفع والمتابعة والملاحظات.
5. إحصاءات استخدام اختيارية بموافقة الزائر: مشاهدات الصفحات، الزوار الفريدون على أساس معرّف عشوائي، الإضافة إلى السلة، وبدء الطلب.
6. نسخة اختيارية من كل طلب في Google Sheets وإشعار Gmail عبر Google Apps Script. هذا تكامل إضافي، وليس بوابة العميل ولا قاعدة البيانات الأساسية.

## البنية

- الواجهة العامة: ملفات الموقع الثابتة.
- واجهات `/api/*`: Cloudflare Worker.
- التخزين التشغيلي الأساسي: Cloudflare D1.
- لوحة المدير: `/admin/`، وواجهات الإدارة محمية بجلسة موقعة. كلمة المرور ومفتاح الجلسة لا يوضعان في JavaScript العام.
- Google Sheets وGmail: نسخة ومراسلات اختيارية تعمل من الخلفية.

## إعداد Cloudflare قبل أول نشر للإصدار

### 1) إنشاء قاعدة D1

1. من لوحة Cloudflare افتح **Workers & Pages** ثم **D1 SQL Database**.
2. اضغط **Create database**.
3. الاسم المقترح: `khutwa-production`.
4. بعد الإنشاء، انسخ قيمة **Database ID**.
5. افتح تبويب **Console** للقاعدة والصق محتوى ملف `schema.sql` كاملًا ثم نفّذه.

### 2) أسرار المدير

من مشروع Worker الخاص بخُطوة، افتح **Settings → Variables and Secrets**، وأضف كـ **Secret**:

- `ADMIN_PASSWORD`: كلمة مرور مدير طويلة وفريدة، 16 حرفًا أو أكثر.
- `SESSION_SECRET`: قيمة عشوائية طويلة، 32 حرفًا على الأقل. لا تستخدم كلمة مرور المدير نفسها.

لا ترسل هذه القيم إلى أي شخص ولا تضعها في GitHub أو ملفات الموقع.

### 3) Google Sheets وGmail (اختياري بعد التأكد من D1)

1. أنشئ Google Sheet خاصًا باسم `Khutwa — Website Requests`، أو استخدم ملف متابعة خُطوة بعد تحويله إلى Google Sheets.
2. افتح [Google Apps Script](https://script.google.com/) وأنشئ مشروعًا جديدًا.
3. الصق محتوى `Google_Notifications_Code.gs` في ملف `Code.gs`.
4. من **Project Settings → Script properties** أضف:
   - `KHUTWA_WEBHOOK_SECRET`: سر عشوائي طويل.
   - `KHUTWA_SHEET_ID`: معرّف ملف Google Sheets (الجزء بين `/d/` و`/edit` في رابط الجدول).
   - `KHUTWA_NOTIFY_EMAIL`: البريد الذي تريد وصول إشعارات الطلبات إليه، مثل `khotwatutors@gmail.com`.
5. من **Deploy → New deployment → Web app** اختر:
   - Execute as: **Me**.
   - Who has access: **Anyone**.
6. وافق على أذونات Google المطلوبة (Sheets وGmail)، ثم انسخ رابط Web App المنتهي غالبًا بـ `/exec`.
7. في Cloudflare Worker أضف كـ Secrets:
   - `GOOGLE_APPS_SCRIPT_URL`: رابط Web App.
   - `GOOGLE_APPS_SCRIPT_SECRET`: نفس قيمة `KHUTWA_WEBHOOK_SECRET` حرفيًا.

الرابط متاح للوصول العام كي يستطيع Worker الاتصال به؛ حماية التنفيذ تتم بالسر المشترك. لا تضع السر في كود الموقع أو GitHub.

## إعداد Build command

المستودع الحالي قد يحتوي ملفات الموقع مسطحة في الجذر. حزمة الترقية تحتوي ملفات الاستبدال. بعد رفع `Khutwa_Operations_Upgrade_v0_5.zip` إلى جذر مستودع GitHub، استخدم أمر البناء التالي، مع استبدال `PASTE_D1_DATABASE_ID_HERE` بمعرف D1 الحقيقي:

```bash
unzip -o Khutwa_Operations_Upgrade_v0_5.zip -d . && mkdir -p site/assets/css site/assets/js site/admin && cp index.html site/index.html && cp styles.css site/assets/css/styles.css && cp content.js site/assets/content.js && cp app.js site/assets/js/app.js && cp admin.html site/admin/index.html && printf '%s\n' '{"name":"khotwa","main":"./worker.js","compatibility_date":"2026-11-14","assets":{"directory":"./site","binding":"ASSETS","run_worker_first":["/api/*"]},"d1_databases":[{"binding":"DB","database_name":"khutwa-production","database_id":"PASTE_D1_DATABASE_ID_HERE"}]}' > wrangler.jsonc
```

Deploy command: `npx wrangler deploy`

لا تضغط Deploy قبل إنشاء D1 وتنفيذ `schema.sql` ووضع Database ID والأسرار. اترك Preview command فارغًا في البداية.

## الاختبار الإلزامي بعد النشر

1. افتح `/api/health` ويجب أن ترى `ok: true` و`database: true`.
2. افتح `/admin/` وسجّل الدخول بكلمة مرور المدير.
3. افتح الموقع من نافذة خاصة أو متصفح آخر، وأرسل طلبًا تجريبيًا ببيانات اختبار غير حقيقية.
4. تأكد أن رقم الطلب ظهر بعد نجاح الإرسال.
5. تأكد أن الطلب ظاهر في لوحة المدير، ثم غيّر حالته واحفظ.
6. بعد إعداد Google integration، تأكد أن صفًا جديدًا ظهر في تبويب `طلبات الموقع` وأن إشعار Gmail وصل.
7. احذف بيانات الاختبار من لوحة الإدارة يدويًا أو ضعها في حالة ملغى/اختبار حسب سياسة الاحتفاظ التي تعتمدها خُطوة. لا يوجد حذف آلي مفعّل في هذه النسخة.

## حدود الإصدار

- لا يوجد دفع إلكتروني أو اشتراك مدفوع تلقائي حتى الآن. العميل يرسل **طلب خدمة**، ثم يتفق فريق خُطوة معه على النطاق والسعر والدفع خارج الموقع، وتُسجّل حالة الدفع يدويًا في لوحة المدير بعد التحقق.
- لا يمكن معرفة هوية شخص اكتفى بالتصفح أو ترك السلة دون إرسال طلب. الإحصاءات الاختيارية مجهّلة/مستعارة بمعرّف عشوائي ولا تعمل إلا بعد موافقته.
- لا نجمع كلمات مرور العملاء أو رموز دخولهم.
- Google Sheets نسخة متابعة إضافية؛ D1 هي قاعدة التشغيل الأساسية.
