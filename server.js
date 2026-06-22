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
const { execSync } = require('child_process');
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const { renderPage } = require('./lib/render');

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

/* ---------------- rendering ---------------- */
// All render helpers live in lib/render.js (shared with scripts/build.js).
const render = (c) => renderPage(c, TEMPLATE);

/* ---------------- auth ---------------- */
function requireAuth(req, res, next) {
  if (req.session && req.session.authed) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

/* ---------------- uploads ---------------- */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MEDIA_DIR),
  filename: (req, file, cb) => {
    let ext = (path.extname(file.originalname) || '').toLowerCase().replace(/[^.a-z0-9]/g, '') || '.bin';
    // .mov / QuickTime from phones is an MP4-family container — store as .mp4 so browsers will play it
    if (ext === '.mov' || ext === '.qt' || file.mimetype === 'video/quicktime') ext = '.mp4';
    const base = (req.body && req.body.name ? String(req.body.name) : 'media')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'media';
    cb(null, `${base}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}${ext}`);
  }
});
// accept any image or video type (mp4, webm, mov/quicktime, m4v, ogg, …)
const ALLOWED = /^(image|video)\//;
const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED.test(file.mimetype))
});

/* ---------------- routes ---------------- */
// public site
app.get('/', (req, res) => {
  try { res.type('html').send(render(readContent())); }
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
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', qt: 'video/quicktime', m4v: 'video/x-m4v', ogv: 'video/ogg' };
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
    const html = inlineMedia(render(readContent()));
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const name = `venox-${stamp}.html`;
    fs.writeFileSync(path.join(EXPORT_DIR, name), html);
    res.set('Content-Disposition', `attachment; filename="${name}"`);
    res.type('html').send(html);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// publish to live — commits + pushes local changes; GitHub rebuilds the static site.
// (Only meaningful when running locally with git configured + a remote set.)
app.post('/api/publish', requireAuth, (req, res) => {
  try {
    execSync('git add -A', { cwd: ROOT });
    const changed = execSync('git status --porcelain', { cwd: ROOT }).toString().trim();
    if (!changed) return res.json({ ok: true, message: 'Already up to date — nothing new to publish.' });
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    execSync(`git commit -m "Update site content (${stamp})"`, { cwd: ROOT });
    execSync('git push', { cwd: ROOT, stdio: 'pipe' });
    res.json({ ok: true, message: 'Published! Your live site updates in about a minute.' });
  } catch (e) {
    const msg = (e.stderr && e.stderr.toString()) || e.message || 'Publish failed';
    res.status(500).json({ ok: false, error: msg.slice(0, 400) });
  }
});

// health check (for hosting platforms)
app.get('/healthz', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`VENOX CMS running:  http://localhost:${PORT}`);
  console.log(`Admin panel:        http://localhost:${PORT}/admin`);
  if (ADMIN_PASSWORD === 'venox-admin') console.log('  (using default admin password "venox-admin" — set VENOX_ADMIN_PASSWORD in production)');
});
