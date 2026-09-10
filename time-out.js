'use strict';

const TIPS = [
  'Las contraseñas más seguras tienen más de 12 caracteres, incluyen mayúsculas, números y símbolos.',
  'Nunca uses la misma contraseña en dos sitios. Usa el gestor de contraseñas de CyberPet.',
  'Si un mensaje te pide actuar con urgencia o te amenaza, es señal de alerta.',
  'Activa la verificación en dos pasos (2FA) en tus cuentas importantes.',
  'Actualiza tus apps y sistema operativo para evitar vulnerabilidades conocidas.',
];

function fmtMin(m) {
  if (!m || m <= 0) return '0m';
  const n = Math.round(m * 10) / 10;
  return n >= 60 ? `${Math.floor(n / 60)}h ${Math.round(n % 60)}m` : `${n}m`;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value ?? '');
}

function updateCountdown() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  const diff = midnight - now;
  if (diff <= 0) {
    setText('countdown-val', 'Nuevo día disponible');
    return;
  }
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  setText('countdown-val', h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`);
}

async function buyTime(itemId, btnEl) {
  const msgEl = document.getElementById('buy-msg');
  if (msgEl) {
    msgEl.textContent = 'Procesando...';
    msgEl.style.color = 'var(--text-muted)';
  }
  if (btnEl) btnEl.disabled = true;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'FAMILY_GRANT_TIME', itemId });
    if (res?.ok) {
      const added = res.addedMinutes ?? (itemId === 'extra_time_30' ? 30 : 60);
      if (msgEl) {
        msgEl.textContent = `✅ +${added} minutos desbloqueados. Redirigiendo...`;
        msgEl.style.color = '#22c55e';
      }
      // Usar location.replace para que tabs.onUpdated vea la URL destino
      // con timeLimitReached ya en false → no vuelve a redirigir a time-out
      setTimeout(() => {
        const prev = document.referrer;
        if (prev && !prev.includes('time-out') && prev.startsWith('http')) {
          location.replace(prev);
        } else {
          location.replace('https://www.google.com');
        }
      }, 800);
    } else {
      if (msgEl) {
        msgEl.textContent = res?.error ?? 'No se pudo completar';
        msgEl.style.color = '#ef4444';
      }
      if (btnEl) btnEl.disabled = false;
    }
  } catch {
    if (msgEl) {
      msgEl.textContent = 'Error de conexión con la extensión';
      msgEl.style.color = '#ef4444';
    }
    if (btnEl) btnEl.disabled = false;
  }
}

async function load() {
  setText('tip-text', TIPS[Math.floor(Math.random() * TIPS.length)]);
  try {
    const data = await chrome.storage.local.get([
      'dailyStats', 'familySettings', 'userCoins', 'petHealth', 'themeColor', 'timeLimitReached'
    ]);
    document.body.dataset.theme = data.themeColor ?? 'blue';

    const stats = data.dailyStats ?? {};
    const fs = data.familySettings ?? {};
    const coins = data.userCoins ?? 0;
    const hp = data.petHealth ?? 100;
    const maxMin = fs.maxDailyMinutes ?? 120;
    const usedMin = stats.screenMinutes ?? 0;

    setText('used-min', fmtMin(usedMin));
    setText('max-min', fmtMin(maxMin));
    setText('threats-today', stats.threatsSeen ?? 0);
    setText('coins-val', coins);
    if (fs.timeUpMessage) setText('msg-custom', `"${fs.timeUpMessage}"`);
    setText('cat-emoji', hp === 0 ? '😿' : hp >= 70 ? '😸' : '😺');

    const section = document.getElementById('coins-section');
    if (section && fs.allowCoinPurchases !== false && coins >= 35) {
      section.style.display = 'block';
      const btn60 = document.getElementById('btn-buy-60');
      if (btn60 && coins < 60) btn60.disabled = true;
    }

    // Poll: si timeLimitReached pasa a false (compra de tiempo), navegar
    // usando replace para evitar loop de onUpdated
    if (data.timeLimitReached === false) {
      const prev = document.referrer;
      location.replace(prev && prev.startsWith('http') && !prev.includes('time-out')
        ? prev : 'https://www.google.com');
    }
  } catch {
    setText('countdown-val', 'No disponible');
  }
}

document.getElementById('btn-buy-30')?.addEventListener('click', e => buyTime('extra_time_30', e.currentTarget));
document.getElementById('btn-buy-60')?.addEventListener('click', e => buyTime('extra_time_60', e.currentTarget));

// FIX: history.back() vuelve a la página bloqueada y el background la redirige de nuevo.
// Usar chrome.tabs.getCurrent + remove, o navegar a google como fallback.
document.getElementById('btn-close-tab')?.addEventListener('click', () => {
  try {
    chrome.tabs.getCurrent(tab => {
      if (tab?.id) {
        chrome.tabs.remove(tab.id);
      } else {
        window.close();
      }
    });
  } catch {
    window.close();
  }
});

load();
updateCountdown();
setInterval(updateCountdown, 1000);

// FIX M1: escuchar cambios en tiempo real para desbloquear TODAS las pestañas bloqueadas
// cuando el usuario compra tiempo extra desde otra pestaña o el apoderado desbloquea.
// El poll original en load() solo corre una vez — este listener es reactivo.
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.timeLimitReached?.newValue === false) {
      const prev = document.referrer;
      location.replace(
        prev && prev.startsWith('http') && !prev.includes('time-out')
          ? prev
          : 'https://www.google.com'
      );
    }
    // Actualizar monedas disponibles si cambian mientras la página está abierta
    if (changes.userCoins) {
      setText('coins-val', changes.userCoins.newValue ?? 0);
    }
  });
} catch {
  // Entorno sin chrome.storage (tests) — ignorar
}