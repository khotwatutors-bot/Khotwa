/**
 * Khutwa website notifications and Google Sheets mirror.
 * Deploy as a Web App: Execute as Me; Who has access: Anyone.
 * Store these values under Apps Script > Project Settings > Script properties:
 * KHUTWA_WEBHOOK_SECRET, KHUTWA_SHEET_ID, KHUTWA_NOTIFY_EMAIL
 */
function doPost(e) {
  var properties = PropertiesService.getScriptProperties();
  var expectedSecret = properties.getProperty('KHUTWA_WEBHOOK_SECRET');
  var payload;
  try {
    payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return output({ ok: false, error: 'Invalid JSON.' });
  }

  if (!expectedSecret || !payload.secret || payload.secret !== expectedSecret) {
    return output({ ok: false, error: 'Unauthorized.' });
  }
  if (payload.type !== 'new_request' || !payload.requestId || !payload.request) {
    return output({ ok: false, error: 'Unsupported event.' });
  }

  var sheetId = properties.getProperty('KHUTWA_SHEET_ID');
  var notifyEmail = properties.getProperty('KHUTWA_NOTIFY_EMAIL');
  if (!sheetId || !notifyEmail) {
    return output({ ok: false, error: 'Missing spreadsheet ID or notification email.' });
  }

  try {
    var lock = LockService.getScriptLock();
    lock.waitLock(15000);
    var spreadsheet = SpreadsheetApp.openById(sheetId);
    var sheet = spreadsheet.getSheetByName('طلبات الموقع');
    if (!sheet) sheet = spreadsheet.insertSheet('طلبات الموقع');

    var headers = [
      'رقم الطلب', 'تاريخ الاستلام (UTC)', 'حالة الطلب', 'اسم العميل', 'واتساب',
      'البريد الإلكتروني', 'الدولة', 'التخصص', 'وسيلة التواصل المفضلة',
      'الخدمات والموضوعات', 'الهدف والاحتياج', 'رابط البروفايل', 'اللغة', 'تاريخ النسخ'
    ];
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      sheet.setFrozenRows(1);
    }

    var requestId = String(payload.requestId);
    var lastRow = sheet.getLastRow();
    var existing = lastRow > 1
      ? sheet.getRange(2, 1, lastRow - 1, 1).createTextFinder(requestId).matchEntireCell(true).findNext()
      : null;
    var request = payload.request;
    var customer = request.customer || {};
    var platforms = request.platforms || {};
    var items = Array.isArray(request.selectedItems) ? request.selectedItems : [];
    var labels = items.map(function (item) {
      return String(item.label || '') + (item.price == null ? '' : ' ($' + item.price + ')');
    }).join(' | ');

    if (!existing) {
      sheet.appendRow([
        requestId,
        request.createdAt || new Date().toISOString(),
        'جديد',
        safeCell(customer.name),
        safeCell(customer.whatsapp),
        safeCell(customer.email),
        safeCell(customer.country),
        safeCell(customer.subject),
        safeCell(customer.preferredContact),
        safeCell(labels),
        safeCell(request.goal),
        safeCell(platforms.profileLink),
        request.language === 'en' ? 'English' : 'العربية',
        new Date()
      ]);
    }

    var subject = 'طلب خدمة جديد في خُطوة — ' + requestId;
    var body = [
      'وصل طلب جديد من موقع خُطوة.',
      '',
      'رقم الطلب: ' + requestId,
      'الاسم: ' + (customer.name || '—'),
      'واتساب: ' + (customer.whatsapp || '—'),
      'البريد: ' + (customer.email || '—'),
      'الدولة: ' + (customer.country || '—'),
      'التخصص: ' + (customer.subject || '—'),
      'الخدمات: ' + (labels || '—'),
      '',
      'الاحتياج: ' + (request.goal || '—'),
      '',
      'تم حفظ الطلب في قاعدة بيانات خُطوة. افتح لوحة الإدارة لمراجعته وتحديث حالته.'
    ].join('\n');

    GmailApp.sendEmail(notifyEmail, subject, body, {
      name: 'Khutwa Website',
      replyTo: 'khotwatutors@gmail.com'
    });

    return output({ ok: true, requestId: requestId, sheet: 'طلبات الموقع', emailSent: true });
  } catch (err) {
    return output({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

function safeCell(value) {
  var text = String(value == null ? '' : value).replace(/[\r\n]+/g, ' ').slice(0, 4000);
  // Prevent spreadsheet formula injection from submitted user input.
  if (/^[=+@\-]/.test(text)) text = "'" + text;
  return text;
}

function output(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
