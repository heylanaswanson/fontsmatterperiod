#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════
   fonts matter, period. — static page generator
   ══════════════════════════════════════════════════════════════

   Reads  : fonts.json + template.html
   Writes : ../blog/<slug>/index.html  (one page per font)

   Usage:
     node build.js            only fonts that have body copy written
     node build.js --all      every font, stubs included
     node build.js --list     show what's ready vs stub, write nothing

   No dependencies. Node 14+.
   ══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const OUT = path.join(HERE, '..', 'blog');
const SITE = 'https://fontsmatterperiod.com';

const args = process.argv.slice(2);
const writeAll = args.includes('--all');
const listOnly = args.includes('--list');

// ── load ──────────────────────────────────────────────────────
const fonts = JSON.parse(fs.readFileSync(path.join(HERE, 'fonts.json'), 'utf8'));
const template = fs.readFileSync(path.join(HERE, 'template.html'), 'utf8');

// ── helpers ───────────────────────────────────────────────────
const esc = s => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// strip the <em> emphasis markup for use in meta tags / JSON-LD
const plain = s => String(s).replace(/<\/?em>/g, '');

// JSON-LD and meta attributes can't carry raw quotes or newlines
const attr = s => plain(s).replace(/"/g, '&quot;').replace(/\s+/g, ' ').trim();

const truncate = (s, n) => {
  const t = plain(s).replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return t.slice(0, t.lastIndexOf(' ', n - 1)).replace(/[,;:.]$/, '') + '…';
};

const hasBody = f => Array.isArray(f.body) && f.body.length > 0;

// The specimen is either the real typeface or a stand-in. Say which, plainly —
// on a typography site, quietly showing Cinzel and calling it Trajan is a lie.
function subNote(font) {
  const rendered = esc(font.renderedIn || 'the original');
  if (font.genuine) {
    return `Specimen above is set in ${rendered} — the real thing, not a `
         + `stand-in. Where we can't license a typeface for web use, we say so.`;
  }
  return `Specimen above is set in ${rendered}, not the original. We substitute `
       + `when a typeface isn't licensable for web use — the letterforms you see `
       + `will differ from the real thing.`;
}

// ── render pieces ─────────────────────────────────────────────
function renderFacts(facts) {
  if (!facts || !facts.length) return '';
  return facts.map(f => `<div>
            <span class="font-facts__num">${esc(f.num)}</span>
            <span class="font-facts__label">${esc(f.label)}</span>
          </div>`).join('\n          ');
}

function renderBody(font) {
  if (!hasBody(font)) {
    return `<div class="font-stub">
            <strong>Full write-up in progress.</strong> The carousel for
            ${esc(font.name)} is live on Instagram — the long-form version
            lands here next. Add sections to <code>body</code> in
            <code>fonts.json</code> and rebuild.
          </div>`;
  }
  return font.body.map(sec => {
    const h = sec.heading ? `<h2>${esc(sec.heading)}</h2>\n          ` : '';
    // allow <em> through for emphasis; escape everything else
    const text = esc(sec.text).replace(/&lt;(\/?)em&gt;/g, '<$1em>');
    return `${h}<p>${text}</p>`;
  }).join('\n          ');
}

function renderPagerLink(font, dir) {
  if (!font) return '<span></span>';
  const cls = dir === 'next' ? ' class="font-pager__next"' : '';
  const label = dir === 'next' ? 'Next font' : 'Previous font';
  return `<a href="/blog/${font.slug}/"${cls}>
            <span class="font-pager__dir">${label}</span>
            <span class="font-pager__name">${esc(font.name)}</span>
          </a>`;
}

// ── build one page ────────────────────────────────────────────
function buildPage(font, prev, next) {
  const metaDescription = truncate(
    `${font.name} — ${font.title} ${font.hook}`, 155
  );

  const tokens = {
    slug: font.slug,
    num: font.num,
    name: esc(font.name),
    nameLower: esc(font.name.toLowerCase()),
    specimen: esc(font.specimen),
    mod: font.mod,
    category: esc(font.category),
    year: esc(font.year),
    designer: esc(font.designer),
    origin: esc(font.origin),
    title: esc(plain(font.title)),
    hook: esc(font.hook).replace(/&lt;(\/?)em&gt;/g, '<$1em>'),
    renderedIn: esc(font.renderedIn || 'the original'),
    subNote: subNote(font),
    metaDescription: attr(metaDescription),
    facts: renderFacts(font.facts),
    body: renderBody(font),
    prev: renderPagerLink(prev, 'prev'),
    next: renderPagerLink(next, 'next'),
    yearNow: new Date().getFullYear()
  };

  let html = template;
  for (const [key, val] of Object.entries(tokens)) {
    html = html.split(`{{${key}}}`).join(val);
  }

  const leftover = html.match(/\{\{(\w+)\}\}/g);
  if (leftover) {
    throw new Error(`${font.slug}: unreplaced token(s) ${[...new Set(leftover)].join(', ')}`);
  }

  const dir = path.join(OUT, font.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
  return path.relative(path.join(HERE, '..'), path.join(dir, 'index.html'));
}

// ── sitemap ───────────────────────────────────────────────────
function buildSitemap(published) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${SITE}/`, pri: '1.0' },
    { loc: `${SITE}/blog/`, pri: '0.9' },
    ...published.map(f => ({ loc: `${SITE}/blog/${f.slug}/`, pri: '0.8' }))
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <priority>${u.pri}</priority>
  </url>`).join('\n')}
</urlset>
`;
  fs.writeFileSync(path.join(HERE, '..', 'sitemap.xml'), xml, 'utf8');
  return urls.length;
}

// ── run ───────────────────────────────────────────────────────
const ready = fonts.filter(hasBody);
const stubs = fonts.filter(f => !hasBody(f));

if (listOnly) {
  console.log(`\n  ${fonts.length} fonts in fonts.json\n`);
  console.log(`  ready (${ready.length}):`);
  ready.forEach(f => console.log(`    ✓ ${f.num}  ${f.name}`));
  console.log(`\n  stub — no body copy yet (${stubs.length}):`);
  stubs.forEach(f => console.log(`    · ${f.num}  ${f.name}`));
  console.log('\n  Run with --all to publish stubs anyway.\n');
  process.exit(0);
}

const toBuild = writeAll ? fonts : ready;

if (!toBuild.length) {
  console.log('\n  Nothing to build. No font has body copy yet.');
  console.log('  Add sections to a font\'s "body" array, or run --all.\n');
  process.exit(0);
}

console.log('');
const written = [];
for (const font of toBuild) {
  // pager always walks the full list, so stubs stay reachable
  const i = fonts.indexOf(font);
  const rel = buildPage(font, fonts[i - 1], fonts[i + 1]);
  written.push(rel);
  console.log(`  ${hasBody(font) ? '✓' : '·'} ${rel}`);
}

const n = buildSitemap(toBuild);
console.log(`  → sitemap.xml (${n} urls)`);

console.log(`\n  ${written.length} page${written.length === 1 ? '' : 's'} written.`);
if (!writeAll && stubs.length) {
  console.log(`  ${stubs.length} skipped for having no body copy — see --list.`);
}
console.log('');
