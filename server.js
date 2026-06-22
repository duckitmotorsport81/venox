/*
 * VENOX CMS server
 * - Serves the public marketing site, rendered from data/content.json + the template.
 * - Password-protected /admin to manage hero slides, featured carousel, system cards
 *   and all models (grid + detail subpage): photos (upload) and review videos (URL).
 * - Export builds a single self-contained index.html with every image inlined.
 *
 * Config via environment variables (all optional, with safe local defaults):
 *   VENOX_ADMIN_PASSWORD   admin login password   (default: venox-admin)
 *   VENOX_SESSION_SECRET   session signing secret (default: dev secret — set in prod!)
 *   PORT                   http port              (default: 3000)
 */
try { require('dotenv').config(); } catch (e) { /* optional: loads a local .env if present */ }
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const multer = require('multer');

const ROOT = __dirname;
const TEMPLATE_FILE = path.join(ROOT, 'public', 'index.template.html');
const ADMIN_DIR = path.join(ROOT, 'public', 'admin');
const EXPORT_DIR = path.join(ROOT, 'exports');

// Data + media live in the repo by default, but can be redirected to a mounted
// persistent disk on hosts with ephemeral filesystems (Render/Railway):
//   VENOX_DATA_DIR=/var/data  VENOX_MEDIA_DIR=/var/data/media
const SEED_DATA_DIR = path.join(ROOT, 'data');
const SEED_MEDIA_DIR = path.join(ROOT, 'media');
const DATA_DIR = process.env.VENOX_DATA_DIR ? path.resolve(process.env.VENOX_DATA_DIR) : SEED_DATA_DIR;
const MEDIA_DIR = process.env.VENOX_MEDIA_DIR ? path.resolve(process.env.VENOX_MEDIA_DIR) : SEED_MEDIA_DIR;
const DATA_FILE = path.join(DATA_DIR, 'content.json');

for (const d of [DATA_DIR, MEDIA_DIR, EXPORT_DIR]) fs.mkdirSync(d, { recursive: true });

// First run on a fresh persistent disk: seed it from the copy committed in the repo.
function seedIfEmpty() {
  if (DATA_DIR !== SEED_DATA_DIR && !fs.existsSync(DATA_FILE) && fs.existsSync(path.join(SEED_DATA_DIR, 'content.json'))) {
    fs.copyFileSync(path.join(SEED_DATA_DIR, 'content.json'), DATA_FILE);
    console.log('Seeded content.json into', DATA_DIR);
  }
  if (MEDIA_DIR !== SEED_MEDIA_DIR && fs.existsSync(SEED_MEDIA_DIR) && fs.readdirSync(MEDIA_DIR).length === 0) {
    for (const f of fs.readdirSync(SEED_MEDIA_DIR)) {
      fs.copyFileSync(path.join(SEED_MEDIA_DIR, f), path.join(MEDIA_DIR, f));
    }
    console.log('Seeded media files into', MEDIA_DIR);
  }
}
seedIfEmpty();

const ADMIN_PASSWORD = process.env.VENOX_ADMIN_PASSWORD || 'venox-admin';
const SESSION_SECRET = process.env.VENOX_SESSION_SECRET || 'venox-dev-secret-change-me';
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 12 }
}));

/* ---------------- content store ---------------- */
function readContent() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}
function writeContent(obj) {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, DATA_FILE); // atomic-ish
}
let TEMPLATE = fs.existsSync(TEMPLATE_FILE) ? fs.readFileSync(TEMPLATE_FILE, 'utf8') : '';

/* ---------------- render helpers ---------------- */
// attribute-safe: escape the quote that delimits attributes; preserve existing
// HTML entities (&ndash; etc.) that the original copy relies on.
const esc = (s) => String(s == null ? '' : s).replace(/"/g, '&quot;');
// normalise a stored media reference into a usable URL
function url(p) {
  p = (p || '').trim();
  if (!p) return '';
  if (/^(https?:)?\/\//.test(p) || p.startsWith('/') || p.startsWith('data:')) return p;
  return '/' + p.replace(/^\/+/, '');
}

function renderHero(c) {
  const slides = (c.hero && c.hero.slides) || [];
  if (!slides.length) return '<div class="slide is-active"></div>';
  return slides.map((src, i) =>
    `<div class="slide${i === 0 ? ' is-active' : ''}" style="background-image:url('${url(src)}')"></div>`
  ).join('\n    ');
}
function renderSystems(c) {
  return (c.systems || []).map((s) => `
      <article class="line-card reveal">
        <span class="num">${s.num || ''}</span>
        <div class="media">${s.img
    ? `<img class="line-photo" src="${url(s.img)}" alt="${esc(s.title)}" loading="lazy">`
    : `<span class="ph">Add photo</span>`}</div>
        <h3>${s.title || ''}</h3>
        <p>${s.desc || ''}</p>
        <a class="more" href="#models">Configure <span>&rarr;</span></a>
      </article>`).join('\n');
}
function renderFeatured(c) {
  return (c.featured || []).map((f, i) => `
      <article class="cf-card${i === 0 ? ' is-active' : ''}" data-title="${esc(f.title)}" data-sub="${esc(f.sub)}">
        ${f.img
    ? `<img src="${url(f.img)}" alt="${esc(f.title)}" loading="lazy">`
    : `<div class="cf-ph-fill"><span class="cf-ph-tag">Add photo</span></div>`}
      </article>`).join('\n');
}
function renderModels(c) {
  return (c.models || []).map((m) => {
    const imgs = (m.images || []).map(url).filter(Boolean);
    const dataImgs = imgs.join(',');
    const media = imgs[0]
      ? `<div class="prod-media"><img src="${imgs[0]}" alt="${esc(m.title)}" loading="lazy"></div>`
      : `<div class="prod-media"><span class="ph">Add photo</span></div>`;
    return `
      <button class="prod-card" data-id="${esc(m.id)}"
        data-sub="${esc(m.sub)}" data-pn="${esc(m.pn)}" data-engine="${esc(m.engine)}" data-imgs="${esc(dataImgs)}" data-video="${esc(m.video)}"
        data-review="${esc(m.review)}" data-reviewer="${esc(m.reviewer)}"
        data-brand="${esc(m.brand)}" data-title="${esc(m.title)}" data-year="${esc(m.year)}"
        data-mat="${esc(m.mat)}" data-valve="${esc(m.valve)}" data-series="${esc(m.series || 'Venox Stainless Steel')}"
        data-desc="${esc(m.desc)}">
        ${media}
        <div class="prod-body">
          <span class="prod-brand">${m.brand || ''}</span>
          <h3 class="prod-title">${m.title || ''}</h3>
          <p class="prod-spec">${m.year || ''}<br>304 SST</p>
          <span class="arr">View details &rarr;</span>
        </div>
      </button>`;
  }).join('\n');
}
function renderOptions(list) {
  return (list || []).map((v) => `<option>${esc(v)}</option>`).join('\n          ');
}
// turn a contact string into a clickable link where possible (email / phone), else plain text
function contactLink(s) {
  s = (s || '').trim();
  if (!s) return '';
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) return `<a href="mailto:${esc(s)}">${s}</a>`;
  const digits = s.replace(/[^\d]/g, '');
  if (digits.length >= 7 && /^[\d +()\-]+$/.test(s)) return `<a href="tel:${esc(s.replace(/[^\d+]/g, ''))}">${s}</a>`;
  return s;
}
function renderDealers(c) {
  const list = (c.dealers || []).filter((d) => d && (d.name || d.address || d.contact));
  if (!list.length) return ''; // hide the whole block when there are no dealers
  const cards = list.map((d) => `
      <div class="dealer-card">
        <h3>${d.name || ''}</h3>
        ${d.address ? `<p class="addr">${d.address}</p>` : ''}
        ${d.contact ? `<p class="contact">${contactLink(d.contact)}</p>` : ''}
      </div>`).join('\n');
  return `
    <div class="dealers reveal">
      <div class="section-head" style="text-align:center;margin-bottom:8px">
        <span class="eyebrow">Where to Buy</span>
        <h2 class="display" style="font-size:clamp(1.8rem,4vw,2.6rem)">Authorised <span class="hl">Dealers.</span></h2>
      </div>
      <div class="dealer-grid">${cards}
      </div>
    </div>`;
}
function renderPage(c) {
  const search = c.search || {};
  return TEMPLATE
    .replace('{{HERO_SLIDES}}', renderHero(c))
    .replace('{{SYSTEM_CARDS}}', renderSystems(c))
    .replace('{{FEATURED_CARDS}}', renderFeatured(c))
    .replace('{{MODEL_CARDS}}', renderModels(c))
    .replace('{{SERIES_OPTIONS}}', renderOptions(search.series))
    .replace('{{BRAND_OPTIONS}}', renderOptions(search.brands))
    .replace('{{DEALERS_SECTION}}', renderDealers(c));
}

/* ---------------- auth ---------------- */
function requireAuth(req, res, next) {
  if (req.session && req.session.authed) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

/* ---------------- uploads ---------------- */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MEDIA_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase().replace(/[^.a-z0-9]/g, '') || '.bin';
    const base = (req.body && req.body.name ? String(req.body.name) : 'media')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'media';
    cb(null, `${base}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}${ext}`);
  }
});
const ALLOWED = /^(image\/(jpeg|png|webp|gif|svg\+xml)|video\/(mp4|webm))$/;
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED.test(file.mimetype))
});

/* ---------------- routes ---------------- */
// public site
app.get('/', (req, res) => {
  try { res.type('html').send(renderPage(readContent())); }
  catch (e) { res.status(500).send('Render error: ' + e.message); }
});

// static assets
app.use('/media', express.static(MEDIA_DIR, { maxAge: '7d' }));
app.use('/admin', express.static(ADMIN_DIR));

// session/auth
app.get('/api/session', (req, res) => res.json({ authed: !!(req.session && req.session.authed) }));
app.post('/api/login', (req, res) => {
  if ((req.body && req.body.password) === ADMIN_PASSWORD) {
    req.session.authed = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: 'Wrong password' });
});
app.post('/api/logout', (req, res) => { req.session.destroy(() => res.json({ ok: true })); });

// content read/write
app.get('/api/content', (req, res) => {
  try { res.json(readContent()); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/content', requireAuth, (req, res) => {
  const c = req.body;
  if (!c || typeof c !== 'object' || !c.hero || !Array.isArray(c.models)) {
    return res.status(400).json({ error: 'Invalid content shape' });
  }
  try { writeContent(c); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// photo / video upload
app.post('/api/upload', requireAuth, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file or unsupported type' });
    res.json({ path: 'media/' + req.file.filename, url: '/media/' + req.file.filename });
  });
});

// export single self-contained file (all media inlined as base64)
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', mp4: 'video/mp4', webm: 'video/webm' };
function inlineMedia(html) {
  const cache = {};
  return html.replace(/\/media\/([A-Za-z0-9._-]+)/g, (m, file) => {
    if (cache[file]) return cache[file];
    const fp = path.join(MEDIA_DIR, file);
    if (!fs.existsSync(fp)) return m;
    const ext = path.extname(file).slice(1).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    const data = `data:${mime};base64,${fs.readFileSync(fp).toString('base64')}`;
    cache[file] = data;
    return data;
  });
}
app.post('/api/export', requireAuth, (req, res) => {
  try {
    const html = inlineMedia(renderPage(readContent()));
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const name = `venox-${stamp}.html`;
    fs.writeFileSync(path.join(EXPORT_DIR, name), html);
    res.set('Content-Disposition', `attachment; filename="${name}"`);
    res.type('html').send(html);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// health check (for hosting platforms)
app.get('/healthz', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`VENOX CMS running:  http://localhost:${PORT}`);
  console.log(`Admin panel:        http://localhost:${PORT}/admin`);
  if (ADMIN_PASSWORD === 'venox-admin') console.log('  (using default admin password "venox-admin" — set VENOX_ADMIN_PASSWORD in production)');
});
