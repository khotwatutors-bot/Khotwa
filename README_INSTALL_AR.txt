خُطوة — حزمة تشغيل Cloudflare Pages v0.6

هذه الحزمة مخصصة لمشروع Cloudflare Pages الحالي المتصل بمستودع GitHub.
لا تستخدم معها أوامر Worker مستقلة مثل: npx wrangler deploy.

محتويات الحزمة:
- site/: واجهة الموقع وملفات الصور والتنسيق والبرمجة ولوحة الإدارة.
- functions/api/[[path]].js: وظائف استقبال الطلبات وواجهات الإدارة.
- schema.sql: الجداول المطلوبة لقاعدة D1.
- site/_routes.json: يجعل وظائف الخلفية تعمل على /api/* فقط.
- Google_Notifications_Code.gs: تكامل اختياري لاحقًا مع Google Sheets وGmail.

إعداد GitHub:
1) ارفع ملف ZIP نفسه إلى جذر مستودع Khotwa الحالي، بجوار الملفات الموجودة.
2) لا ترفع الملفات داخل المجلد يدويًا ولا تحذف الملفات القديمة الآن.
3) في Cloudflare Pages > Settings/Build settings اجعل:
   Framework preset: None
   Root directory: فارغ (الجذر)
   Build command: unzip -o Khutwa_Pages_Operations_v0_6.zip -d .
   Build output directory: site
4) احفظ إعدادات البناء ثم أعد النشر.

بعد نجاح النشر:
1) من مشروع Pages نفسه افتح Settings > Bindings > Add > D1 database.
2) Variable name: DB
3) اختر قاعدة البيانات الموجودة: khutwa-production
4) احفظ ثم أعد النشر.
5) افتح قاعدة D1 > Console ونفّذ محتويات schema.sql مرة واحدة.
6) أضف أسرار الإدارة في إعدادات Pages (Secrets):
   ADMIN_PASSWORD: كلمة مرور قوية وفريدة لا تقل عن 16 حرفًا.
   SESSION_SECRET: قيمة عشوائية مستقلة لا تقل عن 32 حرفًا.

اختبار الصحة بعد ربط DB وتشغيل الجداول:
افتح https://رابط-موقعك/api/health
المتوقع: {"ok":true,"database":true}

ثم افتح:
https://رابط-موقعك/admin/

تنبيهات:
- لا تضع ADMIN_PASSWORD أو SESSION_SECRET داخل GitHub أو داخل ملفات الموقع.
- لا تفعّل Google Sheets/Gmail الآن؛ هذا تكامل اختياري بعد نجاح الطلبات ولوحة الإدارة.
- لا يوجد دفع إلكتروني في هذا الإصدار؛ تسجيل الدفع في لوحة الإدارة يدوي بعد التحقق.
- لا تستخدم أمر npx wrangler deploy ولا ملف wrangler.jsonc الخاص بحزمة v0.5 القديمة.
