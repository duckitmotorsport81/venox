/*
 * migrate.js — one-time extraction.
 * Reads the original self-contained index.html, pulls every editable image out of
 * the base64 blobs into /media files, records all text + media references in
 * data/content.json, and writes public/index.template.html — the same page with the
 * editable regions replaced by {{PLACEHOLDERS}} that the server fills at render time.
 *
 * Run once:  npm run migrate
 */
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'index.html');                 // original static site
const MEDIA = path.join(ROOT, 'media');
const DATA = path.join(ROOT, 'data');
const PUBLIC = path.join(ROOT, 'public');

for (const d of [MEDIA, DATA, PUBLIC]) fs.mkdirSync(d, { recursive: true });

const html = fs.readFileSync(SRC, 'utf8');
const $ = cheerio.load(html, { decodeEntities: false });

/* ---------- helpers ---------- */
function saveDataUrl(dataUrl, name) {
  const m = /^data:image\/([a-zA-Z0-9.+-]+);base64,(.*)$/s.exec((dataUrl || '').trim());
  if (!m) return '';
  let ext = m[1].toLowerCase(); if (ext === 'jpeg') ext = 'jpg'; if (ext === 'svg+xml') ext = 'svg';
  const file = `${name}.${ext}`;
  fs.writeFileSync(path.join(MEDIA, file), Buffer.from(m[2], 'base64'));
  return `media/${file}`;
}
// turn an <img> src into a stored media path (or pass through a normal URL)
function imgToMedia(src, name) {
  src = (src || '').trim();
  if (src.startsWith('data:')) return saveDataUrl(src, name);
  return src; // already a URL/path
}

const content = {
  site: { brand: 'VENOX', whatsapp: '60102192863', email: 'duckitmotorsport@gmail.com', logo: '', youtube: '' },
  search: {
    series: ['Venox Stainless Steel', 'Venox Titanium'],
    brands: ['BMW', 'AUDI', 'MERCEDES-BENZ', 'TOYOTA GR', 'HONDA', 'PORSCHE', 'FERRARI', 'LAMBORGHINI', 'MCLAREN']
  },
  hero: { slides: [] },
  systems: [],
  featured: [],
  models: [],
  dealers: [
    { name: 'Duckit Motorsport', address: 'Puchong, Selangor, Malaysia', contact: '+60 10-219 2863' }
  ]
};

/* ---------- logo + hero slides live in CSS :root vars ---------- */
const styleText = $('style').first().html() || '';
function cssVarUrl(name) {
  const re = new RegExp('--' + name + ':\\s*url\\(\\s*["\\\']?(data:[^"\\\')]+)["\\\']?\\s*\\)', 'i');
  const m = re.exec(styleText);
  return m ? m[1] : null;
}
const logo = cssVarUrl('logo');
if (logo) content.site.logo = saveDataUrl(logo, 'logo');
['hero', 'hero2', 'hero3', 'hero4', 'hero5'].forEach((v, i) => {
  const u = cssVarUrl(v);
  if (u) content.hero.slides.push({ image: saveDataUrl(u, 'hero-' + (i + 1)), video: '' });
});

/* ---------- 3 system cards ---------- */
$('.lines-grid .line-card').each((i, el) => {
  const $el = $(el);
  content.systems.push({
    num: $el.find('.num').text().trim(),
    title: $el.find('h3').text().trim(),
    desc: $el.find('p').first().text().trim(),
    img: imgToMedia($el.find('img').attr('src'), 'system-' + (i + 1))
  });
});

/* ---------- featured carousel cards ---------- */
$('#cfStage .cf-card').each((i, el) => {
  const $el = $(el);
  content.featured.push({
    title: $el.attr('data-title') || '',
    sub: $el.attr('data-sub') || '',
    img: imgToMedia($el.find('img').attr('src'), 'featured-' + (i + 1))
  });
});

/* ---------- models (grid + detail subpage data) ---------- */
$('.prod-grid .prod-card').each((i, el) => {
  const $el = $(el);
  const g = (n) => $el.attr('data-' + n) || '';
  const imgs = (g('imgs') || '').split(',').map(s => s.trim()).filter(Boolean)
    .map((src, k) => imgToMedia(src, `model-${g('id')}-${k + 1}`));
  const mat = /titan/i.test(g('mat') + ' ' + g('series')) ? 'Titanium' : 'Stainless Steel';
  content.models.push({
    id: g('id'), brand: g('brand'), title: g('title'), sub: g('sub'),
    pn: g('pn'), engine: g('engine'), year: g('year'),
    mat: mat, valve: g('valve'), series: 'Venox ' + mat,
    desc: g('desc'), review: g('review'), reviewer: g('reviewer'),
    images: imgs, video: g('video')
  });
});

/* ---------- build the template (placeholders for editable regions) ---------- */
$('#slides').html('{{HERO_SLIDES}}');
$('.lines-grid').html('{{SYSTEM_CARDS}}');
$('#cfStage').html('{{FEATURED_CARDS}}');
$('.prod-grid').html('{{MODEL_CARDS}}');

let out = $.html();
// drop the now-unused giant --hero* vars; repoint --logo at the media file
out = out.replace(/--hero\d?:\s*url\([^)]*\);?/g, '');
if (content.site.logo) {
  out = out.replace(/--logo:\s*url\([^)]*\)/, `--logo:url("/${content.site.logo}")`);
}

fs.writeFileSync(path.join(PUBLIC, 'index.template.html'), out);
fs.writeFileSync(path.join(DATA, 'content.json'), JSON.stringify(content, null, 2));

/* ---------- report ---------- */
const mediaFiles = fs.readdirSync(MEDIA);
console.log('Migration complete.');
console.log('  hero slides   :', content.hero.slides.length);
console.log('  system cards  :', content.systems.length);
console.log('  featured cards:', content.featured.length);
console.log('  models        :', content.models.length);
console.log('  media files   :', mediaFiles.length);
console.log('  template size :', (out.length / 1024).toFixed(1), 'KB (was', (html.length / 1024 / 1024).toFixed(2), 'MB)');
