/*
 * Shared page renderer — used by both the live server (server.js) and the
 * static site builder (scripts/build.js). Pure: takes content + template string,
 * returns the finished HTML. No filesystem / server dependencies.
 */

// attribute-safe: escape the quote that delimits attributes; preserve existing
// HTML entities (&ndash; etc.) the original copy relies on.
const esc = (s) => String(s == null ? '' : s).replace(/"/g, '&quot;');

// normalise a stored media reference into a usable URL
function url(p) {
  p = (p || '').trim();
  if (!p) return '';
  if (/^(https?:)?\/\//.test(p) || p.startsWith('/') || p.startsWith('data:')) return p;
  return '/' + p.replace(/^\/+/, '');
}

function slideObj(s) { return (typeof s === 'string') ? { image: s, video: '' } : (s || {}); }

function videoType(u) {
  u = (u || '').toLowerCase();
  if (/\.webm(\?|$)/.test(u)) return 'video/webm';
  if (/\.ogv(\?|$)/.test(u)) return 'video/ogg';
  if (/\.(mov|qt)(\?|$)/.test(u)) return 'video/mp4'; // .mov is MP4-family; label as mp4 so browsers attempt playback
  if (/\.m4v(\?|$)/.test(u)) return 'video/x-m4v';
  return 'video/mp4';
}

function renderHero(c) {
  const slides = (c.hero && c.hero.slides) || [];
  if (!slides.length) return '<div class="slide is-active"></div>';
  return slides.map((raw, i) => {
    const s = slideObj(raw);
    const cls = `slide${i === 0 ? ' is-active' : ''}`;
    if (s.video) {
      const poster = s.image ? ` poster="${url(s.image)}"` : '';
      return `<div class="${cls}"><video class="slide-video" autoplay muted loop playsinline preload="auto"${poster}><source src="${url(s.video)}" type="${videoType(s.video)}"></video></div>`;
    }
    return `<div class="${cls}" style="background-image:url('${url(s.image)}')"></div>`;
  }).join('\n    ');
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

// fill the template with content. `template` is the index.template.html string.
function renderPage(c, template) {
  const search = c.search || {};
  return template
    .replace('{{HERO_SLIDES}}', renderHero(c))
    .replace('{{SYSTEM_CARDS}}', renderSystems(c))
    .replace('{{FEATURED_CARDS}}', renderFeatured(c))
    .replace('{{MODEL_CARDS}}', renderModels(c))
    .replace('{{SERIES_OPTIONS}}', renderOptions(search.series))
    .replace('{{BRAND_OPTIONS}}', renderOptions(search.brands))
    .replace('{{DEALERS_SECTION}}', renderDealers(c));
}

module.exports = { renderPage };
