/*
  Prompt Bank - بنك البرومبتات
  Supabase Integration (Auth + DB + RLS)
  إصدار مُصلح لتدفق المصادقة (Auth Flow)
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
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}

function escapeAttr(s = "") {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

function platformMeta(id) {
  return PLATFORMS.find((p) => p.id === id) || { id, color: "#8b8d98" };
}

function nowISO() {
  return new Date().toISOString();
}

function applyTheme(t) {
  const root = document.documentElement;
  if (t === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  try {
    localStorage.setItem("promptbank.theme.v1", t);
  } catch (e) {}
  $$("[data-theme-toggle]").forEach((btn) => {
    btn.innerHTML = root.classList.contains("dark")
      ? '<svg class="icon"><use href="#i-sun"></use></svg>'
      : '<svg class="icon"><use href="#i-moon"></use></svg>';
    btn.setAttribute(
      "aria-label",
      root.classList.contains("dark") ? "تبديل للوضع النهاري" : "تبديل للوضع الليلي"
    );
  });
}

function initTheme() {
  try {
    const saved = localStorage.getItem("promptbank.theme.v1");
    if (saved) applyTheme(saved);
    else applyTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  } catch (e) {
    applyTheme("light");
  }
}

function toast(msg) {
  const root = document.getElementById("toastRoot");
  if (!root) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML =
    '<svg class="icon"><use href="#i-circle-check"></use></svg><span>' +
    escapeHtml(msg) +
    "</span>";
  root.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    el.style.transition = "all 200ms ease";
    setTimeout(() => el.remove(), 200);
  }, 1600);
}

/* ===================== Supabase Client ===================== */
let pbClient = null;

function initPb() {
  const lib = window.supabase;
  if (!lib) {
    console.error("[Prompt Bank] مكتبة Supabase لم تُحمل");
    document.body.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100dvh;text-align:center;padding:24px;font-family:IBM Plex Sans Arabic,sans-serif;direction:rtl"><div><h1 style="margin:0 0 10px">تعذر تحميل مكتبة Supabase</h1><p style="margin:0;color:#6b6b6b">تأكد من الاتصال بالإنترنت وجرب تحديث الصفحة</p></div></div>';
    return false;
  }
  const createClientFn = lib.createClient || (lib.default && lib.default.createClient);
  if (typeof createClientFn !== "function") {
    console.error("[Prompt Bank] دالة createClient غير موجودة");
    document.body.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100dvh;text-align:center;padding:24px;font-family:IBM Plex Sans Arabic,sans-serif;direction:rtl"><div><h1 style="margin:0 0 10px">خطأ في مكتبة Supabase</h1><p style="margin:0;color:#6b6b6b">لم يتم العثور على createClient</p></div></div>';
    return false;
  }
  if (
    !window.SUPABASE_CONFIG ||
    !window.SUPABASE_CONFIG.url ||
    !window.SUPABASE_CONFIG.anonKey
  ) {
    console.error("[Prompt Bank] إعدادات Supabase مفقودة");
    document.body.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100dvh;text-align:center;padding:24px;font-family:IBM Plex Sans Arabic,sans-serif;direction:rtl"><div><h1 style="margin:0 0 10px">ملف الإعدادات مفقود</h1><p style="margin:0;color:#6b6b6b">تأكد من وجود assets/config.js</p></div></div>';
    return false;
  }
  try {
    pbClient = createClientFn(
      window.SUPABASE_CONFIG.url,
      window.SUPABASE_CONFIG.anonKey
    );
    console.log("[Prompt Bank] تم تهيئة Supabase بنجاح");

    // إعداد مستمع تغيير حالة المصادقة فوراً بعد التهيئة
    setupAuthListener();

    return true;
  } catch (err) {
    console.error("[Prompt Bank] خطأ في التهيئة:", err);
    document.body.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100dvh;text-align:center;padding:24px;font-family:IBM Plex Sans Arabic,sans-serif;direction:rtl"><div><h1 style="margin:0 0 10px">خطأ في التهيئة</h1><p style="margin:0;color:#6b6b6b">' +
      escapeHtml(err.message) +
      '</p></div></div>';
    return false;
  }
}

/* ===================== State ===================== */
const state = {
  user: null,
  profile: null,
  data: { folders: [], prompts: [], results: [] },
  view: "dashboard",
  filters: { platform: "all", folder: "all", query: "", onlyPinned: false }
};

/* ===================== UI Elements (تُجلب بعد DOMContentLoaded) ===================== */
let authScreen, appEl, authForm, authHeading, authSub, authNameGroup, authName, authEmail, authPassword, authSubmitLabel, authSpinner, authError, authErrorText, authTerms, authSwitch;
let viewRoot, globalSearch, navPromptCount, navResultCount, sidebarFolders, workspaceName, workspaceInitial, sidebarAvatar, sidebarUserName, sidebarUserEmail, modalRoot;

function getUIElements() {
  authScreen = document.getElementById("authScreen");
  appEl = document.getElementById("app");
  authForm = document.getElementById("authForm");
  authHeading = document.getElementById("authHeading");
  authSub = document.getElementById("authSub");
  authNameGroup = document.getElementById("authNameGroup");
  authName = document.getElementById("authName");
  authEmail = document.getElementById("authEmail");
  authPassword = document.getElementById("authPassword");
  authSubmitLabel = document.getElementById("authSubmitLabel");
  authSpinner = document.getElementById("authSpinner");
  authError = document.getElementById("authError");
  authErrorText = document.getElementById("authErrorText");
  authTerms = document.getElementById("authTerms");
  authSwitch = document.getElementById("authSwitch");

  viewRoot = document.getElementById("viewRoot");
  globalSearch = document.getElementById("globalSearch");
  navPromptCount = document.getElementById("navPromptCount");
  navResultCount = document.getElementById("navResultCount");
  sidebarFolders = document.getElementById("sidebarFolders");
  workspaceName = document.getElementById("workspaceName");
  workspaceInitial = document.getElementById("workspaceInitial");
  sidebarAvatar = document.getElementById("sidebarAvatar");
  sidebarUserName = document.getElementById("sidebarUserName");
  sidebarUserEmail = document.getElementById("sidebarUserEmail");
  modalRoot = document.getElementById("modalRoot");
}

let authMode = "login";

function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll("[data-action='auth-tab']").forEach((b) => {
    const active = b.dataset.mode === mode;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  });
  if (mode === "login") {
    if (authHeading) authHeading.textContent = "مرحباً بعودتك";
    if (authSub) authSub.textContent = "سجّل الدخول لفتح بنك برومبتاتك الآمن.";
    if (authNameGroup) authNameGroup.hidden = true;
    if (authSubmitLabel) authSubmitLabel.textContent = "تسجيل الدخول";
    if (authTerms) authTerms.hidden = true;
    if (authSwitch)
      authSwitch.innerHTML =
        'ليس لديك حساب بعد؟ <button type="button" data-action="auth-tab" data-mode="register">أنشئ حسابك</button>';
    if (authPassword) authPassword.setAttribute("autocomplete", "current-password");
  } else {
    if (authHeading) authHeading.textContent = "أنشئ حسابك";
    if (authSub) authSub.textContent = "بياناتك محمية ومعزولة بالكامل.";
    if (authNameGroup) authNameGroup.hidden = false;
    if (authSubmitLabel) authSubmitLabel.textContent = "إنشاء الحساب";
    if (authTerms) authTerms.hidden = false;
    if (authSwitch)
      authSwitch.innerHTML =
        'لديك حساب بالفعل؟ <button type="button" data-action="auth-tab" data-mode="login">سجّل الدخول</button>';
    if (authPassword) authPassword.setAttribute("autocomplete", "new-password");
  }
  if (authError) authError.hidden = true;
  if (authErrorText) authErrorText.textContent = "";
}

/* ===================== Auth State Change Listener ===================== */
function setupAuthListener() {
  if (!pbClient) {
    console.error("[Prompt Bank] لا يمكن إعداد مستمع المصادقة: pbClient غير مهيأ");
    return;
  }
  console.log("[Prompt Bank] إعداد مستمع تغيير حالة المصادقة...");

  pbClient.auth.onAuthStateChange(async (_e, session) => {
    console.log(
      "[Prompt Bank] حدث مصادقة:",
      _e,
      session?.user ? "مُسجل دخول (" + session.user.email + ")" : "تسجيل خروج"
    );

    if (session?.user) {
      state.user = session.user;
      try {
        await loadProfile();
        await loadData();
      } catch (err) {
        console.error("[Prompt Bank] خطأ في تحميل البيانات بعد تسجيل الدخول:", err);
      }
      if (authScreen) authScreen.hidden = true;
      if (appEl) appEl.hidden = false;
      initApp();
    } else {
      state.user = null;
      state.profile = null;
      state.data = { folders: [], prompts: [], results: [] };
      if (authScreen) authScreen.hidden = false;
      if (appEl) appEl.hidden = true;
    }
  });

  // فحص الجلسة الحالية فوراً (للمستخدمين العائدين)
  pbClient.auth.getSession().then(({ data: { session }, error }) => {
    if (error) {
      console.error("[Prompt Bank] خطأ في جلب الجلسة:", error);
      return;
    }
    if (session?.user) {
      console.log("[Prompt Bank] جلسة موجودة:", session.user.email);
      state.user = session.user;
      // لا نغير الشاشة هنا لأن المستمع سيطلق تلقائياً عند وجود جلسة
    } else {
      console.log("[Prompt Bank] لا توجد جلسة — إظهار شاشة تسجيل الدخول");
      if (authScreen) authScreen.hidden = false;
      if (appEl) appEl.hidden = true;
    }
  });
}

/* ===================== Global Event Delegation ===================== */
document.addEventListener("click", (e) => {
  const tab = e.target.closest("[data-action='auth-tab']");
  if (tab) {
    setAuthMode(tab.dataset.mode);
    return;
  }

  const tp = e.target.closest("[data-action='toggle-password']");
  if (tp && authPassword) {
    const show = authPassword.type === "password";
    authPassword.type = show ? "text" : "password";
    tp.innerHTML = show
      ? '<svg class="icon"><use href="#i-eye-off"></use></svg>'
      : '<svg class="icon"><use href="#i-eye"></use></svg>';
    return;
  }

  const th = e.target.closest("[data-action='toggle-theme']");
  if (th) {
    applyTheme(
      document.documentElement.classList.contains("dark") ? "light" : "dark"
    );
    return;
  }

  const lo = e.target.closest("[data-action='logout']");
  if (lo && pbClient) {
    pbClient.auth.signOut().finally(() => location.reload());
    return;
  }

  const nv = e.target.closest("[data-action='nav']");
  if (nv) {
    setView(nv.dataset.view);
    document.getElementById("sidebar")?.classList.remove("open");
    document.getElementById("sidebarBackdrop")?.classList.remove("active");
    return;
  }

  const os = e.target.closest("[data-action='open-sidebar']");
  if (os) {
    document.getElementById("sidebar")?.classList.add("open");
    document.getElementById("sidebarBackdrop")?.classList.add("active");
    return;
  }

  const cs = e.target.closest("[data-action='close-sidebar']");
  if (cs) {
    document.getElementById("sidebar")?.classList.remove("open");
    document.getElementById("sidebarBackdrop")?.classList.remove("active");
    return;
  }

  const np = e.target.closest("[data-action='new-prompt']");
  if (np) {
    openPromptModal();
    return;
  }

  const nf = e.target.closest("[data-action='new-folder']");
  if (nf) {
    openFolderModal();
    return;
  }

  // Copy prompt
  const c = e.target.closest("[data-copy]");
  if (c && pbClient && state.user) {
    const id = c.dataset.copy;
    const p = state.data.prompts.find((x) => x.id === id);
    if (!p) return;
    try {
      navigator.clipboard.writeText(p.text);
      pbClient
        .from("prompts")
        .update({ uses: (p.uses || 0) + 1, updated_at: nowISO() })
        .eq("id", id)
        .eq("user_id", state.user.id);
      loadData();
      render();
      toast("تم النسخ وزيادة العداد");
    } catch (err) {
      toast("تعذّر النسخ");
    }
    return;
  }

  // Pin / unpin
  const pin = e.target.closest("[data-pin]");
  if (pin && pbClient && state.user) {
    const id = pin.dataset.pin;
    const p = state.data.prompts.find((x) => x.id === id);
    if (!p) return;
    try {
      const np_ = !p.pinned;
      pbClient
        .from("prompts")
        .update({ pinned: np_, updated_at: nowISO() })
        .eq("id", id)
        .eq("user_id", state.user.id);
      loadData();
      render();
      toast(np_ ? "تم التثبيت" : "تم إلغاء التثبيت");
    } catch (err) {
      toast("حدث خطأ");
    }
    return;
  }

  // Rate prompt
  const rate = e.target.closest("[data-rate]");
  if (rate && pbClient && state.user) {
    const id = rate.dataset.rate;
    const r = +rate.dataset.v;
    try {
      pbClient
        .from("prompts")
        .update({ rating: r, updated_at: nowISO() })
        .eq("id", id)
        .eq("user_id", state.user.id);
      loadData();
      render();
    } catch (err) {
      toast("حدث خطأ");
    }
    return;
  }

  // Edit prompt
  const edit = e.target.closest("[data-edit]");
  if (edit) {
    openPromptModal(edit.dataset.edit);
    return;
  }

  // Delete prompt
  const del = e.target.closest("[data-del]");
  if (del && pbClient && state.user) {
    if (!confirm("حذف هذا البرومبت نهائياً؟")) return;
    try {
      pbClient
        .from("prompts")
        .delete()
        .eq("id", del.dataset.del)
        .eq("user_id", state.user.id);
      loadData();
      render();
      toast("تم الحذف");
    } catch (err) {
      toast("حدث خطأ");
    }
    return;
  }

  // Folder open / edit / delete
  const fo = e.target.closest("[data-fopen]");
  if (fo) {
    state.filters.folder = fo.dataset.fopen;
    setView("prompts");
    return;
  }

  const fe = e.target.closest("[data-fedit]");
  if (fe) {
    openFolderModal(fe.dataset.fedit);
    return;
  }

  const fd = e.target.closest("[data-fdel]");
  if (fd && pbClient && state.user) {
    if (!confirm("حذف هذا المجلد؟ ستبقى البرومبتات بدون مجلد")) return;
    try {
      pbClient
        .from("prompts")
        .update({ folder_id: null })
        .eq("folder_id", fd.dataset.fdel)
        .eq("user_id", state.user.id);
      pbClient
        .from("folders")
        .delete()
        .eq("id", fd.dataset.fdel)
        .eq("user_id", state.user.id);
      loadData();
      render();
      toast("تم الحذف");
    } catch (err) {
      toast("حدث خطأ");
    }
    return;
  }

  // Add result
  const ar = e.target.closest("[data-action='add-result']");
  if (ar) {
    openResultModal();
    return;
  }

  // Delete result
  const rd = e.target.closest("[data-rdel]");
  if (rd && pbClient && state.user) {
    if (!confirm("حذف هذه النتيجة؟")) return;
    try {
      pbClient
        .from("results")
        .delete()
        .eq("id", rd.dataset.rdel)
        .eq("user_id", state.user.id);
      loadData();
      render();
      toast("تم الحذف");
    } catch (err) {
      toast("حدث خطأ");
    }
    return;
  }
});

/* ===================== Auth Form ===================== */
authForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!pbClient) {
    toast("الموقع لم يتم تهيئته بعد، يرجى تحديث الصفحة");
    return;
  }
  if (authError) authError.hidden = true;
  if (authErrorText) authErrorText.textContent = "";

  const email = authEmail.value.trim().toLowerCase();
  const pass = authPassword.value;
  const name = authName.value.trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (authErrorText) {
      authErrorText.textContent = "بريد إلكتروني غير صحيح";
      authError.hidden = false;
    }
    return;
  }
  if (pass.length < 8) {
    if (authErrorText) {
      authErrorText.textContent = "كلمة المرور ٨ أحرف على الأقل";
      authError.hidden = false;
    }
    return;
  }

  if (authSpinner) authSpinner.hidden = false;
  if (authSubmitLabel)
    authSubmitLabel.textContent =
      authMode === "login" ? "جاري الدخول..." : "جاري الإنشاء...";

  try {
    if (authMode === "register") {
      if (!name) {
        if (authErrorText) {
          authErrorText.textContent = "أدخل الاسم الكامل";
          authError.hidden = false;
        }
        if (authSpinner) authSpinner.hidden = true;
        if (authSubmitLabel) authSubmitLabel.textContent = "إنشاء الحساب";
        return;
      }
      const { data, error } = await pbClient.auth.signUp({
        email,
        password: pass,
        options: { data: { full_name: name } }
      });
      if (error) throw error;
      if (data.user)
        await pbClient
          .from("profiles")
          .upsert({ id: data.user.id, email, full_name: name });
      toast("تم إنشاء الحساب بنجاح، سجّل الدخول الآن");
      setAuthMode("login");
      authEmail.value = email;
    } else {
      const { error } = await pbClient.auth.signInWithPassword({
        email,
        password: pass
      });
      if (error) throw error;
      toast("تم تسجيل الدخول بنجاح");
      // علىAuthStateChange سيتولى عرض الواجهة الرئيسية
    }
  } catch (err) {
    if (authErrorText) {
      authErrorText.textContent = err.message || "خطأ";
      authError.hidden = false;
    }
  } finally {
    if (authSpinner) authSpinner.hidden = true;
    if (authSubmitLabel)
      authSubmitLabel.textContent =
        authMode === "login" ? "تسجيل الدخول" : "إنشاء الحساب";
  }
});

/* ===================== Data Loading ===================== */
async function loadProfile() {
  if (!pbClient || !state.user) return;
  try {
    const { data } = await pbClient
      .from("profiles")
      .select("*")
      .eq("id", state.user.id)
      .maybeSingle();
    if (data) {
      state.profile = data;
    } else {
      const name =
        state.user.user_metadata?.full_name || state.user.email.split("@")[0];
      await pbClient
        .from("profiles")
        .upsert({ id: state.user.id, email: state.user.email, full_name: name });
      const { data: d2 } = await pbClient
        .from("profiles")
        .select("*")
        .eq("id", state.user.id)
        .maybeSingle();
      state.profile = d2;
    }
  } catch (e) {
    state.profile = {
      full_name:
        state.user.user_metadata?.full_name || state.user.email.split("@")[0]
    };
  }
}

async function loadData() {
  if (!pbClient || !state.user) return;
  try {
    const [f, p, r] = await Promise.all([
      pbClient.from("folders").select("*").order("created_at", { ascending: true }),
      pbClient.from("prompts").select("*").order("updated_at", { ascending: false }),
      pbClient.from("results").select("*").order("created_at", { ascending: false })
    ]);
    state.data.folders = f.data || [];
    state.data.prompts = p.data || [];
    state.data.results = r.data || [];
    console.log(
      "[Prompt Bank] تم تحميل البيانات:",
      state.data.folders.length,
      "مجلدات",
      state.data.prompts.length,
      "برومبتات",
      state.data.results.length,
      "نتائج"
    );
  } catch (e) {
    console.error("[Prompt Bank] خطأ في تحميل البيانات:", e);
    state.data = { folders: [], prompts: [], results: [] };
  }
}

/* ===================== App Shell ===================== */
function initApp() {
  if (!state.user) return;
  const name =
    state.profile?.full_name ||
    state.user.user_metadata?.full_name ||
    state.user.email.split("@")[0];
  const first = (name.trim()[0] || "ب").toUpperCase();
  if (workspaceName)
    workspaceName.textContent = "بنك " + (name.split(" ")[0] || name);
  if (workspaceInitial) workspaceInitial.textContent = first;
  if (sidebarAvatar) sidebarAvatar.textContent = first;
  if (sidebarUserName) sidebarUserName.textContent = name;
  if (sidebarUserEmail) sidebarUserEmail.textContent = state.user.email;
  setView("dashboard");
}

function setView(v) {
  state.view = v;
  document.querySelectorAll(".nav-item").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === v)
  );
  const ey = document.getElementById("topbarEyebrow");
  const tt = document.getElementById("topbarTitle");
  if (ey && tt) {
    if (v === "dashboard") {
      ey.textContent = "مساحة العمل";
      tt.textContent = "نظرة عامة";
    }
    if (v === "prompts") {
      ey.textContent = "المكتبة";
      tt.textContent = "مكتبة البرومبتات";
    }
    if (v === "folders") {
      ey.textContent = "التنظيم";
      tt.textContent = "المجلدات";
    }
    if (v === "results") {
      ey.textContent = "الأرشيف";
      tt.textContent = "النتائج الناجحة";
    }
  }
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
  if (navPromptCount) navPromptCount.textContent = state.data.prompts.length;
  if (navResultCount) navResultCount.textContent = state.data.results.length;
  if (!sidebarFolders) return;
  sidebarFolders.innerHTML = "";

  const all = document.createElement("button");
  all.className = "folder-nav-item";
  all.innerHTML =
    '<span class="folder-dot" style="background:var(--border-strong)"></span><span class="folder-name">كل البرومبتات</span><span class="folder-count">' +
    state.data.prompts.length +
    "</span>";
  all.onclick = () => {
    state.filters.folder = "all";
    setView("prompts");
  };
  sidebarFolders.appendChild(all);

  state.data.folders
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((f) => {
      const c = state.data.prompts.filter((p) => p.folder_id === f.id).length;
      const btn = document.createElement("button");
      btn.className = "folder-nav-item";
      btn.innerHTML =
        '<span class="folder-dot" style="background:' +
        f.color +
        '"></span><span class="folder-name">' +
        escapeHtml(f.name) +
        '</span><span class="folder-count">' +
        c +
        "</span>";
      btn.onclick = () => {
        state.filters.folder = f.id;
        setView("prompts");
      };
      sidebarFolders.appendChild(btn);
    });
}

/* ===================== Dashboard ===================== */
function renderDashboard() {
  if (!viewRoot) return;
  const p = state.data.prompts;
  const r = state.data.results;
  const total = p.length;
  const pinned = p.filter((x) => x.pinned).length;
  const uses = p.reduce((a, x) => a + (x.uses || 0), 0);
  viewRoot.innerHTML =
    '<div class="view">' +
    '<section class="hero">' +
    '<div class="hero-grid"></div>' +
    '<div class="hero-content">' +
    '<span class="hero-kicker"><span class="eyebrow-dot"></span> آمن ومعزول بالكامل</span>' +
    '<h1 class="hero-title">نظّم برومبتاتك <span>الذهبية</span></h1>' +
    '<p class="hero-sub">احفظ، ثبّت، قيّم، وانسخ أفضل برومبتاتك في مكان واحد</p>' +
    '<div class="hero-actions">' +
    '<button class="btn btn-primary" data-action="new-prompt"><svg class="icon"><use href="#i-plus"></use></svg><span>برومبت جديد</span></button>' +
    '<button class="btn btn-secondary" data-action="nav" data-view="prompts"><svg class="icon"><use href="#i-library"></use></svg><span>فتح المكتبة</span></button>' +
    "</div>" +
    "</div>" +
    "</section>" +
    '<section class="stats-grid">' +
    '<article class="stat-card"><div class="stat-head"><span class="stat-label">إجمالي البرومبتات</span></div><div class="stat-value">' +
    total +
    "</div></article>" +
    '<article class="stat-card"><div class="stat-head"><span class="stat-label">مثبّتة</span></div><div class="stat-value">' +
    pinned +
    "</div></article>" +
    '<article class="stat-card"><div class="stat-head"><span class="stat-label">إجمالي الاستخدام</span></div><div class="stat-value">' +
    uses +
    "</div></article>" +
    '<article class="stat-card"><div class="stat-head"><span class="stat-label">النتائج الناجحة</span></div><div class="stat-value">' +
    r.length +
    "</div></article>" +
    "</section>" +
    "</div>";
}

/* ===================== Prompts ===================== */
function renderPrompts() {
  if (!viewRoot) return;
  let list = state.data.prompts.slice();

  if (state.filters.folder !== "all")
    list = list.filter((x) => x.folder_id === state.filters.folder);
  if (state.filters.platform !== "all")
    list = list.filter((x) => x.platform === state.filters.platform);
  if (state.filters.onlyPinned) list = list.filter((x) => x.pinned);

  const q = state.filters.query.trim().toLowerCase();
  if (q)
    list = list.filter(
      (x) =>
        (x.title + " " + x.text + " " + (x.tags || []).join(" "))
          .toLowerCase()
          .includes(q)
    );

  list.sort(
    (a, b) =>
      (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) ||
      (b.uses || 0) - (a.uses || 0)
  );

  const fopts =
    '<option value="all">كل المجلدات</option>' +
    state.data.folders
      .map(
        (f) =>
          '<option value="' +
          f.id +
          '" ' +
          (state.filters.folder === f.id ? "selected" : "") +
          ">" +
          escapeHtml(f.name) +
          "</option>"
      )
      .join("");
  const popts =
    '<option value="all">كل المنصات</option>' +
    PLATFORMS.map(
      (p) =>
        '<option value="' +
        p.id +
        '" ' +
        (state.filters.platform === p.id ? "selected" : "") +
        ">" +
        p.id +
        "</option>"
    )
    .join("");

  viewRoot.innerHTML =
    '<div class="view">' +
    '<div class="toolbar">' +
    '<div class="toolbar-group">' +
    '<div class="segment">' +
    '<button class="segment-btn ' +
    (!state.filters.onlyPinned ? "active" : "") +
    '" data-pf="false">الكل</button>' +
    '<button class="segment-btn ' +
    (state.filters.onlyPinned ? "active" : "") +
    '" data-pf="true">المثبتة فقط</button>' +
    "</div>" +
    '<select class="filter-select" id="fsel">' +
    fopts +
    "</select>" +
    '<select class="filter-select" id="psel">' +
    popts +
    "</select>" +
    "</div>" +
    '<div class="toolbar-group">' +
    '<div class="search-inline"><svg class="icon"><use href="#i-search"></use></svg><input id="sis" type="search" value="' +
    escapeAttr(state.filters.query) +
    '" placeholder="بحث فوري..."></div>' +
    '<button class="btn btn-primary" data-action="new-prompt"><svg class="icon"><use href="#i-plus"></use></svg><span>برومبت جديد</span></button>' +
    "</div>" +
    "</div>" +
    '<div class="card-grid">' +
    (list.length
      ? list.map(card).join("")
      : '<div class="panel"><div class="panel-body" style="text-align:center;color:var(--text-tertiary)">لا توجد نتائج</div></div>') +
    "</div>" +
    "</div>";

  document.getElementById("sis").oninput = (e) => {
    state.filters.query = e.target.value;
    render();
  };
  document.querySelectorAll("[data-pf]").forEach((b) => {
    b.onclick = () => {
      state.filters.onlyPinned = b.dataset.pf === "true";
      render();
    };
  });
  document.getElementById("fsel").onchange = (e) => {
    state.filters.folder = e.target.value;
    render();
  };
  document.getElementById("psel").onchange = (e) => {
    state.filters.platform = e.target.value;
    render();
  };
}

function card(p) {
  const m = platformMeta(p.platform);
  const folder = state.data.folders.find((f) => f.id === p.folder_id);
  const tags = (p.tags || [])
    .map((t) => '<span>' + escapeHtml(t) + "</span>")
    .join("");
  let stars = "";
  for (let i = 1; i <= 5; i++)
    stars +=
      '<button class="rating-btn ' +
      (i <= (p.rating || 0) ? "active" : "") +
      '" data-rate="' +
      p.id +
      '" data-v="' +
      i +
      '"><svg class="icon"><use href="#i-star"></use></svg></button>';
  return (
    '<article class="prompt-card ' +
    (p.pinned ? "pinned" : "") +
    '">' +
    '<div class="prompt-card-head">' +
    '<div style="display:flex;flex-direction:column;gap:6px">' +
    '<span class="prompt-platform"><span class="list-dot" style="background:' +
    m.color +
    '"></span>' +
    escapeHtml(m.id) +
    "</span>" +
    (folder
      ? '<span style="font-size:12px;color:var(--text-tertiary)">' +
        escapeHtml(folder.name) +
        "</span>"
      : "") +
    "</div>" +
    '<div class="prompt-actions">' +
    '<button class="icon-btn" data-pin="' +
    p.id +
    '"><svg class="icon"><use href="#i-pin"></use></svg></button>' +
    '<button class="icon-btn" data-edit="' +
    p.id +
    '"><svg class="icon"><use href="#i-pencil"></use></svg></button>' +
    '<button class="icon-btn" data-del="' +
    p.id +
    '"><svg class="icon"><use href="#i-trash"></use></svg></button>' +
    "</div>" +
    "</div>" +
    '<div class="prompt-body">' +
    '<h3 class="prompt-title">' +
    escapeHtml(p.title) +
    "</h3>" +
    '<p class="prompt-preview">' +
    escapeHtml(p.text) +
    "</p>" +
    (tags ? '<div class="prompt-tags">' + tags + "</div>" : "") +
    "</div>" +
    '<div class="prompt-foot">' +
    '<div class="prompt-meta"><span>' +
    (p.uses || 0) +
    ' استخدام</span><div class="rating">' +
    stars +
    "</div></div>" +
    '<button class="copy-btn" data-copy="' +
    p.id +
    '"><svg class="icon"><use href="#i-copy"></use></svg><span>نسخ</span></button>' +
    "</div>" +
    "</article>"
  );
}

/* ===================== Folders ===================== */
function renderFolders() {
  if (!viewRoot) return;
  viewRoot.innerHTML =
    '<div class="view">' +
    '<div class="toolbar">' +
    '<div class="toolbar-group"><h3 style="margin:0">المجلدات</h3></div>' +
    '<button class="btn btn-primary" data-action="new-folder"><svg class="icon"><use href="#i-folder-plus"></use></svg><span>مجلد جديد</span></button>' +
    "</div>" +
    '<div class="card-grid">' +
    (state.data.folders.length
      ? state.data.folders
          .map(
            (f) =>
              '<article class="prompt-card">' +
              '<div class="prompt-card-head">' +
              '<div style="display:flex;align-items:center;gap:10px">' +
              '<span style="width:10px;height:10px;border-radius:50%;background:' +
              f.color +
              '"></span>' +
              '<h3 class="prompt-title" style="font-size:17px">' +
              escapeHtml(f.name) +
              "</h3>" +
              "</div>" +
              '<div class="prompt-actions">' +
              '<button class="icon-btn" data-fedit="' +
              f.id +
              '"><svg class="icon"><use href="#i-pencil"></use></svg></button>' +
              '<button class="icon-btn" data-fdel="' +
              f.id +
              '"><svg class="icon"><use href="#i-trash"></use></svg></button>' +
              "</div>" +
              "</div>" +
              '<div class="prompt-foot">' +
              '<button class="btn btn-secondary" data-fopen="' +
              f.id +
              '">عرض البرومبتات</button>' +
              "</div>" +
              "</article>"
          )
          .join("")
      : '<div class="panel"><div class="panel-body" style="text-align:center;color:var(--text-tertiary)">لا توجد مجلدات بعد</div></div>') +
    "</div>" +
    "</div>";
}

/* ===================== Results ===================== */
function renderResults() {
  if (!viewRoot) return;
  let list = state.data.results.slice().sort(
    (a, b) => String(b.created_at).localeCompare(String(a.created_at))
  );
  viewRoot.innerHTML =
    '<div class="view">' +
    '<div class="toolbar">' +
    '<div class="toolbar-group"><h3 style="margin:0">النتائج الناجحة</h3></div>' +
    '<button class="btn btn-primary" data-action="add-result"><svg class="icon"><use href="#i-plus"></use></svg><span>حفظ نتيجة جديدة</span></button>' +
    "</div>" +
    '<div class="card-grid">' +
    (list.length
      ? list
          .map(
            (r) =>
              '<article class="prompt-card">' +
              '<div class="prompt-card-head">' +
              '<h3 class="prompt-title">' +
              escapeHtml(r.title) +
              "</h3>" +
              '<button class="icon-btn" data-rdel="' +
              r.id +
              '"><svg class="icon"><use href="#i-trash"></use></svg></button>' +
              "</div>" +
              '<div class="prompt-body"><p class="prompt-preview">' +
              escapeHtml(r.content) +
              "</p></div>" +
              "</article>"
          )
          .join("")
      : '<div class="panel"><div class="panel-body" style="text-align:center;color:var(--text-tertiary)">لا توجد نتائج بعد</div></div>') +
    "</div>" +
    "</div>";
}

/* ===================== Modals ===================== */
function closeModals() {
  if (modalRoot) modalRoot.innerHTML = "";
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModals();
});

async function openPromptModal(id = null) {
  if (!modalRoot || !pbClient || !state.user) return;
  const edit = id ? state.data.prompts.find((p) => p.id === id) : null;
  const obj = edit
    ? JSON.parse(JSON.stringify(edit))
    : { title: "", text: "", platform: "Claude", tags: [], folder_id: null };
  const folders =
    '<option value="">بدون مجلد</option>' +
    state.data.folders
      .map(
        (f) =>
          '<option value="' +
          f.id +
          '" ' +
          (obj.folder_id === f.id ? "selected" : "") +
          ">" +
          escapeHtml(f.name) +
          "</option>"
      )
      .join("");
  const plats = PLATFORMS.map(
    (p) =>
      '<option value="' +
      p.id +
      '" ' +
      (obj.platform === p.id ? "selected" : "") +
      ">" +
      p.id +
      "</option>"
  ).join("");
  modalRoot.innerHTML =
    '<div class="modal-backdrop" data-mc></div>' +
    '<div class="modal">' +
    '<div class="modal-head">' +
    '<div><h3>' +
    (edit ? "تعديل البرومبت" : "برومبت جديد") +
    "</h3></div>" +
    '<button class="icon-btn" data-mc><svg class="icon"><use href="#i-x"></use></svg></button>' +
    "</div>" +
    '<div class="modal-body">' +
    '<div class="field-group"><label class="field-label">العنوان</label><input class="field-input" id="pmt" value="' +
    escapeAttr(obj.title) +
    '"></div>' +
    '<div class="field-group"><label class="field-label">نص البرومبت الكامل</label><textarea class="field-textarea" id="pmx">' +
    escapeHtml(obj.text) +
    "</textarea></div>" +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
    '<div class="field-group"><label class="field-label">المنصة</label><select class="filter-select" id="pmp">' +
    plats +
    "</select></div>" +
    '<div class="field-group"><label class="field-label">المجلد</label><select class="filter-select" id="pmf">' +
    folders +
    "</select></div>" +
    "</div>" +
    '<div class="field-group"><label class="field-label">الوسوم (مفصولة بفاصلة)</label><input class="field-input" id="pmtg" value="' +
    escapeAttr((obj.tags || []).join(", ")) +
    '"></div>' +
    "</div>" +
    '<div class="modal-foot">' +
    '<button class="btn btn-secondary" data-mc>إلغاء</button>' +
    '<button class="btn btn-primary" id="pms">حفظ</button>' +
    "</div>" +
    "</div>";
  modalRoot.querySelectorAll("[data-mc]").forEach((b) => (b.onclick = closeModals));
  document.getElementById("pms").onclick = async () => {
    const title = document.getElementById("pmt").value.trim();
    const text = document.getElementById("pmx").value;
    if (!title || !text) {
      toast("العنوان ونص البرومبت مطلوبان");
      return;
    }
    const payload = {
      title,
      text,
      platform: document.getElementById("pmp").value,
      folder_id: document.getElementById("pmf").value || null,
      tags: (document.getElementById("pmtg").value || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      updated_at: nowISO()
    };
    try {
      if (edit) {
        await pbClient
          .from("prompts")
          .update(payload)
          .eq("id", edit.id)
          .eq("user_id", state.user.id);
        toast("تم التعديل بنجاح");
      } else {
        await pbClient.from("prompts").insert({
          ...payload,
          user_id: state.user.id,
          pinned: false,
          uses: 0,
          rating: 0,
          created_at: nowISO()
        });
        toast("تم الإضافة بنجاح");
      }
      closeModals();
      await loadData();
      render();
    } catch (err) {
      toast("فشل الحفظ");
    }
  };
}

async function openFolderModal(id = null) {
  if (!modalRoot || !pbClient || !state.user) return;
  const edit = id ? state.data.folders.find((f) => f.id === id) : null;
  const obj = edit
    ? JSON.parse(JSON.stringify(edit))
    : { name: "", color: "#7c5cff" };
  const colors = [
    "#7c5cff",
    "#4c8df6",
    "#10a37f",
    "#f59e0b",
    "#ef4444",
    "#1fb8ad",
    "#8b8d98",
    "#a38bff"
  ];
  modalRoot.innerHTML =
    '<div class="modal-backdrop" data-mc></div>' +
    '<div class="modal">' +
    '<div class="modal-head">' +
    '<div><h3>' +
    (edit ? "تعديل المجلد" : "مجلد جديد") +
    "</h3></div>" +
    '<button class="icon-btn" data-mc><svg class="icon"><use href="#i-x"></use></svg></button>' +
    "</div>" +
    '<div class="modal-body">' +
    '<div class="field-group"><label class="field-label">اسم المجلد</label><input class="field-input" id="fmn" value="' +
    escapeAttr(obj.name) +
    '"></div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
    colors
      .map(
        (c) =>
          '<button class="color-swatch ' +
          (obj.color === c ? "active" : "") +
          '" data-c="' +
          c +
          '" style="background:' +
          c +
          '"></button>'
      )
      .join("") +
    "</div>" +
    "</div>" +
    '<div class="modal-foot">' +
    '<button class="btn btn-secondary" data-mc>إلغاء</button>' +
    '<button class="btn btn-primary" id="fms">حفظ</button>' +
    "</div>" +
    "</div>";
  modalRoot.querySelectorAll("[data-mc]").forEach((b) => (b.onclick = closeModals));
  let sel = obj.color;
  document.querySelectorAll(".color-swatch").forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll(".color-swatch").forEach((x) =>
        x.classList.remove("active")
      );
      b.classList.add("active");
      sel = b.dataset.c;
    };
  });
  document.getElementById("fms").onclick = async () => {
    const name = document.getElementById("fmn").value.trim();
    if (!name) {
      toast("اسم المجلد مطلوب");
      return;
    }
    try {
      if (edit) {
        await pbClient
          .from("folders")
          .update({ name, color: sel, updated_at: nowISO() })
          .eq("id", edit.id)
          .eq("user_id", state.user.id);
        toast("تم التعديل بنجاح");
      } else {
        await pbClient.from("folders").insert({
          name,
          color: sel,
          user_id: state.user.id,
          created_at: nowISO()
        });
        toast("تم الإضافة بنجاح");
      }
      closeModals();
      await loadData();
      render();
    } catch (err) {
      toast("فشل الحفظ");
    }
  };
}

async function openResultModal() {
  if (!modalRoot || !pbClient || !state.user) return;
  const opts =
    '<option value="">بدون ربط</option>' +
    state.data.prompts
      .map((p) => '<option value="' + p.id + '">' + escapeHtml(p.title) + "</option>")
      .join("");
  modalRoot.innerHTML =
    '<div class="modal-backdrop" data-mc></div>' +
    '<div class="modal">' +
    '<div class="modal-head">' +
    '<div><h3>حفظ نتيجة ناجحة</h3></div>' +
    '<button class="icon-btn" data-mc><svg class="icon"><use href="#i-x"></use></svg></button>' +
    "</div>" +
    '<div class="modal-body">' +
    '<div class="field-group"><label class="field-label">عنوان النتيجة</label><input class="field-input" id="rmt"></div>' +
    '<div class="field-group"><label class="field-label">يرتبط بالبرومبت</label><select class="filter-select" id="rmp">' +
    opts +
    "</select></div>" +
    '<div class="field-group"><label class="field-label">محتوى النتيجة</label><textarea class="field-textarea" id="rmx"></textarea></div>' +
    '<div class="field-group"><label class="field-label">المنصة</label><select class="filter-select" id="rmpl">' +
    PLATFORMS.map((p) => '<option>' + p.id + "</option>").join("") +
    "</select></div>" +
    "</div>" +
    '<div class="modal-foot">' +
    '<button class="btn btn-secondary" data-mc>إلغاء</button>' +
    '<button class="btn btn-primary" id="rms">حفظ</button>' +
    "</div>" +
    "</div>";
  modalRoot.querySelectorAll("[data-mc]").forEach((b) => (b.onclick = closeModals));
  document.getElementById("rms").onclick = async () => {
    const title = document.getElementById("rmt").value.trim();
    const content = document.getElementById("rmx").value.trim();
    if (!title || !content) {
      toast("العنوان والمحتوى مطلوبان");
      return;
    }
    try {
      await pbClient.from("results").insert({
        title,
        content,
        prompt_id: document.getElementById("rmp").value || null,
        platform: document.getElementById("rmpl").value,
        user_id: state.user.id,
        created_at: nowISO()
      });
      closeModals();
      await loadData();
      render();
      toast("تم الحفظ بنجاح");
    } catch (err) {
      toast("فشل الحفظ");
    }
  };
}

/* ===================== Bootstrap ===================== */
document.addEventListener("DOMContentLoaded", () => {
  console.log("[Prompt Bank] DOM تم تحميله");
  getUIElements();
  initTheme();
  setAuthMode("login");

  // إظهار شاشة تسجيل الدخول افتراضيًا
  if (authScreen) authScreen.hidden = false;
  if (appEl) appEl.hidden = true;

  if (!initPb()) return;
  console.log("[Prompt Bank] Supabase جاهز، في انتظار المصادقة...");
});

</parameter>
</function>

