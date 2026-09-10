'use strict';

// ── Consejos de seguridad ────────────────────────────────────────────────────
const TIPS = [
  'Las contraseñas más seguras tienen más de 12 caracteres, incluyen mayúsculas, números y símbolos.',
  'Nunca uses la misma contraseña en dos sitios. Usa el gestor de contraseñas de CyberPet.',
  'Si un mensaje te pide actuar con urgencia o te amenaza, es señal de alerta.',
  'Activa la verificación en dos pasos (2FA) en tus cuentas importantes.',
  'Actualiza tus apps y sistema operativo para evitar vulnerabilidades conocidas.',
  'Revisa los permisos de las apps que instalas — menos permisos = más seguridad.',
  'Desconfía de redes Wi-Fi públicas sin contraseña para acceder a tus cuentas.',
  'Los sitios seguros siempre empiezan por https:// — el candado es tu amigo.',
];

// ── Mapas de categorías bloqueadas ───────────────────────────────────────────
const CATEGORY_META = {
  adult:      { icon: '🔞', label: 'Contenido adulto',             tip: 'Este tipo de contenido no es adecuado para menores.' },
  gambling:   { icon: '🎰', label: 'Apuestas / Casino',            tip: 'Los sitios de apuestas pueden ser adictivos y perjudiciales.' },
  downloads:  { icon: '⬇️', label: 'Descargas no autorizadas',     tip: 'Las descargas de software no oficial pueden contener malware.' },
  violence:   { icon: '⚠️', label: 'Violencia extrema',            tip: 'Este sitio contiene imágenes o vídeos perturbadores.' },
  unverified: { icon: '❓', label: 'Dominio no verificado',         tip: 'El modo de filtrado alto solo permite sitios de confianza.' },
  manual:     { icon: '🛑', label: 'Bloqueado por apoderado',        tip: 'Este sitio ha sido bloqueado manualmente por tu apoderado.' },
  weapons:    { icon: '🔫', label: 'Armas / Contenido peligroso',    tip: 'Sitios relacionados con armas o material peligroso están restringidos.' },
  drugs:      { icon: '💊', label: 'Drogas / Sustancias ilícitas',   tip: 'Sitios sobre sustancias ilegales están bloqueados por tu seguridad.' },
  hate:       { icon: '☣️', label: 'Discurso de odio / Extremismo',  tip: 'Este contenido promueve ideas dañinas y no es apropiado.' },
  none:       { icon: '🚫', label: 'Contenido bloqueado',            tip: 'Este sitio ha sido bloqueado por el filtro familiar.' },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtMin(m) {
  if (!m || m <= 0) return '0m';
  const n = Math.round(m * 10) / 10;
  return n >= 60 ? `${Math.floor(n / 60)}h ${Math.round(n % 60)}m` : `${n}m`;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value ?? '');
}

function closeTab() {
  try {
    chrome.tabs.getCurrent(tab => {
      if (tab?.id) chrome.tabs.remove(tab.id);
      else window.close();
    });
  } catch { window.close(); }
}

// ── Leer parámetros de la URL ────────────────────────────────────────────────
const _params      = new URLSearchParams(location.search);
const IS_BLOCKED   = _params.get('blocked') === '1';
const BLOCK_REASON = _params.get('reason')   ? decodeURIComponent(_params.get('reason'))   : '';
const BLOCK_CAT    = _params.get('category') ? decodeURIComponent(_params.get('category')) : 'none';
const BLOCK_HOST   = _params.get('host')     ? decodeURIComponent(_params.get('host'))     : '';

// ── Aplicar modo al <body> inmediatamente (evita FOUC) ───────────────────────
document.body.classList.add(IS_BLOCKED ? 'mode-blocked' : 'mode-timeout');

// ── Countdown (solo timeout) ─────────────────────────────────────────────────
function updateCountdown() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  const diff = midnight - now;
  if (diff <= 0) { setText('countdown-val', 'Nuevo día disponible'); return; }
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  setText('countdown-val', h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`);
}

// ── Comprar tiempo extra ─────────────────────────────────────────────────────
async function buyTime(itemId, btnEl) {
  const msgEl = document.getElementById('buy-msg');
  if (msgEl) { msgEl.textContent = 'Procesando...'; msgEl.style.color = 'var(--text-muted)'; }
  if (btnEl) btnEl.disabled = true;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'FAMILY_GRANT_TIME', itemId });
    if (res?.ok) {
      const added = res.addedMinutes ?? (itemId === 'extra_time_30' ? 30 : 60);
      if (msgEl) { msgEl.textContent = `✅ +${added} minutos desbloqueados. Redirigiendo...`; msgEl.style.color = '#22c55e'; }
      setTimeout(() => {
        const prev = document.referrer;
        location.replace(prev && !prev.includes('time-out') && prev.startsWith('http')
          ? prev : 'https://www.google.com');
      }, 800);
    } else {
      if (msgEl) { msgEl.textContent = res?.error ?? 'No se pudo completar'; msgEl.style.color = '#ef4444'; }
      if (btnEl) btnEl.disabled = false;
    }
  } catch {
    if (msgEl) { msgEl.textContent = 'Error de conexión con la extensión'; msgEl.style.color = '#ef4444'; }
    if (btnEl) btnEl.disabled = false;
  }
}

// ── Inicializar modo TIMEOUT ─────────────────────────────────────────────────
async function loadTimeout() {
  try {
    const data = await chrome.storage.local.get([
      'dailyStats', 'familySettings', 'userCoins', 'petHealth', 'themeColor', 'timeLimitReached'
    ]);
    document.body.dataset.theme = data.themeColor ?? 'blue';

    const stats  = data.dailyStats    ?? {};
    const fs     = data.familySettings ?? {};
    const coins  = data.userCoins ?? 0;
    const hp     = data.petHealth ?? 100;
    const maxMin = fs.maxDailyMinutes ?? 120;

    setText('used-min',      fmtMin(stats.screenMinutes ?? 0));
    setText('max-min',       fmtMin(maxMin));
    setText('threats-today', stats.threatsSeen ?? 0);
    setText('coins-val',     coins);

    if (fs.timeUpMessage) setText('msg-custom', `"${fs.timeUpMessage}"`);

    // Emoji del gato según salud
    setText('cat-emoji', hp === 0 ? '😿' : hp >= 70 ? '😸' : '😺');

    // Mostrar sección de compra de tiempo si aplica
    const section = document.getElementById('coins-section');
    if (section && fs.allowCoinPurchases !== false && coins >= 35) {
      section.style.display = 'block';
      const btn60 = document.getElementById('btn-buy-60');
      if (btn60 && coins < 60) btn60.disabled = true;
    }

    // Si timeLimitReached ya es false, redirigir (tiempo extra comprado desde otra pestaña)
    if (data.timeLimitReached === false) {
      const prev = document.referrer;
      location.replace(prev && prev.startsWith('http') && !prev.includes('time-out')
        ? prev : 'https://www.google.com');
    }
  } catch {
    setText('countdown-val', 'No disponible');
  }
}

// ── Inicializar modo BLOCKED ─────────────────────────────────────────────────
async function loadBlocked() {
  try {
    const data = await chrome.storage.local.get([
      'dailyStats', 'userCoins', 'petHealth', 'themeColor', 'blockedSites'
    ]);
    document.body.dataset.theme = data.themeColor ?? 'blue';

    const stats  = data.dailyStats  ?? {};
    const coins  = data.userCoins   ?? 0;
    const hp     = data.petHealth   ?? 100;

    // Emoji según salud
    setText('cat-emoji', hp === 0 ? '😿' : hp >= 70 ? '🙀' : '😾');

    // Badge de categoría
    const meta = CATEGORY_META[BLOCK_CAT] ?? CATEGORY_META.none;
    setText('block-icon',           meta.icon);
    setText('block-category-label', meta.label);

    // Hostname bloqueado
    setText('block-host', BLOCK_HOST || '(sitio desconocido)');

    // Razón del bloqueo
    setText('block-reason-text', BLOCK_REASON || meta.tip);

    // Contar cuántos bloqueos hubo hoy
    const today = new Date().toDateString();
    const blockedSites = data.blockedSites ?? [];
    const todayBlocks  = blockedSites.filter(b => {
      try { return new Date(b.date).toDateString() === today; } catch { return false; }
    }).length;

    setText('block-count-today', todayBlocks);
    setText('block-used-min',    fmtMin(stats.screenMinutes ?? 0));
    setText('block-coins-val',   coins);

    // Tip específico de la categoría
    setText('tip-text', meta.tip);

  } catch (e) {
    // Fallback silencioso
  }
}

// ── Carga principal ──────────────────────────────────────────────────────────
async function load() {
  // Consejo aleatorio (compartido; puede sobreescribirse en loadBlocked)
  setText('tip-text', TIPS[Math.floor(Math.random() * TIPS.length)]);

  if (IS_BLOCKED) {
    await loadBlocked();
  } else {
    await loadTimeout();
    updateCountdown();
    setInterval(updateCountdown, 1000);
  }
}

// ── Event listeners ──────────────────────────────────────────────────────────

// Timeout: comprar tiempo
document.getElementById('btn-buy-30')?.addEventListener('click', e => buyTime('extra_time_30', e.currentTarget));
document.getElementById('btn-buy-60')?.addEventListener('click', e => buyTime('extra_time_60', e.currentTarget));

// Timeout: cerrar pestaña
document.getElementById('btn-close-tab')?.addEventListener('click', closeTab);

// Blocked: volver atrás
document.getElementById('btn-go-back')?.addEventListener('click', () => {
  // history.back() podría volver al sitio bloqueado y redirigir de nuevo.
  // Preferimos ir a la nueva pestaña (about:blank) o google como fallback.
  const prev = document.referrer;
  if (prev && prev.startsWith('http') && !prev.includes('time-out')) {
    location.replace(prev);
  } else if (history.length > 2) {
    history.go(-2); // saltar 2 entradas para evitar el sitio bloqueado
  } else {
    location.replace('https://www.google.com');
  }
});

// Blocked: cerrar pestaña
document.getElementById('btn-close-blocked')?.addEventListener('click', closeTab);

// Blocked: enlace al dashboard
document.getElementById('link-dashboard')?.addEventListener('click', e => {
  e.preventDefault();
  chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' }).catch(() => {});
});

// ── Listener reactivo (timeout): desbloquear si el padre compra tiempo extra ──
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    if (!IS_BLOCKED && changes.timeLimitReached?.newValue === false) {
      const prev = document.referrer;
      location.replace(
        prev && prev.startsWith('http') && !prev.includes('time-out')
          ? prev : 'https://www.google.com'
      );
    }

    // Actualizar monedas en tiempo real en ambos modos
    if (changes.userCoins) {
      setText('coins-val',       changes.userCoins.newValue ?? 0);
      setText('block-coins-val', changes.userCoins.newValue ?? 0);
    }
  });
} catch {
  // Entorno sin chrome.storage (tests) — ignorar
}

// ── Arranque ─────────────────────────────────────────────────────────────────
load();