/*
  Prompt Bank - بنك البرومبتات
  Local-only SaaS (LocalStorage/IndexedDB-lite via localStorage). Arabic RTL. Light/Dark. Linear x Notion.
*/

const STORAGE_KEYS = {
  users: "promptbank.users.v1",
  session: "promptbank.session.v1",
  data: "promptbank.data.v1", // per-user blob
  theme: "promptbank.theme.v1"
};

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

const state = {
  user: null,
  data: {
    folders: [],
    prompts: [],
    results: []
  },
  view: "dashboard",
  filters: {
    platform: "all",
    folder: "all",
    query: "",
    onlyPinned: false
  },
  editing: null
};

function uid(prefix = "id") {
  return prefix + "_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function nowISO() {
  return new Date().toISOString();
}

function getUsers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.users);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveUsers(users) {
  localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users));
}

function getSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.session);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(s) {
  if (s) localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(s));
  else localStorage.removeItem(STORAGE_KEYS.session);
}

function dataKey(uid) {
  return STORAGE_KEYS.data + "." + uid;
}

function loadData(uid) {
  try {
    const raw = localStorage.getItem(dataKey(uid));
    if (!raw) {
      const def = { folders: [], prompts: [], results: [] };
      localStorage.setItem(dataKey(uid), JSON.stringify(def));
      return structuredClone(def);
    }
    const d = JSON.parse(raw);
    if (!d.folders) d.folders = [];
    if (!d.prompts) d.prompts = [];
    if (!d.results) d.results = [];
    return d;
  } catch {
    const def = { folders: [], prompts: [], results: [] };
    return def;
  }
}

function saveData() {
  if (!state.user) return;
  localStorage.setItem(dataKey(state.user.id), JSON.stringify(state.data));
}

// Theme
function applyTheme(t) {
  const root = document.documentElement;
  if (t === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  try {
    localStorage.setItem(STORAGE_KEYS.theme, t);
  } catch {}
  $$("[data-theme-toggle]").forEach(btn => {
    btn.innerHTML = root.classList.contains("dark")
      ? '<svg class="icon"><use href="#i-sun"></use></svg>'
      : '<svg class="icon"><use href="#i-moon"></use></svg>';
    btn.setAttribute("aria-label", root.classList.contains("dark") ? "تبديل للوضع النهاري" : "تبديل للوضع الليلي");
  });
}

function initTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.theme);
    if (saved) applyTheme(saved);
    else applyTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  } catch {
    applyTheme("light");
  }
}

// Auth UI
const authScreen = $("#authScreen");
const appEl = $("#app");
const authForm = $("#authForm");
const authTabs = $$("[data-action='auth-tab']");
const authHeading = $("#authHeading");
const authSub = $("#authSub");
const authNameGroup = $("#authNameGroup");
const authName = $("#authName");
const authEmail = $("#authEmail");
const authPassword = $("#authPassword");
const authSubmitLabel = $("#authSubmitLabel");
const authSpinner = $("#authSpinner");
const authError = $("#authError");
const authErrorText = $("#authErrorText");
const authTerms = $("#authTerms");
const authSwitch = $("#authSwitch");

let authMode = "login"; // login | register

function setAuthMode(mode) {
  authMode = mode;
  authTabs.forEach(b => {
    const active = b.dataset.mode === mode;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  });
  if (mode === "login") {
    authHeading.textContent = "مرحباً بعودتك";
    authSub.textContent = "سجّل الدخول لتفتح بنك برومبتاتك الذهبية.";
    authNameGroup.hidden = true;
    authName.required = false;
    authSubmitLabel.textContent = "تسجيل الدخول";
    authTerms.hidden = true;
    authSwitch.innerHTML = 'ليس لديك بنك بعد؟ <button type="button" data-action="auth-tab" data-mode="register">أنشئ حسابك المجاني</button>';
    authPassword.setAttribute("autocomplete", "current-password");
  } else {
    authHeading.textContent = "أنشئ بنكك الخاص";
    authSub.textContent = "مساحتك محلية بالكامل. فقط لك.";
    authNameGroup.hidden = false;
    authName.required = true;
    authSubmitLabel.textContent = "إنشاء الحساب";
    authTerms.hidden = false;
    authSwitch.innerHTML = 'لديك حساب بالفعل؟ <button type="button" data-action="auth-tab" data-mode="login">سجّل الدخول</button>';
    authPassword.setAttribute("autocomplete", "new-password");
  }
  hideAuthError();
}

$$("[data-action='auth-tab']").forEach(btn => {
  btn.addEventListener("click", () => setAuthMode(btn.dataset.mode));
});

$$("[data-action='toggle-password']").forEach(btn => {
  btn.addEventListener("click", () => {
    const type = authPassword.type === "password" ? "text" : "password";
    authPassword.type = type;
    btn.innerHTML = type === "password"
      ? '<svg class="icon"><use href="#i-eye"></use></svg>'
      : '<svg class="icon"><use href="#i-eye-off"></use></svg>';
  });
});

function showAuthError(msg) {
  authErrorText.textContent = msg;
  authError.hidden = false;
}

function hideAuthError() {
  authError.hidden = true;
  authErrorText.textContent = "";
}

authForm.addEventListener("submit", (e) => {
  e.preventDefault();
  hideAuthError();
  const email = authEmail.value.trim().toLowerCase();
  const pass = authPassword.value;
  const name = authName.value.trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showAuthError("يرجى إدخال بريد إلكتروني صحيح.");
    authEmail.focus();
    return;
  }
  if (pass.length < 8) {
    showAuthError("كلمة المرور يجب أن تكون ٨ أحرف على الأقل.");
    authPassword.focus();
    return;
  }

  const users = getUsers();
  if (authMode === "register") {
    if (!name) {
      showAuthError("يرجى إدخال الاسم.");
      authName.focus();
      return;
    }
    if (users.some(u => u.email === email)) {
      showAuthError("هذا البريد مسجّل بالفعل. جرّب تسجيل الدخول.");
      return;
    }
    const user = { id: uid("user"), name, email, passHash: btoa(pass), createdAt: nowISO() };
    users.push(user);
    saveUsers(users);
    doLogin(user);
    return;
  }

  const user = users.find(u => u.email === email && u.passHash === btoa(pass));
  if (!user) {
    showAuthError("بيانات الدخول غير صحيحة.");
    return;
  }
  doLogin(user);
});

$$("[data-action='demo-login']").forEach(btn => {
  btn.addEventListener("click", () => {
    const users = getUsers();
    let demo = users.find(u => u.email === "demo@promptbank.app");
    if (!demo) {
      demo = { id: uid("user"), name: "مستخدم تجريبي", email: "demo@promptbank.app", passHash: btoa("demodemo"), createdAt: nowISO() };
      users.push(demo);
      saveUsers(users);
      const d = loadData(demo.id);
      // seed minimal
      const f1 = { id: uid("folder"), name: "كتابة المحتوى", color: "#7c5cff", createdAt: nowISO() };
      d.folders.push(f1);
      d.prompts.push({
        id: uid("p"), title: "محرر المحتوى الصارم", text: "أنت محرر محتوى عربي محترف، لديك حساسية عالية تجاه الأسلوب والوضوح والدقة. راجع النص التالي وقدم ملاحظات عملية وقصيرة، مع اقتراحات قابلة للتطبيق.", platform: "Claude", tags: ["تحرير", "كتابة"], folderId: f1.id, pinned: true, uses: 47, rating: 5, createdAt: nowISO(), updatedAt: nowISO()
      });
      d.prompts.push({
        id: uid("p"), title: "منشئ وصف منتجات", text: "اكتب وصف منتج بالعربية بناءً على المواصفات التالية. ركّز على الفائدة لا المزايا، واستخدم نبرة طبيعية مناسبة للتسويق.", platform: "ChatGPT", tags: ["تسويق", "منتجات"], folderId: f1.id, pinned: false, uses: 24, rating: 4, createdAt: nowISO(), updatedAt: nowISO()
      });
      d.prompts.push({
        id: uid("p"), title: "برومبت صورة سينمائي", text: "صوّر لقطة سينمائية واقعية، إضاءة دراماتيكية، عدسة 35mm، عمق مجال ضيّق، ألوان طبيعية دافئة، بدون نص أو شعار.", platform: "Midjourney", tags: ["صور", "سينمائي"], folderId: null, pinned: false, uses: 16, rating: 5, createdAt: nowISO(), updatedAt: nowISO()
      });
      d.results.push({ id: uid("r"), promptId: d.prompts[0].id, title: "نتيجة محرر المحتوى", content: "تم التحسين: أزل التكرار، واستخدم جمل أقصر، وأضف انتقالات سلسة بين الفقرات.", platform: "Claude", createdAt: nowISO() });
      localStorage.setItem(dataKey(demo.id), JSON.stringify(d));
    }
    doLogin(demo);
  });
});

function doLogin(user) {
  state.user = user;
  state.data = loadData(user.id);
  saveSession({ userId: user.id });
  authScreen.hidden = true;
  appEl.hidden = false;
  initApp();
}

// App shell
const sidebar = $("#sidebar");
const sidebarBackdrop = $("#sidebarBackdrop");
const viewRoot = $("#viewRoot");
const topbarEyebrow = $("#topbarEyebrow");
const topbarTitle = $("#topbarTitle");
const globalSearch = $("#globalSearch");
const navPromptCount = $("#navPromptCount");
const navResultCount = $("#navResultCount");
const sidebarFolders = $("#sidebarFolders");
const workspaceName = $("#workspaceName");
const workspaceInitial = $("#workspaceInitial");
const sidebarAvatar = $("#sidebarAvatar");
const sidebarUserName = $("#sidebarUserName");
const sidebarUserEmail = $("#sidebarUserEmail");

$$("[data-action='open-sidebar']").forEach(b => b.addEventListener("click", () => { sidebar.classList.add("open"); sidebarBackdrop.classList.add("active"); }));
$$("[data-action='close-sidebar']").forEach(b => b.addEventListener("click", () => { sidebar.classList.remove("open"); sidebarBackdrop.classList.remove("active"); }));
$$("[data-action='toggle-theme']").forEach(b => b.addEventListener("click", () => applyTheme(document.documentElement.classList.contains("dark") ? "light" : "dark")));
$$("[data-action='logout']").forEach(b => b.addEventListener("click", () => { saveSession(null); location.reload(); }));
$$("[data-action='nav']").forEach(b => b.addEventListener("click", () => { setView(b.dataset.view); sidebar.classList.remove("open"); sidebarBackdrop.classList.remove("active"); }));
$$("[data-action='new-prompt']").forEach(b => b.addEventListener("click", () => openPromptModal()));
$$("[data-action='new-folder']").forEach(b => b.addEventListener("click", () => openFolderModal()));

globalSearch.addEventListener("input", () => { state.filters.query = globalSearch.value; if (state.view !== "prompts") setView("prompts"); else render(); });

function initApp() {
  const u = state.user;
  const first = (u.name || u.email).trim()[0] || "ب";
  workspaceName.textContent = (u.name ? "بنك " + u.name.split(" ")[0] : "بنكي الشخصي");
  workspaceInitial.textContent = first;
  sidebarAvatar.textContent = first;
  sidebarUserName.textContent = u.name || "مستخدم";
  sidebarUserEmail.textContent = u.email;
  setView("dashboard");
}

function setView(v) {
  state.view = v;
  $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  if (v === "dashboard") { topbarEyebrow.textContent = "مساحة العمل"; topbarTitle.textContent = "نظرة عامة"; }
  if (v === "prompts") { topbarEyebrow.textContent = "المكتبة"; topbarTitle.textContent = "مكتبة البرومبتات"; }
  if (v === "folders") { topbarEyebrow.textContent = "التنظيم"; topbarTitle.textContent = "المجلدات"; }
  if (v === "results") { topbarEyebrow.textContent = "الأرشيف"; topbarTitle.textContent = "النتائج الناجحة"; }
  render();
}

function render() {
  renderSidebar();
  if (state.view === "dashboard") renderDashboard();
  else if (state.view === "prompts") renderPrompts();
  else if (state.view === "folders") renderFolders();
  else if (state.view === "results") renderResults();
}

function renderSidebar() {
  navPromptCount.textContent = state.data.prompts.length;
  navResultCount.textContent = state.data.results.length;
  sidebarFolders.innerHTML = "";
  const all = document.createElement("button");
  all.className = "folder-nav-item";
  all.innerHTML = '<span class="folder-dot" style="background:var(--border-strong)"></span><span class="folder-name">كل البرومبتات</span><span class="folder-count">' + state.data.prompts.length + '</span>';
  all.addEventListener("click", () => { state.filters.folder = "all"; setView("prompts"); });
  sidebarFolders.appendChild(all);
  state.data.folders.slice().sort((a,b)=>(a.name.localeCompare(b.name))).forEach(f => {
    const c = state.data.prompts.filter(p=>p.folderId===f.id).length;
    const btn = document.createElement("button");
    btn.className = "folder-nav-item";
    btn.innerHTML = '<span class="folder-dot" style="background:' + f.color + '"></span><span class="folder-name">' + escapeHtml(f.name) + '</span><span class="folder-count">' + c + '</span>';
    btn.addEventListener("click", () => { state.filters.folder = f.id; setView("prompts"); });
    sidebarFolders.appendChild(btn);
  });
}

function escapeHtml(s="") {
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

function platformMeta(id) {
  return PLATFORMS.find(p=>p.id===id) || {id, color:"#8b8d98"};
}

function renderDashboard() {
  const prompts = state.data.prompts;
  const results = state.data.results;
  const total = prompts.length;
  const pinned = prompts.filter(p=>p.pinned).length;
  const uses = prompts.reduce((a,p)=>a+(p.uses||0),0);
  // top platform
  const countByP = {};
  prompts.forEach(p=>{ countByP[p.platform]=(countByP[p.platform]||0)+1; });
  let topP = "-";
  if (total) { topP = Object.entries(countByP).sort((a,b)=>b[1]-a[1])[0][0]; }
  // top prompt
  let topPrompt = null;
  if (prompts.length) topPrompt = prompts.slice().sort((a,b)=>(b.uses||0)-(a.uses||0))[0];

  viewRoot.innerHTML = '<div class="view">' +
    '<section class="hero"><div class="hero-grid"></div><div class="hero-content"><span class="hero-kicker"><span class="eyebrow-dot"></span> مساحتك محلية بالكامل</span><h1 class="hero-title">نظّم برومبتاتك <span>الذهبية</span></h1><p class="hero-sub">احفظ أفضل برومبتاتك لكل منصات الذكاء الاصطناعي، قيّمها، ثبّتها، وارجع لنتائجك الناجحة بسرعة.</p><div class="hero-actions"><button class="btn btn-primary" data-action="new-prompt"><svg class="icon"><use href="#i-plus"></use></svg><span>إضافة برومبت جديد</span></button><button class="btn btn-secondary" data-action="nav" data-view="prompts"><svg class="icon"><use href="#i-library"></use></svg><span>فتح المكتبة</span></button></div></div></section>' +
    '<section class="stats-grid">' +
    statCard("إجمالي البرومبتات", total, "i-library", "جاهز للاستخدام") +
    statCard("مثبّتة", pinned, "i-pin", "في مقدمة المكتبة") +
    statCard("إجمالي الاستخدام", uses, "i-trending", "عند كل نسخة") +
    statCard("النتائج الناجحة", results.length, "i-award", "أرشيفك الشخصي") +
    '</section>' +
    '<section class="split-grid"><div class="panel"><div class="panel-head"><div><h3>توزيع حسب المنصة</h3><p>أكثر المنصات استخداماً في بنكك</p></div></div><div class="panel-body"><div class="bar-chart">' + renderBarChart(countByP) + '</div></div></div><div class="panel"><div class="panel-head"><div><h3>أكثر برومبت استخداماً</h3><p>يعكس أكثر ما تحتاجه فعلاً</p></div></div><div class="panel-body">' + (topPrompt ? topPromptItem(topPrompt) : '<div style="color:var(--text-tertiary);text-align:center;padding:18px">لا يوجد برومبتات بعد</div>') + '</div></div></section>' +
    '</div>';

  viewRoot.querySelectorAll("[data-action='new-prompt']").forEach(b=>b.addEventListener("click",openPromptModal));
  viewRoot.querySelectorAll("[data-action='nav']").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.view)));
}

function statCard(label,val,icon,foot){
  return '<article class="stat-card"><div class="stat-head"><span class="stat-label">'+escapeHtml(label)+'</span><span class="stat-icon"><svg class="icon"><use href="#'+icon+'"></use></svg></span></div><div class="stat-value">'+val+'</div><div class="stat-foot">'+escapeHtml(foot)+'</div></article>';
}

function renderBarChart(map){
  const entries = Object.entries(map).sort((a,b)=>b[1]-a[1]);
  if(entries.length===0) return '<div style="color:var(--text-tertiary);text-align:center">أضف أول برومبت لعرض الرسم البياني</div>';
  const max = Math.max(1,...entries.map(e=>e[1]));
  return entries.map(([id,c])=>{
    const m = platformMeta(id);
    const pct = Math.round((c/max)*100);
    return '<div class="bar-row"><div class="bar-label"><span class="list-dot" style="background:'+m.color+'"></span><span>'+escapeHtml(id)+'</span></div><div class="bar-track"><div class="bar-fill" style="width:'+pct+'%"></div></div><div class="bar-value">'+c+'</div></div>';
  }).join("");
}

function topPromptItem(p){
  const m = platformMeta(p.platform);
  return '<div class="list-item"><span class="list-dot" style="background:'+m.color+'"></span><div class="list-copy"><strong>'+escapeHtml(p.title)+'</strong><span>'+escapeHtml(m.id)+' • '+(p.uses||0)+' استخداماً</span></div><button class="icon-btn" data-action="copy-prompt" data-id="'+p.id+'" title="نسخ"><svg class="icon"><use href="#i-copy"></use></svg></button></div>';
}

function renderPrompts(){
  let list = state.data.prompts.slice();
  if(state.filters.folder!=="all") list = list.filter(p=>p.folderId===state.filters.folder);
  if(state.filters.platform!=="all") list = list.filter(p=>p.platform===state.filters.platform);
  if(state.filters.onlyPinned) list = list.filter(p=>p.pinned);
  const q = state.filters.query.trim().toLowerCase();
  if(q){ list = list.filter(p=>(p.title+" "+p.text+" "+(p.tags||[]).join(" ")).toLowerCase().includes(q)); }
  list.sort((a,b)=> (b.pinned?1:0)-(a.pinned?1:0) || (b.uses||0)-(a.uses||0) || b.updatedAt.localeCompare(a.updatedAt));

  const folderOpts = '<option value="all">كل المجلدات</option>' + state.data.folders.map(f=>'<option value="'+f.id+'" '+(state.filters.folder===f.id?'selected':'')+'>'+escapeHtml(f.name)+'</option>').join("");
  const platOpts = '<option value="all">كل المنصات</option>' + PLATFORMS.map(p=>'<option value="'+p.id+'" '+(state.filters.platform===p.id?'selected':'')+'>'+p.id+'</option>').join("");

  viewRoot.innerHTML = '<div class="view"><div class="toolbar"><div class="toolbar-group"><div class="segment"><button class="segment-btn '+(!state.filters.onlyPinned?'active':'')+'" data-action="filter-pinned" data-v="false">الكل</button><button class="segment-btn '+(state.filters.onlyPinned?'active':'')+'" data-action="filter-pinned" data-v="true">المثبتة فقط</button></div><select class="filter-select" data-action="filter-folder">'+folderOpts+'</select><select class="filter-select" data-action="filter-platform">'+platOpts+'</select></div><div class="toolbar-group"><div class="search-inline"><svg class="icon"><use href="#i-search"></use></svg><input id="inlineSearch" type="search" placeholder="بحث فوري..." value="'+escapeHtml(state.filters.query)+'" /></div><button class="btn btn-primary" data-action="new-prompt"><svg class="icon"><use href="#i-plus"></use></svg><span>برومبت جديد</span></button></div></div>' + (list.length?'<div class="card-grid">'+list.map(p=>promptCard(p)).join('')+'</div>':'<div class="panel"><div class="panel-body" style="text-align:center;padding:32px;color:var(--text-tertiary)">لا توجد نتائج مطابقة</div></div>') + '</div>';

  $("#inlineSearch").addEventListener("input",e=>{state.filters.query=e.target.value; render();});
  viewRoot.querySelectorAll("[data-action='filter-pinned']").forEach(b=>b.addEventListener("click",()=>{state.filters.onlyPinned = b.dataset.v==='true'; render();}));
  viewRoot.querySelector('[data-action="filter-folder"]').addEventListener("change",e=>{state.filters.folder=e.target.value; render();});
  viewRoot.querySelector('[data-action="filter-platform"]').addEventListener("change",e=>{state.filters.platform=e.target.value; render();});
  viewRoot.querySelectorAll("[data-action='new-prompt']").forEach(b=>b.addEventListener("click",openPromptModal));
  wirePromptCards();
}

function promptCard(p){
  const m = platformMeta(p.platform);
  const folder = state.data.folders.find(f=>f.id===p.folderId);
  const tags = (p.tags||[]).slice(0,4).map(t=>'<span>'+escapeHtml(t)+'</span>').join('');
  const stars = Array(5).fill(0).map((_,i)=>'<button class="rating-btn '+(i<p.rating?'active':'')+'" data-action="rate" data-id="'+p.id+'" data-v="'+(i+1)+'"><svg class="icon"><use href="#i-star"></use></svg></button>').join('');
  return '<article class="prompt-card '+(p.pinned?'pinned':'')+'"><div class="prompt-card-head"><div style="display:flex;flex-direction:column;gap:8px"><span class="prompt-platform"><span class="list-dot" style="background:'+m.color+'"></span>'+escapeHtml(m.id)+'</span>'+(folder?'<span style="display:flex;align-items:center;gap:6px;color:var(--text-tertiary);font-size:12px"><svg class="icon"><use href="#i-folder"></use></svg>'+escapeHtml(folder.name)+'</span>':'')+'</div><div class="prompt-actions"><button class="icon-btn" data-action="pin" data-id="'+p.id+'" title="'+(p.pinned?'إلغاء التثبيت':'تثبيت')+'"><svg class="icon"><use href="#i-pin"></use></svg></button><button class="icon-btn" data-action="edit-prompt" data-id="'+p.id+'" title="تعديل"><svg class="icon"><use href="#i-pencil"></use></svg></button><button class="icon-btn" data-action="delete-prompt" data-id="'+p.id+'" title="حذف"><svg class="icon"><use href="#i-trash"></use></svg></button></div></div><div class="prompt-body"><h3 class="prompt-title">'+escapeHtml(p.title)+'</h3><p class="prompt-preview">'+escapeHtml(p.text)+'</p><div class="prompt-tags">'+tags+( (p.tags||[]).length>4?'<span>+'+((p.tags||[]).length-4)+'</span>':'')+'</div></div><div class="prompt-foot"><div class="prompt-meta"><span><svg class="icon"><use href="#i-clock"></use></svg> '+(p.uses||0)+' استخدام</span><div class="rating">'+stars+'</div></div><button class="copy-btn" data-action="copy-prompt" data-id="'+p.id+'"><svg class="icon"><use href="#i-copy"></use></svg><span>نسخ</span></button></div></article>';
}

function wirePromptCards(){
  viewRoot.querySelectorAll("[data-action='pin']").forEach(b=>b.addEventListener("click",()=>{const p=state.data.prompts.find(x=>x.id===b.dataset.id); if(!p)return; p.pinned=!p.pinned; p.updatedAt=nowISO(); saveData(); toast(p.pinned?'تم التثبيت':'تم إلغاء التثبيت'); render();}));
  viewRoot.querySelectorAll("[data-action='edit-prompt']").forEach(b=>b.addEventListener("click",()=>openPromptModal(b.dataset.id)));
  viewRoot.querySelectorAll("[data-action='delete-prompt']").forEach(b=>b.addEventListener("click",()=>{if(confirm('حذف هذا البرومبت؟ لا يمكن التراجع.')){ state.data.prompts = state.data.prompts.filter(x=>x.id!==b.dataset.id); saveData(); toast('تم الحذف'); render(); }}));
  viewRoot.querySelectorAll("[data-action='rate']").forEach(b=>b.addEventListener("click",()=>{const p=state.data.prompts.find(x=>x.id===b.dataset.id); if(!p)return; p.rating=Number(b.dataset.v); p.updatedAt=nowISO(); saveData(); render();}));
  viewRoot.querySelectorAll("[data-action='copy-prompt']").forEach(b=>b.addEventListener("click",async ()=>{const p=state.data.prompts.find(x=>x.id===b.dataset.id); if(!p)return; try{ await navigator.clipboard.writeText(p.text); p.uses=(p.uses||0)+1; p.updatedAt=nowISO(); saveData(); toast('تم النسخ وزيادة العداد'); render(); }catch{ toast('تعذّر النسخ'); }}));
}

function renderFolders(){
  viewRoot.innerHTML = '<div class="view"><div class="toolbar"><div class="toolbar-group"><h3 style="margin:0">المجلدات</h3></div><button class="btn btn-primary" data-action="new-folder"><svg class="icon"><use href="#i-folder-plus"></use></svg><span>مجلد جديد</span></button></div><div class="card-grid">'+(state.data.folders.length?state.data.folders.map(f=>folderCard(f)).join(''):'<div class="panel"><div class="panel-body" style="text-align:center;padding:32px;color:var(--text-tertiary)">لا توجد مجلدات بعد</div></div>')+'</div></div>';
  viewRoot.querySelectorAll("[data-action='new-folder']").forEach(b=>b.addEventListener("click",openFolderModal));
  viewRoot.querySelectorAll("[data-action='open-folder']").forEach(b=>b.addEventListener("click",()=>{state.filters.folder=b.dataset.id; setView("prompts");}));
  viewRoot.querySelectorAll("[data-action='edit-folder']").forEach(b=>b.addEventListener("click",()=>openFolderModal(b.dataset.id)));
  viewRoot.querySelectorAll("[data-action='delete-folder']").forEach(b=>b.addEventListener("click",()=>{if(confirm('حذف المجلد؟ ستبقى البرومبتات بدون مجلد.')){ state.data.folders=state.data.folders.filter(x=>x.id!==b.dataset.id); state.data.prompts.forEach(p=>{if(p.folderId===b.dataset.id)p.folderId=null;}); saveData(); toast('تم الحذف'); render(); }}));
}

function folderCard(f){
  const c = state.data.prompts.filter(p=>p.folderId===f.id).length;
  return '<article class="prompt-card"><div class="prompt-card-head"><div style="display:flex;align-items:center;gap:10px"><span style="width:10px;height:10px;border-radius:50%;background:'+f.color+'"></span><h3 class="prompt-title" style="font-size:17px">'+escapeHtml(f.name)+'</h3></div><div class="prompt-actions"><button class="icon-btn" data-action="edit-folder" data-id="'+f.id+'"><svg class="icon"><use href="#i-pencil"></use></svg></button><button class="icon-btn" data-action="delete-folder" data-id="'+f.id+'"><svg class="icon"><use href="#i-trash"></use></svg></button></div></div><div class="prompt-body"><p style="color:var(--text-tertiary)">'+c+' برومبت</p></div><div class="prompt-foot"><button class="btn btn-secondary" data-action="open-folder" data-id="'+f.id+'">عرض البرومبتات</button></div></article>';
}

function renderResults(){
  let list = state.data.results.slice();
  list.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  viewRoot.innerHTML = '<div class="view"><div class="toolbar"><div class="toolbar-group"><h3 style="margin:0">النتائج الناجحة</h3></div><button class="btn btn-primary" data-action="add-result"><svg class="icon"><use href="#i-plus"></use></svg><span>حفظ نتيجة جديدة</span></button></div>'+(list.length?'<div class="card-grid">'+list.map(r=>resultCard(r)).join('')+'</div>':'<div class="panel"><div class="panel-body" style="text-align:center;padding:32px;color:var(--text-tertiary)">احفظ نتيجة ناجحة بعد نسخ برومبتك</div></div>')+'</div>';
  viewRoot.querySelectorAll("[data-action='add-result']").forEach(b=>b.addEventListener("click",()=>openResultModal()));
  viewRoot.querySelectorAll("[data-action='del-result']").forEach(b=>b.addEventListener("click",()=>{if(confirm('حذف النتيجة؟')){ state.data.results=state.data.results.filter(x=>x.id!==b.dataset.id); saveData(); toast('تم الحذف'); render(); }}));
}

function resultCard(r){
  const p = state.data.prompts.find(x=>x.id===r.promptId);
  const m = platformMeta(r.platform|| (p?p.platform:''));
  return '<article class="prompt-card"><div class="prompt-card-head"><div style="display:flex;flex-direction:column;gap:6px"><span class="prompt-platform"><span class="list-dot" style="background:'+m.color+'"></span>'+escapeHtml(m.id)+'</span><span style="font-size:12px;color:var(--text-tertiary)">'+(p?escapeHtml(p.title):'برومبت محذوف')+'</span></div><div class="prompt-actions"><button class="icon-btn" data-action="del-result" data-id="'+r.id+'"><svg class="icon"><use href="#i-trash"></use></svg></button></div></div><div class="prompt-body"><h3 class="prompt-title">'+escapeHtml(r.title||'نتيجة')+'</h3><p class="prompt-preview">'+escapeHtml(r.content||'')+'</p></div><div class="prompt-foot"><span style="color:var(--text-tertiary);font-size:12px">'+new Date(r.createdAt).toLocaleDateString('ar-SA')+'</span></div></article>';
}

// Modals
const drawerRoot = $("#drawerRoot");
const modalRoot = $("#modalRoot");

function openPromptModal(id=null){
  const edit = id ? state.data.prompts.find(p=>p.id===id) : null;
  state.editing = edit ? JSON.parse(JSON.stringify(edit)) : {id:uid("p"), title:"", text:"", platform:"Claude", tags:[], folderId:null, pinned:false, uses:0, rating:0, createdAt:nowISO(), updatedAt:nowISO()};
  const folders = '<option value="">بدون مجلد</option>' + state.data.folders.map(f=>'<option value="'+escapeAttr(f.id)+'" '+(state.editing.folderId===f.id?'selected':'')+'>'+escapeHtml(f.name)+'</option>').join("");
  const plats = PLATFORMS.map(p=>'<option value="'+escapeAttr(p.id)+'" '+(state.editing.platform===p.id?'selected':'')+'>'+escapeHtml(p.id)+'</option>').join("");
  const tagsStr = (state.editing.tags||[]).join(', ');
  modalRoot.innerHTML = '<div class="modal-backdrop" data-action="close-modal"></div><div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><div><h3>'+(edit?'تعديل البرومبت':'برومبت جديد')+'</h3><p>حفظه في مكتبتك الخاصة</p></div><button class="icon-btn" type="button" data-action="close-modal" aria-label="إغلاق"><svg class="icon"><use href="#i-x"></use></svg></button></div><div class="modal-body"><div class="field-group"><label class="field-label" for="pmTitle">العنوان</label><input class="field-input" id="pmTitle" value="'+escapeAttr(state.editing.title)+'" placeholder="مثال: كاتب إعلانات احترافي" /></div><div class="field-group"><label class="field-label" for="pmText">نص البرومبت الكامل</label><textarea class="field-textarea" id="pmText" placeholder="اكتب البرومبت هنا...">'+escapeHtml(state.editing.text)+'</textarea></div><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px"><div class="field-group"><label class="field-label" for="pmPlat">المنصة</label><select class="filter-select" id="pmPlat" style="width:100%">'+plats+'</select></div><div class="field-group"><label class="field-label" for="pmFolder">المجلد</label><select class="filter-select" id="pmFolder" style="width:100%">'+folders+'</select></div></div><div class="field-group"><label class="field-label" for="pmTags">الوسوم (مفصولة بفاصلة)</label><input class="field-input" id="pmTags" value="'+escapeAttr(tagsStr)+'" placeholder="كتابة, تسويق, SEO" /></div></div><div class="modal-foot"><button class="btn btn-secondary" type="button" data-action="close-modal">إلغاء</button><button class="btn btn-primary" type="button" id="pmSave">حفظ</button></div></div>';
  modalRoot.querySelectorAll("[data-action='close-modal']").forEach(b=>b.addEventListener("click",closeModals));
  $("#pmSave").addEventListener("click",()=>{
    const p = state.editing;
    p.title = ($("#pmTitle").value||"").trim();
    p.text = $("#pmText").value||"";
    p.platform = $("#pmPlat").value;
    p.folderId = $("#pmFolder").value||null;
    p.tags = ($("#pmTags").value||"").split(',').map(x=>x.trim()).filter(Boolean);
    p.updatedAt = nowISO();
    if(!p.title || !p.text){ toast('العنوان ونص البرومبت مطلوبان'); return; }
    if(!edit){ 
      if(!p.createdAt) p.createdAt = nowISO();
      state.data.prompts.push(p); 
    } else {
      const idx = state.data.prompts.findIndex(x=>x.id===p.id);
      if(idx>=0) {
        state.data.prompts[idx] = p;
      } else {
        state.data.prompts.push(p);
      }
    }
    saveData();
    closeModals();
    toast('تم الحفظ');
    render();
  });
  setTimeout(()=>{$("#pmTitle").focus();}, 50);
}

function openFolderModal(id=null){
  const edit = id? state.data.folders.find(f=>f.id===id): null;
  const obj = edit? JSON.parse(JSON.stringify(edit)): {id:uid("folder"), name:"", color:"#7c5cff", createdAt:nowISO()};
  const colors = ["#7c5cff","#4c8df6","#10a37f","#f59e0b","#ef4444","#1fb8ad","#8b8d98","#a38bff"];
  modalRoot.innerHTML = '<div class="modal-backdrop" data-action="close-modal"></div><div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><div><h3>'+(edit?'تعديل المجلد':'مجلد جديد')+'</h3></div><button class="icon-btn" type="button" data-action="close-modal" aria-label="إغلاق"><svg class="icon"><use href="#i-x"></use></svg></button></div><div class="modal-body"><div class="field-group"><label class="field-label" for="fmName">اسم المجلد</label><input class="field-input" id="fmName" value="'+escapeAttr(obj.name)+'" /></div><div class="field-group"><label class="field-label">اللون</label><div style="display:flex;flex-wrap:wrap;gap:8px">'+colors.map(c=>'<button type="button" class="color-swatch '+(obj.color===c?'active':'')+'" data-c="'+escapeAttr(c)+'" style="background:'+escapeAttr(c)+'"></button>').join('')+'</div></div></div><div class="modal-foot"><button class="btn btn-secondary" type="button" data-action="close-modal">إلغاء</button><button class="btn btn-primary" type="button" id="fmSave">حفظ</button></div></div>';
  modalRoot.querySelectorAll("[data-action='close-modal']").forEach(b=>b.addEventListener("click",closeModals));
  let sel = obj.color;
  modalRoot.querySelectorAll(".color-swatch").forEach(b=>b.addEventListener("click",()=>{modalRoot.querySelectorAll(".color-swatch").forEach(x=>x.classList.remove("active")); b.classList.add("active"); sel=b.dataset.c;}));
  $("#fmSave").addEventListener("click",()=>{
    const name = ($("#fmName").value||"").trim();
    if(!name){ toast('اسم المجلد مطلوب'); return; }
    obj.name=name; obj.color=sel;
    if(!edit){ state.data.folders.push(obj); } else {
      const idx = state.data.folders.findIndex(x=>x.id===obj.id);
      if(idx>=0) state.data.folders[idx]=obj; else state.data.folders.push(obj);
    }
    saveData(); closeModals(); toast('تم الحفظ'); render();
  });
  setTimeout(()=>{$("#fmName").focus();}, 50);
}

function openResultModal(){
  const opts = '<option value="">اختر برومبت (اختياري)</option>' + state.data.prompts.map(p=>'<option value="'+p.id+'">'+escapeHtml(p.title)+'</option>').join("");
  modalRoot.innerHTML = '<div class="modal-backdrop" data-action="close-modal"></div><div class="modal"><div class="modal-head"><div><h3>حفظ نتيجة ناجحة</h3></div><button class="icon-btn" data-action="close-modal"><svg class="icon"><use href="#i-x"></use></svg></button></div><div class="modal-body"><div class="field-group"><label class="field-label">عنوان النتيجة</label><input class="field-input" id="rmTitle" placeholder="مثال: مقال مدونة جاهز" /></div><div class="field-group"><label class="field-label">يرتبط بالبرومبت</label><select class="filter-select" id="rmPid" style="width:100%">'+opts+'</select></div><div class="field-group"><label class="field-label">محتوى النتيجة</label><textarea class="field-textarea" id="rmContent"></textarea></div><div class="field-group"><label class="field-label">المنصة</label><select class="filter-select" id="rmPlat" style="width:100%">'+PLATFORMS.map(p=>'<option>'+p.id+'</option>').join('')+'</select></div></div><div class="modal-foot"><button class="btn btn-secondary" data-action="close-modal">إلغاء</button><button class="btn btn-primary" id="rmSave">حفظ</button></div></div>';
  modalRoot.querySelectorAll("[data-action='close-modal']").forEach(b=>b.addEventListener("click",closeModals));
  $("#rmSave").addEventListener("click",()=>{
    const title = $("#rmTitle").value.trim();
    const content = $("#rmContent").value.trim();
    if(!title || !content){ toast('العنوان والمحتوى مطلوبان'); return; }
    const r = {id:uid("r"), title, content, promptId: $("#rmPid").value||null, platform: $("#rmPlat").value, createdAt:nowISO()};
    state.data.results.push(r);
    saveData(); closeModals(); toast('تم الحفظ'); render();
  });
}

function closeModals(){ modalRoot.innerHTML=""; }

document.addEventListener("keydown", (e)=>{
  if(e.key === "Escape"){ closeModals(); }
});

function escapeAttr(s=""){ return escapeHtml(s).replace(/"/g,'&quot;'); }

function toast(msg){
  const root = $("#toastRoot");
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = '<svg class="icon"><use href="#i-circle-check"></use></svg><span>'+escapeHtml(msg)+'</span>';
  root.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(6px)'; el.style.transition='all 200ms'; setTimeout(()=>el.remove(),200); }, 1800);
}

// Boot
function boot(){
  initTheme();
  setAuthMode("login");
  const sess = getSession();
  if(sess && sess.userId){
    const users = getUsers();
    const u = users.find(x=>x.id===sess.userId);
    if(u){ doLogin(u); return; }
  }
  authScreen.hidden = false;
  appEl.hidden = true;
}

boot();
