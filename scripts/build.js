/*
 * build.js — produce a STATIC version of the site for free hosting.
 *
 * Output: dist/
 *   dist/index.html   (rendered from data/content.json, with relative media/ links)
 *   dist/media/...    (all photos & videos)
 *
 * The dist/ folder is a complete static site — drag it onto Netlify or Cloudflare
 * Pages (or any static host) for free. No server needed; the admin is not included
 * (you run the admin locally to edit, then re-run this build to publish).
 *
 * Usage:  npm run build
 */
const fs = require('fs');
const path = require('path');
const { renderPage } = require('../lib/render');

const ROOT = path.join(__dirname, '..');
const TEMPLATE_FILE = path.join(ROOT, 'public', 'index.template.html');
const DATA_FILE = path.join(ROOT, 'data', 'content.json');
const MEDIA_DIR = path.join(ROOT, 'media');
const DIST = path.join(ROOT, 'dist');
const DIST_MEDIA = path.join(DIST, 'media');

function rmrf(p) { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); }
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dest, { recursive: true });
  let n = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name), d = path.join(dest, entry.name);
    if (entry.isDirectory()) n += copyDir(s, d);
    else { fs.copyFileSync(s, d); n++; }
  }
  return n;
}

// render
const template = fs.readFileSync(TEMPLATE_FILE, 'utf8');
const content = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
let html = renderPage(content, template);

// make media links relative ("/media/x" -> "media/x") so the folder works on any
// host, at a domain root or a sub-path. Only touches quoted/paren'd references.
html = html.replace(/(["'(])\/media\//g, '$1media/');

// write dist
rmrf(DIST);
fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, 'index.html'), html);
const mediaCount = copyDir(MEDIA_DIR, DIST_MEDIA);
// helps SPAs/!found routing on some hosts; harmless static fallback
fs.writeFileSync(path.join(DIST, '404.html'), html);

const sizeKB = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log('Static site built -> dist/');
console.log('  index.html : ' + sizeKB + ' KB');
console.log('  media files: ' + mediaCount);
console.log('\nDeploy: drag the dist/ folder onto https://app.netlify.com/drop');
console.log('   or:  connect this repo on Cloudflare Pages with build command "npm run build" and output dir "dist".');
