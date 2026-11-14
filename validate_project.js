const fs = require('fs');
const { spawnSync } = require('child_process');
const assert = (condition, message) => { if (!condition) throw new Error(message); console.log('PASS', message); };
for (const file of ['worker.js','app.js']) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert(result.status === 0, `${file} JavaScript syntax`);
}
const admin = fs.readFileSync('admin.html','utf8');
const scripts = [...admin.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
assert(scripts.length === 1, 'admin dashboard has one inline script');
fs.writeFileSync('/tmp/khutwa-admin-check.js', scripts[0]);
const adminCheck = spawnSync(process.execPath, ['--check','/tmp/khutwa-admin-check.js'], { encoding:'utf8' });
assert(adminCheck.status === 0, 'admin dashboard JavaScript syntax');
const html = fs.readFileSync('index.html','utf8');
const app = fs.readFileSync('app.js','utf8');
const worker = fs.readFileSync('worker.js','utf8');
assert(html.includes('إرسال طلبك إلى خُطوة'), 'customer form has direct submit label');
assert(app.includes("fetch('/api/requests'"), 'customer form submits to backend');
assert(worker.includes("'/api/requests'") && worker.includes("'/api/admin/overview'"), 'worker exposes request and admin APIs');
assert(html.includes('analyticsConsent') && app.includes("fetch('/api/events'"), 'consent-gated first-party analytics is wired');
assert(fs.existsSync('schema.sql') && fs.existsSync('admin.html') && fs.existsSync('Google_Notifications_Code.gs'), 'database, admin, and notification files exist');
console.log('ALL OPERATIONAL STATIC CHECKS PASSED');
