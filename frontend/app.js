// Shared helpers
const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (d) => new Date(d).toLocaleDateString();

async function api(path, method = 'GET', body) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.token || '') },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && localStorage.token) { logout(); return; }
  if (!res.ok) throw new Error(data.error || (res.status >= 502 ? 'The server is starting or unavailable. Wait a few seconds and try again.' : 'Something went wrong (code ' + res.status + ')'));
  return data;
}

function logout() { localStorage.clear(); location.href = '/'; }

function guard(role) {
  if (!localStorage.token || localStorage.role !== role) { location.href = '/'; return false; }
  $('#who').textContent = localStorage.name;
  return true;
}

function say(el, text, ok) { el.textContent = text; el.className = 'msg ' + (ok ? 'ok' : 'err'); }
