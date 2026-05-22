// AppNation Chat — minimal vanilla-JS client.
// Talks to the backend at http://localhost:3000 by default.
// SSE is consumed by reading the streaming fetch body directly (EventSource
// doesn't support custom Authorization headers).

const $ = (sel) => document.querySelector(sel);
const els = {
  apiBase: $('#apiBase'),
  adminToken: $('#adminToken'),
  connect: $('#connect'),
  health: $('#health'),
  userBadge: $('#userBadge'),
  refreshChats: $('#refreshChats'),
  newChat: $('#newChat'),
  chatList: $('#chatList'),
  paginationInfo: $('#paginationInfo'),
  chatTitle: $('#chatTitle'),
  conversationHeader: $('#conversationHeader'),
  historyMeta: $('#historyMeta'),
  messages: $('#messages'),
  composer: $('#composer'),
  prompt: $('#prompt'),
  flags: $('#flags'),
  eventLog: $('#eventLog'),
  emptyState: $('#emptyState'),
  emptyHeadline: $('#emptyHeadline'),
  emptyNewChat: $('#emptyNewChat'),
};

const state = {
  activeChatId: null,
  flags: null,
  jwt: '',
  user: null,
};

// --- localStorage persistence -------------------------------------------------
// We deliberately DON'T persist the JWT — a stale token (e.g. backend rotated
// JWT_SECRET) caused "invalid signature" 401s. Re-minting via /api/dev/login
// on every page load is cheap and avoids that whole class of bugs.
const STORAGE_KEY = 'appnation-chat-demo-v2';
function loadCreds() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (s.apiBase) els.apiBase.value = s.apiBase;
    if (s.adminToken) els.adminToken.value = s.adminToken;
  } catch {}
}
function saveCreds() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    apiBase: els.apiBase.value.trim(),
    adminToken: els.adminToken.value.trim(),
  }));
}
loadCreds();
// Drop the legacy key (which DID save the JWT) so old caches don't haunt users.
try { localStorage.removeItem('appnation-chat-demo'); } catch {}

// --- API helpers --------------------------------------------------------------
function apiBase() { return els.apiBase.value.trim().replace(/\/$/, ''); }
function authHeaders() { return { Authorization: `Bearer ${state.jwt}` }; }
function adminHeaders() { return { 'x-admin-token': els.adminToken.value.trim() }; }

async function ensureSession({ force = false } = {}) {
  if (state.jwt && !force) return;
  try {
    const out = await jsonReq('/api/dev/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    state.jwt = out.data.token;
    state.user = out.data.user;
    renderUser();
  } catch (err) {
    console.warn('mock-login failed', err);
  }
}

/**
 * Toggle between the conversation view and the empty-state CTA. Three modes:
 *   'no-chats'  — user has zero chats; show a big "+ New chat" centered.
 *   'no-active' — chats exist but none picked; nudge to pick from the sidebar.
 *   'chat'      — render the conversation normally.
 */
function setMainView(mode) {
  const isEmpty = mode !== 'chat';
  els.emptyState.hidden = !isEmpty;
  els.conversationHeader.hidden = isEmpty;
  els.messages.hidden = isEmpty;
  els.composer.hidden = isEmpty;
  if (mode === 'no-chats') {
    els.emptyHeadline.textContent = 'No chats yet';
    els.emptyState.querySelector('p').textContent =
      'Create your first conversation to get started.';
    els.emptyNewChat.textContent = '+ New chat';
  } else if (mode === 'no-active') {
    els.emptyHeadline.textContent = 'Pick a chat';
    els.emptyState.querySelector('p').textContent =
      'Select a conversation from the left, or start a new one.';
    els.emptyNewChat.textContent = '+ New chat';
  }
}

function renderUser() {
  if (state.user) {
    els.userBadge.hidden = false;
    els.userBadge.textContent = `${state.user.email} · ${state.user.tier}`;
    els.userBadge.className = 'badge ok';
  } else {
    els.userBadge.hidden = true;
  }
}

async function jsonReq(path, init = {}, { _retry = false } = {}) {
  const res = await fetch(apiBase() + path, init);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }

  // Auto-recovery for stale JWTs: when the auth middleware says 401, drop the
  // token, re-mint via /api/dev/login, and replay the original call ONCE.
  // The /api/dev/login call itself is exempt (no infinite loop on auth-down).
  if (res.status === 401 && !_retry && !path.startsWith('/api/dev/login')) {
    state.jwt = '';
    await ensureSession({ force: true });
    if (state.jwt && init.headers && 'Authorization' in init.headers) {
      init = { ...init, headers: { ...init.headers, ...authHeaders() } };
    }
    return jsonReq(path, init, { _retry: true });
  }

  if (!res.ok) throw new ApiError(res.status, body);
  return body;
}
class ApiError extends Error {
  constructor(status, body) {
    super((body && body.error && body.error.message) || `HTTP ${status}`);
    this.status = status; this.body = body;
  }
}

// --- Health + flags -----------------------------------------------------------
async function refreshHealth() {
  try {
    const h = await jsonReq('/health');
    els.health.textContent = `online — ${h.env}`;
    els.health.className = 'badge ok';
    state.flags = h.featureFlags;
    renderFlags();
  } catch (err) {
    els.health.textContent = 'offline';
    els.health.className = 'badge fail';
    console.warn('health failed', err);
  }
}

function renderFlags() {
  if (!state.flags) { els.flags.innerHTML = ''; return; }
  els.flags.innerHTML = '';
  for (const [name, value] of Object.entries(state.flags)) {
    const row = document.createElement('div');
    row.className = 'flag';
    const isBool = typeof value === 'boolean';
    row.innerHTML = `<span class="name">${name}</span>`;
    if (isBool) {
      row.innerHTML += `
        <label class="switch">
          <input type="checkbox" ${value ? 'checked' : ''} data-flag="${name}">
          <span class="value">${value}</span>
        </label>`;
    } else {
      row.innerHTML += `
        <input type="number" value="${value}" data-flag="${name}">
        <button class="apply" data-apply="${name}">apply</button>`;
    }
    els.flags.appendChild(row);
  }
}

els.flags.addEventListener('change', async (ev) => {
  const t = ev.target;
  if (t.matches('input[type="checkbox"][data-flag]')) {
    const key = t.dataset.flag;
    await patchFlag(key, t.checked);
  }
});
els.flags.addEventListener('click', async (ev) => {
  const t = ev.target;
  if (t.matches('button[data-apply]')) {
    const key = t.dataset.apply;
    const input = els.flags.querySelector(`input[data-flag="${key}"]`);
    const value = Number(input.value);
    await patchFlag(key, value);
  }
});

async function patchFlag(key, value) {
  try {
    const out = await jsonReq(`/api/admin/feature-flags/${key}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify({ value }),
    });
    state.flags = out.data;
    renderFlags();
    toast(`${key} → ${value}`);
  } catch (err) {
    toast(`failed: ${err.message}`, true);
  }
}

function toast(msg, isError = false) {
  console[isError ? 'warn' : 'log'](msg);
  els.health.textContent = msg;
  els.health.className = `badge ${isError ? 'fail' : 'ok'}`;
  setTimeout(refreshHealth, 1500);
}

// --- Chat list ----------------------------------------------------------------
async function loadChats() {
  els.chatList.innerHTML = '<li class="muted small" style="padding:8px">Loading…</li>';
  try {
    const out = await jsonReq('/api/chats', { headers: authHeaders() });
    els.chatList.innerHTML = '';
    if (!out.data.length) {
      els.chatList.innerHTML = '<li class="muted small" style="padding:8px">No chats yet</li>';
      els.paginationInfo.textContent = '';
      state.activeChatId = null;
      setMainView('no-chats');
      return;
    }
    for (const c of out.data) {
      const li = document.createElement('li');
      li.dataset.id = c.id;
      li.innerHTML = `
        <div class="title">${escape(c.title)}</div>
        <div class="meta">${new Date(c.updatedAt).toLocaleString()}</div>`;
      li.addEventListener('click', () => selectChat(c));
      els.chatList.appendChild(li);
    }
    els.paginationInfo.textContent = `limit=${out.meta.limit} • next=${out.meta.nextCursor ?? '—'}`;
    // Chats exist but the user hasn't picked one yet — show the "pick a chat"
    // nudge instead of an empty composer that silently fails on submit.
    if (!state.activeChatId) setMainView('no-active');
  } catch (err) {
    els.chatList.innerHTML = `<li class="muted small" style="padding:8px;color:var(--bad)">${escape(err.message)}</li>`;
  }
}

async function selectChat(chat) {
  state.activeChatId = chat.id;
  setMainView('chat');
  for (const li of els.chatList.querySelectorAll('li')) {
    li.classList.toggle('active', li.dataset.id === chat.id);
  }
  els.chatTitle.textContent = chat.title;
  els.messages.innerHTML = '<li class="muted small">Loading history…</li>';
  try {
    const out = await jsonReq(`/api/chats/${chat.id}/history`, { headers: authHeaders() });
    els.messages.innerHTML = '';
    for (const m of out.data.messages) appendMessage(m.role, m.content);
    els.historyMeta.textContent = `strategy: ${out.meta.strategy} • ${out.data.messages.length} message(s)`;
  } catch (err) {
    els.messages.innerHTML = `<li class="muted small" style="color:var(--bad)">${escape(err.message)}</li>`;
  }
}

function appendMessage(role, text) {
  const li = document.createElement('li');
  li.className = `msg role-${role}`;
  li.innerHTML = `<span class="who">${role}</span>`;
  const content = document.createElement('span');
  content.className = 'content';
  content.textContent = text;
  li.appendChild(content);
  els.messages.appendChild(li);
  els.messages.scrollTop = els.messages.scrollHeight;
  return content; // for streaming append
}

function escape(s) { return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// --- Completion ---------------------------------------------------------------
els.composer.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const prompt = els.prompt.value.trim();
  if (!prompt) return;
  if (!state.activeChatId) {
    toast('Pick or create a chat first', true);
    return;
  }
  els.prompt.value = '';
  appendMessage('USER', prompt);
  await runCompletion(state.activeChatId, prompt);
});

async function runCompletion(chatId, prompt) {
  // We don't know if streaming is on until we hit the endpoint and read the
  // response Content-Type. Plan for both.
  els.eventLog.hidden = false;
  els.eventLog.textContent = '';

  const res = await fetch(`${apiBase()}/api/chats/${chatId}/completion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    appendMessage('ASSISTANT', `[error] ${body?.error?.message ?? res.status}`);
    return;
  }

  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('text/event-stream')) {
    await consumeSse(res);
  } else {
    const json = await res.json();
    appendMessage('ASSISTANT', json.data.message.content);
    if (json.data.toolCalls?.length) {
      appendMessage('TOOL', JSON.stringify(json.data.toolCalls, null, 2));
    }
    logEvent('done', 'json mode');
  }
}

async function consumeSse(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let assistantContentEl = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line.
    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      handleSseFrame(frame, (text) => {
        if (!assistantContentEl) {
          assistantContentEl = appendMessage('ASSISTANT', '');
        }
        assistantContentEl.textContent += text;
        els.messages.scrollTop = els.messages.scrollHeight;
      });
    }
  }
}

function handleSseFrame(frame, onToken) {
  let event = 'message';
  let data = '';
  for (const line of frame.split('\n')) {
    if (line.startsWith('event: ')) event = line.slice(7).trim();
    else if (line.startsWith('data: ')) data += line.slice(6);
  }
  let parsed = null;
  try { parsed = data ? JSON.parse(data) : null; } catch {}
  logEvent(event, parsed);

  switch (event) {
    case 'token':
      if (parsed?.value) onToken(parsed.value);
      break;
    case 'tool_execution':
      appendMessage('TOOL', JSON.stringify(parsed, null, 2));
      break;
    case 'error':
      appendMessage('ASSISTANT', `[stream error] ${parsed?.message ?? ''}`);
      break;
  }
}

function logEvent(name, payload) {
  const line = document.createElement('div');
  line.className = `ev-${name.split('_')[0]}`;
  const stamp = new Date().toLocaleTimeString();
  line.textContent = `${stamp}  ${name}  ${payload ? JSON.stringify(payload).slice(0, 200) : ''}`;
  els.eventLog.appendChild(line);
  els.eventLog.scrollTop = els.eventLog.scrollHeight;
}

// --- Wire up ------------------------------------------------------------------
els.connect.addEventListener('click', async () => {
  saveCreds();
  // Force a fresh session so reviewers can rotate identities on demand.
  state.jwt = '';
  state.user = null;
  await ensureSession({ force: true });
  await refreshHealth();
  await loadChats();
});
els.refreshChats.addEventListener('click', loadChats);

async function createChat({ prompt: askForTitle } = { prompt: true }) {
  const title = askForTitle ? (window.prompt('Chat title (leave empty for default):') ?? '') : '';
  try {
    const body = title.trim() ? { title: title.trim() } : {};
    const out = await jsonReq('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    });
    await loadChats();
    selectChat(out.data);
  } catch (err) {
    toast(`new chat failed: ${err.message}`, true);
  }
}

els.newChat.addEventListener('click', () => createChat({ prompt: true }));
// Big centered button — skip the title prompt so the empty state feels instant.
els.emptyNewChat.addEventListener('click', () => createChat({ prompt: false }));

(async () => {
  renderUser();
  setMainView('no-active'); // start with the empty state visible until loadChats decides otherwise
  await refreshHealth();
  await ensureSession();
  if (state.jwt) await loadChats();
})();
