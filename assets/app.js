/*
  Prompt Bank - بنك البرومبتات
  Supabase Auth + DB + RLS
  نسخة بسيطة ومضمونة - تم إصلاح تدفق المصادقة
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
    document.body.innerHTML = '<div style="text-align:center;padding:50px;font-family:sans-serif;direction:rtl"><h2>تعذر تحميل مكتبة Supabase</h2><p>تأكد من الاتصال بالإنترنت</p></div>';
    return false;
  }
  const createClient = lib.createClient || (lib.default && lib.default.createClient);
  if (typeof createClient !== 'function') {
    document.body.innerHTML = '<div style="text-align:center;padding:50px;font-family:sans-serif;direction:rtl"><h2>خطأ في مكتبة Supabase</h2></div>';
    return false;
  }
  if (!window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.url || !window.SUPABASE_CONFIG.anonKey) {
    document.body.innerHTML = '<div style="text-align:center;padding:50px;font-family:sans-serif;direction:rtl"><h2>الإعدادات مفقودة</h2><p>تأكد من وجود assets/config.js</p></div>';
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
  isDemo: false,
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
    if (authHeading) authHeading.textContent = 'مرحباً بعودتك';
    if (authSub) authSub.textContent = 'سجّل الدخول لفتح بنك برومبتاتك.';
    if (authNameGroup) authNameGroup.hidden = true;
    if (authSubmitLabel) authSubmitLabel.textContent = 'تسجيل الدخول';
    if (authSwitch) authSwitch.innerHTML = 'ليس لديك حساب بعد؟ <button type="button" data-action="auth-tab" data-mode="register">أنشئ حسابك</button>';
    if (authPassword) authPassword.setAttribute('autocomplete', 'current-password');
  } else {
    if (authHeading) authHeading.textContent = 'أنشئ حسابك';
    if (authSub) authSub.textContent = 'بياناتك محمية ومعزولة.';
    if (authNameGroup) authNameGroup.hidden = false;
    if (authSubmitLabel) authSubmitLabel.textContent = 'إنشاء الحساب';
    if (authSwitch) authSwitch.innerHTML = 'لديك حساب بالفعل؟ <button type="button" data-action="auth-tab" data-mode="login">سجّل الدخول</button>';
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

  if (state.isDemo) {
    if (authScreen) authScreen.hidden = true;
    if (appEl) appEl.hidden = false;
    initApp();
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
function bindAuthForm() {
  if (!authForm) return;
  authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!pbClient) return;
  if (authError) authError.hidden = true;
  if (authErrorText) authErrorText.textContent = '';

  const email = authEmail.value.trim().toLowerCase();
  const pass = authPassword.value;
  const name = authName.value.trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (authErrorText) { authErrorText.textContent = 'بريد إلكتروني غير صحيح'; authError.hidden = false; }
    return;
  }
  if (pass.length < 8) {
    if (authErrorText) { authErrorText.textContent = 'كلمة المرور ٨ أحرف على الأقل'; authError.hidden = false; }
    return;
  }

  if (authSpinner) authSpinner.hidden = false;
  if (authSubmitLabel) authSubmitLabel.textContent = authMode === 'login' ? 'جاري الدخول...' : 'جاري الإنشاء...';

  try {
    if (authMode === 'register') {
      if (!name) {
        if (authErrorText) { authErrorText.textContent = 'أدخل الاسم الكامل'; authError.hidden = false; }
        if (authSpinner) authSpinner.hidden = true;
        if (authSubmitLabel) authSubmitLabel.textContent = 'إنشاء الحساب';
        return;
      }
      const { data, error } = await pbClient.auth.signUp({
        email, password: pass,
        options: { data: { full_name: name } }
      });
      if (error) throw error;
      if (data.user) {
        if (data.session) {
          await pbClient.from('profiles').upsert({ id: data.user.id, email, full_name: name });
          toast('تم إنشاء الحساب وتسجيل الدخول.');
        } else {
          if (authErrorText) {
            authErrorText.textContent = 'تم إنشاء الحساب. افتح رسالة التأكيد في بريدك الإلكتروني، ثم سجّل الدخول.';
            authError.hidden = false;
          }
        }
      }
    } else {
      const { error } = await pbClient.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      toast('تم تسجيل الدخول');
    }
    // showApp will be called by onAuthStateChange
  } catch (err) {
    console.error('[PB] Auth error:', err);
    if (authErrorText) { authErrorText.textContent = err.message || 'خطأ'; authError.hidden = false; }
  } finally {
    if (authSpinner) authSpinner.hidden = true;
    if (authSubmitLabel) authSubmitLabel.textContent = authMode === 'login' ? 'تسجيل الدخول' : 'إنشاء الحساب';
  }
  });
}

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
  if (lo) {
    if (state.isDemo) {
      state.isDemo = false;
      state.user = null;
      state.profile = null;
      state.data = { folders: [], prompts: [], results: [] };
      if (authScreen) authScreen.hidden = false;
      if (appEl) appEl.hidden = true;
    } else if (pbClient) {
      pbClient.auth.signOut().finally(() => location.reload());
    }
    return;
  }

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
  if (demo) {
    const btn = demo.querySelector('.demo-badge') || demo;
    const orig = btn.textContent;
    btn.textContent = 'جاري الدخول...';
    state.isDemo = true;
    state.user = { id: 'local-demo', email: 'demo@promptbank.local' };
    state.profile = { full_name: 'مستخدم تجريبي' };
    state.data = {
      folders: [{ id: 'demo-writing', name: 'الكتابة', color: '#7c5cff' }],
      prompts: [{ id: 'demo-prompt', title: 'محرر المحتوى العربي', text: 'أنت محرر محتوى عربي محترف. حسّن النص مع الحفاظ على المعنى والنبرة.', platform: 'ChatGPT', folder_id: 'demo-writing', tags: ['تحرير', 'كتابة'], pinned: true, uses: 12, rating: 5 }],
      results: [{ id: 'demo-result', title: 'نتيجة تجريبية ناجحة', content: 'هذا مثال لنتيجة محفوظة في الحساب التجريبي.', created_at: nowISO() }]
    };
    showApp();
    btn.textContent = orig;
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
    toast('تم النسخ');
    return;
  }

  // Pin
  const pin = e.target.closest("[data-pin]");
  if (pin && pbClient && state.user) {
    const p = state.data.prompts.find(x => x.id === pin.dataset.pin);
    if (!p) return;
    (async () => {
      const nextPinned = !Boolean(p.pinned);
      const { data, error } = await pbClient.from('prompts')
        .update({ pinned: nextPinned, updated_at: nowISO() })
        .eq('id', p.id)
        .eq('user_id', state.user.id)
        .select('id,pinned')
        .maybeSingle();
      if (error || !data) {
        console.error('[PB] Pin error:', error || 'No prompt was updated');
        toast(error ? 'تعذر تحديث التثبيت: ' + error.message : 'تعذر العثور على البرومبت لتثبيته');
        return;
      }
      p.pinned = data.pinned;
      render();
      toast(p.pinned ? 'تم تثبيت البرومبت' : 'تم إلغاء تثبيت البرومبت');
    })();
    return;
  }

  // Rate
  const rate = e.target.closest("[data-rate]");
  if (rate && pbClient && state.user) {
    const p = state.data.prompts.find(x => x.id === rate.dataset.rate);
    if (!p) return;
    (async () => {
      const rating = Number(rate.dataset.v);
      const { error } = await pbClient.from('prompts').update({ rating, updated_at: nowISO() }).eq('id', p.id).eq('user_id', state.user.id);
      if (error) { console.error('[PB] Rating error:', error); toast('تعذر حفظ التقييم: ' + error.message); return; }
      p.rating = rating;
      render();
      toast('تم حفظ التقييم');
    })();
    return;
  }

  // Edit
  const ed = e.target.closest("[data-edit]");
  if (ed) { openPromptModal(ed.dataset.edit); return; }

  // Delete prompt
  const dl = e.target.closest("[data-del]");
  if (dl && pbClient && state.user) {
    if (!confirm('حذف نهائياً؟')) return;
    const id = dl.dataset.del;
    (async () => {
      const { error } = await pbClient.from('prompts').delete().eq('id', id).eq('user_id', state.user.id);
      if (error) { console.error('[PB] Delete error:', error); toast('تعذر حذف البرومبت: ' + error.message); return; }
      state.data.prompts = state.data.prompts.filter(p => p.id !== id);
      render();
      toast('تم الحذف');
    })();
    return;
  }

  // Folder open
  const fo = e.target.closest("[data-fopen]");
  if (fo) { state.filters.folder = fo.dataset.fopen; state.view = 'prompts'; render(); return; }

  const fe = e.target.closest("[data-fedit]");
  if (fe) { openFolderModal(fe.dataset.fedit); return; }

  const fd = e.target.closest("[data-fdel]");
  if (fd && pbClient && state.user) {
    if (!confirm('حذف المجلد؟')) return;
    pbClient.from('prompts').update({ folder_id: null }).eq('folder_id', fd.dataset.fdel).eq('user_id', state.user.id);
    pbClient.from('folders').delete().eq('id', fd.dataset.fdel).eq('user_id', state.user.id);
    loadData();
    render();
    toast('تم الحذف');
    return;
  }

  // Add result
  const ar = e.target.closest("[data-action='add-result']");
  if (ar) { openResultModal(); return; }

  // Delete result
  const rd = e.target.closest("[data-rdel]");
  if (rd && pbClient && state.user) {
    if (!confirm('حذف النتيجة؟')) return;
    pbClient.from('results').delete().eq('id', rd.dataset.rdel).eq('user_id', state.user.id);
    loadData();
    render();
    toast('تم الحذف');
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
  const first = (name.trim()[0] || 'ب').toUpperCase();
  if (workspaceName) workspaceName.textContent = 'بنك ' + (name.split(' ')[0] || name);
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
    if (v === 'dashboard') { ey.textContent = 'مساحة العمل'; tt.textContent = 'نظرة عامة'; }
    if (v === 'prompts') { ey.textContent = 'المكتبة'; tt.textContent = 'مكتبة البرومبتات'; }
    if (v === 'folders') { ey.textContent = 'التنظيم'; tt.textContent = 'المجلدات'; }
    if (v === 'results') { ey.textContent = 'الأرشيف'; tt.textContent = 'النتائج الناجحة'; }
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
  all.innerHTML = '<span class="folder-dot" style="background:var(--border-strong)"></span><span class="folder-name">كل البرومبتات</span><span class="folder-count">' + state.data.prompts.length + '</span>';
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
  viewRoot.innerHTML = '<div class="view"><section class="hero"><div class="hero-content"><span class="hero-kicker">آمن ومعزول</span><h1 class="hero-title">نظّم برومبتاتك <span>الذهبية</span></h1><p class="hero-sub">احفظ، ثبّت، قيّم، وانسخ أفضل برومبتاتك</p><div class="hero-actions"><button class="btn btn-primary" data-action="new-prompt">برومبت جديد</button><button class="btn btn-secondary" data-action="nav" data-view="prompts">المكتبة</button></div></div></section><section class="stats-grid"><article class="stat-card"><div class="stat-head"><span class="stat-label">إجمالي البرومبتات</span></div><div class="stat-value">' + total + '</div></article><article class="stat-card"><div class="stat-head"><span class="stat-label">مثبّتة</span></div><div class="stat-value">' + pinned + '</div></article><article class="stat-card"><div class="stat-head"><span class="stat-label">إجمالي الاستخدام</span></div><div class="stat-value">' + uses + '</div></article><article class="stat-card"><div class="stat-head"><span class="stat-label">النتائج الناجحة</span></div><div class="stat-value">' + r.length + '</div></article></section></div>';
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

  const fopts = '<option value="all">كل المجلدات</option>' + state.data.folders.map(f => '<option value="' + f.id + '" ' + (state.filters.folder === f.id ? 'selected' : '') + '>' + escapeHtml(f.name) + '</option>').join('');
  const popts = '<option value="all">كل المنصات</option>' + PLATFORMS.map(p => '<option value="' + p.id + '" ' + (state.filters.platform === p.id ? 'selected' : '') + '>' + p.id + '</option>').join('');

  viewRoot.innerHTML = '<div class="view"><div class="toolbar"><div class="toolbar-group"><div class="segment"><button class="segment-btn ' + (!state.filters.onlyPinned ? 'active' : '') + '" data-pf="false">الكل</button><button class="segment-btn ' + (state.filters.onlyPinned ? 'active' : '') + '" data-pf="true">المثبتة</button></div><select class="filter-select" id="fsel">' + fopts + '</select><select class="filter-select" id="psel">' + popts + '</select></div><div class="toolbar-group"><div class="search-inline"><svg class="icon"><use href="#i-search"></use></svg><input id="sis" type="search" placeholder="بحث..."></div><button class="btn btn-primary" data-action="new-prompt">برومبت جديد</button></div></div><div class="card-grid">' + (list.length ? list.map(card).join('') : '<div class="panel"><div class="panel-body" style="text-align:center;color:var(--text-tertiary);padding:40px">لا توجد نتائج</div></div>') + '</div></div>';

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
  return '<article class="prompt-card ' + (p.pinned ? 'pinned' : '') + '"><div class="prompt-card-head"><div style="display:flex;flex-direction:column;gap:6px"><span class="prompt-platform"><span class="list-dot" style="background:' + m.color + '"></span>' + escapeHtml(m.id) + '</span>' + (folder ? '<span style="font-size:12px;color:var(--text-tertiary)">' + escapeHtml(folder.name) + '</span>' : '') + '</div><div class="prompt-actions"><button class="icon-btn" data-pin="' + p.id + '"><svg class="icon"><use href="#i-pin"></use></svg></button><button class="icon-btn" data-edit="' + p.id + '"><svg class="icon"><use href="#i-pencil"></use></svg></button><button class="icon-btn" data-del="' + p.id + '"><svg class="icon"><use href="#i-trash"></use></svg></button></div></div><div class="prompt-body"><h3 class="prompt-title">' + escapeHtml(p.title) + '</h3><p class="prompt-preview">' + escapeHtml(p.text) + '</p>' + (tags ? '<div class="prompt-tags">' + tags + '</div>' : '') + '</div><div class="prompt-foot"><div class="prompt-meta"><span>' + (p.uses || 0) + ' استخدام</span><div class="rating">' + stars + '</div></div><button class="copy-btn" data-copy="' + p.id + '"><svg class="icon"><use href="#i-copy"></use></svg><span>نسخ</span></button></div></article>';
}

function renderFolders() {
  if (!viewRoot) return;
  viewRoot.innerHTML = '<div class="view"><div class="toolbar"><div class="toolbar-group"><h3 style="margin:0">المجلدات</h3></div><button class="btn btn-primary" data-action="new-folder">مجلد جديد</button></div><div class="card-grid">' + (state.data.folders.length ? state.data.folders.map(f => '<article class="prompt-card"><div class="prompt-card-head"><div style="display:flex;align-items:center;gap:10px"><span style="width:10px;height:10px;border-radius:50%;background:' + f.color + '"></span><h3 class="prompt-title" style="font-size:17px">' + escapeHtml(f.name) + '</h3></div><div class="prompt-actions"><button class="icon-btn" data-fedit="' + f.id + '"><svg class="icon"><use href="#i-pencil"></use></svg></button><button class="icon-btn" data-fdel="' + f.id + '"><svg class="icon"><use href="#i-trash"></use></svg></button></div></div><div class="prompt-foot"><button class="btn btn-secondary" data-fopen="' + f.id + '">عرض البرومبتات</button></div></article>').join('') : '<div class="panel"><div class="panel-body" style="text-align:center;color:var(--text-tertiary);padding:40px">لا توجد مجلدات</div></div>') + '</div></div>';
}

function renderResults() {
  if (!viewRoot) return;
  let list = state.data.results.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  viewRoot.innerHTML = '<div class="view"><div class="toolbar"><div class="toolbar-group"><h3 style="margin:0">النتائج الناجحة</h3></div><button class="btn btn-primary" data-action="add-result">نتيجة جديدة</button></div><div class="card-grid">' + (list.length ? list.map(r => '<article class="prompt-card"><div class="prompt-card-head"><h3 class="prompt-title">' + escapeHtml(r.title) + '</h3><button class="icon-btn" data-rdel="' + r.id + '"><svg class="icon"><use href="#i-trash"></use></svg></button></div><div class="prompt-body"><p class="prompt-preview">' + escapeHtml(r.content) + '</p></div></article>').join('') : '<div class="panel"><div class="panel-body" style="text-align:center;color:var(--text-tertiary);padding:40px">لا توجد نتائج</div></div>') + '</div></div>';
}

/* ===================== Modals ===================== */
function closeModals() { if (modalRoot) modalRoot.innerHTML = ''; }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModals(); });

async function openPromptModal(id = null) {
  if (!modalRoot || !pbClient || !state.user) return;
  const edit = id ? state.data.prompts.find(p => p.id === id) : null;
  const obj = edit ? JSON.parse(JSON.stringify(edit)) : { title: '', text: '', platform: 'Claude', tags: [], folder_id: null };
  const folders = '<option value="">بدون مجلد</option>' + state.data.folders.map(f => '<option value="' + f.id + '" ' + (obj.folder_id === f.id ? 'selected' : '') + '>' + escapeHtml(f.name) + '</option>').join('');
  const plats = PLATFORMS.map(p => '<option value="' + p.id + '" ' + (obj.platform === p.id ? 'selected' : '') + '>' + p.id + '</option>').join('');
  modalRoot.innerHTML = '<div class="modal-backdrop" data-mc></div><div class="modal"><div class="modal-head"><div><h3>' + (edit ? 'تعديل البرومبت' : 'برومبت جديد') + '</h3></div><button class="icon-btn" data-mc><svg class="icon"><use href="#i-x"></use></svg></button></div><div class="modal-body"><div class="field-group"><label class="field-label">العنوان</label><input class="field-input" id="pmt" value="' + escapeAttr(obj.title) + '"></div><div class="field-group"><label class="field-label">نص البرومبت</label><textarea class="field-textarea" id="pmx">' + escapeHtml(obj.text) + '</textarea></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="field-group"><label class="field-label">المنصة</label><select class="filter-select" id="pmp">' + plats + '</select></div><div class="field-group"><label class="field-label">المجلد</label><select class="filter-select" id="pmf">' + folders + '</select></div></div><div class="field-group"><label class="field-label">الوسوم</label><input class="field-input" id="pmtg" value="' + escapeAttr((obj.tags || []).join(', ')) + '"></div></div><div class="modal-foot"><button class="btn btn-secondary" data-mc>إلغاء</button><button class="btn btn-primary" id="pms">حفظ</button></div></div>';
  modalRoot.querySelectorAll("[data-mc]").forEach(b => b.onclick = closeModals);
  document.getElementById('pms').onclick = async () => {
    const title = document.getElementById('pmt').value.trim();
    const text = document.getElementById('pmx').value;
    if (!title || !text) { toast('العنوان والنص مطلوبان'); return; }
    const payload = { title, text, platform: document.getElementById('pmp').value, folder_id: document.getElementById('pmf').value || null, tags: (document.getElementById('pmtg').value || '').split(',').map(x => x.trim()).filter(Boolean), updated_at: nowISO() };
    try {
      if (edit) { await pbClient.from('prompts').update(payload).eq('id', edit.id).eq('user_id', state.user.id); toast('تم التعديل'); }
      else { await pbClient.from('prompts').insert({ ...payload, user_id: state.user.id, pinned: false, uses: 0, rating: 0, created_at: nowISO() }); toast('تم الإضافة'); }
      closeModals(); await loadData(); render();
    } catch (err) { toast('فشل الحفظ'); }
  };
}

async function openFolderModal(id = null) {
  if (!modalRoot || !pbClient || !state.user) return;
  const edit = id ? state.data.folders.find(f => f.id === id) : null;
  const obj = edit ? JSON.parse(JSON.stringify(edit)) : { name: '', color: '#7c5cff' };
  const colors = ['#7c5cff', '#4c8df6', '#10a37f', '#f59e0b', '#ef4444', '#1fb8ad', '#8b8d98', '#a38bff'];
  modalRoot.innerHTML = '<div class="modal-backdrop" data-mc></div><div class="modal"><div class="modal-head"><div><h3>' + (edit ? 'تعديل المجلد' : 'مجلد جديد') + '</h3></div><button class="icon-btn" data-mc><svg class="icon"><use href="#i-x"></use></svg></button></div><div class="modal-body"><div class="field-group"><label class="field-label">اسم المجلد</label><input class="field-input" id="fmn" value="' + escapeAttr(obj.name) + '"></div><div style="display:flex;gap:8px;flex-wrap:wrap">' + colors.map(c => '<button class="color-swatch ' + (obj.color === c ? 'active' : '') + '" data-c="' + c + '" style="background:' + c + '"></button>').join('') + '</div></div><div class="modal-foot"><button class="btn btn-secondary" data-mc>إلغاء</button><button class="btn btn-primary" id="fms">حفظ</button></div></div>';
  modalRoot.querySelectorAll("[data-mc]").forEach(b => b.onclick = closeModals);
  let sel = obj.color;
  $$(".color-swatch").forEach(b => b.onclick = () => { $$(".color-swatch").forEach(x => x.classList.remove('active')); b.classList.add('active'); sel = b.dataset.c; });
  document.getElementById('fms').onclick = async () => {
    const name = document.getElementById('fmn').value.trim();
    if (!name) { toast('اسم المجلد مطلوب'); return; }
    try {
      if (edit) { await pbClient.from('folders').update({ name, color: sel, updated_at: nowISO() }).eq('id', edit.id).eq('user_id', state.user.id); toast('تم التعديل'); }
      else { await pbClient.from('folders').insert({ name, color: sel, user_id: state.user.id, created_at: nowISO() }); toast('تم الإضافة'); }
      closeModals(); await loadData(); render();
    } catch (err) { toast('فشل الحفظ'); }
  };
}

async function openResultModal() {
  if (!modalRoot || !pbClient || !state.user) return;
  const opts = '<option value="">بدون ربط</option>' + state.data.prompts.map(p => '<option value="' + p.id + '">' + escapeHtml(p.title) + '</option>').join('');
  modalRoot.innerHTML = '<div class="modal-backdrop" data-mc></div><div class="modal"><div class="modal-head"><div><h3>حفظ نتيجة ناجحة</h3></div><button class="icon-btn" data-mc><svg class="icon"><use href="#i-x"></use></svg></button></div><div class="modal-body"><div class="field-group"><label class="field-label">عنوان النتيجة</label><input class="field-input" id="rmt"></div><div class="field-group"><label class="field-label">يرتبط بالبرومبت</label><select class="filter-select" id="rmp">' + opts + '</select></div><div class="field-group"><label class="field-label">محتوى النتيجة</label><textarea class="field-textarea" id="rmx"></textarea></div><div class="field-group"><label class="field-label">المنصة</label><select class="filter-select" id="rmpl">' + PLATFORMS.map(p => '<option>' + p.id + '</option>').join('') + '</select></div></div><div class="modal-foot"><button class="btn btn-secondary" data-mc>إلغاء</button><button class="btn btn-primary" id="rms">حفظ</button></div></div>';
  modalRoot.querySelectorAll("[data-mc]").forEach(b => b.onclick = closeModals);
  document.getElementById('rms').onclick = async () => {
    const title = document.getElementById('rmt').value.trim();
    const content = document.getElementById('rmx').value.trim();
    if (!title || !content) { toast('العنوان والمحتوى مطلوبان'); return; }
    try {
      await pbClient.from('results').insert({ title, content, prompt_id: document.getElementById('rmp').value || null, platform: document.getElementById('rmpl').value, user_id: state.user.id, created_at: nowISO() });
      closeModals(); await loadData(); render(); toast('تم الحفظ');
    } catch (err) { toast('فشل الحفظ'); }
  };
}

/* ===================== Bootstrap ===================== */
document.addEventListener('DOMContentLoaded', () => {
  console.log('[PB] DOM loaded');
  getElements();
  bindAuthForm();
  initTheme();
  setAuthMode('login');
  if (authScreen) authScreen.hidden = false;
  if (appEl) appEl.hidden = true;
  if (!initPb()) return;
  setupAuth();
  console.log('[PB] Ready');
});
