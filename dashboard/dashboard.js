// ════════════════════════════════════════════════
//  CYBERPET v4.1 — DASHBOARD JS
// ════════════════════════════════════════════════

'use strict';

// ── UTILIDADES ────────────────────────────────────────────────────────────
// Usar funciones compartidas de utils/shared.js si están disponibles
const $ = id => document.getElementById(id);

const setText = (id, val) => {
  const el = $(id);
  if (el) el.textContent = String(val ?? '');
};

// Usar escHtml compartido si está disponible
const escHtml = window.CyberPetUtils?.escHtml || (s => String(s ?? '').replace(/[&<>"']/g, m => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
}[m])));

// Usar fmtMin compartido si está disponible
const fmtMin = window.CyberPetUtils?.fmtMin || (m => {
  const n = Math.round(m * 10) / 10;
  return n >= 60 ? `${Math.floor(n / 60)}h ${Math.round(n % 60)}m` : `${n}m`;
});

// Usar pwdScore compartido si está disponible
function pwdScore(p) {
  if (window.CyberPetUtils?.pwdScore) return window.CyberPetUtils.pwdScore(p);
  if (!p) return 0;
  let s = 0;
  if (p.length >= 8)  s += 20;
  if (p.length >= 12) s += 15;
  if (p.length >= 16) s += 15;
  if (/[a-z]/.test(p)) s += 10;
  if (/[A-Z]/.test(p)) s += 10;
  if (/\d/.test(p))    s += 10;
  if (/[^A-Za-z0-9]/.test(p)) s += 15;
  if (/(.)\1{2,}/.test(p))               s -= 10;
  if (/123|abc|password|qwerty/i.test(p)) s -= 15;
  return Math.max(0, Math.min(100, s));
}

function pwdLabel(score) {
  if (score >= 80) return { text: '💪 Fuerte',    color: '#22c55e' };
  if (score >= 60) return { text: '😐 Media',     color: '#f59e0b' };
  if (score >= 40) return { text: '⚠️ Débil',     color: '#ef4444' };
  return                   { text: '🚨 Muy débil', color: '#dc2626' };
}

function genPassword(len = 16) {
  if (window.CyberPetUtils?.genPassword) return window.CyberPetUtils.genPassword(len);
  const sets = [
    'abcdefghijklmnopqrstuvwxyz',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    '0123456789',
    '!@#$%^&*()_+-=[]{}|;:,.<>?',
  ];
  const all = sets.join('');
  let pwd = sets.map(s => s[Math.floor(Math.random() * s.length)]).join('');
  for (let i = pwd.length; i < len; i++) {
    pwd += all[Math.floor(Math.random() * all.length)];
  }
  return pwd.split('').sort(() => Math.random() - .5).join('');
}

// Usar iconos compartidos si están disponibles
const VAULT_ICONS = window.CyberPetUtils?.VAULT_ICONS || {
  google:'🔍', facebook:'📘', twitter:'🐦', instagram:'📸',
  youtube:'▶️', github:'🐙', amazon:'📦', netflix:'🎬',
  spotify:'🎵', discord:'💬', twitch:'🟣', paypal:'💳',
};

function vaultIcon(site = '') {
  if (window.CyberPetUtils?.getVaultIcon) return window.CyberPetUtils.getVaultIcon(site);
  const s = site.toLowerCase();
  for (const [k, v] of Object.entries(VAULT_ICONS)) if (s.includes(k)) return v;
  return '🌐';
}

const SHOP_ICONS = window.CyberPetUtils?.SHOP_ICONS || {
  cloth_bow_neck:'🎀', cloth_shoes_beige:'👟', cloth_bow_tail:'🎗️',
  cloth_hat_cap:'🧢', cloth_scarf_pink:'🧣', cloth_glasses_heart:'🩷',
  title_guardian:'🛡️', title_hacker:'💻', title_cyber:'🐱', title_shadow:'🌑',
  extra_time_30:'⏰', extra_time_60:'⏱️',
};

// ── ESTADO ────────────────────────────────────────────────────────────────

let S  = {};           // estado global de la sesión
let _vaultUnlocked  = false;
let _familyAuthed   = false;
let _shopTabActive  = 'cloth';
let _toolsInited    = false;
let _chatInited     = false;
let _toastTimer     = null;

// ── DASHBOARD USAGE TRACKING ──────────────────────────────────────────────
// Mide cuánto tiempo pasa el usuario en el dashboard y cuántas veces lo abre.
const _dashUsage = {
  sessionStart: Date.now(),
  ticker: null,
};

async function initDashUsageTracking() {
  const today = new Date().toDateString();
  const { dashUsage = {} } = await chrome.storage.local.get('dashUsage');

  // Incrementar contador de aperturas
  const opensToday  = (dashUsage.date === today ? (dashUsage.opensToday  || 0) : 0) + 1;
  const opensTotal  = (dashUsage.opensTotal  || 0) + 1;
  const timeTotal   = dashUsage.timeTotal   || 0;
  const timeTodayBase = dashUsage.date === today ? (dashUsage.timeToday || 0) : 0;

  await chrome.storage.local.set({
    dashUsage: {
      ...dashUsage,
      date: today,
      opensToday,
      opensTotal,
      timeTotal,
      timeToday: timeTodayBase,
      lastOpen: new Date().toLocaleString(),
    },
  });

  // Tick cada 30 s para acumular tiempo
  _dashUsage.ticker = setInterval(async () => {
    const elapsed = (Date.now() - _dashUsage.sessionStart) / 60000; // minutos
    const { dashUsage: du = {} } = await chrome.storage.local.get('dashUsage');
    const todayStr = new Date().toDateString();
    await chrome.storage.local.set({
      dashUsage: {
        ...du,
        timeToday: parseFloat(((du.date === todayStr ? (du.timeToday || 0) : 0) + 0.5).toFixed(2)),
        timeTotal: parseFloat(((du.timeTotal || 0) + 0.5).toFixed(2)),
      },
    });
    // Si la página stats está abierta, actualizar en tiempo real
    if ($('page-stats')?.classList.contains('active')) renderDashUsage();
  }, 30000);

  // Guardar tiempo al cerrar/navegar fuera
  window.addEventListener('beforeunload', async () => {
    clearInterval(_dashUsage.ticker);
    const elapsed = Math.round((Date.now() - _dashUsage.sessionStart) / 60000 * 10) / 10;
    if (elapsed < 0.1) return;
    const { dashUsage: du = {} } = await chrome.storage.local.get('dashUsage');
    const todayStr = new Date().toDateString();
    await chrome.storage.local.set({
      dashUsage: {
        ...du,
        timeToday: parseFloat(((du.date === todayStr ? (du.timeToday || 0) : 0) + elapsed).toFixed(2)),
        timeTotal: parseFloat(((du.timeTotal || 0) + elapsed).toFixed(2)),
      },
    });
  });
}

// ── INIT ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.runtime) {
    const main = document.querySelector('.main-content');
    if (main) {
      main.innerHTML = `
        <div style="max-width:760px;margin:40px auto;padding:24px;border:1px solid #f0b0b0;border-radius:18px;background:#fff6f6;color:#7f1d1d;">
          <h1 style="margin:0 0 12px;font-size:1.35rem;">⚠️ Dashboard no cargado</h1>
          <p style="margin:0;font-size:.95rem;line-height:1.6;">Este panel solo funciona cuando se carga como página de extensión en Chrome/Edge. No lo abras con <code>file://</code>. Carga la extensión descomprimida desde <strong>chrome://extensions</strong> o <strong>edge://extensions</strong>.</p>
        </div>`;
    }
    return;
  }

  await loadData();
  applyTheme(S.themeColor || 'blue');
  renderHome();
  renderActivities();
  renderKeywords();
  renderWhitelist();
  setupNavigation();
  setupHomeListeners();
  setupSettingsListeners();
  document.querySelector('.groq-panel')?.remove();
  initDashUsageTracking();

  // FIX M5b: escuchar cambios de storage en tiempo real para actualizar el dashboard
  // sin que el usuario tenga que recargar la página.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    let needsHomeRefresh = false;

    // Actividad reciente — la más importante de actualizar en tiempo real
    if (changes.activities) {
      S.activities = changes.activities.newValue ?? [];
      renderActivities();
    }
    // Historial de páginas (para actividad y estadísticas)
    if (changes.pageHistory) {
      S.pageHistory = changes.pageHistory.newValue ?? {};
    }
    // Estado y salud del gato — refleja cambios del content script
    if (changes.petHealth) {
      S.health = changes.petHealth.newValue ?? 100;
      needsHomeRefresh = true;
    }
    if (changes.petState) {
      S.petState = changes.petState.newValue ?? 'neutral';
      needsHomeRefresh = true;
    }
    // Puntos y monedas — actualizados por recompensas pasivas
    if (changes.userPoints) {
      S.points = Math.floor(changes.userPoints.newValue ?? 0);
      needsHomeRefresh = true;
    }
    if (changes.userCoins) {
      S.coins = changes.userCoins.newValue ?? 0;
      needsHomeRefresh = true;
    }
    // Amenazas bloqueadas
    if (changes.threatsBlocked) {
      S.threatsBlocked = changes.threatsBlocked.newValue ?? 0;
      needsHomeRefresh = true;
    }
    // Daily stats (screen time, páginas visitadas)
    if (changes.dailyStats) {
      S.dailyStats = changes.dailyStats.newValue ?? {};
      // Si la sección de stats está visible, actualizarla también
      if ($('page-stats')?.style.display !== 'none') renderStats();
    }
    // Historial de amenazas
    if (changes.threatHistory) {
      S.threatHistory = changes.threatHistory.newValue ?? [];
    }
    // Family mode
    if (changes.equippedOutfit) {
      S.equippedOutfit = changes.equippedOutfit.newValue ?? {};
      renderHome();
    }
    if (changes.familyModeEnabled) {
      S.familyMode = !!changes.familyModeEnabled.newValue;
    }
    if (changes.familySettings) {
      S.familySettings = changes.familySettings.newValue ?? {};
    }
    if (changes.timeLimitReached !== undefined) {
      S.timeLimitReached = !!changes.timeLimitReached?.newValue;
    }

    if (needsHomeRefresh) renderHome();
  });

  // Navegar a la sección indicada en el hash (#home, #vault, etc.)
  const hash = window.location.hash.slice(1);
  if (hash && hash !== 'home') {
    navigateToPage(hash);
  } else if (hash === 'home' || !hash) {
    // Ya está en home por defecto
  }

  // Auto-actualizar actividad reciente y stats cuando el background las modifica
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  // Actividad nueva
  if (changes.activities) {
    S.activities = changes.activities.newValue ?? [];
    renderActivities();
  }

  // Salud del gato
  if (changes.petHealth || changes.petState) {
    if (changes.petHealth) S.health = changes.petHealth.newValue ?? S.health;
    if (changes.petState)  S.petState = changes.petState.newValue ?? S.petState;
    renderHome();
  }

  // Puntos y monedas
  if (changes.userPoints || changes.userCoins) {
    if (changes.userPoints) S.points = Math.floor(changes.userPoints.newValue ?? S.points);
    if (changes.userCoins)  S.coins  = changes.userCoins.newValue ?? S.coins;
    renderHome();
  }

  // Amenazas
  if (changes.threatsBlocked || changes.threatHistory) {
    if (changes.threatsBlocked) S.threatsBlocked = changes.threatsBlocked.newValue ?? S.threatsBlocked;
    if (changes.threatHistory)  S.threatHistory  = changes.threatHistory.newValue ?? [];
    renderHome();
    // Si stats está abierto, actualizar también
    if (document.querySelector('[data-page="stats"]')?.classList.contains('active')) {
      renderThreats();
    }
  }

  // dailyStats (tiempo de pantalla, páginas visitadas)
  if (changes.dailyStats) {
    S.dailyStats = changes.dailyStats.newValue ?? {};
    S.screenMinutes = Math.round((S.dailyStats.screenMinutes ?? 0) * 10) / 10;
    renderHome();
  }

  // FIX SYNC: Family Mode activado/desactivado desde el popup → refrescar panel si está abierto
  if (changes.familyModeEnabled !== undefined) {
    S.familyMode = !!changes.familyModeEnabled.newValue;
    if (document.querySelector('[data-page="family"]')?.classList.contains('active')) {
      _familyAuthed = !!changes.familyModeEnabled.newValue && _familyAuthed;
      renderFamilyPanel();
    }
  }
  if (changes.familySettings) {
    S.familySettings = changes.familySettings.newValue ?? {};
    if (document.querySelector('[data-page="family"]')?.classList.contains('active')) {
      renderFamilyPanel();
    }
  }
});

});

// ── CARGA DE DATOS ────────────────────────────────────────────────────────

async function loadData() {
  const [stored, timeRes] = await Promise.all([
    chrome.storage.local.get([
      'userPoints','userCoins','petHealth','threatsBlocked',
      'keywords','whitelist','activities','petState','threatHistory',
      'petName','userName','userTitle','shopInventory','equippedCloth','equippedItem','equippedOutfit',
      'notificationsEnabled','shimeijiEnabled',
      'passwordCheckEnabled','keywordCensorEnabled','phishingDetectEnabled',
      'familyModeEnabled','familySettings',
      'dailyStats','weeklyStats','streakStats',
      'pageHistory','timeLimitReached','themeColor',
    ]),
    chrome.runtime.sendMessage({ type: 'GET_SCREEN_TIME' }).catch(() => ({ minutes: 0 })),
  ]);

  S = {
    points:           Math.floor(stored.userPoints   ?? 0),
    coins:            stored.userCoins                ?? 0,
    health:           stored.petHealth                ?? 100,
    threatsBlocked:   stored.threatsBlocked           ?? 0,
    keywords:         stored.keywords                 ?? [],
    whitelist:        stored.whitelist                ?? [],
    activities:       stored.activities               ?? [],
    threatHistory:    stored.threatHistory            ?? [],
    pageHistory:      stored.pageHistory              ?? {},
    petState:         stored.petState                 ?? 'neutral',
    petName:          stored.petName                  ?? 'CyberPet',
    userName:         stored.userName                 ?? '',
    userTitle:        stored.userTitle                ?? 'Novato Digital',
    shopInventory:    stored.shopInventory            ?? [],
    equippedCloth:    stored.equippedCloth             ?? null,
    equippedOutfit:   stored.equippedOutfit            ?? {},  // multi-slot
    equippedItem:     stored.equippedItem              ?? null,
    familyMode:       !!stored.familyModeEnabled,
    familySettings:   stored.familySettings           ?? {},
    dailyStats:       stored.dailyStats               ?? {},
    weeklyStats:      stored.weeklyStats              ?? [],
    streakStats:      stored.streakStats              ?? {},
    timeLimitReached: !!stored.timeLimitReached,
    screenMinutes:    Math.round((timeRes?.minutes ?? 0) * 10) / 10,
    themeColor:       stored.themeColor               ?? 'blue',
  };

  // Sincronizar estado de los toggles en el HTML
  const toggleMap = {
    'notifications-toggle':   stored.notificationsEnabled  !== false,
    'shimeji-toggle':         stored.shimeijiEnabled       !== false,
    'password-check-toggle':  stored.passwordCheckEnabled  !== false,
    'keyword-censor-toggle':  stored.keywordCensorEnabled  !== false,
    'phishing-detect-toggle': stored.phishingDetectEnabled !== false,
  };
  for (const [id, val] of Object.entries(toggleMap)) {
    const el = $(id);
    if (el) el.checked = val;
  }
}

// ── TEMA ──────────────────────────────────────────────────────────────────

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  document.querySelectorAll('.theme-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.theme === theme);
    s.setAttribute('aria-pressed', s.dataset.theme === theme ? 'true' : 'false');
  });
}

// ── NAVEGACIÓN ────────────────────────────────────────────────────────────

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => { e.preventDefault(); navigateToPage(item.dataset.page); });
    // Soporte de teclado
    item.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigateToPage(item.dataset.page); }
    });
  });
}

function navigateToPage(page) {
  const target = $(`page-${page}`);
  if (!target) return;

  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  target.classList.add('active');

  // Render lazy — solo cuando se abre la sección
  switch (page) {
    case 'stats':     renderStats(); break;
    case 'family':    renderFamilyPanel(); break;
    case 'shop':      renderShop(); break;
    case 'vault':     renderVaultDash(); break;
    case 'inventory': renderInventory(); break;
    case 'badges':    renderBadges(); break;
    case 'tools':     if (!_toolsInited) { initTools(); _toolsInited = true; } break;
    case 'edu':       initEduDash(); break;
    case 'settings':  renderExportImport(); break;
    case 'chat':      if (!_chatInited)  { initDashChat(); _chatInited = true; } break;
  }
}

// ── HOME ──────────────────────────────────────────────────────────────────

function renderHome() {
  const timeStr = fmtMin(S.screenMinutes);
  const derivedState = S.health >= 70 ? 'happy' : S.health >= 50 ? 'neutral' : 'sick';
  if (S.petState !== derivedState) S.petState = derivedState;

  setText('total-points',    S.points);
  setText('total-coins',     S.coins);
  setText('cat-health',      S.health + '%');
  setText('threats-count',   S.threatsBlocked);
  setText('screen-time-val', timeStr);
  setText('pet-name-dash',   S.petName);
  setText('sidebar-pet-name',S.petName);
  setText('user-title-dash', S.userTitle);
  setText('streak-val-dash', S.streakStats?.currentStreak ?? 0);
  setText('sidebar-points',  S.points);
  setText('sidebar-coins',   S.coins);
  setText('sidebar-time',    timeStr);
  setText('home-pages-today', S.dailyStats?.pagesVisited ?? 0);

  // Barra de salud
  const healthBar = $('home-health-bar');
  if (healthBar) {
    healthBar.style.width = `${S.health}%`;
    healthBar.style.background =
      S.health >= 70 ? 'linear-gradient(90deg,#22c55e,#4ade80)' :
      S.health >= 40 ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' :
                       'linear-gradient(90deg,#ef4444,#f87171)';
  }

  // Aura del gato según estado
  const aura = $('home-pet-aura');
  if (aura) {
    aura.dataset.state = derivedState;
  }

  const deathAlert = $('death-alert');
  if (deathAlert) deathAlert.style.display = S.health === 0 ? 'flex' : 'none';

  const petImg = $('main-pet-img');
  if (petImg) {
    petImg.src           = `../assets/sprites/${S.petState}.png`;
    petImg.style.opacity = S.health === 0 ? '0.4' : '1';
    petImg.style.filter  = S.health === 0 ? 'grayscale(80%)' : 'none';
  }
  // Actualizar capas de ropa en home y sidebar
  const _outfitForLayers = (() => {
    const o = S.equippedOutfit;
    if (o && typeof o === 'object' && Object.values(o).some(Boolean)) return o;
    return S.equippedCloth || null;
  })();
  _applyOutfitLayers('main-pet-wrapper', _outfitForLayers);
  _applyOutfitLayers('sidebar-pet-wrapper', _outfitForLayers);
  const sideImg = $('sidebar-pet-img');
  if (sideImg) sideImg.src = `../assets/sprites/${S.petState}.png`;

  // Texto de estado
  const statusEl  = $('pet-status-text');
  const messageEl = $('pet-message');
  if (statusEl && messageEl) {
    const hp   = S.health;
    const name = S.petName;
    if      (hp === 0)  { statusEl.textContent = `${name} ha muerto 💀`;    messageEl.textContent = 'Revívelo desde el botón de arriba.'; }
    else if (hp >= 80)  { statusEl.textContent = `${name} está feliz 😺`;   messageEl.textContent = '¡Excelente! Navegación segura.'; }
    else if (hp >= 50)  { statusEl.textContent = `${name} está neutral 😐`; messageEl.textContent = 'Puedes mejorar tus prácticas de seguridad.'; }
    else                { statusEl.textContent = `${name} está enfermo 😷`; messageEl.textContent = '⚠️ Cuida más tu seguridad en línea.'; }
  }

  // Botón toggle pet
  const toggleBtn = $('toggle-pet-btn');
  if (toggleBtn) {
    const shimeijiEl = $('shimeji-toggle');
    const isVisible  = shimeijiEl ? shimeijiEl.checked : true;
    toggleBtn.textContent = isVisible ? '👁️ Ocultar CyberCat' : '🙈 Mostrar CyberCat';
  }
}

function setupHomeListeners() {
  $('btn-revive')?.addEventListener('click', async () => {
    if (!confirm('¿Revivir a tu CyberPet? (−50 puntos)')) return;
    const res = await chrome.runtime.sendMessage({ type: 'REVIVE_PET' });
    if (res?.revived) {
      await loadData();
      renderHome();
      renderActivities();
      showToast('💚 ¡CyberPet revivido!');
    }
  });
}

// ── ACTIVIDADES ───────────────────────────────────────────────────────────

function renderActivities() {
  const list = $('activity-list');
  if (!list) return;

  if (!S.activities.length) {
    list.innerHTML = '<p style="color:var(--text-muted);padding:16px;text-align:center;">Sin actividad reciente</p>';
    return;
  }

  list.innerHTML = S.activities.slice(0, 20).map(a => {
    const text = (typeof a === 'object' && a && 'text' in a) ? String(a.text ?? '') : String(a ?? '');
    const date = (typeof a === 'object' && a && 'date' in a) ? String(a.date ?? '') : '';
    return `<div class="activity-item">
      <span class="act-text">${escHtml(text)}</span>
      <span class="act-date">${escHtml(date)}</span>
    </div>`;
  }).join('');
}

// ── ESTADÍSTICAS ──────────────────────────────────────────────────────────

function renderStats() {
  const ds = S.dailyStats ?? {};
  setText('stat-pages-today',    ds.pagesVisited     ?? 0);
  setText('stat-threats-today',  ds.threatsSeen      ?? 0);
  setText('stat-keywords-today', ds.keywordsCensored ?? 0);
  setText('stat-time-today',     fmtMin(S.screenMinutes));
  setText('stat-total-points',   S.points);
  setText('stat-streak',         S.streakStats?.currentStreak ?? 0);

  // Totales históricos (suma semanal + hoy)
  const weeklyPages   = (S.weeklyStats ?? []).reduce((a, d) => a + (d.pagesVisited || 0), 0);
  const totalPages    = weeklyPages + (ds.pagesVisited ?? 0);
  setText('stat-total-pages',    totalPages);
  setText('stat-total-threats',  S.threatsBlocked ?? 0);
  setText('stat-total-coins',    S.coins);

  chrome.storage.local.get('badges').then(({ badges = [] }) => {
    setText('stat-total-badges', badges.length);
  });

  renderDashUsage();
  renderWeeklyChart();
  renderTopPages();
  renderThreats();
}

async function renderDashUsage() {
  const today = new Date().toDateString();
  const { dashUsage = {} } = await chrome.storage.local.get('dashUsage');

  const timeToday   = dashUsage.date === today ? (dashUsage.timeToday || 0) : 0;
  const opensToday  = dashUsage.date === today ? (dashUsage.opensToday || 0) : 0;
  const timeTotal   = dashUsage.timeTotal  || 0;
  const opensTotal  = dashUsage.opensTotal || 0;
  const lastOpen    = dashUsage.lastOpen   || '—';
  const avgSession  = opensTotal > 0
    ? Math.round((timeTotal / opensTotal) * 10) / 10
    : 0;

  // Tiempo de sesión actual (desde que se abrió el dashboard esta vez)
  const sessionNow = Math.round((Date.now() - _dashUsage.sessionStart) / 60000 * 10) / 10;

  setText('stat-dash-time-today',   fmtMin(timeToday));
  setText('stat-dash-opens-today',  opensToday);
  setText('stat-dash-time-total',   fmtMin(timeTotal));
  setText('stat-dash-opens-total',  opensTotal);
  setText('stat-dash-avg-session',  fmtMin(avgSession));
  setText('stat-dash-last-open',    lastOpen);
  setText('stat-dash-session-now',  fmtMin(sessionNow));

  // Mostrar barra de sesión actual si hay tiempo activo
  const barWrap = $('dash-session-bar-wrap');
  if (barWrap) barWrap.style.display = sessionNow >= 0.1 ? '' : 'none';
}

function renderWeeklyChart() {
  const canvas = $('weekly-chart');
  if (!canvas) return;

  const ctx  = canvas.getContext('2d');
  const ws   = S.weeklyStats ?? [];
  const W    = canvas.width;
  const H    = canvas.height;
  const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

  ctx.clearRect(0, 0, W, H);

  if (!ws.length) {
    ctx.fillStyle = '#aaa';
    ctx.font      = '13px Roboto Condensed, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Aún no hay datos semanales', W / 2, H / 2);
    return;
  }

  const maxMin = Math.max(...ws.map(d => d.screenMinutes ?? 0), 30);
  const barW   = Math.floor((W - 40) / 7);

  // FIX #7: resolver variables CSS con getComputedStyle en lugar de pasarlas al canvas
  const style       = getComputedStyle(document.body);
  const accentColor = style.getPropertyValue('--accent').trim()     || '#3571A9';
  const mutedColor  = style.getPropertyValue('--text-muted').trim() || '#667799';

  ws.slice(-7).forEach((day, i) => {
    const mins  = day.screenMinutes ?? 0;
    const barH  = Math.round((mins / maxMin) * (H - 36));
    const x     = 20 + i * barW;
    const y     = H - 18 - barH;
    const color = (day.threatsSeen ?? 0) > 0 ? '#ef4444' : accentColor;

    // Barra con esquinas redondeadas (roundRect disponible en Chrome 99+)
    ctx.fillStyle = color;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x + 3, y, barW - 10, Math.max(barH, 2), 4);
    else               ctx.rect(x + 3, y, barW - 10, Math.max(barH, 2));
    ctx.fill();

    // Etiqueta del día
    ctx.fillStyle = mutedColor;
    ctx.font      = '10px Roboto Condensed, sans-serif';
    ctx.textAlign = 'center';
    try {
      const d = new Date(day.date ?? Date.now());
      ctx.fillText(DAYS[d.getDay()], x + barW / 2 - 2, H - 4);
    } catch {}
  });
}

function renderTopPages() {
  const container = $('top-pages-list');
  if (!container) return;

  const entries = Object.entries(S.pageHistory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  if (!entries.length) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:.83rem;padding:8px 0;">Sin datos aún</p>';
    return;
  }

  const max = entries[0][1];
  container.innerHTML = entries.map(([host, count]) => `
    <div class="top-page-row">
      <span class="top-page-host" title="${escHtml(host)}">${escHtml(host)}</span>
      <div class="top-page-bar-bg">
        <div class="top-page-bar" style="width:${Math.round(count / max * 100)}%"></div>
      </div>
      <span class="top-page-count">${count}</span>
    </div>`).join('');
}

function renderThreats() {
  const list = $('threat-list');
  if (!list) return;

  if (!S.threatHistory.length) {
    list.innerHTML = '<p style="color:var(--text-muted);padding:16px;text-align:center;">Sin amenazas registradas 🎉</p>';
    return;
  }

  const riskIcon = { high:'🔴', medium:'🟡', low:'🟢' };
  list.innerHTML = S.threatHistory.slice(0, 20).map(t => `
    <div class="threat-item">
      <span>${riskIcon[t.riskLevel ?? 'medium'] ?? '⚠️'}</span>
      <div class="threat-info">
        <strong class="threat-type">${escHtml(t.type ?? 'Amenaza')}</strong>
        <span  class="threat-host">${escHtml(t.hostname ?? t.url ?? 'desconocido')}</span>
        ${t.reasons ? `<span class="threat-reason">${escHtml(t.reasons)}</span>` : ''}
      </div>
      <span class="threat-date">${escHtml(t.date ?? '')}</span>
    </div>`).join('');
}

// ── KEYWORDS & WHITELIST ──────────────────────────────────────────────────

function renderKeywords() {
  const list = $('keyword-list');
  if (!list) return;

  if (!S.keywords.length) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;">Sin keywords configuradas</p>';
    return;
  }

  list.innerHTML = S.keywords.map(kw => chipHtml(kw)).join('');
  list.querySelectorAll('.chip-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const val = btn.dataset.val;
      S.keywords = S.keywords.filter(k => k !== val);
      await chrome.storage.local.set({ keywords: S.keywords });
      renderKeywords();
    });
  });
}

function renderWhitelist() {
  const list = $('whitelist-list');
  if (!list) return;

  if (!S.whitelist.length) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;">Sin sitios en whitelist</p>';
    return;
  }

  list.innerHTML = S.whitelist.map(s => chipHtml(s)).join('');
  list.querySelectorAll('.chip-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const val = btn.dataset.val;
      S.whitelist = S.whitelist.filter(s => s !== val);
      await chrome.storage.local.set({ whitelist: S.whitelist });
      renderWhitelist();
    });
  });
}

function chipHtml(val) {
  return `<div class="chip">
    <span>${escHtml(val)}</span>
    <button class="chip-remove" data-val="${escHtml(val)}" type="button" aria-label="Eliminar ${escHtml(val)}">×</button>
  </div>`;
}

// ── SHOP ──────────────────────────────────────────────────────────────────

function renderShop() {
  setText('shop-coins-dash',  S.coins);
  setText('shop-points-dash', S.points);

  // FIX M4: ocultar tab Tiempo Extra si Family Mode no está activo o coins desactivadas
  const familyActive    = S.familyMode;
  const coinPurchasesOn = S.familySettings?.allowCoinPurchases !== false;
  const showExtraTime   = familyActive && coinPurchasesOn;
  const extraTimeTabEl  = $('dash-tab-extra-time');
  if (extraTimeTabEl) {
    extraTimeTabEl.style.display = showExtraTime ? '' : 'none';
    // Si la tab activa era extra_time y se ocultó, resetear a cloth
    if (_shopTabActive === 'extra_time' && !showExtraTime) {
      _shopTabActive = 'cloth';
      document.querySelectorAll('.shop-tab-dash').forEach(b => {
        const active = b.dataset.type === 'cloth';
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
    }
  }

  // FIX #4: registrar listeners solo una vez con onclick (sobrescribe el anterior)
  document.querySelectorAll('.shop-tab-dash').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.shop-tab-dash').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      _shopTabActive = btn.dataset.type;
      drawShopGrid();
    };
  });

  drawShopGrid();
}

// FIX #16: catálogo cacheado localmente — no hay round-trip al background en cada render
let _shopCatalog = null;

async function drawShopGrid() {
  const grid = $('shop-grid-dash');
  if (!grid) return;

  // Cargar catálogo solo la primera vez
  if (!_shopCatalog) {
    const res = await chrome.runtime.sendMessage({ type: 'GET_SHOP_CATALOG' });
    _shopCatalog = res?.catalog ?? [];
  }

  // FIX M4: excluir extra_time del catálogo si Family Mode no está activo
  const showExtraTime = S.familyMode && (S.familySettings?.allowCoinPurchases !== false);
  const filtered = _shopCatalog.filter(item => {
    if (item.type === 'extra_time' && !showExtraTime) return false;
    return item.type === _shopTabActive;
  });

  if (!filtered.length) {
    grid.innerHTML = '<p style="color:var(--text-muted);padding:12px;grid-column:1/-1;">Sin items en esta categoría</p>';
    return;
  }

  grid.innerHTML = filtered.map(item => {
    const owned      = S.shopInventory.includes(item.id);
    const canAfford  = item.currency === 'coins'
      ? S.coins  >= item.price
      : S.points >= item.price;
    const icon       = SHOP_ICONS[item.id] ?? '🎁';
    const comingSoon = !!item.comingSoon;

    return `
    <div class="shop-card${owned ? ' owned' : ''}${!canAfford && !owned && !comingSoon ? ' cant-afford' : ''}${comingSoon ? ' coming-soon' : ''}">
      <span class="shop-card-icon">${icon}</span>
      <div class="shop-card-name">${escHtml(item.name)}</div>
      ${comingSoon
        ? '<div class="shop-coming-label">✨ Próximamente</div>'
        : `<div class="shop-card-price ${item.currency === 'coins' ? 'price-c' : 'price-p'}">
             ${item.currency === 'coins' ? '🪙' : '🏆'} ${item.price}
           </div>
           ${owned
             ? '<div class="shop-owned-label">✓ Lo tienes</div>'
             : `<button class="btn-shop-buy" data-id="${item.id}" ${!canAfford ? 'disabled' : ''} type="button">
                  ${canAfford ? 'Comprar' : 'Sin fondos'}
                </button>`
           }`}
    </div>`;
  }).join('');

  // Evento delegado en el grid — evita múltiples listeners por botón
  grid.onclick = async e => {
    const btn = e.target.closest('.btn-shop-buy:not([disabled])');
    if (!btn) return;
    const res = await chrome.runtime.sendMessage({ type: 'SHOP_BUY', item: btn.dataset.id });
    if (res?.ok) {
      await loadData();
      renderHome();
      renderShop();
      showToast('✅ ¡Comprado!');
    } else {
      showToast('❌ ' + (res?.error ?? 'Sin fondos'));
    }
  };
}

// ── INVENTARIO (dress-up multi-slot) ─────────────────────────────────────

// Mapa slot → ids de items que van en ese slot
const SLOT_MAP = {
  hat:  ['cloth_hat_cap'],
  neck: ['cloth_bow_neck', 'cloth_scarf_pink'],
  tail: ['cloth_bow_tail'],
  feet: ['cloth_shoes_beige'],
  acc:  ['cloth_glasses_heart'],
};
const SLOT_LABELS = { hat:'🎩 Cabeza', neck:'🎀 Cuello', tail:'🎗️ Cola', feet:'👟 Pies', acc:'👓 Accesorios' };

function _slotOfItem(id) {
  for (const [slot, ids] of Object.entries(SLOT_MAP)) {
    if (ids.includes(id)) return slot;
  }
  return null;
}

// Aplica capas de outfit sobre un wrapper (home, sidebar, probador)
// outfitOrId puede ser: null, string (legacy), o objeto {hat,neck,...}
function _applyOutfitLayers(wrapperId, outfitOrId) {
  const wrapper = $(wrapperId);
  if (!wrapper) return;
  wrapper.querySelectorAll('.dash-cloth-layer').forEach(l => l.remove());
  let items = [];
  if (!outfitOrId) {
    items = [];
  } else if (typeof outfitOrId === 'string') {
    items = [outfitOrId];
  } else if (typeof outfitOrId === 'object') {
    items = Object.values(outfitOrId).filter(Boolean);
  }
  items.forEach(id => {
    const img = document.createElement('img');
    img.className = 'dash-cloth-layer';
    img.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;pointer-events:none;z-index:2;';
    img.src = `../assets/clothes/${id}.png`;
    img.onerror = () => img.remove();
    wrapper.appendChild(img);
  });
}

// Draft del probador (descartado si no se guarda)
let _draftOutfit = {};

function renderInventory() {
  if (!_shopCatalog) {
    chrome.runtime.sendMessage({ type: 'GET_SHOP_CATALOG' }).then(res => {
      _shopCatalog = res?.catalog ?? [];
      renderInventory();
    });
    return;
  }

  // Inicializar draft: preferir equippedOutfit si tiene items, sino migrar equippedCloth legacy
  const savedOutfit = S.equippedOutfit ?? {};
  const hasOutfit   = Object.values(savedOutfit).some(Boolean);
  if (hasOutfit) {
    _draftOutfit = { ...savedOutfit };
  } else if (S.equippedCloth) {
    // Migración automática: poner el item legacy en su slot correcto
    const legacySlot = _slotOfItem(S.equippedCloth) ?? 'neck';
    _draftOutfit = { [legacySlot]: S.equippedCloth };
  } else {
    _draftOutfit = {};
  }

  const inv        = S.shopInventory ?? [];
  const clothItems = inv.filter(id => id.startsWith('cloth_'));

  // ── Probador visual (dress-up) ───────────────────────────────────────────
  const tryonEl = $('inv-tryon-preview');
  if (tryonEl) {
    tryonEl.innerHTML = `
      <div id="tryon-wrapper" style="position:relative;width:120px;height:120px;margin:0 auto 8px;display:inline-block;">
        <img id="tryon-sprite" src="../assets/sprites/${S.petState ?? 'neutral'}.png"
             style="width:120px;height:120px;object-fit:contain;display:block;" alt="CyberPet">
      </div>
      <p style="font-size:.78rem;color:var(--text-muted);">Haz clic en los accesorios para probarlos 🎨</p>`;
    _refreshTryonLayers(); // mostrar outfit actual en el probador
  }

  // ── Accesorios por slot ──────────────────────────────────────────────────
  const clothEl = $('inv-cloth-list');
  if (clothEl) {
    if (!clothItems.length) {
      clothEl.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;grid-column:1/-1;">¡Aún no tienes accesorios. ¡Visita la Tienda!</p>';
    } else {
      const bySlot = {};
      clothItems.forEach(id => {
        const slot = _slotOfItem(id) ?? 'acc';
        if (!bySlot[slot]) bySlot[slot] = [];
        bySlot[slot].push(id);
      });

      clothEl.innerHTML = Object.entries(bySlot).map(([slot, ids]) => `
        <div class="inv-slot-group" data-slot="${slot}">
          <div class="inv-slot-label">${SLOT_LABELS[slot] ?? slot}</div>
          <div class="inv-slot-items">
            ${ids.map(id => {
              const item = _shopCatalog.find(i => i.id === id);
              const icon = SHOP_ICONS[id] ?? '🎁';
              const isOn = _draftOutfit[slot] === id;
              return `<div class="shop-card inv-cloth-card${isOn ? ' owned' : ''}" data-id="${id}" data-slot="${slot}" style="cursor:pointer;min-width:90px;">
                <span class="shop-card-icon">${icon}</span>
                <div class="shop-card-name">${escHtml(item?.name ?? id)}</div>
                <div class="inv-slot-badge">${isOn ? '✓ Puesto' : 'Probar'}</div>
              </div>`;
            }).join('')}
          </div>
        </div>`).join('');

      // Toggle slot al clicar tarjeta — usar onclick para evitar listeners duplicados
      clothEl.onclick = e => {
        const card = e.target.closest('.inv-cloth-card');
        if (!card) return;
        const { id, slot } = card.dataset;
        if (_draftOutfit[slot] === id) {
          delete _draftOutfit[slot];
        } else {
          _draftOutfit[slot] = id;
        }
        // Actualizar solo las tarjetas del mismo slot
        clothEl.querySelectorAll(`.inv-cloth-card[data-slot="${slot}"]`).forEach(c => {
          const on = _draftOutfit[slot] === c.dataset.id;
          c.classList.toggle('owned', on);
          c.querySelector('.inv-slot-badge').textContent = on ? '✓ Puesto' : 'Probar';
        });
        _refreshTryonLayers();
      };
    }
  }

  // ── Botón guardar outfit ─────────────────────────────────────────────────
  const saveBtn = $('inv-save-outfit');
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const outfit = { ..._draftOutfit };
      await chrome.runtime.sendMessage({ type: 'EQUIP_ITEM', itemType: 'outfit', outfit });
      S.equippedOutfit = outfit;
      S.equippedCloth  = Object.values(outfit).filter(Boolean)[0] ?? null;
      await chrome.storage.local.set({ equippedOutfit: outfit, equippedCloth: S.equippedCloth });
      renderHome();
      showToast('🐱 ¡Outfit guardado!');
    };
  }

  // ── Botón quitar todo ────────────
  const clearBtn = $('inv-clear-outfit');
  if (clearBtn) {
    clearBtn.onclick = () => {
      _draftOutfit = {};
      document.querySelectorAll('.inv-cloth-card').forEach(c => {
        c.classList.remove('owned');
        const badge = c.querySelector('.inv-slot-badge');
        if (badge) badge.textContent = 'Probar';
      });
      _refreshTryonLayers();
    };
  }

  // ── Títulos ──────────────────────────────────────────────────────────────
  const titleEl = $('inv-title-list');
  if (titleEl) {
    const titleItems = inv.filter(id => id.startsWith('title_'));
    if (!titleItems.length) {
      titleEl.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;grid-column:1/-1;">Sin títulos desbloqueados aún.</p>';
    } else {
      titleEl.innerHTML = titleItems.map(id => {
        const item  = _shopCatalog.find(i => i.id === id);
        const icon  = SHOP_ICONS[id] ?? '🏅';
        const isAct = S.userTitle === item?.text;
        return `
        <div class="shop-card${isAct ? ' owned' : ''}">
          <span class="shop-card-icon">${icon}</span>
          <div class="shop-card-name">${escHtml(item?.name ?? id)}</div>
          ${isAct
            ? '<div class="shop-owned-label">✓ Activo</div>'
            : `<button class="btn-shop-buy inv-title-btn" data-id="${id}" data-text="${escHtml(item?.text ?? id)}" type="button">Activar</button>`}
        </div>`;
      }).join('');

      titleEl.querySelectorAll('.inv-title-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const text = btn.dataset.text;
          await chrome.storage.local.set({ userTitle: text });
          S.userTitle = text;
          renderInventory();
          renderHome();
          showToast(`🏅 Título "${text}" activado`);
        });
      });
    }
  }
}

// Actualiza capas en el probador con _draftOutfit actual
function _refreshTryonLayers() {
  const wrapper = $('tryon-wrapper');
  if (!wrapper) return;
  wrapper.querySelectorAll('.tryon-cloth-layer').forEach(l => l.remove());
  Object.values(_draftOutfit).filter(Boolean).forEach(id => {
    const img = document.createElement('img');
    img.className = 'tryon-cloth-layer';
    img.style.cssText = 'position:absolute;top:0;left:0;width:120px;height:120px;object-fit:contain;pointer-events:none;';
    img.src = `../assets/clothes/${id}.png`;
    img.onerror = () => img.remove();
    wrapper.appendChild(img);
  });
}

// ── VAULT ─────────────────────────────────────────────────────────────────

async function renderVaultDash() {
  const { vaultLocked, vaultPin } = await chrome.storage.local.get(['vaultLocked','vaultPin']);
  _vaultUnlocked = !vaultPin || vaultLocked === false;

  $('dash-vault-lock').style.display = _vaultUnlocked ? 'none'  : 'block';
  $('dash-vault-open').style.display = _vaultUnlocked ? 'block' : 'none';

  if (_vaultUnlocked) renderVaultEntries();
}

async function renderVaultEntries(filter = '') {
  const { vault = [] } = await chrome.runtime.sendMessage({ type: 'VAULT_GET' });
  const container      = $('dash-vault-entries');
  if (!container) return;

  const lowerFilter = filter.toLowerCase();
  const list = filter
    ? vault.filter(e =>
        e.site.toLowerCase().includes(lowerFilter) ||
        e.username.toLowerCase().includes(lowerFilter)
      )
    : vault;

  if (!list.length) {
    container.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:20px;">
      ${filter ? 'Sin resultados para "' + escHtml(filter) + '"' : 'Sin contraseñas guardadas. ¡Añade una!'}
    </p>`;
    return;
  }

  container.innerHTML = list.map(e => `
    <div class="vault-entry-dash">
      <div class="vault-entry-icon">${vaultIcon(e.site)}</div>
      <div class="vault-entry-info">
        <div class="vault-entry-site">${escHtml(e.site)}</div>
        <div class="vault-entry-user" id="vu-${e.id}">${escHtml(e.username)}</div>
        <div class="vault-entry-date">${escHtml(e.date ?? '')}</div>
      </div>
      <div class="vault-entry-actions">
        <button class="btn-entry" data-action="copy"
                data-pwd="${encodeURIComponent(e.password ?? '')}"
                title="Copiar contraseña" type="button">📋</button>

        <button class="btn-entry" data-action="show"
                data-pwd="${encodeURIComponent(e.password ?? '')}"
                data-user="${encodeURIComponent(e.username ?? '')}"
                data-id="${e.id}" title="Ver contraseña" type="button">👁️</button>

        <button class="btn-entry" data-action="del"  data-id="${e.id}" title="Eliminar" type="button">🗑️</button>
      </div>
    </div>`).join('');

  // Evento delegado en el contenedor
  container.onclick = async e => {
    const btn = e.target.closest('.btn-entry');
    if (!btn) return;
    const { action } = btn.dataset;

    if (action === 'copy') {
      const rawPwd = btn.dataset.pwd ?? '';
      let pwd = rawPwd;
      try { pwd = decodeURIComponent(rawPwd); } catch {}
      await navigator.clipboard.writeText(pwd);
      showToast('✅ Contraseña copiada');

    } else if (action === 'show') {
      const infoEl = $(`vu-${btn.dataset.id}`);
      if (!infoEl) return;

      const rawPwd  = btn.dataset.pwd ?? '';
      const rawUser = btn.dataset.user ?? '';

      let pwd = rawPwd;
      let user = rawUser;
      try { pwd = decodeURIComponent(rawPwd); } catch {}
      try { user = decodeURIComponent(rawUser); } catch {}

      if (btn.dataset.showing) {
        infoEl.textContent = user;
        delete btn.dataset.showing;
        btn.textContent    = '👁️';
      } else {
        infoEl.textContent   = `🔑 ${pwd}`;
        btn.dataset.showing  = '1';
        btn.textContent      = '🙈';
        setTimeout(() => {
          if (btn.dataset.showing) {
            infoEl.textContent = user;
            delete btn.dataset.showing;
            btn.textContent    = '👁️';
          }
        }, 5000);
      }

    } else if (action === 'del') {
      if (!confirm('¿Eliminar esta contraseña?')) return;
      await chrome.runtime.sendMessage({ type: 'VAULT_DELETE', id: btn.dataset.id });
      showToast('🗑️ Eliminado');
      renderVaultEntries($('dash-vault-search')?.value ?? '');
    }
  };
}

function _applyStrengthBar(barId, labelId, password) {
  const bar   = $(barId);
  const label = $(labelId);
  if (!bar) return;
  const score = pwdScore(password);
  const info  = pwdLabel(score);
  bar.style.width      = score + '%';
  bar.style.background = info.color;
  if (label) label.textContent = password ? info.text : '';
}

// ── TOOLS ─────────────────────────────────────────────────────────────────

function initTools() {
  // Verificador de contraseña
  $('dash-pwd-input')?.addEventListener('input', e => {
    _applyStrengthBar('dash-pwd-bar', 'dash-pwd-label', e.target.value);
  });

  // Generador
  $('dash-gen-len')?.addEventListener('input', e => {
    setText('dash-gen-len-val', e.target.value);
  });

  $('dash-gen-btn')?.addEventListener('click', () => {
    const len = parseInt($('dash-gen-len')?.value ?? '16', 10);
    const pwd = genPassword(len);
    const out  = $('dash-gen-out');
    const copy = $('dash-gen-copy');
    if (out)  { out.value = pwd; out.style.display = 'block'; }
    if (copy) { copy.style.display = 'inline-flex'; }
  });

  $('dash-gen-copy')?.addEventListener('click', () => {
    const val = $('dash-gen-out')?.value;
    if (val) navigator.clipboard.writeText(val).then(() => showToast('✅ Contraseña copiada'));
  });

  // HIBP email
  $('hibp-check-dash')?.addEventListener('click', () => {
    const email  = $('hibp-email-dash')?.value.trim();
    const result = $('hibp-result-dash');
    if (!result) return;

    if (!email || !email.includes('@') || !email.includes('.')) {
      result.innerHTML = '<p class="tool-error">❌ Ingresa un email válido.</p>';
      return;
    }
    result.innerHTML = `
      <p class="tool-ok" style="margin-bottom:8px;">
        La API de HIBP requiere verificar en el sitio oficial.<br>Se abrirá con tu email listo.
      </p>
      <button class="btn btn-primary btn-sm" id="hibp-open-web" type="button">
        Verificar en haveibeenpwned.com →
      </button>`;
    $('hibp-open-web')?.addEventListener('click', () => {
      chrome.tabs.create({ url: `https://haveibeenpwned.com/account/${encodeURIComponent(email)}` });
    });
  });
  $('hibp-email-dash')?.addEventListener('keypress', e => {
    if (e.key === 'Enter') $('hibp-check-dash')?.click();
  });

  // HIBP contraseña (k-anonymity)
  $('hibp-pwd-check')?.addEventListener('click', async () => {
    const pwd    = $('hibp-pwd-input')?.value;
    const result = $('hibp-pwd-result');
    if (!pwd || !result) return;

    result.innerHTML = '<span style="color:var(--text-muted)">🔍 Verificando...</span>';

    try {
      const buf    = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(pwd));
      const hex    = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('').toUpperCase();
      const prefix = hex.slice(0, 5);
      const suffix = hex.slice(5);

      const res  = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { 'Add-Padding': 'true' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const text  = await res.text();
      const found = text.split(/\r?\n/).find(line => line.toUpperCase().startsWith(suffix));

      if (found) {
        const count = parseInt(found.split(':')[1] ?? '0', 10).toLocaleString();
        result.innerHTML = `<p class="tool-error">⚠️ Esta contraseña aparece <strong>${count}</strong> veces en filtraciones conocidas. ¡Cámbiala ya!</p>`;
      } else {
        result.innerHTML = '<p class="tool-ok">✅ No aparece en filtraciones conocidas. ¡Bien!</p>';
      }
    } catch (err) {
      result.innerHTML = `<p class="tool-error">❌ Error al verificar: ${escHtml(err.message)}</p>`;
    }
  });

  // Links externos
  const extLinks = {
    'btn-virustotal':   'https://www.virustotal.com/gui/home/url',
    'btn-google-safe':  'https://transparencyreport.google.com/safe-browsing/search',
    'btn-cover-tracks': 'https://coveryourtracks.eff.org/',
    'btn-ssl-check':    'https://www.ssllabs.com/ssltest/',
  };
  for (const [id, url] of Object.entries(extLinks)) {
    $(id)?.addEventListener('click', () => chrome.tabs.create({ url }));
  }
}

// ── FAMILY PANEL ──────────────────────────────────────────────────────────

async function renderFamilyPanel() {
  const panel = $('family-panel');
  if (!panel) return;

  // Leer estado fresco desde storage para que popup y dashboard estén siempre sincronizados
  const stored = await chrome.storage.local.get([
    'familyModeEnabled','familyPinHash','familyPin',
    'familyRecoveryAnswerHash','familyRecoveryQuestion',
  ]);
  const hasPin      = !!(stored.familyPinHash || stored.familyPin);
  const hasRecovery = !!stored.familyRecoveryAnswerHash;

  // Sincronizar estado local con lo que realmente hay en storage
  S.familyMode = !!stored.familyModeEnabled || hasPin;

  // Family Mode desactivado — mostrar formulario de activación
  if (!S.familyMode) {
    // Si ya hay recovery guardado, no mostrar esos campos de nuevo
    const recoveryFieldsHtml = hasRecovery
      ? `<p style="font-size:.8rem;color:#22c55e;margin-top:4px;">✅ Pregunta de seguridad ya configurada — no hace falta volver a introducirla.</p>`
      : `<hr style="border:none;border-top:1px solid var(--border);margin:6px 0;">
         <p style="font-size:.8rem;color:var(--text-muted);">Pregunta de seguridad (para recuperar PIN si lo olvidas)</p>
         <input type="text" class="form-input" id="fs-secq" placeholder="Ej: ¿Nombre de tu primera mascota?" maxlength="80" aria-label="Pregunta de seguridad">
         <input type="text" class="form-input" id="fs-seca" placeholder="Respuesta (guárdala bien)" maxlength="60" aria-label="Respuesta de seguridad">`;

    panel.innerHTML = `
      <p style="color:var(--text-muted);font-size:.85rem;margin-bottom:12px;">
        Family Mode desactivado. Actívalo para establecer límites de pantalla.
      </p>
      <div style="display:flex;flex-direction:column;gap:8px;max-width:340px;">
        <input type="password" class="form-input" id="fs-pin1" maxlength="4" placeholder="PIN del apoderado (4 dígitos)" autocomplete="new-password">
        <input type="password" class="form-input" id="fs-pin2" maxlength="4" placeholder="Confirmar PIN" autocomplete="new-password">
        <input type="number" class="form-input" id="fs-min" value="120" min="0" max="1440" placeholder="Límite diario en minutos" aria-label="Límite en minutos">
        ${recoveryFieldsHtml}
        <p id="fs-error" class="field-error" style="display:none;" role="alert"></p>
        <button class="btn btn-primary" id="fs-activate" type="button" aria-label="Activar Family Mode">Activar Family Mode</button>
      </div>`;

    $('fs-activate')?.addEventListener('click', async () => {
      const p1  = $('fs-pin1')?.value ?? '';
      const p2  = $('fs-pin2')?.value ?? '';
      const mt  = parseInt($('fs-min')?.value ?? '120', 10);
      const err = $('fs-error');

      const showErr = msg => { if (err) { err.textContent = msg; err.style.display = 'block'; } };

      if (!/^\d{4}$/.test(p1)) { showErr('El PIN debe ser exactamente 4 dígitos.'); return; }
      if (p1 !== p2)            { showErr('Los PINs no coinciden.');                 return; }
      if (isNaN(mt) || mt < 0) { showErr('El límite debe ser un número positivo.');   return; }

      const secQ = document.getElementById('fs-secq')?.value?.trim() ?? '';
      const secA = document.getElementById('fs-seca')?.value?.trim() ?? '';
      // Solo validar recovery si no hay uno guardado ya (Patch 3 lo valida también en background)
      if (!hasRecovery && (!secQ || secA.length < 3)) {
        showErr('Agrega una pregunta y respuesta de seguridad.'); return;
      }

      const res = await chrome.runtime.sendMessage({
        type: 'FAMILY_SETUP',
        pin: p1,
        settings: { maxDailyMinutes: mt },
        recoveryQuestion: secQ || undefined,
        recoveryAnswer:   secA || undefined,
      });
      if (!res?.ok) { showErr(res?.error ?? 'Error al activar Family Mode'); return; }
      _familyAuthed = true;
      S.familyMode = true;
      await loadData();
      renderFamilyPanel();
      showToast('✅ Family Mode activado');
    });

    return;
  }

  // Family Mode activo — requiere PIN
  // FIX C2: eliminado _hp2 con salt fijo. Toda verificación de PIN va al background
  // via FAMILY_VERIFY_PIN que usa el salt aleatorio guardado en familyPinSalt.
  if (!_familyAuthed) {
    const { familyRecoveryQuestion, familySecQ } =
      await chrome.storage.local.get(['familyRecoveryQuestion', 'familySecQ']);
    const recoveryQ = familyRecoveryQuestion || familySecQ || '';
    panel.innerHTML = `<div style="max-width:320px;">
      <p style="color:var(--text-muted);font-size:.85rem;margin-bottom:12px;">Introduce el PIN del apoderado.</p>
      <div style="display:flex;gap:8px;margin-bottom:8px;">
        <input type="password" class="form-input" id="fap" maxlength="4" placeholder="PIN" style="flex:1;" aria-label="PIN de apoderado">
        <button class="btn btn-primary" id="fap-ok" type="button">Entrar</button>
      </div>
      <p id="fap-err" style="color:#ef4444;font-size:.82rem;display:none;" role="alert"></p>
      ${recoveryQ ? `<details style="margin-top:8px;"><summary style="cursor:pointer;font-size:.82rem;color:var(--text-muted);">¿Olvidaste el PIN?</summary>
        <div style="margin-top:8px;background:var(--c1);border-radius:10px;padding:12px;">
          <p style="font-size:.85rem;font-weight:600;margin-bottom:6px;">${escHtml(recoveryQ)}</p>
          <div style="display:flex;gap:8px;margin-bottom:6px;">
            <input type="text" class="form-input" id="fap-sec" placeholder="Respuesta" style="flex:1;" aria-label="Respuesta">
          </div>
          <input type="password" class="form-input" id="fap-newpin" maxlength="4" placeholder="Nuevo PIN (4 dígitos)" style="width:100%;margin-bottom:6px;">
          <button class="btn btn-primary btn-sm" id="fap-sec-ok" type="button" style="width:100%;">Recuperar acceso</button>
          <p id="fap-sec-err" style="color:#ef4444;font-size:.8rem;margin-top:4px;display:none;" role="alert"></p>
        </div></details>` : ''}
    </div>`;

    // FIX C2: usar FAMILY_VERIFY_PIN del background — salt correcto
    const doAuth = async () => {
      const p = document.getElementById('fap')?.value ?? '';
      if (!p) return;
      const errEl = document.getElementById('fap-err');
      const { valid } = await chrome.runtime.sendMessage({ type: 'FAMILY_VERIFY_PIN', pin: p });
      if (valid) {
        _familyAuthed = true;
        renderFamilyPanel();
      } else {
        if (errEl) { errEl.textContent = 'PIN incorrecto'; errEl.style.display = 'block'; }
      }
    };
    document.getElementById('fap-ok')?.addEventListener('click', doAuth);
    document.getElementById('fap')?.addEventListener('keypress', e => { if (e.key === 'Enter') doAuth(); });

    // Recuperación via pregunta de seguridad → FAMILY_RESET_PIN (hashea en background)
    document.getElementById('fap-sec-ok')?.addEventListener('click', async () => {
      const answer = (document.getElementById('fap-sec')?.value ?? '').trim();
      const newPin = (document.getElementById('fap-newpin')?.value ?? '').trim();
      const secErrEl = document.getElementById('fap-sec-err');
      if (!answer) { if (secErrEl) { secErrEl.textContent = 'Escribe la respuesta'; secErrEl.style.display = 'block'; } return; }
      if (!/^\d{4}$/.test(newPin)) { if (secErrEl) { secErrEl.textContent = 'El nuevo PIN debe ser 4 dígitos'; secErrEl.style.display = 'block'; } return; }
      const res = await chrome.runtime.sendMessage({ type: 'FAMILY_RESET_PIN', answer, newPin });
      if (res?.ok) { _familyAuthed = true; renderFamilyPanel(); showToast('✅ PIN actualizado'); }
      else { if (secErrEl) { secErrEl.textContent = res?.error ?? 'Respuesta incorrecta'; secErrEl.style.display = 'block'; } }
    });
    return;
  }

  // Family Mode activo
  const fs      = S.familySettings ?? {};
  const maxMin  = fs.maxDailyMinutes ?? 120;
  const usedMin = S.screenMinutes;
  const pct     = maxMin > 0 ? Math.min(100, Math.round(usedMin / maxMin * 100)) : 0;
  const blocked = S.timeLimitReached;

  const filterLabel = {
    high:   '🔒 Alto (más restrictivo)',
    medium: '🔐 Medio (recomendado)',
    low:    '🔓 Bajo (solo lo esencial)',
  }[fs.contentFilter ?? 'medium'] ?? '🔐 Medio';

  // ── helpers de icono y color por categoría ──────────────────────────────
  const CAT_META = {
    adult:            { icon: '🔞', label: 'Contenido adulto',           color: '#be185d' },
    gambling:         { icon: '🎰', label: 'Apuestas / Casino',          color: '#b45309' },
    downloads:        { icon: '⬇️', label: 'Descargas no autorizadas',   color: '#7c3aed' },
    violence:         { icon: '⚠️', label: 'Violencia extrema',          color: '#dc2626' },
    violence_moderate:{ icon: '🔫', label: 'Violencia / Armas',          color: '#dc2626' },
    weapons:          { icon: '🔫', label: 'Armas',                      color: '#dc2626' },
    drugs:            { icon: '💊', label: 'Drogas',                     color: '#7c3aed' },
    hate:             { icon: '🚷', label: 'Odio / Extremismo',          color: '#dc2626' },
    manual:           { icon: '🚫', label: 'Bloqueado por apoderado',    color: '#1d4ed8' },
    custom_keyword:   { icon: '🔑', label: 'Palabra bloqueada',          color: '#0369a1' },
    unverified:       { icon: '❓', label: 'Dominio no verificado',       color: '#6b7280' },
    none:             { icon: '🚫', label: 'Bloqueado',                  color: '#374151' },
  };
  const catMeta = c => CAT_META[c] ?? CAT_META.none;

  // ── qué bloquea cada nivel ────────────────────────────────────────────────
  const LEVEL_CHIPS = {
    low:    ['🔞 Adulto (obvio)', '⚠️ Violencia extrema', '🚫 Lista manual'],
    medium: ['🔞 Adulto', '🎰 Apuestas', '⬇️ Descargas', '⚠️ Violencia extrema', '🔫 Armas', '💊 Drogas', '🚫 Lista manual'],
    high:   ['🔞 Adulto', '🎰 Apuestas', '⬇️ Descargas', '⚠️ Violencia extrema', '🔫 Armas', '💊 Drogas', '🚷 Odio/Extremismo', '❓ Dominios no verificados', '🔑 Keywords custom', '🚫 Lista manual'],
  };
  const levelChips = (LEVEL_CHIPS[fs.contentFilter ?? 'medium'] ?? LEVEL_CHIPS.medium)
    .map(t => `<span style="display:inline-block;background:rgba(0,0,0,0.07);border-radius:99px;padding:2px 9px;font-size:.74rem;color:var(--text-muted);margin:2px 3px 2px 0;">${t}</span>`)
    .join('');

  // ── chips de sitios bloqueados (blockedUrls) ──────────────────────────────
  const blockedUrlsHtml = (fs.blockedUrls ?? []).length
    ? (fs.blockedUrls ?? []).map(u => `
        <div class="chip">
          <span style="font-size:.78rem;">🚫 ${escHtml(u)}</span>
          <button class="chip-remove" data-blocked-url="${escHtml(u)}" type="button" aria-label="Quitar ${escHtml(u)}">×</button>
        </div>`).join('')
    : `<p style="font-size:.8rem;color:var(--text-muted);margin:0;">Sin sitios bloqueados manualmente.</p>`;

  // ── chips de keywords bloqueadas ──────────────────────────────────────────
  const blockedKwHtml = (fs.blockedKeywords ?? []).length
    ? (fs.blockedKeywords ?? []).map(k => `
        <div class="chip">
          <span style="font-size:.78rem;">🔑 ${escHtml(k)}</span>
          <button class="chip-remove" data-blocked-kw="${escHtml(k)}" type="button" aria-label="Quitar keyword ${escHtml(k)}">×</button>
        </div>`).join('')
    : `<p style="font-size:.8rem;color:var(--text-muted);margin:0;">Sin palabras clave bloqueadas.</p>`;

  panel.innerHTML = `
    <!-- ── Cabecera estado ── -->
    <div class="family-status-row">
      <span class="fam-badge ${blocked ? 'badge-red' : 'badge-green'}">
        ${blocked ? '🔴 Bloqueado' : '🟢 Activo'}
      </span>
      <span style="font-size:.82rem;color:var(--text-muted);">${filterLabel}</span>
    </div>

    <!-- ── Barra de tiempo ── -->
    <div style="margin-bottom:14px;">
      <div class="fam-time-row">
        <span>⏱️ Tiempo usado hoy</span>
        <strong>${fmtMin(usedMin)} / ${fmtMin(maxMin+(fs.bonusMinutesToday||0))}${fs.bonusMinutesToday?` <span style='color:#22c55e;font-size:.75rem'>(+${fs.bonusMinutesToday}m extra)</span>`:''}</strong>
      </div>
      <div class="health-bar-bg">
        <div class="health-bar ${pct >= 90 ? 'low' : pct >= 70 ? 'medium' : ''}" style="width:${pct}%"></div>
      </div>
    </div>

    <!-- ═══════════ TABS ═══════════ -->
    <div id="fam-tabs" style="display:flex;gap:4px;margin-bottom:14px;border-bottom:2px solid var(--border);padding-bottom:0;">
      <button class="fam-tab fam-tab-active" data-tab="config"    type="button">⚙️ Config</button>
      <button class="fam-tab"                data-tab="blocked"   type="button">🚫 Bloqueados</button>
      <button class="fam-tab"                data-tab="keywords"  type="button">🔑 Keywords</button>
      <button class="fam-tab"                data-tab="history"   type="button">📋 Historial</button>
    </div>

    <!-- ═══ TAB: CONFIG ═══ -->
    <div id="fam-tab-config" class="fam-tab-pane">

      <div class="fam-settings-grid">
        <div class="fam-setting-row">
          <label class="fam-label" for="fam-max-min">Límite diario (min)</label>
          <input type="number" class="fam-input" id="fam-max-min" value="${maxMin}" min="0" max="1440">
        </div>
        <div class="fam-setting-row">
          <label class="fam-label" for="fam-filter">Filtro de contenido</label>
          <select class="fam-input" id="fam-filter">
            <option value="low"    ${fs.contentFilter === 'low'    ? 'selected' : ''}>🔓 Bajo</option>
            <option value="medium" ${fs.contentFilter === 'medium' ? 'selected' : ''}>🔐 Medio (recomendado)</option>
            <option value="high"   ${fs.contentFilter === 'high'   ? 'selected' : ''}>🔒 Alto</option>
          </select>
        </div>
        <div class="fam-setting-row" style="grid-column:1/-1;">
          <label class="fam-label" for="fam-msg">Mensaje al agotar tiempo</label>
          <input type="text" class="fam-input" id="fam-msg"
                 value="${escHtml(fs.timeUpMessage ?? '')}" placeholder="Mensaje personalizado...">
        </div>
      </div>

      <!-- Info del nivel activo -->
      <div style="background:var(--c1);border-radius:10px;padding:10px 12px;margin-bottom:12px;">
        <p style="font-size:.78rem;color:var(--text-muted);margin:0 0 6px;font-weight:600;">El nivel actual bloquea:</p>
        <div id="fam-level-chips">${levelChips}</div>
      </div>

      <!-- URLs siempre permitidas (whitelist) -->
      <div style="margin-bottom:12px;">
        <label class="fam-label" style="margin-bottom:5px;">✅ URLs siempre permitidas</label>
        <div style="display:flex;gap:7px;margin-bottom:7px;">
          <input type="text" class="fam-input" id="fam-url-input"
                 placeholder="ej: wikipedia.org" style="flex:1;" aria-label="URL a permitir">
          <button class="btn btn-primary btn-sm" id="fam-add-url" type="button">+</button>
        </div>
        <div id="fam-safe-list" class="chip-list">
          ${(fs.safeUrls ?? []).map(u => `
            <div class="chip">
              <span>${escHtml(u)}</span>
              <button class="chip-remove" data-url="${escHtml(u)}" type="button" aria-label="Eliminar ${escHtml(u)}">×</button>
            </div>`).join('')}
        </div>
      </div>

      <div class="fam-toggle-row">
        <label for="fam-allow-coins">🪙 Permitir comprar tiempo con monedas</label>
        <label class="toggle">
          <input type="checkbox" id="fam-allow-coins" ${fs.allowCoinPurchases !== false ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      </div>

      <div class="fam-actions">
        <input type="password" class="fam-input" id="fam-pin"
               maxlength="4" placeholder="PIN del apoderado" style="width:140px;" autocomplete="off" aria-label="PIN para confirmar cambios">
        <button class="btn btn-primary btn-sm" id="fam-save"    type="button">💾 Guardar</button>
        ${blocked ? `<button class="btn btn-secondary btn-sm" id="fam-unblock" type="button">🔓 +30 min</button>` : ''}
        <button class="btn btn-danger btn-sm"    id="fam-disable" type="button">Desactivar</button>
      </div>
      <p id="fam-error" class="field-error" style="display:none;margin-top:6px;"></p>

    </div><!-- /fam-tab-config -->

    <!-- ═══ TAB: SITIOS BLOQUEADOS ═══ -->
    <div id="fam-tab-blocked" class="fam-tab-pane" style="display:none;">

      <p style="font-size:.82rem;color:var(--text-muted);margin:0 0 10px;line-height:1.5;">
        Los dominios que añadas aquí serán <strong>bloqueados siempre</strong>, sin importar el nivel de filtro.
        Añade solo el dominio raíz (<code style="color:var(--accent);">ejemplo.com</code>) — los subdominios quedan incluidos.
      </p>

      <div style="display:flex;gap:7px;margin-bottom:8px;">
        <input type="text" class="fam-input" id="fam-blocked-input"
               placeholder="ej: tiktok.com, roblox.com" style="flex:1;" aria-label="Dominio a bloquear">
        <button class="btn btn-danger btn-sm" id="fam-add-blocked" type="button">🚫 Bloquear</button>
      </div>
      <div id="fam-blocked-list" class="chip-list" style="margin-bottom:10px;">
        ${blockedUrlsHtml}
      </div>
      <p id="fam-blocked-msg" style="font-size:.8rem;min-height:1.1em;color:#22c55e;"></p>

    </div><!-- /fam-tab-blocked -->

    <!-- ═══ TAB: KEYWORDS ═══ -->
    <div id="fam-tab-keywords" class="fam-tab-pane" style="display:none;">

      <p style="font-size:.82rem;color:var(--text-muted);margin:0 0 10px;line-height:1.5;">
        Si alguna de estas palabras aparece en la URL del sitio, la página será bloqueada.
        La profundidad del escaneo depende del nivel de filtro activo:
      </p>
      <div style="background:var(--c1);border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:.79rem;color:var(--text-muted);">
        <strong style="color:var(--text);">🔓 Bajo</strong> — solo comprueba el nombre del dominio<br>
        <strong style="color:var(--text);">🔐 Medio</strong> — dominio + ruta de la página<br>
        <strong style="color:var(--text);">🔒 Alto</strong> — dominio + ruta + parámetros de la URL
      </div>

      <div style="display:flex;gap:7px;margin-bottom:8px;">
        <input type="text" class="fam-input" id="fam-kw-input"
               placeholder="ej: casino, arma, porno" style="flex:1;" aria-label="Keyword a bloquear">
        <button class="btn btn-primary btn-sm" id="fam-add-kw" type="button">+ Añadir</button>
      </div>
      <div id="fam-kw-list" class="chip-list" style="margin-bottom:10px;">
        ${blockedKwHtml}
      </div>
      <p id="fam-kw-msg" style="font-size:.8rem;min-height:1.1em;color:#22c55e;"></p>

      <!-- Sugerencias de keywords por nivel -->
      <details style="margin-top:8px;">
        <summary style="cursor:pointer;font-size:.81rem;color:var(--accent);font-weight:600;list-style:none;user-select:none;">
          💡 Sugerencias de keywords por categoría
        </summary>
        <div style="margin-top:8px;display:flex;flex-direction:column;gap:8px;">
          ${[
            { cat: '🔞 Adulto',           kws: ['porn', 'xxx', 'hentai', 'nude', 'onlyfans', 'escort'] },
            { cat: '🎰 Apuestas',          kws: ['casino', 'poker', 'apuesta', 'ruleta', 'tragaperras', 'bet'] },
            { cat: '🔫 Armas',             kws: ['gunshop', 'buy-gun', 'firearms', 'ak47', 'ar15', 'ammo'] },
            { cat: '💊 Drogas',            kws: ['buy-cocaine', 'drug-market', 'darknet', 'fentanyl', 'heroin'] },
            { cat: '⚠️ Violencia',         kws: ['gore', 'beheading', 'snuff', 'bestgore', 'liveleak'] },
            { cat: '🚷 Odio',              kws: ['neonazi', 'white-supremacy', 'jihadist'] },
          ].map(({ cat, kws }) => `
            <div style="background:var(--c1);border-radius:8px;padding:8px 10px;">
              <div style="font-size:.79rem;font-weight:600;color:var(--text);margin-bottom:5px;">${cat}</div>
              <div style="display:flex;flex-wrap:wrap;gap:4px;">
                ${kws.map(k => `<button class="fam-kw-suggestion btn-secondary" data-kw="${escHtml(k)}" type="button"
                  style="font-size:.73rem;padding:2px 9px;border-radius:99px;cursor:pointer;border:1px solid var(--border);background:var(--surface);color:var(--text-muted);">${escHtml(k)}</button>`).join('')}
              </div>
            </div>`).join('')}
        </div>
      </details>

    </div><!-- /fam-tab-keywords -->

    <!-- ═══ TAB: HISTORIAL DE BLOQUEOS ═══ -->
    <div id="fam-tab-history" class="fam-tab-pane" style="display:none;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <p style="font-size:.82rem;color:var(--text-muted);margin:0;">Últimos sitios bloqueados automáticamente.</p>
        <button class="btn btn-secondary btn-sm" id="fam-clear-history" type="button" style="font-size:.78rem;">🗑️ Limpiar todo</button>
      </div>
      <div id="fam-history-list">
        <p style="font-size:.82rem;color:var(--text-muted);text-align:center;padding:16px 0;">Cargando historial...</p>
      </div>
    </div><!-- /fam-tab-history -->

    <!-- ── Guía ── -->
    <details style="margin-top:18px;" id="fam-guide">
      <summary style="cursor:pointer;display:flex;align-items:center;gap:8px;padding:10px 14px;
                      background:var(--c1);border-radius:10px;font-weight:600;font-size:.88rem;
                      list-style:none;user-select:none;">
        <span>📖</span>
        <span>Guía — niveles de filtrado</span>
        <span style="margin-left:auto;font-size:.75rem;color:var(--text-muted);">Toca para expandir</span>
      </summary>
      <div style="padding:14px 4px 4px;display:flex;flex-direction:column;gap:12px;">
        ${[
          { border:'#22c55e', title:'🔓 Bajo — solo lo esencial',
            desc:'Bloquea violencia extrema (gore, decapitaciones, etc.) y lista manual del apoderado. El phishing necesita un score de 65+ para activarse. Para adolescentes con buena autonomía digital.' },
          { border:'#f59e0b', title:'🔐 Medio — recomendado ⭐',
            desc:'Añade bloqueo de adulto, apuestas, descargas/warez, armas y drogas. Keywords custom actúan en host+ruta. Score phishing: 40+. Equilibrio protección–libertad. Recomendado 10–14 años.' },
          { border:'#ef4444', title:'🔒 Alto — máxima protección',
            desc:'Todo lo de Medio más discurso de odio, violencia moderada. Keywords custom escanean también los parámetros de la URL. Dominios no verificados dan advertencia. Score phishing: 20+. Recomendado 6–9 años.' },
        ].map(({ border, title, desc }) => `
          <div style="border-left:3px solid ${border};padding:8px 12px;border-radius:0 8px 8px 0;background:var(--surface);">
            <div style="font-weight:700;font-size:.84rem;margin-bottom:3px;">${title}</div>
            <div style="font-size:.79rem;color:var(--text-muted);">${desc}</div>
          </div>`).join('')}
      </div>
    </details>`;

  // ════════════════════════════════════════════════════════════
  //  LÓGICA DE TABS
  // ════════════════════════════════════════════════════════════
  panel.querySelectorAll('.fam-tab').forEach(tab => {
    tab.style.cssText = 'padding:6px 12px;border:none;border-radius:8px 8px 0 0;font-size:.82rem;font-weight:600;cursor:pointer;background:transparent;color:var(--text-muted);font-family:inherit;transition:background .15s,color .15s;';
    tab.addEventListener('click', () => {
      panel.querySelectorAll('.fam-tab').forEach(t => {
        t.classList.remove('fam-tab-active');
        t.style.background = 'transparent';
        t.style.color = 'var(--text-muted)';
      });
      panel.querySelectorAll('.fam-tab-pane').forEach(p => p.style.display = 'none');
      tab.classList.add('fam-tab-active');
      tab.style.background = 'var(--accent)';
      tab.style.color = '#fff';
      const pane = $(`fam-tab-${tab.dataset.tab}`);
      if (pane) pane.style.display = 'block';
      if (tab.dataset.tab === 'history') loadBlockedHistory();
    });
  });
  // Estilo inicial del tab activo
  const activeTab = panel.querySelector('.fam-tab-active');
  if (activeTab) { activeTab.style.background = 'var(--accent)'; activeTab.style.color = '#fff'; }

  // ════════════════════════════════════════════════════════════
  //  HISTORIAL DE BLOQUEOS
  // ════════════════════════════════════════════════════════════
  async function loadBlockedHistory() {
    const listEl = $('fam-history-list');
    if (!listEl) return;
    const { blockedSites = [] } = await chrome.runtime.sendMessage({ type: 'FAMILY_GET_BLOCKED_SITES' });

    if (!blockedSites.length) {
      listEl.innerHTML = '<p style="font-size:.82rem;color:var(--text-muted);text-align:center;padding:16px 0;">Sin bloqueos registrados.</p>';
      return;
    }

    listEl.innerHTML = blockedSites.map((s, i) => {
      const m = catMeta(s.category);
      return `
        <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border-radius:10px;background:var(--c1);margin-bottom:6px;">
          <span style="font-size:1.2rem;line-height:1.3;">${m.icon}</span>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:.84rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(s.hostname ?? s.url)}</div>
            <div style="font-size:.75rem;color:var(--text-muted);">${escHtml(m.label)} · ${escHtml(s.date)}</div>
            ${s.reason ? `<div style="font-size:.73rem;color:var(--text-muted);margin-top:2px;font-style:italic;">${escHtml(s.reason)}</div>` : ''}
          </div>
          <button data-hist-idx="${i}" type="button"
            style="border:none;background:transparent;color:var(--text-muted);cursor:pointer;font-size:.9rem;padding:2px 4px;flex-shrink:0;"
            aria-label="Eliminar entrada">✕</button>
        </div>`;
    }).join('');

    listEl.querySelectorAll('[data-hist-idx]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.histIdx, 10);
        await chrome.runtime.sendMessage({ type: 'FAMILY_REMOVE_BLOCKED_SITE', index: idx });
        loadBlockedHistory();
      });
    });
  }

  $('fam-clear-history')?.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'FAMILY_CLEAR_BLOCKED_SITES' });
    loadBlockedHistory();
    showToast('Historial limpiado');
  });

  // ════════════════════════════════════════════════════════════
  //  HELPERS
  // ════════════════════════════════════════════════════════════
  const showFamErr = msg => {
    const el = $('fam-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  };
  const clearFamErr = () => {
    const el = $('fam-error');
    if (el) { el.textContent = ''; el.style.display = 'none'; }
  };

  // Actualizar chips del nivel en tiempo real al cambiar el select
  $('fam-filter')?.addEventListener('change', e => {
    const chips = (LEVEL_CHIPS[e.target.value] ?? LEVEL_CHIPS.medium)
      .map(t => `<span style="display:inline-block;background:rgba(0,0,0,0.07);border-radius:99px;padding:2px 9px;font-size:.74rem;color:var(--text-muted);margin:2px 3px 2px 0;">${t}</span>`)
      .join('');
    const el = $('fam-level-chips');
    if (el) el.innerHTML = chips;
  });

  // ════════════════════════════════════════════════════════════
  //  TAB CONFIG — LISTENERS
  // ════════════════════════════════════════════════════════════

  // Añadir URL segura (whitelist)
  $('fam-add-url')?.addEventListener('click', async () => {
    const raw = $('fam-url-input')?.value.trim().toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
    if (!raw) return;
    const fs2    = { ...S.familySettings };
    fs2.safeUrls = [...new Set([...(fs2.safeUrls ?? []), raw])];
    $('fam-url-input').value = '';
    await chrome.runtime.sendMessage({ type: 'FAMILY_UPDATE_SETTINGS', settings: { safeUrls: fs2.safeUrls } });
    S.familySettings = fs2;
    renderFamilyPanel();
  });

  // Eliminar URL segura
  panel.querySelectorAll('.chip-remove[data-url]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const fs2    = { ...S.familySettings };
      fs2.safeUrls = (fs2.safeUrls ?? []).filter(u => u !== btn.dataset.url);
      await chrome.runtime.sendMessage({ type: 'FAMILY_UPDATE_SETTINGS', settings: { safeUrls: fs2.safeUrls } });
      S.familySettings = fs2;
      renderFamilyPanel();
    });
  });

  // Guardar ajustes principales
  $('fam-save')?.addEventListener('click', async () => {
    clearFamErr();
    const pin = $('fam-pin')?.value ?? '';
    if (!/^\d{4}$/.test(pin)) { showFamErr('El PIN debe ser 4 dígitos.'); return; }
    const { valid } = await chrome.runtime.sendMessage({ type: 'FAMILY_VERIFY_PIN', pin });
    if (!valid) { showFamErr('❌ PIN incorrecto.'); return; }
    const settings = {
      maxDailyMinutes:    parseInt($('fam-max-min')?.value ?? '120', 10),
      contentFilter:      $('fam-filter')?.value ?? 'medium',
      timeUpMessage:      $('fam-msg')?.value ?? '',
      allowCoinPurchases: $('fam-allow-coins')?.checked !== false,
      safeUrls:           S.familySettings.safeUrls         ?? [],
      blockedUrls:        S.familySettings.blockedUrls       ?? [],
      blockedKeywords:    S.familySettings.blockedKeywords   ?? [],
    };
    await chrome.runtime.sendMessage({ type: 'FAMILY_UPDATE_SETTINGS', settings });
    S.familySettings = { ...S.familySettings, ...settings };
    showToast('✅ Configuración guardada');
    renderFamilyPanel();
  });

  // Desbloquear +30 min
  $('fam-unblock')?.addEventListener('click', async () => {
    clearFamErr();
    const pin = $('fam-pin')?.value ?? '';
    if (!/^\d{4}$/.test(pin)) { showFamErr('El PIN debe ser 4 dígitos.'); return; }
    const { valid } = await chrome.runtime.sendMessage({ type: 'FAMILY_VERIFY_PIN', pin });
    if (!valid) { showFamErr('❌ PIN incorrecto.'); return; }
    const updated = { ...S.familySettings, maxDailyMinutes: (S.familySettings.maxDailyMinutes ?? 120) + 30 };
    await chrome.storage.local.set({ timeLimitReached: false, familySettings: updated });
    S.timeLimitReached = false;
    S.familySettings   = updated;
    showToast('✅ +30 minutos desbloqueados');
    renderFamilyPanel();
  });

  // Desactivar Family Mode
  $('fam-disable')?.addEventListener('click', async () => {
    clearFamErr();
    const pin = $('fam-pin')?.value ?? '';
    if (!pin) { showFamErr('Ingresa el PIN para desactivar.'); return; }
    const res = await chrome.runtime.sendMessage({ type: 'FAMILY_DISABLE', pin });
    if (res?.ok) { await loadData(); renderFamilyPanel(); showToast('Family Mode desactivado'); }
    else showFamErr('❌ PIN incorrecto.');
  });

  // ════════════════════════════════════════════════════════════
  //  TAB SITIOS BLOQUEADOS — LISTENERS
  // ════════════════════════════════════════════════════════════

  const famBlockedMsg = () => $('fam-blocked-msg');

  $('fam-add-blocked')?.addEventListener('click', async () => {
    const raw = $('fam-blocked-input')?.value.trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    if (!raw) return;
    const fs2        = { ...S.familySettings };
    fs2.blockedUrls  = [...new Set([...(fs2.blockedUrls ?? []), raw])];
    $('fam-blocked-input').value = '';
    await chrome.runtime.sendMessage({ type: 'FAMILY_UPDATE_SETTINGS', settings: { blockedUrls: fs2.blockedUrls } });
    S.familySettings = fs2;
    if (famBlockedMsg()) { famBlockedMsg().textContent = `✅ "${raw}" añadido a la lista negra`; setTimeout(() => { if(famBlockedMsg()) famBlockedMsg().textContent=''; }, 2500); }
    renderFamilyPanel();
  });

  $('fam-blocked-input')?.addEventListener('keypress', e => {
    if (e.key === 'Enter') $('fam-add-blocked')?.click();
  });

  panel.querySelectorAll('.chip-remove[data-blocked-url]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const fs2       = { ...S.familySettings };
      fs2.blockedUrls = (fs2.blockedUrls ?? []).filter(u => u !== btn.dataset.blockedUrl);
      await chrome.runtime.sendMessage({ type: 'FAMILY_UPDATE_SETTINGS', settings: { blockedUrls: fs2.blockedUrls } });
      S.familySettings = fs2;
      renderFamilyPanel();
    });
  });

  // ════════════════════════════════════════════════════════════
  //  TAB KEYWORDS — LISTENERS
  // ════════════════════════════════════════════════════════════

  const famKwMsg = () => $('fam-kw-msg');

  const addBlockedKeyword = async (raw) => {
    raw = (raw ?? $('fam-kw-input')?.value ?? '').trim().toLowerCase();
    if (!raw) return;
    const fs2             = { ...S.familySettings };
    fs2.blockedKeywords   = [...new Set([...(fs2.blockedKeywords ?? []), raw])];
    const inp = $('fam-kw-input');
    if (inp) inp.value = '';
    await chrome.runtime.sendMessage({ type: 'FAMILY_UPDATE_SETTINGS', settings: { blockedKeywords: fs2.blockedKeywords } });
    S.familySettings = fs2;
    if (famKwMsg()) { famKwMsg().textContent = `✅ Keyword "${raw}" añadida`; setTimeout(() => { if(famKwMsg()) famKwMsg().textContent=''; }, 2500); }
    renderFamilyPanel();
  };

  $('fam-add-kw')?.addEventListener('click', () => addBlockedKeyword());
  $('fam-kw-input')?.addEventListener('keypress', e => { if (e.key === 'Enter') addBlockedKeyword(); });

  // Sugerencias de keywords
  panel.querySelectorAll('.fam-kw-suggestion').forEach(btn => {
    btn.addEventListener('click', () => addBlockedKeyword(btn.dataset.kw));
  });

  // Eliminar keyword
  panel.querySelectorAll('.chip-remove[data-blocked-kw]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const fs2             = { ...S.familySettings };
      fs2.blockedKeywords   = (fs2.blockedKeywords ?? []).filter(k => k !== btn.dataset.blockedKw);
      await chrome.runtime.sendMessage({ type: 'FAMILY_UPDATE_SETTINGS', settings: { blockedKeywords: fs2.blockedKeywords } });
      S.familySettings = fs2;
      renderFamilyPanel();
    });
  });

} // ── end renderFamilyPanel ──────────────────────────────────────────────────

// ── LISTENERS DE AJUSTES ──────────────────────────────────────────────────

async function loadRecoveryStatus() {
  const { hasRecovery } = await chrome.runtime.sendMessage({ type: 'VAULT_HAS_RECOVERY' });
  const dot = $('recovery-dot');
  const text = $('recovery-text');
  const setup = $('recovery-setup');
  const existing = $('recovery-existing');

  if (hasRecovery) {
    if (dot) { dot.className = 'groq-dot groq-active'; }
    if (text) { text.textContent = 'Configurado'; }
    if (setup) { setup.style.display = 'none'; }
    if (existing) { existing.style.display = 'block'; }
  } else {
    if (dot) { dot.className = 'groq-dot groq-off'; }
    if (text) { text.textContent = 'No configurado'; }
    if (setup) { setup.style.display = 'block'; }
    if (existing) { existing.style.display = 'none'; }
  }
}

function setupSettingsListeners() {

  // Añadir keyword
  const addKeyword = async () => {
    const inp = $('keyword-input');
    const kw  = inp?.value.trim().toLowerCase();
    if (!kw || S.keywords.includes(kw)) return;
    S.keywords.push(kw);
    await chrome.storage.local.set({ keywords: S.keywords });
    renderKeywords();
    if (inp) inp.value = '';
    showToast(`Palabra "${kw}" añadida`);
  };
  $('add-keyword')?.addEventListener('click', addKeyword);
  $('keyword-input')?.addEventListener('keypress', e => { if (e.key === 'Enter') addKeyword(); });

  // Añadir whitelist
  const addWhitelist = async () => {
    const inp  = $('whitelist-input');
    const site = inp?.value.trim().toLowerCase();
    if (!site || S.whitelist.includes(site)) return;
    S.whitelist.push(site);
    await chrome.storage.local.set({ whitelist: S.whitelist });
    renderWhitelist();
    if (inp) inp.value = '';
    showToast(`Sitio "${site}" añadido`);
  };
  $('add-whitelist')?.addEventListener('click', addWhitelist);
  $('whitelist-input')?.addEventListener('keypress', e => { if (e.key === 'Enter') addWhitelist(); });

  // Toggles de seguridad
  const toggleMap = {
    'password-check-toggle':  'passwordCheckEnabled',
    'keyword-censor-toggle':  'keywordCensorEnabled',
    'phishing-detect-toggle': 'phishingDetectEnabled',
    'notifications-toggle':   'notificationsEnabled',
    'shimeji-toggle':         'shimeijiEnabled',
  };
  for (const [id, key] of Object.entries(toggleMap)) {
    $(id)?.addEventListener('change', async e => {
      await chrome.storage.local.set({ [key]: e.target.checked });
      // Notificar a todas las tabs activas
      const tabs = await chrome.tabs.query({});
      tabs.forEach(tab =>
        chrome.tabs.sendMessage(tab.id, { type: 'CONFIG_UPDATED', key, value: e.target.checked }).catch(() => {})
      );
    });
  }

  // Vault — unlock
  const doUnlock = async () => {
    const pin = $('dash-vault-pin-input')?.value ?? '';
    const err = $('dash-vault-pin-error');
    if (!pin) return;

    const { unlocked } = await chrome.runtime.sendMessage({ type: 'VAULT_UNLOCK', pin });
    if (unlocked) {
      _vaultUnlocked = true;
      if (err) err.style.display = 'none';
      renderVaultDash();
      showToast('🔓 Bóveda desbloqueada');
    } else {
      if (err) { err.textContent = '❌ PIN incorrecto.'; err.style.display = 'block'; }
      const inp = $('dash-vault-pin-input');
      if (inp) { inp.value = ''; inp.focus(); }
    }
  };
  $('dash-vault-unlock-btn')?.addEventListener('click', doUnlock);
  $('dash-vault-pin-input')?.addEventListener('keypress', e => { if (e.key === 'Enter') doUnlock(); });

  // Vault — lock
  $('dash-vault-lock-btn')?.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'VAULT_LOCK' });
    _vaultUnlocked = false;
    renderVaultDash();
    showToast('🔒 Bóveda bloqueada');
  });

  // Vault — search
  $('dash-vault-search')?.addEventListener('input', e =>
    renderVaultEntries(e.target.value.trim())
  );

  // Vault — form toggle
  $('dash-add-vault-btn')?.addEventListener('click', () => {
    const f = $('dash-vault-form');
    if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
  });

  // Vault form — strength bar
  $('dv-pwd')?.addEventListener('input', e => _applyStrengthBar('dv-pwd-bar', 'dv-pwd-label', e.target.value));
  $('dv-gen')?.addEventListener('click', () => {
    const pwd = genPassword(16);
    const inp = $('dv-pwd');
    if (inp) { inp.type = 'text'; inp.value = pwd; inp.dispatchEvent(new Event('input')); }
  });
  $('dv-toggle')?.addEventListener('click', () => {
    const i = $('dv-pwd');
    if (i) i.type = i.type === 'password' ? 'text' : 'password';
  });

  // Vault form — guardar
  $('dv-save')?.addEventListener('click', async () => {
    const site = $('dv-site')?.value.trim();
    const user = $('dv-user')?.value.trim();
    const pwd  = $('dv-pwd')?.value;
    if (!site || !user || !pwd) { showToast('Completa todos los campos'); return; }
    await chrome.runtime.sendMessage({ type: 'VAULT_SAVE', entry: { site, username: user, password: pwd } });
    showToast('✅ Contraseña guardada');
    $('dash-vault-form').style.display = 'none';
    ['dv-site','dv-user','dv-pwd'].forEach(id => { const el = $(id); if (el) el.value = ''; });
    _applyStrengthBar('dv-pwd-bar', 'dv-pwd-label', '');
    renderVaultEntries();
  });
  $('dv-cancel')?.addEventListener('click', () => {
    $('dash-vault-form').style.display = 'none';
  });

  // Theme picker
  document.querySelectorAll('.theme-swatch').forEach(btn => {
    btn.addEventListener('click', async () => {
      const theme = btn.dataset.theme;
      S.themeColor = theme;
      applyTheme(theme);
      await chrome.runtime.sendMessage({ type: 'SAVE_THEME', themeColor: theme });
      showToast('🎨 Tema guardado');
    });
  });

  // Groq
  $('save-groq-key')?.addEventListener('click', async () => {
    const key = $('groq-api-key-input')?.value.trim() ?? '';
    if (!key.startsWith('gsk_')) { showToast('❌ La key debe empezar con gsk_'); return; }
    await chrome.storage.local.set({ groqApiKey: key, groqEnabled: true });
    showToast('✅ API Key guardada');
    loadGroqStatus();
  });

  $('test-groq-key')?.addEventListener('click', async () => {
    const { groqApiKey } = await chrome.storage.local.get('groqApiKey');
    const res = $('groq-test-result');
    if (!groqApiKey) { if (res) res.textContent = '❌ No hay API key guardada'; return; }
    if (res) res.textContent = '🔍 Probando...';
    try {
      const r = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${groqApiKey}` },
      });
      if (res) {
        res.textContent = r.ok ? '✅ Conexión correcta con Groq' : '❌ Key inválida o sin permisos';
        res.style.color = r.ok ? 'var(--accent2)' : 'var(--danger)';
      }
    } catch {
      if (res) { res.textContent = '❌ Sin conexión'; res.style.color = 'var(--danger)'; }
    }
  });

  $('clear-groq-key')?.addEventListener('click', async () => {
    await chrome.storage.local.set({ groqApiKey: null, groqEnabled: false });
    const inp = $('groq-api-key-input');
    if (inp) inp.value = '';
    showToast('🗑️ API Key borrada');
    loadGroqStatus();
  });

  // Export
  $('export-data')?.addEventListener('click', async () => {
    const data = await chrome.storage.local.get(null);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a    = Object.assign(document.createElement('a'), {
      href:     URL.createObjectURL(blob),
      download: `cyberpet-backup-${new Date().toISOString().slice(0,10)}.json`,
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    showToast('✅ Backup exportado');
  });

  // Import
  $('import-data')?.addEventListener('click', () => $('import-file-input')?.click());
  $('import-file-input')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const raw      = await file.text();
      const imported = JSON.parse(raw);
      // FIX #9: validación básica del backup antes de importar
      if (typeof imported !== 'object' || Array.isArray(imported)) {
        showToast('❌ Archivo de backup inválido');
        return;
      }
      if (!confirm('¿Restaurar backup? Se perderán los datos actuales.')) return;
      await chrome.storage.local.clear();
      // Solo importar claves conocidas para evitar inyección de datos maliciosos
      const ALLOWED_KEYS = new Set([
        'petState','petHealth','petName','userName','userPronoun','setupComplete',
        'userPoints','userCoins','threatsBlocked','activities','threatHistory',
        'keywords','whitelist','notificationsEnabled','shimeijiEnabled','petVisible',
        'petMovementEnabled','passwordCheckEnabled','keywordCensorEnabled','phishingDetectEnabled',
        'vaultLocked','vaultPin','passwordVault','familyModeEnabled','familyPin','familySettings',
        'dailyStats','weeklyStats','streakStats','pageHistory','shopInventory','equippedCloth',
        'equippedItem','userTitle','trackingStart','timeLimitReached','themeColor',
        // groqApiKey se omite intencionalmente por seguridad
      ]);
      const safe = Object.fromEntries(
        Object.entries(imported).filter(([k]) => ALLOWED_KEYS.has(k))
      );
      await chrome.storage.local.set(safe);
      showToast('✅ Backup restaurado');
      setTimeout(() => location.reload(), 1200);
    } catch (err) {
      showToast('❌ Archivo inválido: ' + err.message);
    }
    e.target.value = ''; // permitir re-importar el mismo archivo
  });

  // ── SISTEMA DE RECUPERACIÓN DE PIN ──────────────────────
  // Cargar estado inicial
  loadRecoveryStatus();

  // Mostrar formulario de configuración
  $('save-recovery')?.addEventListener('click', async () => {
    const question = $('recovery-question')?.value.trim();
    const answer = $('recovery-answer')?.value.trim();
    if (!question || !answer) { showToast('❌ Completa pregunta y respuesta'); return; }
    if (answer.length < 3) { showToast('❌ La respuesta debe tener al menos 3 caracteres'); return; }

    const res = await chrome.runtime.sendMessage({ type: 'VAULT_SET_RECOVERY', question, answer });
    if (res?.ok) {
      showToast('✅ Recuperación configurada');
      $('recovery-question').value = '';
      $('recovery-answer').value = '';
      loadRecoveryStatus();
    } else {
      showToast('❌ Error: ' + (res?.error || 'No se pudo guardar'));
    }
  });

  // Cambiar recuperación existente
  $('change-recovery')?.addEventListener('click', () => {
    $('recovery-setup').style.display = 'block';
    $('recovery-existing').style.display = 'none';
  });

  // Eliminar recuperación
  $('remove-recovery')?.addEventListener('click', async () => {
    if (!confirm('¿Eliminar pregunta de recuperación?')) return;
    await chrome.runtime.sendMessage({ type: 'VAULT_SET_RECOVERY', question: '', answer: '' });
    showToast('🗑️ Recuperación eliminada');
    loadRecoveryStatus();
  });

  // Recuperar PIN olvidado
  $('recover-pin-btn')?.addEventListener('click', async () => {
    const answer = $('recover-answer-input')?.value.trim();
    const result = $('recover-result');
    if (!answer) { if (result) result.textContent = '❌ Ingresa tu respuesta.'; return; }
    if (!result) return;

    result.textContent = '🔍 Verificando...';
    const res = await chrome.runtime.sendMessage({ type: 'VAULT_RECOVER_PIN', answer });

    if (res?.ok) {
      result.textContent = '✅ ' + (res.message || 'PIN reseteado. Debes crear un nuevo PIN.');
      result.style.color = 'var(--accent2)';
      showToast('🔓 PIN reseteado. Las contraseñas antiguas se perdieron por seguridad.');
    } else {
      result.textContent = '❌ ' + (res?.error || 'Respuesta incorrecta');
      result.style.color = 'var(--danger)';
    }
  });

  // Reset
  $('reset-data')?.addEventListener('click', async () => {
    if (!confirm('¿Resetear TODOS los datos? Esta acción no se puede deshacer.')) return;
    // Enviar mensaje al background para que use defaultState()
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      petState: 'neutral', petHealth: 100, userPoints: 0, userCoins: 0,
      setupComplete: false, threatsBlocked: 0,
      keywords: ['gore','sangre','violencia','suicide','drogas','gun','xxx','porn'],
      whitelist: [], notificationsEnabled: true, shimeijiEnabled: true,
      passwordCheckEnabled: true, keywordCensorEnabled: true, phishingDetectEnabled: true,
      activities: [], threatHistory: [], themeColor: 'blue', setupTutorialComplete: false,
    });
    location.reload();
  });
}

// ── GROQ STATUS ───────────────────────────────────────────────────────────

async function loadGroqStatus() {
  const { groqApiKey, groqEnabled } = await chrome.storage.local.get(['groqApiKey','groqEnabled']);
  const isActive = !!(groqApiKey && groqEnabled);
  const dot = $('groq-dot');
  const txt = $('groq-status-text');
  if (dot) dot.className = `groq-dot ${isActive ? 'groq-active' : 'groq-off'}`;
  if (txt) txt.textContent = isActive ? '✅ IA activa — llama-3.3-70b' : 'IA desactivada';
}

// ── TOAST ─────────────────────────────────────────────────────────────────

// FIX #5: el toast usa clases CSS en vez de sobreescribir style.cssText completo
function showToast(msg) {
  const t = $('dashboard-toast');
  if (!t) return;

  t.textContent = msg;
  t.classList.add('visible');

  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('visible'), 2800);
}

// ════════════════════════════════════════════════
//  CHAT IA — DASHBOARD
//  Sistema de árbol de diálogos — sin API externa.
//  Historial solo en memoria — no se persiste.
// ════════════════════════════════════════════════

const _dashChat = {
  history:  [],    // [{ role:'user'|'assistant', content:string }]
  isTyping: false,
  petName:  'CyberPet',
  userName: '',
};

// ── NLP: mapa de intención → respuesta rica (espeja el INTENT_MAP del popup) ──
const DASH_INTENT_MAP = [
  // Tutorial / cómo funciono
  {
    patterns: [
      'como funciona','cómo funciona','que haces','qué haces',
      'para que sirves','para qué sirves','que eres','qué eres',
      'cuentame','cuéntame','explicame','explícame',
      'ayuda','help','tutorial','quien eres','quién eres',
      'como te uso','cómo te uso','instrucciones',
    ],
    reply: () => {
      const n = _dashChat.petName;
      return `🐱 Soy ${n}, tu guardián de ciberseguridad digital.\n\nMi salud (❤️) refleja qué tan seguro navegas:\n• 70–100% → 😺 Feliz (navegas bien)\n• 50–69%  → 😐 Neutral (algunas alertas)\n• 0–49%   → 😷 Enfermo (¡hay amenazas!)\n\nCuando llego a 0% «muero» y pierdes puntos. Puedes revivirme desde el Dashboard → Estado del Pet.\n\n💡 Pregúntame sobre phishing, contraseñas, 2FA, privacidad o el Family Mode.`;
    },
  },
  // Economía / puntos / monedas
  {
    patterns: [
      'puntos','monedas','coins','como gano','cómo gano',
      'recompensa','recompensas','ganar','economia','economía',
      'tienda','comprar','compro','shop',
    ],
    reply: () =>
      '🏆🪙 Sistema de puntos y monedas:\n\n✅ GANAS cuando:\n• Usas contraseñas fuertes (+8 🪙)\n• Navegas sin amenazas (bonus diario)\n• Completas el Modo Educativo (+25 pts)\n• Me consultas en el chat (+pts)\n\n❌ PIERDES cuando:\n• Usas contraseñas débiles (−8 HP)\n• Visitas sitios sospechosos (−HP)\n• Me dejas llegar a 0 HP\n\nLas monedas se gastan en la Tienda 🛍️: ropa, títulos y tiempo extra de pantalla (Family Mode).',
  },
  // Family Mode
  {
    patterns: [
      'family','familiar','control parental','apoderado','padre',
      'tiempo pantalla','tiempo de pantalla','limite','límite',
      'bloqueo familiar','modo familia',
    ],
    reply: () =>
      '👨‍👩‍👧 Family Mode — control parental:\n\nEl apoderado configura un PIN y establece:\n• ⏱️ Límite diario de minutos de navegación\n• 🔒 Nivel de filtro de contenido (bajo/medio/alto)\n• ✅ Whitelist: sitios siempre permitidos\n• 🚫 Blocklist: sitios siempre bloqueados\n• 💬 Mensaje personalizado al agotar el tiempo\n\nCuando se acaba el tiempo, todas las pestañas van a la pantalla de pausa. El apoderado desbloquea con PIN o el usuario compra tiempo con monedas.\n\n📍 Se activa en Dashboard → Family Mode.',
  },
  // Bóveda / vault
  {
    patterns: [
      'boveda','bóveda','vault','guardar contraseña','contraseñas guardadas',
      'contrasenas guardadas','gestor de contraseñas','gestor de contrasenas',
    ],
    reply: () =>
      '🔐 La Bóveda guarda tus contraseñas con cifrado AES-256-GCM.\n\nSolo tú puedes leerlas — ni yo tengo acceso sin tu PIN.\n\nDesde la pestaña 🔐 puedes:\n• Guardar usuario + contraseña de cualquier sitio\n• Buscar y copiar contraseñas en un clic\n• Generar contraseñas seguras automáticamente\n\n⚠️ Si olvidas el PIN, recupéralo con la pregunta de seguridad que configuraste en Ajustes.',
  },
  // Phishing
  {
    patterns: [
      'phishing','estafa','engaño','engano','falso','fake',
      'link sospechoso','url falsa','sitio peligroso','correo falso',
      'email sospechoso','fraude','scam','suplantacion','suplantación',
    ],
    reply: () =>
      '🎣 Phishing: cuando alguien finge ser un sitio legítimo.\n\nSeñales de alerta:\n• Remitente extraño: "paypa1.com" (¡1 en vez de l!)\n• Urgencia falsa: "Tu cuenta cierra en 24h"\n• Errores ortográficos en el dominio\n• Muchos subdominios: secure.verify.login.algo.com\n• TLDs sospechosos: .xyz, .top, .tk, .ml\n\n💡 Tip: Pasa el cursor sobre cualquier link SIN hacer clic para ver la URL real en la barra de estado.\n\n✅ CyberPet analiza cada URL que visitas automáticamente.',
  },
  // Contraseñas
  {
    patterns: [
      'contraseña','contrasena','password','clave',
    ],
    reply: () =>
      '🔐 Contraseña segura = 12+ caracteres + mayúsculas + números + símbolos + nada personal.\n\n💡 Ejemplo: "Gat0$Segur0_2024!" → fuerte y memorable.\n\n🚫 NUNCA uses la misma contraseña en dos sitios. Si uno es hackeado, todos caen.\n\n🔑 Solución: un gestor de contraseñas (la Bóveda de CyberPet, Bitwarden, 1Password). Solo recuerdas UNA contraseña maestra.\n\n✅ Usa el Generador de contraseñas en Herramientas.',
  },
  // Privacidad
  {
    patterns: [
      'privacidad','privaci','rastreo','tracker','cookies',
      'anonimo','anónimo','privado','seguimiento','huella digital',
    ],
    reply: () =>
      '🛡️ Privacidad en internet:\n\n🍪 Cookies: archivos que los sitios guardan en tu navegador para reconocerte.\n👁️ Trackers: scripts que te siguen de sitio en sitio (Facebook Pixel sabe lo que ves aunque no estés en Facebook).\n\nCómo protegerte:\n• Extensión uBlock Origin\n• Navegador Firefox o Brave\n• Revisa permisos de apps regularmente\n• Usa correos alternativos para registros\n• No publiques tu ubicación en tiempo real',
  },
  // VPN
  {
    patterns: ['vpn','red privada','tunnel','tunel'],
    reply: () =>
      '🌐 VPN (Red Privada Virtual):\n\n✅ Oculta tu IP real\n✅ Cifra todo tu tráfico\n✅ Esencial en WiFi público (cafeterías, aeropuertos)\n⚠️ No te hace 100% anónimo\n⚠️ Evita VPNs gratuitas de dudosa procedencia\n\n💡 Opciones confiables:\n• ProtonVPN (plan gratis disponible)\n• Mullvad (sin logs, pago anónimo)\n• ExpressVPN (rápido, de pago)',
  },
  // Redes sociales
  {
    patterns: [
      'redes sociales','redes','instagram','facebook','tiktok','twitter',
      'social','publicar','perfil','x.com','snap',
    ],
    reply: () =>
      '📱 Redes sociales seguras:\n\n✅ Activa 2FA en todas tus cuentas\n✅ Configura privacidad: solo amigos\n✅ Revisa qué apps tienen acceso a tu cuenta\n✅ Desactiva geolocalización en posts\n\n🚫 NUNCA publiques:\n• Documentos de identidad\n• Tu dirección o rutina exacta\n• Información financiera\n• Fotos íntimas\n\n💡 Recuerda: lo que publicas en internet es difícil de borrar definitivamente.',
  },
  // 2FA
  {
    patterns: [
      '2fa','doble factor','verificacion','verificación',
      'autenticacion','autenticación','codigo sms','código sms',
      'doble paso','segundo factor','google authenticator','authy',
    ],
    reply: () =>
      '🔒 2FA (doble factor de autenticación):\n\nIncluso si alguien roba tu contraseña, no puede entrar sin el segundo factor (tu móvil o una app).\n\nTipos de 2FA (del más al menos seguro):\n1. 🏆 Llave física (YubiKey)\n2. ✅ App TOTP (Google Authenticator, Authy)\n3. ⚠️ SMS (vulnerable a SIM swapping, pero mejor que nada)\n\n✅ Actívala en: correo, banco, redes sociales, cualquier cuenta importante.',
  },
  // Saludo
  {
    patterns: ['hola','hey ','buenas','saludos','hi ','hello','ey ','buenos'],
    reply: () => {
      const u = _dashChat.userName ? `, ${_dashChat.userName}` : '';
      const n = _dashChat.petName;
      return `¡Hola${u}! 😺 Soy ${n}, tu guardián digital.\n\nPuedo ayudarte con:\n🎣 Phishing y estafas\n🔐 Contraseñas y la Bóveda\n🔒 Doble factor (2FA)\n🛡️ Privacidad y rastreo\n🌐 VPN\n📱 Redes sociales\n👨‍👩‍👧 Family Mode\n🐱 Cómo funciono yo\n\n¿Sobre qué quieres saber?`;
    },
  },
  // Gracias
  {
    patterns: ['gracias','thanks','thank you','genial','perfecto','excelente'],
    reply: () =>
      '¡De nada! 😸 Recuerda: la mejor defensa es la información.\n¡Sigue navegando de forma segura! 🐾',
  },
];

/**
 * Normaliza (quita acentos + minúsculas) y busca el primer intent con match.
 * Devuelve la función reply() del intent encontrado, o null.
 */
function detectDashIntent(text) {
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const q    = norm(text);
  for (const intent of DASH_INTENT_MAP) {
    if (intent.patterns.some(p => q.includes(norm(p)))) return intent.reply;
  }
  return null;
}

// ── Respuesta del chat — NLP local ─────────────────────────────────────────
function getDashChatResponse(msg) {
  const replyFn = detectDashIntent(msg);
  if (replyFn) return replyFn();

  // Fallback genérico
  return `🤔 No entendí bien esa pregunta, pero puedo ayudarte con:\n\n🎣 Phishing y estafas\n🔐 Contraseñas y la Bóveda\n🔒 2FA / doble factor\n🛡️ Privacidad y rastreo\n🌐 VPN\n📱 Redes sociales\n👨‍👩‍👧 Family Mode\n🐱 Cómo funciono\n\n¿Sobre cuál quieres saber más?`;
}

// ── Inicialización ────────────────────────────────────────────────────────
async function initDashChat() {
  const { petName, userName } = await chrome.storage.local.get(['petName', 'userName']);

  _dashChat.petName  = petName  || 'CyberPet';
  _dashChat.userName = userName || '';

  // Actualizar imagen del gato en el header del chat
  const petImg = $('dash-chat-pet-img');
  const chatState = S.health >= 70 ? 'happy' : S.health >= 50 ? 'neutral' : 'sick';
  if (petImg) petImg.src = `../assets/sprites/${chatState}.png`;
  setText('dash-chat-pet-name', _dashChat.petName);

  // Saludo inicial del bot
const { setupTutorialComplete } = await chrome.storage.local.get('setupTutorialComplete');
 
if (!setupTutorialComplete) {
  chrome.storage.local.set({ setupTutorialComplete: true });
  appendDashMsg('bot', `¡Hola${_dashChat.userName ? ', '+_dashChat.userName : ''}! 👋 Parece que es tu primera vez aquí.\n\nSoy ${_dashChat.petName} y voy a guiarte. Puedes preguntarme sobre:\n🐱 Cómo funciono yo\n🏆 Sistema de puntos y monedas\n🎣 Detección de phishing\n🔐 La bóveda de contraseñas\n👨‍👩‍👧 Family Mode\n\n¡Escribe cualquier pregunta o elige un tema de arriba!`);
} else {
  const greet = _dashChat.userName
    ? `¡Hola, ${_dashChat.userName}! 😺 Soy ${_dashChat.petName}. ¿En qué puedo ayudarte hoy?`
    : `¡Hola! 😺 Soy ${_dashChat.petName}, tu guardián digital. ¿En qué puedo ayudarte?`;
  appendDashMsg('bot', greet);
}


  // Auto-resize del textarea
  const input = $('dash-chat-input');
  if (input) {
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      updateDashCharCount(input.value.length);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendDashChatMessage();
      }
    });
  }

  $('dash-chat-send')?.addEventListener('click', sendDashChatMessage);
  $('dash-chat-clear')?.addEventListener('click', clearDashChat);

  // Chips de sugerencias — evento delegado en el contenedor
  $('dash-chat-suggestions')?.addEventListener('click', e => {
    const chip = e.target.closest('.suggestion-chip');
    if (!chip || _dashChat.isTyping) return;
    const text = chip.textContent.trim();
    const inp  = $('dash-chat-input');
    if (inp) {
      inp.value = text;
      inp.style.height = 'auto';
      inp.style.height = Math.min(inp.scrollHeight, 120) + 'px';
      updateDashCharCount(text.length);
    }
    sendDashChatMessage();
  });
}

// ── Enviar mensaje ────────────────────────────────────────────────────────
async function sendDashChatMessage() {
  const input = $('dash-chat-input');
  const msg   = input?.value.trim() ?? '';
  if (!msg || _dashChat.isTyping) return;

  // Limpiar input y resetear altura
  input.value        = '';
  input.style.height = 'auto';
  updateDashCharCount(0);

  appendDashMsg('user', msg);
  _dashChat.history.push({ role: 'user', content: msg });

  const typingId = appendDashTyping();
  _dashChat.isTyping = true;
  const sendBtn      = $('dash-chat-send');
  if (sendBtn) sendBtn.disabled = true;

  try {
    // Simular delay de "pensamiento"
    await new Promise(r => setTimeout(r, 600 + Math.random() * 400));

    const reply = getDashChatResponse(msg);

    removeDashTyping(typingId);

    if (!reply) throw new Error('Respuesta vacía');

    _dashChat.history.push({ role: 'assistant', content: reply });
    appendDashMsg('bot', reply);

    // Registrar interacción como buena práctica
    chrome.runtime.sendMessage({
      type:   'GOOD_PRACTICE',
      action: 'consultar el chat de seguridad',
    }).catch(() => {});

  } catch (err) {
    removeDashTyping(typingId);
    appendDashMsg('error', `⚠️ No pude procesar tu mensaje. Intenta de nuevo.`);
  } finally {
    _dashChat.isTyping = false;
    if (sendBtn) sendBtn.disabled = false;
    input?.focus();
  }
}

// ── Helpers del DOM ───────────────────────────────────────────────────────
function appendDashMsg(type, text) {
  const container = $('dash-chat-messages');
  if (!container) return;

  const isUser  = type === 'user';
  const isError = type === 'error';

  const msgEl = document.createElement('div');
  msgEl.className = `dash-chat-msg ${isUser ? 'user' : isError ? 'bot error' : 'bot'}`;

  if (!isUser) {
    const av  = document.createElement('img');
    const msgState = S.health >= 70 ? 'happy' : S.health >= 50 ? 'neutral' : 'sick';
    av.src    = `../assets/sprites/${msgState}.png`;
    av.alt    = _dashChat.petName;
    av.className = 'dash-chat-avatar';
    msgEl.appendChild(av);
  }

  const bubble = document.createElement('div');
  bubble.className   = 'dash-chat-bubble';
  bubble.textContent = text;  // textContent — seguro contra XSS

  msgEl.appendChild(bubble);
  container.appendChild(msgEl);
  container.scrollTop = container.scrollHeight;
}

function appendDashTyping() {
  const container = $('dash-chat-messages');
  if (!container) return null;

  const id    = 'dash-typing-' + Date.now();
  const msgEl = document.createElement('div');
  msgEl.className = 'dash-chat-msg bot';
  msgEl.id        = id;

  const av    = document.createElement('img');
  const typingState = S.health >= 70 ? 'happy' : S.health >= 50 ? 'neutral' : 'sick';
  av.src      = `../assets/sprites/${typingState}.png`;
  av.alt      = _dashChat.petName;
  av.className = 'dash-chat-avatar';

  const bubble = document.createElement('div');
  bubble.className = 'dash-chat-bubble';
  bubble.innerHTML = '<div class="dash-typing-dots"><span></span><span></span><span></span></div>';

  msgEl.appendChild(av);
  msgEl.appendChild(bubble);
  container.appendChild(msgEl);
  container.scrollTop = container.scrollHeight;

  return id;
}

function removeDashTyping(id) {
  if (id) $(id)?.remove();
}

function clearDashChat() {
  const container = $('dash-chat-messages');
  if (!container) return;

  container.innerHTML = '';
  _dashChat.history   = [];

  // Mostrar saludo sin re-registrar listeners
  const greet = _dashChat.userName
    ? `¡Conversación limpiada! 😺 ¿En qué más puedo ayudarte, ${_dashChat.userName}?`
    : '¡Conversación limpiada! 😺 ¿Tienes alguna otra pregunta sobre seguridad?';
  appendDashMsg('bot', greet);

  showToast('Conversación limpiada 🗑️');
}

function updateDashCharCount(len) {
  const el = $('dash-chat-char');
  if (!el) return;
  el.textContent = `${len} / 500`;
  el.classList.toggle('near-limit', len > 450);
}
async function renderExportImport() {
  const section=document.getElementById('export-import-section'); if(!section) return;
  section.innerHTML=`
    <h2 class="card-title" style="margin-bottom:12px;">📦 Exportar / Importar</h2>
    <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:14px;">Guarda todo tu progreso en un archivo cifrado <code>.cyberpet</code> y recupéralo en otro dispositivo.</p>
    <div style="display:flex;flex-direction:column;gap:10px;max-width:360px;">
      <div style="display:flex;gap:8px;">
        <input type="password" id="export-pwd" class="form-input" placeholder="Contraseña de cifrado" style="flex:1;" aria-label="Contraseña de exportación">
        <button class="btn btn-primary" id="btn-export" aria-label="Exportar estado">📤 Exportar</button>
      </div>
      <p id="export-msg" style="font-size:.82rem;min-height:1.2em;" role="status"></p>
      <hr style="border:none;border-top:1px solid var(--border);">
      <input type="file" id="import-file" accept=".cyberpet" style="font-size:.82rem;" aria-label="Archivo .cyberpet">
      <div style="display:flex;gap:8px;">
        <input type="password" id="import-pwd" class="form-input" placeholder="Contraseña del archivo" style="flex:1;" aria-label="Contraseña de importación">
        <button class="btn btn-primary" id="btn-import" aria-label="Importar estado">📥 Importar</button>
      </div>
      <p id="import-msg" style="font-size:.82rem;min-height:1.2em;" role="status"></p>
    </div>`;

  document.getElementById('btn-export')?.addEventListener('click',async()=>{
    const pwd=document.getElementById('export-pwd')?.value??'';
    const msg=document.getElementById('export-msg');
    if(!pwd){if(msg)msg.textContent='Introduce una contraseña.';return;}
    if(msg)msg.textContent='Cifrando...';
    const res=await chrome.runtime.sendMessage({type:'EXPORT_STATE',password:pwd});
    if(res?.ok){
      const blob=new Blob([res.data],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url; a.download=`cyberpet-backup-${new Date().toISOString().slice(0,10)}.cyberpet`; a.click();
      setTimeout(()=>URL.revokeObjectURL(url),2000);
      if(msg){msg.textContent='✅ Archivo descargado.';msg.style.color='#22c55e';}
    }
  });

  document.getElementById('btn-import')?.addEventListener('click',async()=>{
    const file=document.getElementById('import-file')?.files?.[0];
    const pwd=document.getElementById('import-pwd')?.value??'';
    const msg=document.getElementById('import-msg');
    if(!file||!pwd){if(msg)msg.textContent='Selecciona un archivo e introduce la contraseña.';return;}
    if(msg)msg.textContent='Importando...';
    const text=await file.text();
    const res=await chrome.runtime.sendMessage({type:'IMPORT_STATE',data:text,password:pwd});
    if(res?.ok){
      if(msg){msg.textContent='✅ Importado correctamente. Recarga para ver los cambios.';msg.style.color='#22c55e';}
      await loadData(); renderHome();
    } else {
      if(msg){msg.textContent=`❌ ${res?.error||'Error'}`;msg.style.color='#ef4444';}
    }
  });
}

// ── LOGROS — DEFINICIONES COMPLETAS ──────────────────────────────────────────
// progress(s) → { cur, max }   (s = objeto de chrome.storage)
const BADGE_DEFS_DASH = [
  // ── POSITIVOS ─────────────────────────────────────────────────────────────
  { id:'cyber_rookie',    name:'Cyber Rookie',        desc:'Alcanza 100 puntos de experiencia',      icon:'🎯', positive:true, points:15, coins:10,
    progress:s=>({cur:Math.min(s.userPoints||0,100),                         max:100  }) },
  { id:'safe_navigator',  name:'Navegante Seguro',    desc:'7 días consecutivos sin amenazas',       icon:'🛡️', positive:true, points:40, coins:20,
    progress:s=>({cur:Math.min(s.streakStats?.currentStreak||0,7),           max:7    }) },
  { id:'streak_legend',   name:'Leyenda del Streak',  desc:'30 días seguros consecutivos',           icon:'🔥', positive:true, points:100, coins:50,
    progress:s=>({cur:Math.min(s.streakStats?.currentStreak||0,30),          max:30   }) },
  { id:'fort_knox',       name:'Fort Knox',           desc:'10 contraseñas fuertes detectadas',      icon:'🏰', positive:true, points:20, coins:15,
    progress:s=>({cur:Math.min(s.badgeCounters?.strongPasswords||0,10),      max:10   }) },
  { id:'password_pro',    name:'Password Pro',        desc:'25 contraseñas fuertes detectadas',      icon:'🔑', positive:true, points:50, coins:25,
    progress:s=>({cur:Math.min(s.badgeCounters?.strongPasswords||0,25),      max:25   }) },
  { id:'hawk_eye',        name:'Ojo de Halcón',       desc:'Detecta 5 sitios de phishing',           icon:'🦅', positive:true, points:30, coins:20,
    progress:s=>({cur:Math.min(s.badgeCounters?.phishingDetected||0,5),      max:5    }) },
  { id:'phishing_hunter', name:'Cazador de Phishing', desc:'Detecta 20 sitios de phishing',          icon:'🎣', positive:true, points:80, coins:40,
    progress:s=>({cur:Math.min(s.badgeCounters?.phishingDetected||0,20),     max:20   }) },
  { id:'vault_master',    name:'Maestro del Vault',   desc:'Guarda 5 contraseñas en el Vault',       icon:'🔐', positive:true, points:25, coins:20,
    progress:s=>({cur:Math.min((s.passwordVault||[]).length,5),              max:5    }) },
  { id:'vault_guardian',  name:'Guardián del Vault',  desc:'Guarda 15 contraseñas en el Vault',      icon:'🏛️', positive:true, points:60, coins:30,
    progress:s=>({cur:Math.min((s.passwordVault||[]).length,15),             max:15   }) },
  { id:'educator',        name:'Estudiante Aplicado', desc:'Completa 3 tests anti-phishing',         icon:'📚', positive:true, points:20, coins:15,
    progress:s=>({cur:Math.min(s.educationStats?.completed||0,3),            max:3    }) },
  { id:'perfect_student', name:'Nota Perfecta',       desc:'Consigue 5/5 en el test educativo',      icon:'🎓', positive:true, points:90, coins:45,
    progress:s=>({cur:Math.min(s.educationStats?.bestScore||0,5),            max:5    }) },
  { id:'coin_hoarder',    name:'Ahorrador Digital',   desc:'Acumula 500 monedas',                    icon:'🪙', positive:true, points:30, coins:25,
    progress:s=>({cur:Math.min(s.userCoins||0,500),                          max:500  }) },
  { id:'shield_wall',     name:'Muro de Escudo',      desc:'Bloquea 25 amenazas en total',           icon:'⚔️', positive:true, points:40, coins:25,
    progress:s=>({cur:Math.min(s.threatsBlocked||0,25),                      max:25   }) },
  { id:'millionaire',     name:'Cyber Millonario',    desc:'Acumula 1000 puntos de experiencia',     icon:'💎', positive:true, points:150, coins:75,
    progress:s=>({cur:Math.min(s.userPoints||0,1000),                        max:1000 }) },

  // ── NEGATIVOS ─────────────────────────────────────────────────────────────
  { id:'first_blood',     name:'Primera Caída',       desc:'Tu CyberPet murió por primera vez',      icon:'💀', positive:false, points:-10, coins:-5,
    progress:s=>({cur:Math.min(s.deathCount||0,1),                           max:1    }) },
  { id:'reckless',        name:'Imprudente',           desc:'Tu CyberPet murió 3 veces',             icon:'☠️', positive:false, points:-30, coins:-15,
    progress:s=>({cur:Math.min(s.deathCount||0,3),                           max:3    }) },
  { id:'weak_chain',      name:'Eslabón Débil',        desc:'Usaste 10 contraseñas inseguras',       icon:'🔓', positive:false, points:-15, coins:-10,
    progress:s=>({cur:Math.min(s.badgeCounters?.weakPasswords||0,10),        max:10   }) },
  { id:'keyword_magnet',  name:'Imán de Palabras',     desc:'20 palabras censuradas en total',       icon:'🤐', positive:false, points:-25, coins:-15,
    progress:s=>({cur:Math.min(s.badgeCounters?.totalKeywordsCensored||0,20),max:20   }) },
  { id:'phishing_bait',   name:'Cebo de Phishing',     desc:'Ignoraste 5 alertas de phishing',       icon:'🪝', positive:false, points:-40, coins:-20,
    progress:s=>({cur:Math.min(s.badgeCounters?.phishingClicked||0,5),       max:5    }) },
];

// ── RENDER LOGROS ─────────────────────────────────────────────────────────────

// Sincronizar todos los badges con el estado actual antes de renderizar
async function syncBadgesWithState() {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'SYNC_ALL_BADGES' });
    console.log('✅ Badges sincronizados:', result);
  } catch (e) {
    console.error('❌ Error sincronizando badges:', e);
  }
}

async function renderBadges() {
  const page = document.getElementById('page-badges');
  if (!page) return;

  // Sincronizar badges con el estado actual antes de renderizar
  await syncBadgesWithState();

  const s = await chrome.storage.local.get([
    'badges','badgesClaimedRewards','badgeCounters','streakStats','passwordVault',
    'equippedOutfit','shopInventory','petName',
    'userPoints','userCoins','threatsBlocked','deathCount','educationStats',
  ]);

  const earned   = s.badges || [];
  const claimed  = s.badgesClaimedRewards || [];
  
  // DEBUG: Mostrar qué datos llegaron del storage
  console.log('🏆 Badge data from storage:', {
    earned: earned,
    earnedCount: earned.length,
    badgeCounters: s.badgeCounters,
    streakStats: s.streakStats,
    passwordVault: s.passwordVault?.length,
    educationStats: s.educationStats,
    deathCount: s.deathCount,
    userPoints: s.userPoints,
    userCoins: s.userCoins,
    threatsBlocked: s.threatsBlocked,
  });
  
  const positives = BADGE_DEFS_DASH.filter(d =>  d.positive);
  const negatives  = BADGE_DEFS_DASH.filter(d => !d.positive);
  const earnedPos  = positives.filter(d => earned.includes(d.id)).length;
  const earnedNeg  = negatives.filter(d => earned.includes(d.id)).length;

  // Sprite del gato con outfit
  const state = S.health >= 70 ? 'happy' : S.health >= 50 ? 'neutral' : 'sick';
  const outfit = s.equippedOutfit || {};
  const clothLayers = Object.values(outfit).filter(Boolean);

  page.innerHTML = `
    <h1 class="page-title">🏆 Logros</h1>

    <!-- Cabecera resumen -->
    <div class="badges-overview">
      <div class="badges-pet-col">
        <div class="badges-pet-wrap">
          <img src="../assets/sprites/${state}.png" class="badges-pet-sprite" alt="CyberPet">
          ${clothLayers.map(id=>`<img src="../assets/clothes/${escHtml(id)}.png" class="badges-pet-overlay" onerror="this.style.display='none'" alt="">`).join('')}
        </div>
        <div class="badges-pet-name">${escHtml(s.petName||'CyberPet')}</div>
      </div>
      <div class="badges-summary">
        <div class="badges-summary-row">
          <span class="bsr-icon">🌟</span>
          <span class="bsr-label">Logros positivos</span>
          <span class="bsr-count pos">${earnedPos} / ${positives.length}</span>
        </div>
        <div class="bsr-bar-bg"><div class="bsr-bar pos" style="width:${Math.round(earnedPos/positives.length*100)}%"></div></div>
        <div class="badges-summary-row" style="margin-top:10px;">
          <span class="bsr-icon">⚠️</span>
          <span class="bsr-label">Logros negativos</span>
          <span class="bsr-count neg">${earnedNeg} / ${negatives.length}</span>
        </div>
        <div class="bsr-bar-bg"><div class="bsr-bar neg" style="width:${Math.round(earnedNeg/negatives.length*100)}%"></div></div>
        <div class="bsr-total">Total desbloqueados: <strong>${earned.length} / ${BADGE_DEFS_DASH.length}</strong></div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="badges-tabs" role="tablist">
      <button class="badge-tab-btn active" data-btab="positive" role="tab" aria-selected="true">
        🌟 Positivos <span class="badge-tab-count">${earnedPos}/${positives.length}</span>
      </button>
      <button class="badge-tab-btn" data-btab="negative" role="tab" aria-selected="false">
        ⚠️ Negativos <span class="badge-tab-count neg">${earnedNeg}/${negatives.length}</span>
      </button>
    </div>

    <!-- Secciones -->
    <div id="btab-positive" class="badges-grid" role="tabpanel">${_buildBadgeCards(positives, earned, claimed, s)}</div>
    <div id="btab-negative" class="badges-grid" style="display:none;" role="tabpanel">${_buildBadgeCards(negatives, earned, claimed, s)}</div>

    <canvas id="badge-canvas" style="display:none;" aria-hidden="true"></canvas>`;

  // Cambio de tab
  page.querySelectorAll('.badge-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      page.querySelectorAll('.badge-tab-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
      btn.classList.add('active'); btn.setAttribute('aria-selected','true');
      const tab = btn.dataset.btab;
      page.querySelector('#btab-positive').style.display = tab === 'positive' ? '' : 'none';
      page.querySelector('#btab-negative').style.display = tab === 'negative' ? '' : 'none';
    });
  });

  // Botones compartir — event delegation para evitar inline onclick
  page.addEventListener('click', e => {
    const btn = e.target.closest('.badge-share-btn');
    if (btn) shareBadge(btn.dataset.id, s);
  }, { once: false });

  // ── Botones reclamar recompensa ────────────────────────────────────────────
  page.addEventListener('click', async e => {
    const btn = e.target.closest('.badge-claim-btn');
    if (!btn) return;

    btn.disabled    = true;
    btn.textContent = '⏳ Reclamando...';

    const res = await chrome.runtime.sendMessage({
      type:    'CLAIM_BADGE_REWARD',
      badgeId: btn.dataset.id,
    }).catch(() => null);

    if (res?.ok) {
      const { pts, coins } = res.gained;
      const parts = [
        pts   ? (pts   > 0 ? `+${pts}`   : String(pts))   + ' pts' : '',
        coins ? (coins > 0 ? `+${coins}` : String(coins)) + ' 🪙'  : '',
      ].filter(Boolean);
      showToast(`🎁 Reclamado: ${parts.join(' · ')}`);

      // Actualizar estado en memoria y home
      S.points = Math.floor(res.points);
      S.coins  = res.coins;
      renderHome();

      // Re-renderizar logros para reflejar el nuevo estado
      renderBadges();
    } else {
      btn.disabled    = false;
      btn.textContent = btn.classList.contains('badge-claim-neg')
        ? '⚠️ Reclamar logro'
        : '🎁 Reclamar recompensa';
      showToast(`❌ ${res?.error || 'Error al reclamar'}`);
    }
  });
}

function _buildBadgeCards(defs, earned, claimed, s) {
  return defs.map(d => {
    const got       = earned.includes(d.id);
    const isClaimed = claimed.includes(d.id);
    const canClaim  = got && !isClaimed;
    const p         = d.progress(s);
    const pct       = Math.min(100, Math.round(p.cur / p.max * 100));

    const barCol = got
      ? (d.positive ? '#f59e0b' : '#ef4444')
      : (d.positive ? 'var(--accent)' : '#f97316');

    // Recompensas
    const rewardHtml = (d.points || d.coins) ? `
      <div class="badge-reward-line" style="color:${d.points > 0 ? 'var(--accent2)' : 'var(--danger)'}">
        ${d.points ? (d.points > 0 ? '➕ ' : '➖ ') + Math.abs(d.points) + ' pts' : ''}
        ${d.coins  ? (d.coins  > 0 ? '➕ ' : '➖ ') + Math.abs(d.coins)  + ' 🪙'  : ''}
      </div>` : '';

    // Botón de acción según estado
    let actionHtml;
    if (!got) {
      actionHtml = `<div class="badge-locked-label" aria-label="Bloqueado">🔒 Bloqueado</div>`;
    } else if (canClaim) {
      const claimLabel = d.positive ? '🎁 Reclamar recompensa' : '⚠️ Reclamar logro';
      actionHtml = `
        <button class="badge-claim-btn${d.positive ? '' : ' badge-claim-neg'}"
                data-id="${escHtml(d.id)}"
                type="button"
                aria-label="Reclamar recompensa de ${escHtml(d.name)}">
          ${claimLabel}
        </button>`;
    } else {
      // Ya reclamado — solo compartir
      actionHtml = `
        <div class="badge-claimed-row">
          <span class="badge-claimed-tag">✅ Reclamado</span>
          <button class="badge-share-btn" data-id="${escHtml(d.id)}" type="button"
                  aria-label="Compartir ${escHtml(d.name)}">📤 Compartir</button>
        </div>`;
    }

    return `
    <div class="badge-card${got ? ' badge-earned' : ''}${!d.positive ? ' badge-neg' : ''}${canClaim ? ' badge-claimable' : ''}"
         role="article"
         aria-label="${escHtml(d.name)}: ${got ? (isClaimed ? 'reclamado' : 'pendiente de reclamar') : 'bloqueado'}">

      <div class="badge-card-icon${!got ? ' badge-locked-icon' : ''}">${d.icon}</div>
      <div class="badge-card-name">${escHtml(d.name)}</div>
      <div class="badge-card-desc">${escHtml(d.desc)}</div>
      ${rewardHtml}

      <div class="badge-prog-wrap" title="${p.cur} de ${p.max}">
        <div class="badge-prog-fill" style="width:${pct}%;background:${barCol};"></div>
      </div>
      <div class="badge-prog-label">
        <span>${p.cur} / ${p.max}</span>
        <span>${got ? (isClaimed ? '✅ Reclamado' : '🔔 Listo para reclamar') : pct + '%'}</span>
      </div>

      ${actionHtml}
    </div>`;
  }).join('');
}

async function shareBadge(id, s) {
  const d = BADGE_DEFS_DASH.find(x => x.id === id);
  if (!d) return;
  if (!s) s = await chrome.storage.local.get(['petName','userPoints']);
  const canvas = document.getElementById('badge-canvas');
  if (!canvas) return;

  canvas.width = 520; canvas.height = 300;
  const ctx = canvas.getContext('2d');

  // Fondo
  const bg = ctx.createLinearGradient(0, 0, 520, 300);
  bg.addColorStop(0, d.positive ? '#0f2238' : '#1f0a0a');
  bg.addColorStop(1, d.positive ? '#16213e' : '#2d0808');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 520, 300);

  // Borde dorado o rojo
  ctx.strokeStyle = d.positive ? '#f59e0b' : '#ef4444';
  ctx.lineWidth = 3;
  if (ctx.roundRect) ctx.roundRect(8, 8, 504, 284, 18);
  else ctx.rect(8, 8, 504, 284);
  ctx.stroke();

  // Icono
  ctx.font = '64px serif'; ctx.textAlign = 'center';
  ctx.fillText(d.icon, 260, 105);

  // Nombre
  ctx.fillStyle = d.positive ? '#f59e0b' : '#ef4444';
  ctx.font = 'bold 22px system-ui'; ctx.fillText(d.name, 260, 148);

  // Descripción
  ctx.fillStyle = '#94a3b8'; ctx.font = '14px system-ui'; ctx.fillText(d.desc, 260, 174);

  // Tipo
  ctx.fillStyle = d.positive ? '#4ade80' : '#f87171';
  ctx.font = 'bold 12px system-ui';
  ctx.fillText(d.positive ? '⭐ Logro Positivo' : '⚠️ Logro Negativo', 260, 200);

  // Footer
  ctx.fillStyle = '#475569'; ctx.font = '11px system-ui';
  ctx.fillText(`${s.petName || 'CyberPet'} · ${Math.floor(s.userPoints || 0)} pts · CyberPet Extension`, 260, 232);

  canvas.toBlob(b => {
    const u = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = u; a.download = `badge-${id}.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(u), 2000);
  });
}

let _eduDashInited = false;
 
function initEduDash() {
  const startBtn  = document.getElementById('edu-start-dash');
  const levelSel  = document.getElementById('edu-level-dash');
  const panel     = document.getElementById('edu-panel-dash');
  if (!startBtn || _eduDashInited) return;
  _eduDashInited = true;
 
  startBtn.addEventListener('click', async () => {
    const level = levelSel?.value || 'normal';
    panel.innerHTML = '<span style="color:var(--text-muted)">Iniciando sesión...</span>';
    startBtn.disabled = true;
 
    const res = await chrome.runtime.sendMessage({ type: 'EDU_START', level }).catch(() => null);
    if (!res?.ok) {
      panel.innerHTML = '<span style="color:var(--danger)">Error al iniciar. Recarga e intenta de nuevo.</span>';
      startBtn.disabled = false;
      return;
    }
    renderEduQuestion(res.question, res.step, res.total, panel, startBtn);
  });
}
 
function renderEduQuestion(q, step, total, panel, startBtn) {
  if (!q) return;
  panel.innerHTML = `
    <div style="margin-bottom:10px;font-size:.8rem;color:var(--text-muted);">Pregunta ${step} de ${total}</div>
    <div style="font-family:monospace;font-size:.9rem;word-break:break-all;background:var(--c1);padding:10px 14px;border-radius:10px;margin-bottom:14px;">${escHtml(q.url)}</div>
    <p style="font-size:.85rem;margin-bottom:12px;">¿Esta URL es legítima o es phishing?</p>
    <div style="display:flex;gap:10px;">
      <button class="btn btn-primary"   id="edu-real"    style="flex:1;">✅ Es real</button>
      <button class="btn btn-danger-sm" id="edu-phishing" style="flex:1;padding:9px;">🎣 Es phishing</button>
    </div>
    <div id="edu-feedback" style="margin-top:12px;font-size:.84rem;min-height:1.5em;"></div>
  `;
 
  const answer = async (real) => {
    document.getElementById('edu-real')?.remove();
    document.getElementById('edu-phishing')?.remove();
    const fb = document.getElementById('edu-feedback');
 
    const res = await chrome.runtime.sendMessage({ type: 'EDU_ANSWER', real }).catch(() => null);
    if (!res) return;
 
    if (fb) {
      fb.style.color = res.correct ? 'var(--accent2)' : 'var(--danger)';
      fb.textContent = res.correct
        ? '✅ ¡Correcto!'
        : `❌ Incorrecto. ${res.explanation || ''}`;
    }
 
    setTimeout(() => {
      if (res.done) {
        const r = res.result || {};
        panel.innerHTML = `
          <div style="text-align:center;padding:16px;">
            <div style="font-size:2rem;margin-bottom:8px;">${r.hits >= 4 ? '🏆' : r.hits >= 3 ? '😺' : '😿'}</div>
            <h3 style="color:var(--accent);margin-bottom:6px;">${r.hits}/${r.total} correctas</h3>
            <p style="font-size:.85rem;color:var(--text-muted);">
              ${r.points > 0 ? `+${r.points} puntos` : 'Sin puntos extra esta vez'}
              ${r.healthPenalty > 0 ? ` · -${r.healthPenalty} HP` : ''}
            </p>
          </div>`;
        startBtn.disabled = false;
        loadData().then(renderHome);
      } else {
        renderEduQuestion(res.question, res.step, res.total, panel, startBtn);
      }
    }, 1800);
  };
 
  document.getElementById('edu-real')?.addEventListener('click', () => answer(true));
  document.getElementById('edu-phishing')?.addEventListener('click', () => answer(false));
}