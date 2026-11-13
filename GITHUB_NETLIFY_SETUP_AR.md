# نشر خُطوة من GitHub إلى Netlify

## الفكرة

- GitHub هو النسخة الأصلية من ملفات المشروع وسجل التعديلات.
- Netlify يستضيف مجلد الموقع وينشر أي إصدار يتم اعتماده.
- كل تعديل كبير يكون في فرع مستقل أو Pull Request، ثم تتم معاينته قبل دمجه في النسخة المنشورة.

## أول إعداد

1. أنشئ مستودع GitHub خاصًا باسم `khutwa-website`.
2. ارفع محتويات مجلد `site/` إلى جذر المستودع إذا أردت أبسط نشر، أو ارفع المشروع كله واضبط Publish directory في Netlify إلى `site`.
3. افتح Netlify، واختر إضافة مشروع جديد من Git.
4. اربط مستودع GitHub.
5. إذا رفعت كامل المشروع: اجعل Publish directory = `site`، ولا توجد حاجة إلى Build command لأن الموقع ملفات ثابتة.
6. اختر الفرع `main` للإنتاج.
7. راجع أول نشر من رابط Netlify التجريبي.

## طريقة آمنة للتعديلات

- `main`: النسخة المستقرة المنشورة.
- `develop`: الدمج الأولي للتطوير إن احتجت ذلك.
- `feature/...`: فرع منفصل لكل تعديل كبير.
- افتح Pull Request من فرع التعديل إلى `main`.
- راجع Deploy Preview الذي يولده Netlify قبل الدمج.
- لا تدمج التعديل إلى `main` إلا بعد مراجعة الهاتف والكمبيوتر والوظائف.

## تعديل المحتوى دون لمس HTML

استخدم `tools/content-editor.html` لتعديل المحتوى والأسعار. بعد تصدير `content.js`، ارفع الملف إلى المسار `site/assets/content.js` في المستودع، ثم افتح Pull Request. لا ترفع أسرار أو مفاتيح API إلى GitHub.

## حماية المشروع

- اجعل مستودع GitHub خاصًا.
- لا ترفع كلمات مرور Google أو رموز الدخول أو مفاتيح API.
- لا تجعل Google Sheets الذي يستقبل بيانات العملاء عامًا.
- راجع صلاحيات كل نموذج وكل جدول على حدة.
- لا تنشر ملف الطلبات أو أي بيانات عميل داخل مجلد الموقع العام.

## مراجع رسمية

- GitHub Docs: https://docs.github.com/
- Netlify Deploy Previews: https://docs.netlify.com/deploy/deploy-types/deploy-previews/
- Netlify Git deploys: https://docs.netlify.com/welcome/add-new-site/
