const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const site = path.join(root, 'site');
const contentPath = path.join(site, 'assets', 'content.js');
const appPath = path.join(site, 'assets', 'js', 'app.js');
const htmlPath = path.join(site, 'index.html');
const cssPath = path.join(site, 'assets', 'css', 'styles.css');
const editorPath = path.join(root, 'tools', 'content-editor.html');
const errors = [];
const notes = [];
const ok = (condition, message) => condition ? notes.push(`PASS ${message}`) : errors.push(`FAIL ${message}`);

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(contentPath, 'utf8'), context, { filename: 'content.js' });
const data = context.window.KHUTWA_DATA;
ok(!!data && data.version === '4.0.0', 'content.js exposes Khutwa data version 4.0.0');
ok(data.services.length === 8, '8 service records are defined');
ok(data.paths.length === 15, '15 learning paths are defined');
const topics = data.paths.flatMap(p => p.topics);
ok(topics.length === 45, '45 learning topics are defined');
ok(new Set(topics.map(t => t.id)).size === 45, 'topic IDs are unique');
ok(data.packages.length === 5, '5 curated combinations are defined');
ok(data.portfolio.videos.length === 4, '4 video portfolio links are defined');
ok(data.portfolio.profiles.length === 6, '6 profile portfolio links are defined');
ok(data.pricing.topicPrice === 3, 'launch topic price is $3');
ok(!('internalDiscountBands' in data.pricing) && !('topicBundles' in data.pricing), 'private discount rules are not exposed in public site data');
ok(data.services.find(s => s.id === 'profile_creation')?.price === 30, 'profile creation launch price is $30');
ok(data.services.find(s => s.id === 'profile_development')?.price === 20, 'profile development launch price is $20');
ok(data.services.find(s => s.id === 'video_creation')?.price === 10, 'standard new video launch price is $10');
ok(data.services.find(s => s.id === 'video_development')?.price === 7, 'existing video development launch price is $7');
ok(data.services.find(s => s.id === 'video_bundle')?.price === 15, 'combined new + existing video launch price is $15');

const serviceIds = new Set(data.services.map(s => s.id));
const topicIds = new Set(topics.map(t => t.id));
const packageIds = new Set(data.packages.map(p => p.id));
const allIds = new Set([...serviceIds, ...topicIds]);
for (const pkg of data.packages) {
  for (const item of pkg.items) ok(allIds.has(item), `package ${pkg.id} item ${item} exists`);
}
for (const rule of data.recommendationRules) {
  for (const id of (rule.serviceIds || [])) ok(serviceIds.has(id), `guide service recommendation ${id} exists`);
  for (const id of (rule.topicIds || [])) ok(topicIds.has(id), `guide topic recommendation ${id} exists`);
  for (const id of (rule.packageIds || [])) ok(packageIds.has(id), `guide package recommendation ${id} exists`);
}

const app = fs.readFileSync(appPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const editor = fs.readFileSync(editorPath, 'utf8');
const appCheck = spawnSync(process.execPath, ['--check', appPath], { encoding: 'utf8' });
ok(appCheck.status === 0, 'main JavaScript passes node --check');
const contentCheck = spawnSync(process.execPath, ['--check', contentPath], { encoding: 'utf8' });
ok(contentCheck.status === 0, 'content data JavaScript passes node --check');

const htmlIds = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1]);
const idCounts = htmlIds.reduce((a, id) => (a[id] = (a[id] || 0) + 1, a), {});
const duplicates = Object.entries(idCounts).filter(([, count]) => count > 1).map(([id]) => id);
ok(duplicates.length === 0, `HTML IDs are unique${duplicates.length ? ': ' + duplicates.join(', ') : ''}`);
const refs = [...app.matchAll(/\$\('#([^']+)'\)/g)].map(m => m[1]).filter(selector => !selector.includes(' '));
const missingRefs = [...new Set(refs.filter(id => !htmlIds.includes(id)))];
ok(missingRefs.length === 0, `all required single-ID selectors exist${missingRefs.length ? ': ' + missingRefs.join(', ') : ''}`);

const localAssets = [...html.matchAll(/(?:src|href)=["'](assets\/[^"']+)["']/g)].map(m => m[1]);
const missingAssets = localAssets.filter(rel => !fs.existsSync(path.join(site, rel)));
ok(missingAssets.length === 0, `all local asset references exist${missingAssets.length ? ': ' + missingAssets.join(', ') : ''}`);
ok(fs.statSync(path.join(site, 'assets', 'khutwa-mark.jpg')).size > 50000, 'local Khutwa logo asset exists and is non-empty');
ok(fs.statSync(path.join(site, 'assets', 'khutwa-brand-banner.jpg')).size > 50000, 'local Khutwa banner asset exists and is non-empty');
ok(html.includes('data-fallback="mark"') && html.includes('data-fallback="banner"'), 'logo and banner fallback hooks are present');
ok(css.includes('.brand-image-wrap.image-failed') && css.includes('.hero-image-frame.image-failed'), 'CSS image fallback states are defined');
ok(html.includes('مرشد تفاعلي يعتمد على قواعد') || html.includes('مرشد تفاعلي يعتمد'), 'guide limitations are disclosed in the page');
ok(html.includes('نموذج Google Forms') && html.includes('لن تظهر له رسالة'), 'request form does not claim delivery when Forms is not connected');
ok(!/fake|dummy|1,?000\\+? visitors|1000 customers/i.test(html), 'no obvious fabricated public proof metrics in page source');

// Cross-sell IDs are checked from the static map in app.js.
const crossBlock = app.slice(app.indexOf('const CROSS_SELL'), app.indexOf('function crossSellReason'));
const crossRefs = [...crossBlock.matchAll(/'([^']+)'/g)].map(m => m[1]);
const invalidCrossRefs = crossRefs.filter(id => !allIds.has(id));
ok(invalidCrossRefs.length === 0, `all basket recommendation IDs exist${invalidCrossRefs.length ? ': ' + invalidCrossRefs.join(', ') : ''}`);

const keys = ['general','profileCreation','profileDevelopment','videoCreation','videoDevelopment','topicSession','marketReview','promotion','multiService','futureVision'];
ok(keys.every(k => Object.prototype.hasOwnProperty.call(data.integrations.googleForms, k)), 'Google Forms config contains all route keys');
if (!Object.values(data.integrations.googleForms).some(v => typeof v === 'string' && /^https:\/\//.test(v))) notes.push('INFO Google Forms links and entry IDs still require setup in the owner account');
if (!data.integrations.googleAnalyticsId) notes.push('INFO GA4 is intentionally disabled until Khutwa supplies a measurement ID');

// Check the offline content editor's inline script syntax.
const inline = [...editor.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let editorSyntaxOk = inline.length > 0;
for (let i = 0; i < inline.length; i++) {
  const temp = path.join('/tmp', `khutwa-editor-inline-${i}.js`);
  fs.writeFileSync(temp, inline[i]);
  const check = spawnSync(process.execPath, ['--check', temp], { encoding: 'utf8' });
  if (check.status !== 0) { editorSyntaxOk = false; errors.push(`FAIL content editor inline script syntax: ${check.stderr}`); }
  fs.unlinkSync(temp);
}
ok(editorSyntaxOk, 'offline content editor inline JavaScript syntax is valid');

console.log(notes.join('\n'));
if (errors.length) {
  console.error('\n' + errors.join('\n'));
  process.exit(1);
}
console.log(`\nALL STATIC CHECKS PASSED (${notes.filter(x => x.startsWith('PASS')).length})`);
