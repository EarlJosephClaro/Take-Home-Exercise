'use strict';

// Tiny DOM helper.
const $ = (id) => document.getElementById(id);

const RECENT_KEY = 'url-shortener:recent';
const RECENT_MAX = 8;

/* ---------------------------------------------------------------- Shorten */

$('shorten-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const url = $('url-input').value.trim();
  hide('shorten-error');
  hide('shorten-result');
  if (!url) return;

  try {
    const res = await fetch('/shorten', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);

    showResult(data.short_url, data.short_code);
    rememberLink(data.short_code, data.short_url, url);
    $('url-input').value = '';
  } catch (err) {
    showError('shorten-error', err.message);
  }
});

function showResult(shortUrl, shortCode) {
  const link = $('short-link');
  link.href = shortUrl;
  link.textContent = shortUrl;
  $('short-link').dataset.code = shortCode;
  show('shorten-result');
}

$('copy-btn').addEventListener('click', async () => {
  const text = $('short-link').textContent;
  try {
    await navigator.clipboard.writeText(text);
    flash($('copy-btn'), 'Copied!');
  } catch {
    flash($('copy-btn'), 'Copy failed');
  }
});

$('stats-btn').addEventListener('click', () => {
  const code = $('short-link').dataset.code;
  if (code) loadStats(code);
});

/* ------------------------------------------------------------------ Stats */

$('stats-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const code = extractCode($('code-input').value);
  if (code) loadStats(code);
});

// Accept either a bare code or a full short URL and return the code.
function extractCode(raw) {
  const value = raw.trim().replace(/\/+$/, '');
  if (!value) return '';
  const parts = value.split('/');
  return parts[parts.length - 1];
}

async function loadStats(code) {
  hide('stats-error');
  hide('stats-result');
  $('code-input').value = code;
  try {
    const res = await fetch(`/stats/${encodeURIComponent(code)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    renderStats(data);
  } catch (err) {
    showError('stats-error', err.message);
  }
}

function renderStats(stats) {
  $('stat-total').textContent = stats.total_hits;
  $('stat-code').textContent = stats.short_code;
  const original = $('stat-original');
  original.href = stats.original_url;
  original.textContent = stats.original_url;
  $('stat-created').textContent = formatDate(stats.created_at);
  renderChart(stats.daily);
  show('stats-result');
}

function renderChart(daily) {
  const chart = $('chart');
  chart.replaceChildren();
  const max = Math.max(1, ...daily.map((d) => d.hits));
  const today = daily.length ? daily[daily.length - 1].date : null;

  daily.forEach((d) => {
    const bar = document.createElement('div');
    bar.className = 'chart__bar' + (d.date === today ? ' chart__bar--today' : '');
    bar.style.height = `${Math.round((d.hits / max) * 100)}%`;
    bar.title = `${d.date}: ${d.hits} hit${d.hits === 1 ? '' : 's'}`;
    chart.appendChild(bar);
  });
}

/* ----------------------------------------------------------- Recent links */

function rememberLink(code, shortUrl, originalUrl) {
  const items = loadRecent().filter((i) => i.code !== code);
  items.unshift({ code, shortUrl, originalUrl });
  saveRecent(items.slice(0, RECENT_MAX));
  renderRecent();
}

function loadRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
  } catch {
    return [];
  }
}

function saveRecent(items) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(items));
  } catch {
    /* storage disabled — non-fatal */
  }
}

function renderRecent() {
  const items = loadRecent();
  const list = $('recent-list');
  list.replaceChildren();
  if (items.length === 0) {
    hide('recent-section');
    return;
  }
  items.forEach((item) => {
    const li = document.createElement('li');

    const link = document.createElement('a');
    link.href = item.shortUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = item.code;
    link.title = item.originalUrl;

    const statsBtn = document.createElement('button');
    statsBtn.className = 'recent__stats-link';
    statsBtn.type = 'button';
    statsBtn.textContent = 'stats →';
    statsBtn.addEventListener('click', () => loadStats(item.code));

    li.append(link, statsBtn);
    list.appendChild(li);
  });
  show('recent-section');
}

/* ---------------------------------------------------------------- Helpers */

function show(id) {
  $(id).hidden = false;
}
function hide(id) {
  $(id).hidden = true;
}
function showError(id, message) {
  const el = $(id);
  el.textContent = message;
  el.hidden = false;
}
function flash(button, text) {
  const original = button.textContent;
  button.textContent = text;
  button.disabled = true;
  setTimeout(() => {
    button.textContent = original;
    button.disabled = false;
  }, 1200);
}
function formatDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

renderRecent();
