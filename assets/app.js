/*
  Prompt Bank - بنك البرومبتات
  Supabase Integration (Auth + DB + RLS) - LocalStorage replaced
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

const supabase = window.supabase.createClient(
  window.SUPABASE_CONFIG.url,
  window.SUPABASE_CONFIG.anonKey
);

const state = {
  user: null,
  profile: null,
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

function nowISO() {
  return new Date().toISOString();
}

function escapeHtml(s="") {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

function escapeAttr(s=""){ return escapeHtml(s).replace(/"/g,'&quot;'); }

function platformMeta(id) {
  return PLATFORMS.find(p=>p.id===id) || {id, color:"#8b8d98"};
}

function applyTheme(t) {
  const root = document.documentElement;
  if (t === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  try { localStorage.setItem("promptbank.theme.v1", t); } catch {}
  $$("[data-theme-toggle]").forEach(btn => {
    btn.innerHTML = root.classList.contains("dark")
      ? '<svg class="icon"><use href="#i-sun"></use></svg>'
      : '<svg class="icon"><use href="#i-moon"></use></svg>';
    btn.setAttribute("aria-label", root.classList.contains("dark") ? "تبديل للوضع النهاري" : "تبديل للوضع الليلي");
  });
}

function initTheme() {
  try {
    const saved = localStorage.getItem("promptbank.theme.v1");
    if (saved) applyTheme(saved);
    else applyTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  } catch { applyTheme("light"); }
}

function toast(msg){
  const root = $("#toastRoot");
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = '<svg class="icon"><use href="#i-circle-check"></use></svg><span>'+escapeHtml(msg)+'</span>';
  root.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(6px)'; el.style.transition='all 200ms'; setTimeout(()=>el.remove(),200); }, 1800);
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

let authMode = "login";

function setAuthMode(mode) {
  authMode = mode;
  authTabs.forEach(b => {
    const active = b.dataset.mode === mode;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  });
  if (mode === "login") {
    authHeading.textContent = "مرحباً بعودتك";
    authSub.textContent = "سجّل الدخول لفتح بنك برومبتاتك الآمن.";
    authNameGroup.hidden = true;
    authName.required = false;
    authSubmitLabel.textContent = "تسجيل الدخول";
    authTerms.hidden = true;
    authSwitch.innerHTML = 'ليس لديك حساب بعد؟ <button type="button" data-action="auth-tab" data-mode="register">أنشئ حسابك</button>';
    authPassword.setAttribute("autocomplete", "current-password");
  } else {
    authHeading.textContent = "أنشئ حسابك";
    authSub.textContent = "بياناتك محمية وآمنة مع Supabase.";
    authNameGroup.hidden = false;
    authName.required = true;
    authSubmitLabel.textContent = "إنشاء الحساب";
    authTerms.hidden = false;
    authSwitch.innerHTML = 'لديك حساب بالفعل؟ <button type="button" data-action="auth-tab" data-mode="login">سجّل الدخول</button>';
    authPassword.setAttribute("autocomplete", "new-password");
  }
  hideAuthError();
}

document.addEventListener("click", (e)=>{
  const b = e.target.closest("[data-action='auth-tab']");
  if(b){ setAuthMode(b.dataset.mode); return; }
  const tp = e.target.closest("[data-action='toggle-password']");
  if(tp){
    const type = authPassword.type === "password" ? "text" : "password";
    authPassword.type = type;
    tp.innerHTML = type === "password"
      ? '<svg class="icon"><use href="#i-eye"></use></svg>'
      : '<svg class="icon"><use href="#i-eye-off"></use></svg>';
  }
});

function showAuthError(msg){ authErrorText.textContent = msg; authError.hidden = false; }
function hideAuthError(){ authError.hidden = true; authErrorText.textContent = ""; }

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAuthError();
  const email = authEmail.value.trim().toLowerCase();
  const pass = authPassword.value;
  const name = authName.value.trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showAuthError("يرجى إدخال بريد إلكتروني صحيح."); authEmail.focus(); return; }
  if (pass.length < 8) { showAuthError("كلمة المرور يجب أن تكون ٨ أحرف على الأقل."); authPassword.focus(); return; }

  authSpinner.hidden = false;
  authSubmitLabel.textContent = authMode === "login" ? "جاري الدخول..." : "جاري الإنشاء...";

  try {
    if (authMode === "register") {
      if (!name) { showAuthError("يرجى إدخال الاسم."); authName.focus(); authSpinner.hidden=true; authSubmitLabel.textContent="إنشاء الحساب"; return; }
      const { data, error } = await supabase.auth.signUp({ email, password: pass, options: { data: { full_name: name } } });
      if (error) throw error;
      if (data.user) {
        await supabase.from('profiles').upsert({ id: data.user.id, full_name: name, email });
      }
      toast("تم إنشاء الحساب بنجاح. يمكنك تسجيل الدخول الآن.");
      setAuthMode("login");
      authEmail.value = email;
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      toast("تم تسجيل الدخول بنجاح");
    }
  } catch (err) {
    showAuthError(err.message || "حدث خطأ غير متوقع");
  } finally {
    authSpinner.hidden = true;
    authSubmitLabel.textContent = authMode === "login" ? "تسجيل الدخول" : "إنشاء الحساب";
  }
});

$$("[data-action='toggle-theme']").forEach(b => b.addEventListener("click", () => applyTheme(document.documentElement.classList.contains("dark") ? "light" : "dark")));

// Session
supabase.auth.onAuthStateChange(async (_event, session) => {
  if (session?.user) {
    state.user = session.user;
    await loadProfile();
    await loadAllData();
    authScreen.hidden = true;
    appEl.hidden = false;
    initApp();
  } else {
    state.user = null;
    state.profile = null;
    state.data = { folders: [], prompts: [], results: [] };
    authScreen.hidden = false;
    appEl.hidden = true;
  }
});

async function loadProfile(){
  try {
    const { data } = await supabase.from('profiles').select('*').eq('id', state.user.id).maybeSingle();
    if (data) {
      state.profile = data;
    } else {
      const name = state.user.user_metadata?.full_name || state.user.email.split('@')[0];
      await supabase.from('profiles').upsert({ id: state.user.id, email: state.user.email, full_name: name });
      const { data: d2 } = await supabase.from('profiles').select('*').eq('id', state.user.id).maybeSingle();
      state.profile = d2;
    }
  } catch (e) {
    state.profile = { full_name: state.user.user_metadata?.full_name || state.user.email.split('@')[0], email: state.user.email };
  }
}

async function loadAllData(){
  try {
    const [fRes, pRes, rRes] = await Promise.all([
      supabase.from('folders').select('*').order('created_at', { ascending: true }),
      supabase.from('prompts').select('*').order('updated_at', { ascending: false }),
      supabase.from('results').select('*').order('created_at', { ascending: false })
    ]);
    state.data.folders = fRes.data || [];
    state.data.prompts = pRes.data || [];
    state.data.results = rRes.data || [];
  } catch (e) {
    state.data = { folders: [], prompts: [], results: [] };
  }
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

document.addEventListener("click", (e)=>{
  const b = e.target.closest("[data-action]");
  if(!b) return;
  const act = b.dataset.action;
  if(act==="open-sidebar"){ sidebar.classList.add("open"); sidebarBackdrop.classList.add("active"); }
  if(act==="close-sidebar"){ sidebar.classList.remove("open"); sidebarBackdrop.classList.remove("active"); }
  if(act==="logout"){ supabase.auth.signOut().catch(()=>{}).finally(()=>{ location.reload(); }); }
  if(act==="nav"){ setView(b.dataset.view); sidebar.classList.remove("open"); sidebarBackdrop.classList.remove("active"); }
  if(act==="new-prompt"){ openPromptModal(); }
  if(act==="new-folder"){ openFolderModal(); }
});

globalSearch.addEventListener("input", () => { state.filters.query = globalSearch.value; if (state.view !== "prompts") setView("prompts"); else render(); });

function initApp() {
  const u = state.user;
  const name = state.profile?.full_name || u.user_metadata?.full_name || (u.email ? u.email.split('@')[0] : "مستخدم");
  const first = (name.trim()[0] || "ب").toUpperCase();
  workspaceName.textContent = "بنك " + (name.split(" ")[0] || name);
  workspaceInitial.textContent = first;
  sidebarAvatar.textContent = first;
  sidebarUserName.textContent = name;
  sidebarUserEmail.textContent = u.email || "";
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
    const c = state.data.prompts.filter(p=>p.folder_id===f.id).length;
    const btn = document.createElement("button");
    btn.className = "folder-nav-item";
    btn.innerHTML = '<span class="folder-dot" style="background:' + f.color + '"></span><span class="folder-name">' + escapeHtml(f.name) + '</span><span class="folder-count">' + c + '</span>';
    btn.addEventListener("click", () => { state.filters.folder = f.id; setView("prompts"); });
    sidebarFolders.appendChild(btn);
  });
}

function renderDashboard() {
  const prompts = state.data.prompts;
  const results = state.data.results;
  const total = prompts.length;
  const pinned = prompts.filter(p=>p.pinned).length;
  const uses = prompts.reduce((a,p)=>a+(p.uses||0),0);
  const countByP = {};
  prompts.forEach(p=>{ countByP[p.platform]=(countByP[p.platform]||0)+1; });
  let topP = "-";
  if (total) { topP = Object.entries(countByP).sort((a,b)=>b[1]-a[1])[0][0]; }
  let topPrompt = null;
  if (prompts.length) topPrompt = prompts.slice().sort((a,b)=>(b.uses||0)-(a.uses||0))[0];

  viewRoot.innerHTML = '<div class="view">' +
    '<section class="hero"><div class="hero-grid"></div><div class="hero-content"><span class="hero-kicker"><span class="eyebrow-dot"></span> مساحتك آمنة ومحفوظة في Supabase</span><h1 class="hero-title">نظّم برومبتاتك <span>الذهبية</span></h1><p class="hero-sub">احفظ أفضل برومبتاتك لكل منصات الذكاء الاصطناعي، قيّمها، ثبّتها، وارجع لنتائجك الناجحة بسرعة.</p><div class="hero-actions"><button class="btn btn-primary" data-action="new-prompt"><svg class="icon"><use href="#i-plus"></use></svg><span>إضافة برومبت جديد</span></button><button class="btn btn-secondary" data-action="nav" data-view="prompts"><svg class="icon"><use href="#i-library"></use></svg><span>فتح المكتبة</span></button></div></div></section>' +
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
  if(state.filters.folder!=="all") list = list.filter(p=>p.folder_id===state.filters.folder);
  if(state.filters.platform!=="all") list = list.filter(p=>p.platform===state.filters.platform);
  if(state.filters.onlyPinned) list = list.filter(p=>p.pinned);
  const q = state.filters.query.trim().toLowerCase();
  if(q){ list = list.filter(p=>(p.title+" "+p.text+" "+(p.tags||[]).join(" ")).toLowerCase().includes(q)); }
  list.sort((a,b)=> (b.pinned?1:0)-(a.pinned?1:0) || (b.uses||0)-(a.uses||0) || String(b.updated_at||b.created_at).localeCompare(String(a.updated_at||a.created_at)));

  const folderOpts = '<option value="all">كل المجلدات</option>' + state.data.folders.map(f=>'<option value="'+escapeAttr(f.id)+'" '+(state.filters.folder===f.id?'selected':'')+'>'+escapeHtml(f.name)+'</option>').join("");
  const platOpts = '<option value="all">كل المنصات</option>' + PLATFORMS.map(p=>'<option value="'+escapeAttr(p.id)+'" '+(state.filters.platform===p.id?'selected':'')+'>'+p.id+'</option>').join("");

  viewRoot.innerHTML = '<div class="view"><div class="toolbar"><div class="toolbar-group"><div class="segment"><button class="segment-btn '+(!state.filters.onlyPinned?'active':'')+'" data-action="filter-pinned" data-v="false">الكل</button><button class="segment-btn '+(state.filters.onlyPinned?'active':'')+'" data-action="filter-pinned" data-v="true">المثبتة فقط</button></div><select class="filter-select" data-action="filter-folder">'+folderOpts+'</select><select class="filter-select" data-action="filter-platform">'+platOpts+'</select></div><div class="toolbar-group"><div class="search-inline"><svg class="icon"><use href="#i-search"></use></svg><input id="inlineSearch" type="search" placeholder="بحث فوري..." value="'+escapeAttr(state.filters.query)+'" /></div><button class="btn btn-primary" data-action="new-prompt"><svg class="icon"><use href="#i-plus"></use></svg><span>برومبت جديد</span></button></div></div>' + (list.length?'<div class="card-grid">'+list.map(p=>promptCard(p)).join('')+'</div>':'<div class="panel"><div class="panel-body" style="text-align:center;padding:32px;color:var(--text-tertiary)">لا توجد نتائج مطابقة</div></div>') + '</div>';

  $("#inlineSearch").addEventListener("input",e=>{state.filters.query=e.target.value; render();});
  viewRoot.querySelectorAll("[data-action='filter-pinned']").forEach(b=>b.addEventListener("click",()=>{state.filters.onlyPinned = b.dataset.v==='true'; render();}));
  const ff = viewRoot.querySelector('[data-action="filter-folder"]'); if(ff) ff.addEventListener("change",e=>{state.filters.folder=e.target.value; render();});
  const fp = viewRoot.querySelector('[data-action="filter-platform"]'); if(fp) fp.addEventListener("change",e=>{state.filters.platform=e.target.value; render();});
  viewRoot.querySelectorAll("[data-action='new-prompt']").forEach(b=>b.addEventListener("click",openPromptModal));
  wirePromptCards();
}

function promptCard(p){
  const m = platformMeta(p.platform);
  const folder = state.data.folders.find(f=>f.id===p.folder_id);
  const tags = (p.tags||[]).slice(0,4).map(t=>'<span>'+escapeHtml(t)+'</span>').join('');
  const stars = Array(5).fill(0).map((_,i)=>'<button class="rating-btn '+(i<p.rating?'active':'')+'" data-action="rate" data-id="'+p.id+'" data-v="'+(i+1)+'"><svg class="icon"><use href="#i-star"></use></svg></button>').join('');
  return '<article class="prompt-card '+(p.pinned?'pinned':'')+'"><div class="prompt-card-head"><div style="display:flex;flex-direction:column;gap:8px"><span class="prompt-platform"><span class="list-dot" style="background:'+m.color+'"></span>'+escapeHtml(m.id)+'</span>'+(folder?'<span style="display:flex;align-items:center;gap:6px;color:var(--text-tertiary);font-size:12px"><svg class="icon"><use href="#i-folder"></use></svg>'+escapeHtml(folder.name)+'</span>':'')+'</div><div class="prompt-actions"><button class="icon-btn" data-action="pin" data-id="'+p.id+'" title="'+(p.pinned?'إلغاء التثبيت':'تثبيت')+'"><svg class="icon"><use href="#i-pin"></use></svg></button><button class="icon-btn" data-action="edit-prompt" data-id="'+p.id+'" title="تعديل"><svg class="icon"><use href="#i-pencil"></use></svg></button><button class="icon-btn" data-action="delete-prompt" data-id="'+p.id+'" title="حذف"><svg class="icon"><use href="#i-trash"></use></svg></button></div></div><div class="prompt-body"><h3 class="prompt-title">'+escapeHtml(p.title)+'</h3><p class="prompt-preview">'+escapeHtml(p.text)+'</p><div class="prompt-tags">'+tags+( (p.tags||[]).length>4?'<span>+'+((p.tags||[]).length-4)+'</span>':'')+'</div></div><div class="prompt-foot"><div class="prompt-meta"><span><svg class="icon"><use href="#i-clock"></use></svg> '+(p.uses||0)+' استخدام</span><div class="rating">'+stars+'</div></div><button class="copy-btn" data-action="copy-prompt" data-id="'+p.id+'"><svg class="icon"><use href="#i-copy"></use></svg><span>نسخ</span></button></div></article>';
}

function wirePromptCards(){
  viewRoot.querySelectorAll("[data-action='pin']").forEach(b=>b.addEventListener("click",async ()=>{
    const p = state.data.prompts.find(x=>x.id===b.dataset.id);
    if(!p)return;
    const np = !p.pinned;
    const {error}=await supabase.from('prompts').update({pinned: np, updated_at: nowISO()}).eq('id', p.id);
    if(!error){ p.pinned=np; p.updated_at=nowISO(); toast(np?'تم التثبيت':'تم إلغاء التثبيت'); render(); }
  }));
  viewRoot.querySelectorAll("[data-action='edit-prompt']").forEach(b=>b.addEventListener("click",()=>openPromptModal(b.dataset.id)));
  viewRoot.querySelectorAll("[data-action='delete-prompt']").forEach(b=>b.addEventListener("click",async ()=>{
    if(confirm('حذف هذا البرومبت؟ لا يمكن التراجع.')){
      const {error}=await supabase.from('prompts').delete().eq('id', b.dataset.id);
      if(!error){ state.data.prompts = state.data.prompts.filter(x=>x.id!==b.dataset.id); toast('تم الحذف'); render(); }
    }
  }));
  viewRoot.querySelectorAll("[data-action='rate']").forEach(b=>b.addEventListener("click",async ()=>{
    const p = state.data.prompts.find(x=>x.id===b.dataset.id);
    if(!p)return;
    const r = Number(b.dataset.v);
    const {error}=await supabase.from('prompts').update({rating:r, updated_at: nowISO()}).eq('id', p.id);
    if(!error){ p.rating=r; p.updated_at=nowISO(); render(); }
  }));
  viewRoot.querySelectorAll("[data-action='copy-prompt']").forEach(b=>b.addEventListener("click",async ()=>{
    const p = state.data.prompts.find(x=>x.id===b.dataset.id);
    if(!p)return;
    try{
      await navigator.clipboard.writeText(p.text);
      const nu = (p.uses||0)+1;
      const {error}=await supabase.from('prompts').update({uses: nu, updated_at: nowISO()}).eq('id', p.id);
      if(!error){ p.uses=nu; p.updated_at=nowISO(); toast('تم النسخ وزيادة العداد'); render(); }
      else { toast('تم النسخ'); }
    }catch{ toast('تعذّر النسخ'); }
  }));
}

function renderFolders(){
  viewRoot.innerHTML = '<div class="view"><div class="toolbar"><div class="toolbar-group"><h3 style="margin:0">المجلدات</h3></div><button class="btn btn-primary" data-action="new-folder"><svg class="icon"><use href="#i-folder-plus"></use></svg><span>مجلد جديد</span></button></div><div class="card-grid">'+(state.data.folders.length?state.data.folders.map(f=>folderCard(f)).join(''):'<div class="panel"><div class="panel-body" style="text-align:center;padding:32px;color:var(--text-tertiary)">لا توجد مجلدات بعد</div></div>')+'</div></div>';
  viewRoot.querySelectorAll("[data-action='new-folder']").forEach(b=>b.addEventListener("click",openFolderModal));
  viewRoot.querySelectorAll("[data-action='open-folder']").forEach(b=>b.addEventListener("click",()=>{state.filters.folder=b.dataset.id; setView("prompts");}));
  viewRoot.querySelectorAll("[data-action='edit-folder']").forEach(b=>b.addEventListener("click",()=>openFolderModal(b.dataset.id)));
  viewRoot.querySelectorAll("[data-action='delete-folder']").forEach(b=>b.addEventListener("click",async ()=>{
    if(confirm('حذف المجلد؟ ستبقى البرومبتات بدون مجلد.')){
      await supabase.from('prompts').update({folder_id: null}).eq('folder_id', b.dataset.id);
      await supabase.from('folders').delete().eq('id', b.dataset.id);
      await loadAllData(); toast('تم الحذف'); render();
    }
  }));
}

function folderCard(f){
  const c = state.data.prompts.filter(p=>p.folder_id===f.id).length;
  return '<article class="prompt-card"><div class="prompt-card-head"><div style="display:flex;align-items:center;gap:10px"><span style="width:10px;height:10px;border-radius:50%;background:'+f.color+'"></span><h3 class="prompt-title" style="font-size:17px">'+escapeHtml(f.name)+'</h3></div><div class="prompt-actions"><button class="icon-btn" data-action="edit-folder" data-id="'+f.id+'"><svg class="icon"><use href="#i-pencil"></use></svg></button><button class="icon-btn" data-action="delete-folder" data-id="'+f.id+'"><svg class="icon"><use href="#i-trash"></use></svg></button></div></div><div class="prompt-body"><p style="color:var(--text-tertiary)">'+c+' برومبت</p></div><div class="prompt-foot"><button class="btn btn-secondary" data-action="open-folder" data-id="'+f.id+'">عرض البرومبتات</button></div></article>';
}

function renderResults(){
  let list = state.data.results.slice();
  list.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  viewRoot.innerHTML = '<div class="view"><div class="toolbar"><div class="toolbar-group"><h3 style="margin:0">النتائج الناجحة</h3></div><button class="btn btn-primary" data-action="add-result"><svg class="icon"><use href="#i-plus"></use></svg><span>حفظ نتيجة جديدة</span></button></div>'+(list.length?'<div class="card-grid">'+list.map(r=>resultCard(r)).join('')+'</div>':'<div class="panel"><div class="panel-body" style="text-align:center;padding:32px;color:var(--text-tertiary)">احفظ نتيجة ناجحة بعد نسخ برومبتك</div></div>')+'</div>';
  viewRoot.querySelectorAll("[data-action='add-result']").forEach(b=>b.addEventListener("click",()=>openResultModal()));
  viewRoot.querySelectorAll("[data-action='del-result']").forEach(b=>b.addEventListener("click",async ()=>{
    if(confirm('حذف النتيجة؟')){
      await supabase.from('results').delete().eq('id', b.dataset.id);
      state.data.results = state.data.results.filter(x=>x.id!==b.dataset.id);
      toast('تم الحذف'); render();
    }
  }));
}

function resultCard(r){
  const p = state.data.prompts.find(x=>x.id===r.prompt_id);
  const m = platformMeta(r.platform|| (p?p.platform:''));
  return '<article class="prompt-card"><div class="prompt-card-head"><div style="display:flex;flex-direction:column;gap:6px"><span class="prompt-platform"><span class="list-dot" style="background:'+m.color+'"></span>'+escapeHtml(m.id)+'</span><span style="font-size:12px;color:var(--text-tertiary)">'+(p?escapeHtml(p.title):'برومبت غير مرتبط')+'</span></div><div class="prompt-actions"><button class="icon-btn" data-action="del-result" data-id="'+r.id+'"><svg class="icon"><use href="#i-trash"></use></svg></button></div></div><div class="prompt-body"><h3 class="prompt-title">'+escapeHtml(r.title||'نتيجة')+'</h3><p class="prompt-preview">'+escapeHtml(r.content||'')+'</p></div><div class="prompt-foot"><span style="color:var(--text-tertiary);font-size:12px">'+(r.created_at? new Date(r.created_at).toLocaleDateString('ar-SA'): '')+'</span></div></article>';
}

// Modals
const modalRoot = $("#modalRoot");

async function openPromptModal(id=null){
  const edit = id ? state.data.prompts.find(p=>p.id===id) : null;
  state.editing = edit ? JSON.parse(JSON.stringify(edit)) : { title:"", text:"", platform:"Claude", tags:[], folder_id:null, pinned:false, uses:0, rating:0 };
  const folders = '<option value="">بدون مجلد</option>' + state.data.folders.map(f=>'<option value="'+escapeAttr(f.id)+'" '+(state.editing.folder_id===f.id?'selected':'')+'>'+escapeHtml(f.name)+'</option>').join("");
  const plats = PLATFORMS.map(p=>'<option value="'+escapeAttr(p.id)+'" '+(state.editing.platform===p.id?'selected':'')+'>'+escapeHtml(p.id)+'</option>').join("");
  const tagsStr = (state.editing.tags||[]).join(', ');
  modalRoot.innerHTML = '<div class="modal-backdrop" data-action="close-modal"></div><div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><div><h3>'+(edit?'تعديل البرومبت':'برومبت جديد')+'</h3></div><button class="icon-btn" type="button" data-action="close-modal" aria-label="إغلاق"><svg class="icon"><use href="#i-x"></use></svg></button></div><div class="modal-body"><div class="field-group"><label class="field-label">العنوان</label><input class="field-input" id="pmTitle" value="'+escapeAttr(state.editing.title)+'" /></div><div class="field-group"><label class="field-label">نص البرومبت الكامل</label><textarea class="field-textarea" id="pmText">'+escapeHtml(state.editing.text)+'</textarea></div><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px"><div class="field-group"><label class="field-label">المنصة</label><select class="filter-select" id="pmPlat" style="width:100%">'+plats+'</select></div><div class="field-group"><label class="field-label">المجلد</label><select class="filter-select" id="pmFolder" style="width:100%">'+folders+'</select></div></div><div class="field-group"><label class="field-label">الوسوم (مفصولة بفاصلة)</label><input class="field-input" id="pmTags" value="'+escapeAttr(tagsStr)+'" /></div></div><div class="modal-foot"><button class="btn btn-secondary" type="button" data-action="close-modal">إلغاء</button><button class="btn btn-primary" type="button" id="pmSave">حفظ</button></div></div>';
  modalRoot.querySelectorAll("[data-action='close-modal']").forEach(b=>b.addEventListener("click",closeModals));
  $("#pmSave").addEventListener("click", async ()=>{
    const title = $("#pmTitle").value.trim();
    const text = $("#pmText").value;
    if(!title || !text){ toast('العنوان ونص البرومبت مطلوبان'); return; }
    const p = {
      title,
      text,
      platform: $("#pmPlat").value,
      folder_id: $("#pmFolder").value||null,
      tags: ($("#pmTags").value||"").split(',').map(x=>x.trim()).filter(Boolean),
      pinned: state.editing.pinned||false,
      uses: state.editing.uses||0,
      rating: state.editing.rating||0,
      updated_at: nowISO()
    };
    if(edit){
      const { error } = await supabase.from('prompts').update(p).eq('id', edit.id).eq('user_id', state.user.id);
      if(error){ toast('خطأ في التحديث'); return; }
    }else{
      const { error } = await supabase.from('prompts').insert({ ...p, user_id: state.user.id, created_at: nowISO() });
      if(error){ toast('خطأ في الإضافة'); return; }
    }
    closeModals();
    toast('تم الحفظ');
    await loadAllData();
    render();
  });
  setTimeout(()=>{$("#pmTitle").focus();}, 40);
}

async function openFolderModal(id=null){
  const edit = id? state.data.folders.find(f=>f.id===id): null;
  const obj = edit? JSON.parse(JSON.stringify(edit)): {name:"", color:"#7c5cff"};
  const colors = ["#7c5cff","#4c8df6","#10a37f","#f59e0b","#ef4444","#1fb8ad","#8b8d98","#a38bff"];
  modalRoot.innerHTML = '<div class="modal-backdrop" data-action="close-modal"></div><div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><div><h3>'+(edit?'تعديل المجلد':'مجلد جديد')+'</h3></div><button class="icon-btn" type="button" data-action="close-modal" aria-label="إغلاق"><svg class="icon"><use href="#i-x"></use></svg></button></div><div class="modal-body"><div class="field-group"><label class="field-label">اسم المجلد</label><input class="field-input" id="fmName" value="'+escapeAttr(obj.name)+'" /></div><div class="field-group"><label class="field-label">اللون</label><div style="display:flex;flex-wrap:wrap;gap:8px">'+colors.map(c=>'<button type="button" class="color-swatch '+(obj.color===c?'active':'')+'" data-c="'+escapeAttr(c)+'" style="background:'+escapeAttr(c)+'"></button>').join('')+'</div></div></div><div class="modal-foot"><button class="btn btn-secondary" type="button" data-action="close-modal">إلغاء</button><button class="btn btn-primary" type="button" id="fmSave">حفظ</button></div></div>';
  modalRoot.querySelectorAll("[data-action='close-modal']").forEach(b=>b.addEventListener("click",closeModals));
  let sel = obj.color;
  modalRoot.querySelectorAll(".color-swatch").forEach(b=>b.addEventListener("click",()=>{modalRoot.querySelectorAll(".color-swatch").forEach(x=>x.classList.remove("active")); b.classList.add("active"); sel=b.dataset.c;}));
  $("#fmSave").addEventListener("click", async ()=>{
    const name = $("#fmName").value.trim();
    if(!name){ toast('اسم المجلد مطلوب'); return; }
    if(edit){
      await supabase.from('folders').update({name, color:sel, updated_at: nowISO()}).eq('id', edit.id).eq('user_id', state.user.id);
    }else{
      await supabase.from('folders').insert({name, color:sel, user_id: state.user.id, created_at: nowISO()});
    }
    closeModals(); toast('تم الحفظ'); await loadAllData(); render();
  });
  setTimeout(()=>{$("#fmName").focus();}, 40);
}

async function openResultModal(){
  const opts = '<option value="">اختر برومبت (اختياري)</option>' + state.data.prompts.map(p=>'<option value="'+p.id+'">'+escapeHtml(p.title)+'</option>').join("");
  modalRoot.innerHTML = '<div class="modal-backdrop" data-action="close-modal"></div><div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><div><h3>حفظ نتيجة ناجحة</h3></div><button class="icon-btn" type="button" data-action="close-modal" aria-label="إغلاق"><svg class="icon"><use href="#i-x"></use></svg></button></div><div class="modal-body"><div class="field-group"><label class="field-label">عنوان النتيجة</label><input class="field-input" id="rmTitle" /></div><div class="field-group"><label class="field-label">يرتبط بالبرومبت</label><select class="filter-select" id="rmPid" style="width:100%">'+opts+'</select></div><div class="field-group"><label class="field-label">محتوى النتيجة</label><textarea class="field-textarea" id="rmContent"></textarea></div><div class="field-group"><label class="field-label">المنصة</label><select class="filter-select" id="rmPlat" style="width:100%">'+PLATFORMS.map(p=>'<option>'+p.id+'</option>').join('')+'</select></div></div><div class="modal-foot"><button class="btn btn-secondary" type="button" data-action="close-modal">إلغاء</button><button class="btn btn-primary" type="button" id="rmSave">حفظ</button></div></div>';
  modalRoot.querySelectorAll("[data-action='close-modal']").forEach(b=>b.addEventListener("click",closeModals));
  $("#rmSave").addEventListener("click", async ()=>{
    const title = $("#rmTitle").value.trim();
    const content = $("#rmContent").value.trim();
    if(!title || !content){ toast('العنوان والمحتوى مطلوبان'); return; }
    await supabase.from('results').insert({ title, content, prompt_id: $("#rmPid").value||null, platform: $("#rmPlat").value, user_id: state.user.id, created_at: nowISO() });
    closeModals(); toast('تم الحفظ'); await loadAllData(); render();
  });
}

function closeModals(){ modalRoot.innerHTML=""; }
document.addEventListener("keydown", (e)=>{ if(e.key === "Escape"){ closeModals(); }});

initTheme();
setAuthMode("login");
