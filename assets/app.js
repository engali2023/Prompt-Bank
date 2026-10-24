/*
  Prompt Bank - Ø¨Ù†Ùƒ Ø§Ù„Ø¨Ø±ÙˆÙ…Ø¨ØªØ§Øª
  Supabase Auth + DB + RLS
  Ù†Ø³Ø®Ø© Ø¨Ø³ÙŠØ·Ø© ÙˆÙ…Ø¶Ù…ÙˆÙ†Ø© - ØªÙ… Ø¥ØµÙ„Ø§Ø­ ØªØ¯ÙÙ‚ Ø§Ù„Ù…ØµØ§Ø¯Ù‚Ø©
*/

const PLATFORMS = [
  { id: "Claude", color: "#c96442" },
  { id: "ChatGPT", color: "#10a37f" },
  { id: "Gemini", color: "#4c8df6" },
  { id: "Midjourney", color: "#7c6bff" },
  { id: "Grok", color: "#8b8d98" },
  { id: "Perplexity", color: "#1fb8ad" }
];

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

function escapeAttr(s = "") {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

function platformMeta(id) {
  return PLATFORMS.find(p => p.id === id) || { id, color: "#8b8d98" };
}

function nowISO() {
  return new Date().toISOString();
}

function applyTheme(t) {
  const root = document.documentElement;
  if (t === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  try { localStorage.setItem('pb-theme', t); } catch {}
  $$("[data-theme-toggle]").forEach(btn => {
    btn.innerHTML = root.classList.contains('dark')
      ? '<svg class="icon"><use href="#i-sun"></use></svg>'
      : '<svg class="icon"><use href="#i-moon"></use></svg>';
  });
}

function initTheme() {
  try {
    const saved = localStorage.getItem('pb-theme');
    if (saved) applyTheme(saved);
    else applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  } catch { applyTheme('light'); }
}

function toast(msg) {
  const root = document.getElementById('toastRoot');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = '<svg class="icon"><use href="#i-circle-check"></use></svg><span>' + escapeHtml(msg) + '</span>';
  root.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

/* ===================== Supabase ===================== */
let pbClient = null;

function initPb() {
  const lib = window.supabase;
  console.log('[PB] supabase lib:', typeof lib);
  if (!lib) {
    document.body.innerHTML = '<div style="text-align:center;padding:50px;font-family:sans-serif;direction:rtl"><h2>ØªØ¹Ø°Ø± ØªØ­Ù…ÙŠÙ„ Ù…ÙƒØªØ¨Ø© Supabase</h2><p>ØªØ£ÙƒØ¯ Ù…Ù† Ø§Ù„Ø§ØªØµØ§Ù„ Ø¨Ø§Ù„Ø¥Ù†ØªØ±Ù†Øª</p></div>';
    return false;
  }
  const createClient = lib.createClient || (lib.default && lib.default.createClient);
  if (typeof createClient !== 'function') {
    document.body.innerHTML = '<div style="text-align:center;padding:50px;font-family:sans-serif;direction:rtl"><h2>Ø®Ø·Ø£ ÙÙŠ Ù…ÙƒØªØ¨Ø© Supabase</h2></div>';
    return false;
  }
  if (!window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.url || !window.SUPABASE_CONFIG.anonKey) {
    document.body.innerHTML = '<div style="text-align:center;padding:50px;font-family:sans-serif;direction:rtl"><h2>Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ù…ÙÙ‚ÙˆØ¯Ø©</h2><p>ØªØ£ÙƒØ¯ Ù…Ù† ÙˆØ¬ÙˆØ¯ assets/config.js</p></div>';
    return false;
  }
  try {
    pbClient = createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);
    console.log('[PB] Supabase initialized');
    return true;
  } catch (err) {
    console.error('[PB] Init error:', err);
    return false;
  }
}

/* ===================== State ===================== */
const state = {
  user: null,
  profile: null,
  data: { folders: [], prompts: [], results: [] },
  view: 'dashboard',
  filters: { platform: 'all', folder: 'all', query: '', onlyPinned: false }
};

/* ===================== Elements ===================== */
let authScreen, appEl, authForm, authHeading, authSub, authNameGroup, authName, authEmail, authPassword, authSubmitLabel, authSpinner, authError, authErrorText, authSwitch;
let viewRoot, navPromptCount, navResultCount, sidebarFolders, workspaceName, workspaceInitial, sidebarAvatar, sidebarUserName, sidebarUserEmail, modalRoot;

function getElements() {
  authScreen = document.getElementById('authScreen');
  appEl = document.getElementById('app');
  authForm = document.getElementById('authForm');
  authHeading = document.getElementById('authHeading');
  authSub = document.getElementById('authSub');
  authNameGroup = document.getElementById('authNameGroup');
  authName = document.getElementById('authName');
  authEmail = document.getElementById('authEmail');
  authPassword = document.getElementById('authPassword');
  authSubmitLabel = document.getElementById('authSubmitLabel');
  authSpinner = document.getElementById('authSpinner');
  authError = document.getElementById('authError');
  authErrorText = document.getElementById('authErrorText');
  authSwitch = document.getElementById('authSwitch');

  viewRoot = document.getElementById('viewRoot');
  navPromptCount = document.getElementById('navPromptCount');
  navResultCount = document.getElementById('navResultCount');
  sidebarFolders = document.getElementById('sidebarFolders');
  workspaceName = document.getElementById('workspaceName');
  workspaceInitial = document.getElementById('workspaceInitial');
  sidebarAvatar = document.getElementById('sidebarAvatar');
  sidebarUserName = document.getElementById('sidebarUserName');
  sidebarUserEmail = document.getElementById('sidebarUserEmail');
  modalRoot = document.getElementById('modalRoot');
}

let authMode = 'login';

function setAuthMode(mode) {
  authMode = mode;
  $$("[data-action='auth-tab']").forEach(b => {
    const active = b.dataset.mode === mode;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  if (mode === 'login') {
    if (authHeading) authHeading.textContent = 'Ù…Ø±Ø­Ø¨Ø§Ù‹ Ø¨Ø¹ÙˆØ¯ØªÙƒ';
    if (authSub) authSub.textContent = 'Ø³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù„ÙØªØ­ Ø¨Ù†Ùƒ Ø¨Ø±ÙˆÙ…Ø¨ØªØ§ØªÙƒ.';
    if (authNameGroup) authNameGroup.hidden = true;
    if (authSubmitLabel) authSubmitLabel.textContent = 'ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„';
    if (authSwitch) authSwitch.innerHTML = 'Ù„ÙŠØ³ Ù„Ø¯ÙŠÙƒ Ø­Ø³Ø§Ø¨ Ø¨Ø¹Ø¯ØŸ <button type="button" data-action="auth-tab" data-mode="register">Ø£Ù†Ø´Ø¦ Ø­Ø³Ø§Ø¨Ùƒ</button>';
    if (authPassword) authPassword.setAttribute('autocomplete', 'current-password');
  } else {
    if (authHeading) authHeading.textContent = 'Ø£Ù†Ø´Ø¦ Ø­Ø³Ø§Ø¨Ùƒ';
    if (authSub) authSub.textContent = 'Ø¨ÙŠØ§Ù†Ø§ØªÙƒ Ù…Ø­Ù…ÙŠØ© ÙˆÙ…Ø¹Ø²ÙˆÙ„Ø©.';
    if (authNameGroup) authNameGroup.hidden = false;
    if (authSubmitLabel) authSubmitLabel.textContent = 'Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø­Ø³Ø§Ø¨';
    if (authSwitch) authSwitch.innerHTML = 'Ù„Ø¯ÙŠÙƒ Ø­Ø³Ø§Ø¨ Ø¨Ø§Ù„ÙØ¹Ù„ØŸ <button type="button" data-action="auth-tab" data-mode="login">Ø³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„</button>';
    if (authPassword) authPassword.setAttribute('autocomplete', 'new-password');
  }
  if (authError) authError.hidden = true;
  if (authErrorText) authErrorText.textContent = '';
}

/* ===================== Show App After Auth ===================== */
async function showApp() {
  console.log('[PB] showApp, user:', state.user ? state.user.email : 'none');
  if (!state.user) {
    if (authScreen) authScreen.hidden = false;
    if (appEl) appEl.hidden = true;
    return;
  }

  try {
    const { data: profile } = await pbClient.from('profiles').select('*').eq('id', state.user.id).maybeSingle();
    state.profile = profile || { full_name: state.user.email.split('@')[0] };
  } catch (e) {
    state.profile = { full_name: state.user.email.split('@')[0] };
  }

  try {
    const [f, p, r] = await Promise.all([
      pbClient.from('folders').select('*').order('created_at', { ascending: true }),
      pbClient.from('prompts').select('*').order('updated_at', { ascending: false }),
      pbClient.from('results').select('*').order('created_at', { ascending: false })
    ]);
    state.data.folders = f.data || [];
    state.data.prompts = p.data || [];
    state.data.results = r.data || [];
  } catch (e) {
    console.error('[PB] Load data error:', e);
    state.data = { folders: [], prompts: [], results: [] };
  }

  if (authScreen) authScreen.hidden = true;
  if (appEl) appEl.hidden = false;
  initApp();
}

/* ===================== Auth Listener ===================== */
function setupAuth() {
  if (!pbClient) return;

  pbClient.auth.onAuthStateChange(async (_event, session) => {
    console.log('[PB] Auth state:', _event, session?.user ? session.user.email : 'signed out');
    state.user = session?.user || null;
    await showApp();
  });

  // Check existing session
  pbClient.auth.getSession().then(({ data: { session }, error }) => {
    if (error) {
      console.log('[PB] No session:', error);
      state.user = null;
      if (authScreen) authScreen.hidden = false;
      if (appEl) appEl.hidden = true;
      return;
    }
    if (session?.user) {
      console.log('[PB] Existing session:', session.user.email);
      state.user = session.user;
      showApp();
    } else {
      state.user = null;
      if (authScreen) authScreen.hidden = false;
      if (appEl) appEl.hidden = true;
    }
  });
}

/* ===================== Auth Form ===================== */
authForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!pbClient) return;
  if (authError) authError.hidden = true;
  if (authErrorText) authErrorText.textContent = '';

  const email = authEmail.value.trim().toLowerCase();
  const pass = authPassword.value;
  const name = authName.value.trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (authErrorText) { authErrorText.textContent = 'Ø¨Ø±ÙŠØ¯ Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ ØºÙŠØ± ØµØ­ÙŠØ­'; authError.hidden = false; }
    return;
  }
  if (pass.length < 8) {
    if (authErrorText) { authErrorText.textContent = 'ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ± Ù¨ Ø£Ø­Ø±Ù Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„'; authError.hidden = false; }
    return;
  }

  if (authSpinner) authSpinner.hidden = false;
  if (authSubmitLabel) authSubmitLabel.textContent = authMode === 'login' ? 'Ø¬Ø§Ø±ÙŠ Ø§Ù„Ø¯Ø®ÙˆÙ„...' : 'Ø¬Ø§Ø±ÙŠ Ø§Ù„Ø¥Ù†Ø´Ø§Ø¡...';

  try {
    if (authMode === 'register') {
      if (!name) {
        if (authErrorText) { authErrorText.textContent = 'Ø£Ø¯Ø®Ù„ Ø§Ù„Ø§Ø³Ù… Ø§Ù„ÙƒØ§Ù…Ù„'; authError.hidden = false; }
        if (authSpinner) authSpinner.hidden = true;
        if (authSubmitLabel) authSubmitLabel.textContent = 'Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø­Ø³Ø§Ø¨';
        return;
      }
      const { data, error } = await pbClient.auth.signUp({
        email, password: pass,
        options: { data: { full_name: name } }
      });
      if (error) throw error;
      if (data.user) {
        await pbClient.from('profiles').upsert({ id: data.user.id, email, full_name: name });
        toast('ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø­Ø³Ø§Ø¨ØŒ Ø¬Ø§Ø±ÙŠ ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„...');
      }
    } else {
      const { error } = await pbClient.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      toast('ØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„');
    }
    // showApp will be called by onAuthStateChange
  } catch (err) {
    console.error('[PB] Auth error:', err);
    if (authErrorText) { authErrorText.textContent = err.message || 'Ø®Ø·Ø£'; authError.hidden = false; }
  } finally {
    if (authSpinner) authSpinner.hidden = true;
    if (authSubmitLabel) authSubmitLabel.textContent = authMode === 'login' ? 'ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„' : 'Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø­Ø³Ø§Ø¨';
  }
});

/* ===================== Global Click Delegation ===================== */
document.addEventListener('click', (e) => {
  const tab = e.target.closest("[data-action='auth-tab']");
  if (tab) { setAuthMode(tab.dataset.mode); return; }

  const tp = e.target.closest("[data-action='toggle-password']");
  if (tp && authPassword) {
    const show = authPassword.type === 'password';
    authPassword.type = show ? 'text' : 'password';
    tp.innerHTML = show ? '<svg class="icon"><use href="#i-eye-off"></use></svg>' : '<svg class="icon"><use href="#i-eye"></use></svg>';
    return;
  }

  const th = e.target.closest("[data-action='toggle-theme']");
  if (th) { applyTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark'); return; }

  const lo = e.target.closest("[data-action='logout']");
  if (lo && pbClient) { pbClient.auth.signOut().finally(() => location.reload()); return; }

  const nv = e.target.closest("[data-action='nav']");
  if (nv) {
    state.view = nv.dataset.view;
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === nv.dataset.view));
    render();
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebarBackdrop')?.classList.remove('active');
    return;
  }

  const os = e.target.closest("[data-action='open-sidebar']");
  if (os) { document.getElementById('sidebar')?.classList.add('open'); document.getElementById('sidebarBackdrop')?.classList.add('active'); return; }

  const cs = e.target.closest("[data-action='close-sidebar']");
  if (cs) { document.getElementById('sidebar')?.classList.remove('open'); document.getElementById('sidebarBackdrop')?.classList.remove('active'); return; }

  const np = e.target.closest("[data-action='new-prompt']");
  if (np) { openPromptModal(); return; }

  const nf = e.target.closest("[data-action='new-folder']");
  if (nf) { openFolderModal(); return; }

  // Demo login
  const demo = e.target.closest("[data-action='demo-login']");
  if (demo && pbClient) {
    const btn = demo.querySelector('.demo-badge') || demo;
    const orig = btn.textContent;
    btn.textContent = 'Ø¬Ø§Ø±ÙŠ Ø§Ù„Ø¯Ø®ÙˆÙ„...';
    pbClient.auth.signInWithPassword({ email: 'demo@promptbank.com', password: 'DemoPromptBank123!' })
      .catch(async () => {
        const { error: suErr } = await pbClient.auth.signUp({
          email: 'demo@promptbank.com',
          password: 'DemoPromptBank123!',
          options: { data: { full_name: 'Ù…Ø³ØªØ®Ø¯Ù… ØªØ¬Ø±ÙŠØ¨ÙŠ' } }
        });
        if (suErr) throw suErr;
      })
      .finally(() => { btn.textContent = orig; });
    return;
  }

  // Copy prompt
  const c = e.target.closest("[data-copy]");
  if (c && pbClient && state.user) {
    const p = state.data.prompts.find(x => x.id === c.dataset.copy);
    if (!p) return;
    navigator.clipboard.writeText(p.text);
    pbClient.from('prompts').update({ uses: (p.uses || 0) + 1, updated_at: nowISO() }).eq('id', p.id).eq('user_id', state.user.id);
    loadData();
    render();
    toast('ØªÙ… Ø§Ù„Ù†Ø³Ø®');
    return;
  }

  // Pin
  const pin = e.target.closest("[data-pin]");
  if (pin && pbClient && state.user) {
    const p = state.data.prompts.find(x => x.id === pin.dataset.pin);
    if (!p) return;
    pbClient.from('prompts').update({ pinned: !p.pinned, updated_at: nowISO() }).eq('id', p.id).eq('user_id', state.user.id);
    loadData();
    render();
    return;
  }

  // Rate
  const rate = e.target.closest("[data-rate]");
  if (rate && pbClient && state.user) {
    pbClient.from('prompts').update({ rating: +rate.dataset.v, updated_at: nowISO() }).eq('id', rate.dataset.rate).eq('user_id', state.user.id);
    loadData();
    render();
    return;
  }

  // Edit
  const ed = e.target.closest("[data-edit]");
  if (ed) { openPromptModal(ed.dataset.edit); return; }

  // Delete prompt
  const dl = e.target.closest("[data-del]");
  if (dl && pbClient && state.user) {
    if (!confirm('Ø­Ø°Ù Ù†Ù‡Ø§Ø¦ÙŠØ§Ù‹ØŸ')) return;
    pbClient.from('prompts').delete().eq('id', dl.dataset.del).eq('user_id', state.user.id);
    loadData();
    render();
    toast('ØªÙ… Ø§Ù„Ø­Ø°Ù');
    return;
  }

  // Folder open
  const fo = e.target.closest("[data-fopen]");
  if (fo) { state.filters.folder = fo.dataset.fopen; state.view = 'prompts'; render(); return; }

  const fe = e.target.closest("[data-fedit]");
  if (fe) { openFolderModal(fe.dataset.fedit); return; }

  const fd = e.target.closest("[data-fdel]");
  if (fd && pbClient && state.user) {
    if (!confirm('Ø­Ø°Ù Ø§Ù„Ù…Ø¬Ù„Ø¯ØŸ')) return;
    pbClient.from('prompts').update({ folder_id: null }).eq('folder_id', fd.dataset.fdel).eq('user_id', state.user.id);
    pbClient.from('folders').delete().eq('id', fd.dataset.fdel).eq('user_id', state.user.id);
    loadData();
    render();
    toast('ØªÙ… Ø§Ù„Ø­Ø°Ù');
    return;
  }

  // Add result
  const ar = e.target.closest("[data-action='add-result']");
  if (ar) { openResultModal(); return; }

  // Delete result
  const rd = e.target.closest("[data-rdel]");
  if (rd && pbClient && state.user) {
    if (!confirm('Ø­Ø°Ù Ø§Ù„Ù†ØªÙŠØ¬Ø©ØŸ')) return;
    pbClient.from('results').delete().eq('id', rd.dataset.rdel).eq('user_id', state.user.id);
    loadData();
    render();
    toast('ØªÙ… Ø§Ù„Ø­Ø°Ù');
    return;
  }
});

/* ===================== Load Data ===================== */
async function loadData() {
  if (!pbClient || !state.user) return;
  try {
    const [f, p, r] = await Promise.all([
      pbClient.from('folders').select('*').order('created_at', { ascending: true }),
      pbClient.from('prompts').select('*').order('updated_at', { ascending: false }),
      pbClient.from('results').select('*').order('created_at', { ascending: false })
    ]);
    state.data.folders = f.data || [];
    state.data.prompts = p.data || [];
    state.data.results = r.data || [];
  } catch (e) {
    console.error('[PB] loadData error:', e);
  }
}

/* ===================== Render ===================== */
function initApp() {
  if (!state.user) return;
  const name = state.profile?.full_name || state.user.email.split('@')[0];
  const first = (name.trim()[0] || 'Ø¨').toUpperCase();
  if (workspaceName) workspaceName.textContent = 'Ø¨Ù†Ùƒ ' + (name.split(' ')[0] || name);
  if (workspaceInitial) workspaceInitial.textContent = first;
  if (sidebarAvatar) sidebarAvatar.textContent = first;
  if (sidebarUserName) sidebarUserName.textContent = name;
  if (sidebarUserEmail) sidebarUserEmail.textContent = state.user.email;
  setView('dashboard');
}

function setView(v) {
  state.view = v;
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  const ey = document.getElementById('topbarEyebrow');
  const tt = document.getElementById('topbarTitle');
  if (ey && tt) {
    if (v === 'dashboard') { ey.textContent = 'Ù…Ø³Ø§Ø­Ø© Ø§Ù„Ø¹Ù…Ù„'; tt.textContent = 'Ù†Ø¸Ø±Ø© Ø¹Ø§Ù…Ø©'; }
    if (v === 'prompts') { ey.textContent = 'Ø§Ù„Ù…ÙƒØªØ¨Ø©'; tt.textContent = 'Ù…ÙƒØªØ¨Ø© Ø§Ù„Ø¨Ø±ÙˆÙ…Ø¨ØªØ§Øª'; }
    if (v === 'folders') { ey.textContent = 'Ø§Ù„ØªÙ†Ø¸ÙŠÙ…'; tt.textContent = 'Ø§Ù„Ù…Ø¬Ù„Ø¯Ø§Øª'; }
    if (v === 'results') { ey.textContent = 'Ø§Ù„Ø£Ø±Ø´ÙŠÙ'; tt.textContent = 'Ø§Ù„Ù†ØªØ§Ø¦Ø¬ Ø§Ù„Ù†Ø§Ø¬Ø­Ø©'; }
  }
  render();
}

function render() {
  renderSidebar();
  if (state.view === 'dashboard') renderDashboard();
  else if (state.view === 'prompts') renderPrompts();
  else if (state.view === 'folders') renderFolders();
  else if (state.view === 'results') renderResults();
}

function renderSidebar() {
  if (navPromptCount) navPromptCount.textContent = state.data.prompts.length;
  if (navResultCount) navResultCount.textContent = state.data.results.length;
  if (!sidebarFolders) return;
  sidebarFolders.innerHTML = '';
  const all = document.createElement('button');
  all.className = 'folder-nav-item';
  all.innerHTML = '<span class="folder-dot" style="background:var(--border-strong)"></span><span class="folder-name">ÙƒÙ„ Ø§Ù„Ø¨Ø±ÙˆÙ…Ø¨ØªØ§Øª</span><span class="folder-count">' + state.data.prompts.length + '</span>';
  all.onclick = () => { state.filters.folder = 'all'; state.view = 'prompts'; render(); };
  sidebarFolders.appendChild(all);
  state.data.folders.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(f => {
    const c = state.data.prompts.filter(p => p.folder_id === f.id).length;
    const btn = document.createElement('button');
    btn.className = 'folder-nav-item';
    btn.innerHTML = '<span class="folder-dot" style="background:' + f.color + '"></span><span class="folder-name">' + escapeHtml(f.name) + '</span><span class="folder-count">' + c + '</span>';
    btn.onclick = () => { state.filters.folder = f.id; state.view = 'prompts'; render(); };
    sidebarFolders.appendChild(btn);
  });
}

function renderDashboard() {
  if (!viewRoot) return;
  const p = state.data.prompts, r = state.data.results;
  const total = p.length, pinned = p.filter(x => x.pinned).length, uses = p.reduce((a, x) => a + (x.uses || 0), 0);
  viewRoot.innerHTML = '<div class="view"><section class="hero"><div class="hero-content"><span class="hero-kicker">Ø¢Ù…Ù† ÙˆÙ…Ø¹Ø²ÙˆÙ„</span><h1 class="hero-title">Ù†Ø¸Ù‘Ù… Ø¨Ø±ÙˆÙ…Ø¨ØªØ§ØªÙƒ <span>Ø§Ù„Ø°Ù‡Ø¨ÙŠØ©</span></h1><p class="hero-sub">Ø§Ø­ÙØ¸ØŒ Ø«Ø¨Ù‘ØªØŒ Ù‚ÙŠÙ‘Ù…ØŒ ÙˆØ§Ù†Ø³Ø® Ø£ÙØ¶Ù„ Ø¨Ø±ÙˆÙ…Ø¨ØªØ§ØªÙƒ</p><div class="hero-actions"><button class="btn btn-primary" data-action="new-prompt">Ø¨Ø±ÙˆÙ…Ø¨Øª Ø¬Ø¯ÙŠØ¯</button><button class="btn btn-secondary" data-action="nav" data-view="prompts">Ø§Ù„Ù…ÙƒØªØ¨Ø©</button></div></div></section><section class="stats-grid"><article class="stat-card"><div class="stat-head"><span class="stat-label">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø¨Ø±ÙˆÙ…Ø¨ØªØ§Øª</span></div><div class="stat-value">' + total + '</div></article><article class="stat-card"><div class="stat-head"><span class="stat-label">Ù…Ø«Ø¨Ù‘ØªØ©</span></div><div class="stat-value">' + pinned + '</div></article><article class="stat-card"><div class="stat-head"><span class="stat-label">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø§Ø³ØªØ®Ø¯Ø§Ù…</span></div><div class="stat-value">' + uses + '</div></article><article class="stat-card"><div class="stat-head"><span class="stat-label">Ø§Ù„Ù†ØªØ§Ø¦Ø¬ Ø§Ù„Ù†Ø§Ø¬Ø­Ø©</span></div><div class="stat-value">' + r.length + '</div></article></section></div>';
}

function renderPrompts() {
  if (!viewRoot) return;
  let list = state.data.prompts.slice();
  if (state.filters.folder !== 'all') list = list.filter(x => x.folder_id === state.filters.folder);
  if (state.filters.platform !== 'all') list = list.filter(x => x.platform === state.filters.platform);
  if (state.filters.onlyPinned) list = list.filter(x => x.pinned);
  const q = state.filters.query.trim().toLowerCase();
  if (q) list = list.filter(x => (x.title + ' ' + x.text).toLowerCase().includes(q));
  list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.uses || 0) - (a.uses || 0));

  const fopts = '<option value="all">ÙƒÙ„ Ø§Ù„Ù…Ø¬Ù„Ø¯Ø§Øª</option>' + state.data.folders.map(f => '<option value="' + f.id + '" ' + (state.filters.folder === f.id ? 'selected' : '') + '>' + escapeHtml(f.name) + '</option>').join('');
  const popts = '<option value="all">ÙƒÙ„ Ø§Ù„Ù…Ù†ØµØ§Øª</option>' + PLATFORMS.map(p => '<option value="' + p.id + '" ' + (state.filters.platform === p.id ? 'selected' : '') + '>' + p.id + '</option>').join('');

  viewRoot.innerHTML = '<div class="view"><div class="toolbar"><div class="toolbar-group"><div class="segment"><button class="segment-btn ' + (!state.filters.onlyPinned ? 'active' : '') + '" data-pf="false">Ø§Ù„ÙƒÙ„</button><button class="segment-btn ' + (state.filters.onlyPinned ? 'active' : '') + '" data-pf="true">Ø§Ù„Ù…Ø«Ø¨ØªØ©</button></div><select class="filter-select" id="fsel">' + fopts + '</select><select class="filter-select" id="psel">' + popts + '</select></div><div class="toolbar-group"><div class="search-inline"><svg class="icon"><use href="#i-search"></use></svg><input id="sis" type="search" placeholder="Ø¨Ø­Ø«..."></div><button class="btn btn-primary" data-action="new-prompt">Ø¨Ø±ÙˆÙ…Ø¨Øª Ø¬Ø¯ÙŠØ¯</button></div></div><div class="card-grid">' + (list.length ? list.map(card).join('') : '<div class="panel"><div class="panel-body" style="text-align:center;color:var(--text-tertiary);padding:40px">Ù„Ø§ ØªÙˆØ¬Ø¯ Ù†ØªØ§Ø¦Ø¬</div></div>') + '</div></div>';

  document.getElementById('sis').oninput = e => { state.filters.query = e.target.value; render(); };
  $$("[data-pf]").forEach(b => b.onclick = () => { state.filters.onlyPinned = b.dataset.pf === 'true'; render(); });
  document.getElementById('fsel').onchange = e => { state.filters.folder = e.target.value; render(); };
  document.getElementById('psel').onchange = e => { state.filters.platform = e.target.value; render(); };
}

function card(p) {
  const m = platformMeta(p.platform);
  const folder = state.data.folders.find(f => f.id === p.folder_id);
  const tags = (p.tags || []).map(t => '<span>' + escapeHtml(t) + '</span>').join('');
  let stars = '';
  for (let i = 1; i <= 5; i++) stars += '<button class="rating-btn ' + (i <= (p.rating || 0) ? 'active' : '') + '" data-rate="' + p.id + '" data-v="' + i + '"><svg class="icon"><use href="#i-star"></use></svg></button>';
  return '<article class="prompt-card ' + (p.pinned ? 'pinned' : '') + '"><div class="prompt-card-head"><div style="display:flex;flex-direction:column;gap:6px"><span class="prompt-platform"><span class="list-dot" style="background:' + m.color + '"></span>' + escapeHtml(m.id) + '</span>' + (folder ? '<span style="font-size:12px;color:var(--text-tertiary)">' + escapeHtml(folder.name) + '</span>' : '') + '</div><div class="prompt-actions"><button class="icon-btn" data-pin="' + p.id + '"><svg class="icon"><use href="#i-pin"></use></svg></button><button class="icon-btn" data-edit="' + p.id + '"><svg class="icon"><use href="#i-pencil"></use></svg></button><button class="icon-btn" data-del="' + p.id + '"><svg class="icon"><use href="#i-trash"></use></svg></button></div></div><div class="prompt-body"><h3 class="prompt-title">' + escapeHtml(p.title) + '</h3><p class="prompt-preview">' + escapeHtml(p.text) + '</p>' + (tags ? '<div class="prompt-tags">' + tags + '</div>' : '') + '</div><div class="prompt-foot"><div class="prompt-meta"><span>' + (p.uses || 0) + ' Ø§Ø³ØªØ®Ø¯Ø§Ù…</span><div class="rating">' + stars + '</div></div><button class="copy-btn" data-copy="' + p.id + '"><svg class="icon"><use href="#i-copy"></use></svg><span>Ù†Ø³Ø®</span></button></div></article>';
}

function renderFolders() {
  if (!viewRoot) return;
  viewRoot.innerHTML = '<div class="view"><div class="toolbar"><div class="toolbar-group"><h3 style="margin:0">Ø§Ù„Ù…Ø¬Ù„Ø¯Ø§Øª</h3></div><button class="btn btn-primary" data-action="new-folder">Ù…Ø¬Ù„Ø¯ Ø¬Ø¯ÙŠØ¯</button></div><div class="card-grid">' + (state.data.folders.length ? state.data.folders.map(f => '<article class="prompt-card"><div class="prompt-card-head"><div style="display:flex;align-items:center;gap:10px"><span style="width:10px;height:10px;border-radius:50%;background:' + f.color + '"></span><h3 class="prompt-title" style="font-size:17px">' + escapeHtml(f.name) + '</h3></div><div class="prompt-actions"><button class="icon-btn" data-fedit="' + f.id + '"><svg class="icon"><use href="#i-pencil"></use></svg></button><button class="icon-btn" data-fdel="' + f.id + '"><svg class="icon"><use href="#i-trash"></use></svg></button></div></div><div class="prompt-foot"><button class="btn btn-secondary" data-fopen="' + f.id + '">Ø¹Ø±Ø¶ Ø§Ù„Ø¨Ø±ÙˆÙ…Ø¨ØªØ§Øª</button></div></article>').join('') : '<div class="panel"><div class="panel-body" style="text-align:center;color:var(--text-tertiary);padding:40px">Ù„Ø§ ØªÙˆØ¬Ø¯ Ù…Ø¬Ù„Ø¯Ø§Øª</div></div>') + '</div></div>';
}

function renderResults() {
  if (!viewRoot) return;
  let list = state.data.results.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  viewRoot.innerHTML = '<div class="view"><div class="toolbar"><div class="toolbar-group"><h3 style="margin:0">Ø§Ù„Ù†ØªØ§Ø¦Ø¬ Ø§Ù„Ù†Ø§Ø¬Ø­Ø©</h3></div><button class="btn btn-primary" data-action="add-result">Ù†ØªÙŠØ¬Ø© Ø¬Ø¯ÙŠØ¯Ø©</button></div><div class="card-grid">' + (list.length ? list.map(r => '<article class="prompt-card"><div class="prompt-card-head"><h3 class="prompt-title">' + escapeHtml(r.title) + '</h3><button class="icon-btn" data-rdel="' + r.id + '"><svg class="icon"><use href="#i-trash"></use></svg></button></div><div class="prompt-body"><p class="prompt-preview">' + escapeHtml(r.content) + '</p></div></article>').join('') : '<div class="panel"><div class="panel-body" style="text-align:center;color:var(--text-tertiary);padding:40px">Ù„Ø§ ØªÙˆØ¬Ø¯ Ù†ØªØ§Ø¦Ø¬</div></div>') + '</div></div>';
}

/* ===================== Modals ===================== */
function closeModals() { if (modalRoot) modalRoot.innerHTML = ''; }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModals(); });

async function openPromptModal(id = null) {
  if (!modalRoot || !pbClient || !state.user) return;
  const edit = id ? state.data.prompts.find(p => p.id === id) : null;
  const obj = edit ? JSON.parse(JSON.stringify(edit)) : { title: '', text: '', platform: 'Claude', tags: [], folder_id: null };
  const folders = '<option value="">Ø¨Ø¯ÙˆÙ† Ù…Ø¬Ù„Ø¯</option>' + state.data.folders.map(f => '<option value="' + f.id + '" ' + (obj.folder_id === f.id ? 'selected' : '') + '>' + escapeHtml(f.name) + '</option>').join('');
  const plats = PLATFORMS.map(p => '<option value="' + p.id + '" ' + (obj.platform === p.id ? 'selected' : '') + '>' + p.id + '</option>').join('');
  modalRoot.innerHTML = '<div class="modal-backdrop" data-mc></div><div class="modal"><div class="modal-head"><div><h3>' + (edit ? 'ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ø¨Ø±ÙˆÙ…Ø¨Øª' : 'Ø¨Ø±ÙˆÙ…Ø¨Øª Ø¬Ø¯ÙŠØ¯') + '</h3></div><button class="icon-btn" data-mc><svg class="icon"><use href="#i-x"></use></svg></button></div><div class="modal-body"><div class="field-group"><label class="field-label">Ø§Ù„Ø¹Ù†ÙˆØ§Ù†</label><input class="field-input" id="pmt" value="' + escapeAttr(obj.title) + '"></div><div class="field-group"><label class="field-label">Ù†Øµ Ø§Ù„Ø¨Ø±ÙˆÙ…Ø¨Øª</label><textarea class="field-textarea" id="pmx">' + escapeHtml(obj.text) + '</textarea></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="field-group"><label class="field-label">Ø§Ù„Ù…Ù†ØµØ©</label><select class="filter-select" id="pmp">' + plats + '</select></div><div class="field-group"><label class="field-label">Ø§Ù„Ù…Ø¬Ù„Ø¯</label><select class="filter-select" id="pmf">' + folders + '</select></div></div><div class="field-group"><label class="field-label">Ø§Ù„ÙˆØ³ÙˆÙ…</label><input class="field-input" id="pmtg" value="' + escapeAttr((obj.tags || []).join(', ')) + '"></div></div><div class="modal-foot"><button class="btn btn-secondary" data-mc>Ø¥Ù„ØºØ§Ø¡</button><button class="btn btn-primary" id="pms">Ø­ÙØ¸</button></div></div>';
  modalRoot.querySelectorAll("[data-mc]").forEach(b => b.onclick = closeModals);
  document.getElementById('pms').onclick = async () => {
    const title = document.getElementById('pmt').value.trim();
    const text = document.getElementById('pmx').value;
    if (!title || !text) { toast('Ø§Ù„Ø¹Ù†ÙˆØ§Ù† ÙˆØ§Ù„Ù†Øµ Ù…Ø·Ù„ÙˆØ¨Ø§Ù†'); return; }
    const payload = { title, text, platform: document.getElementById('pmp').value, folder_id: document.getElementById('pmf').value || null, tags: (document.getElementById('pmtg').value || '').split(',').map(x => x.trim()).filter(Boolean), updated_at: nowISO() };
    try {
      if (edit) { await pbClient.from('prompts').update(payload).eq('id', edit.id).eq('user_id', state.user.id); toast('ØªÙ… Ø§Ù„ØªØ¹Ø¯ÙŠÙ„'); }
      else { await pbClient.from('prompts').insert({ ...payload, user_id: state.user.id, pinned: false, uses: 0, rating: 0, created_at: nowISO() }); toast('ØªÙ… Ø§Ù„Ø¥Ø¶Ø§ÙØ©'); }
      closeModals(); await loadData(); render();
    } catch (err) { toast('ÙØ´Ù„ Ø§Ù„Ø­ÙØ¸'); }
  };
}

async function openFolderModal(id = null) {
  if (!modalRoot || !pbClient || !state.user) return;
  const edit = id ? state.data.folders.find(f => f.id === id) : null;
  const obj = edit ? JSON.parse(JSON.stringify(edit)) : { name: '', color: '#7c5cff' };
  const colors = ['#7c5cff', '#4c8df6', '#10a37f', '#f59e0b', '#ef4444', '#1fb8ad', '#8b8d98', '#a38bff'];
  modalRoot.innerHTML = '<div class="modal-backdrop" data-mc></div><div class="modal"><div class="modal-head"><div><h3>' + (edit ? 'ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ù…Ø¬Ù„Ø¯' : 'Ù…Ø¬Ù„Ø¯ Ø¬Ø¯ÙŠØ¯') + '</h3></div><button class="icon-btn" data-mc><svg class="icon"><use href="#i-x"></use></svg></button></div><div class="modal-body"><div class="field-group"><label class="field-label">Ø§Ø³Ù… Ø§Ù„Ù…Ø¬Ù„Ø¯</label><input class="field-input" id="fmn" value="' + escapeAttr(obj.name) + '"></div><div style="display:flex;gap:8px;flex-wrap:wrap">' + colors.map(c => '<button class="color-swatch ' + (obj.color === c ? 'active' : '') + '" data-c="' + c + '" style="background:' + c + '"></button>').join('') + '</div></div><div class="modal-foot"><button class="btn btn-secondary" data-mc>Ø¥Ù„ØºØ§Ø¡</button><button class="btn btn-primary" id="fms">Ø­ÙØ¸</button></div></div>';
  modalRoot.querySelectorAll("[data-mc]").forEach(b => b.onclick = closeModals);
  let sel = obj.color;
  $$(".color-swatch").forEach(b => b.onclick = () => { $$(".color-swatch").forEach(x => x.classList.remove('active')); b.classList.add('active'); sel = b.dataset.c; });
  document.getElementById('fms').onclick = async () => {
    const name = document.getElementById('fmn').value.trim();
    if (!name) { toast('Ø§Ø³Ù… Ø§Ù„Ù…Ø¬Ù„Ø¯ Ù…Ø·Ù„ÙˆØ¨'); return; }
    try {
      if (edit) { await pbClient.from('folders').update({ name, color: sel, updated_at: nowISO() }).eq('id', edit.id).eq('user_id', state.user.id); toast('ØªÙ… Ø§Ù„ØªØ¹Ø¯ÙŠÙ„'); }
      else { await pbClient.from('folders').insert({ name, color: sel, user_id: state.user.id, created_at: nowISO() }); toast('ØªÙ… Ø§Ù„Ø¥Ø¶Ø§ÙØ©'); }
      closeModals(); await loadData(); render();
    } catch (err) { toast('ÙØ´Ù„ Ø§Ù„Ø­ÙØ¸'); }
  };
}

async function openResultModal() {
  if (!modalRoot || !pbClient || !state.user) return;
  const opts = '<option value="">Ø¨Ø¯ÙˆÙ† Ø±Ø¨Ø·</option>' + state.data.prompts.map(p => '<option value="' + p.id + '">' + escapeHtml(p.title) + '</option>').join('');
  modalRoot.innerHTML = '<div class="modal-backdrop" data-mc></div><div class="modal"><div class="modal-head"><div><h3>Ø­ÙØ¸ Ù†ØªÙŠØ¬Ø© Ù†Ø§Ø¬Ø­Ø©</h3></div><button class="icon-btn" data-mc><svg class="icon"><use href="#i-x"></use></svg></button></div><div class="modal-body"><div class="field-group"><label class="field-label">Ø¹Ù†ÙˆØ§Ù† Ø§Ù„Ù†ØªÙŠØ¬Ø©</label><input class="field-input" id="rmt"></div><div class="field-group"><label class="field-label">ÙŠØ±ØªØ¨Ø· Ø¨Ø§Ù„Ø¨Ø±ÙˆÙ…Ø¨Øª</label><select class="filter-select" id="rmp">' + opts + '</select></div><div class="field-group"><label class="field-label">Ù…Ø­ØªÙˆÙ‰ Ø§Ù„Ù†ØªÙŠØ¬Ø©</label><textarea class="field-textarea" id="rmx"></textarea></div><div class="field-group"><label class="field-label">Ø§Ù„Ù…Ù†ØµØ©</label><select class="filter-select" id="rmpl">' + PLATFORMS.map(p => '<option>' + p.id + '</option>').join('') + '</select></div></div><div class="modal-foot"><button class="btn btn-secondary" data-mc>Ø¥Ù„ØºØ§Ø¡</button><button class="btn btn-primary" id="rms">Ø­ÙØ¸</button></div></div>';
  modalRoot.querySelectorAll("[data-mc]").forEach(b => b.onclick = closeModals);
  document.getElementById('rms').onclick = async () => {
    const title = document.getElementById('rmt').value.trim();
    const content = document.getElementById('rmx').value.trim();
    if (!title || !content) { toast('Ø§Ù„Ø¹Ù†ÙˆØ§Ù† ÙˆØ§Ù„Ù…Ø­ØªÙˆÙ‰ Ù…Ø·Ù„ÙˆØ¨Ø§Ù†'); return; }
    try {
      await pbClient.from('results').insert({ title, content, prompt_id: document.getElementById('rmp').value || null, platform: document.getElementById('rmpl').value, user_id: state.user.id, created_at: nowISO() });
      closeModals(); await loadData(); render(); toast('ØªÙ… Ø§Ù„Ø­ÙØ¸');
    } catch (err) { toast('ÙØ´Ù„ Ø§Ù„Ø­ÙØ¸'); }
  };
}

/* ===================== Bootstrap ===================== */
document.addEventListener('DOMContentLoaded', () => {
  console.log('[PB] DOM loaded');
  getElements();
  initTheme();
  setAuthMode('login');
  if (authScreen) authScreen.hidden = false;
  if (appEl) appEl.hidden = true;
  if (!initPb()) return;
  setupAuth();
  console.log('[PB] Ready');
});
