// ════════════════════════════════════════════════
//  CYBERPET v4.1 — POPUP JS
//  FIXES:
//  - btn-dashboard y btn-open-dashboard ahora abren el dashboard
//  - pet-wrapper: click funciona, sin círculo azul
//  - sprite del popup sincronizado con chrome.storage petState
//  - theme picker: 10 temas, guarda en storage y aplica al body
//  - escHtml corregido (entidades HTML reales)
// ════════════════════════════════════════════════

'use strict';

const $ = id => document.getElementById(id);
const setDisplay = (id, value) => { const el = $(id); if (el) el.style.display = value; };
const STATE_EMOJI = { happy:'😺', neutral:'😐', sick:'😷', wait:'😴' };

const TOOL_URLS = {
  'tool-virustotal':   'https://www.virustotal.com/gui/home/url',
  'tool-google-safe':  'https://transparencyreport.google.com/safe-browsing/search',
  'tool-cover-tracks': 'https://coveryourtracks.eff.org/',
};

const SHOP_ICONS = {
  cloth_bow_neck:'🎀', cloth_shoes_beige:'👟', cloth_bow_tail:'🎗️',
  cloth_hat_cap:'🧢', cloth_scarf_pink:'🧣', cloth_glasses_heart:'🩷',
  title_guardian:'🛡️', title_hacker:'💻', title_cyber:'🐱', title_shadow:'🌑',
  extra_time_30:'⏰', extra_time_60:'⏱️',
};

const VAULT_ICONS = {
  google:'🔍', facebook:'📘', twitter:'🐦', instagram:'📸',
  youtube:'▶️', github:'🐙', amazon:'📦', netflix:'🎬',
  spotify:'🎵', discord:'💬', twitch:'🟣', paypal:'💳',
};

// ── ESTADO ────────────────────────────────────────────────────────────────

let _petVisible  = true;
let _shopTab     = 'cloth';
let _shopCatalog = null;
let _toastTimer  = null;

// ── INIT ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const data = await chrome.storage.local.get([
    'setupComplete','petVisible','petHealth','petState','petName','userName',
    'userPoints','userCoins','userTitle','userPronoun',
    'dailyStats','streakStats','activities','lastActivity',
    'familyModeEnabled','familySettings','timeLimitReached',
    'shimeijiEnabled','passwordCheckEnabled','keywordCensorEnabled',
    'phishingDetectEnabled','notificationsEnabled',
    'vaultLocked','vaultPin','themeColor','shopInventory',
    'equippedCloth','equippedOutfit',
  ]);

  // Aplicar tema guardado
  applyTheme(data.themeColor ?? 'blue');

  if (!data.setupComplete) {
    showScreen('setup');
    initSetupFlow();
    return;
  }

  _petVisible = data.petVisible !== false;
  await renderMain(data);
  registerListeners(data);
});

// ── TEMA ──────────────────────────────────────────────────────────────────

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  // Sincronizar estado visual del picker
  document.querySelectorAll('.theme-dot').forEach(btn => {
    const active = btn.dataset.theme === theme;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

// ── PANTALLAS ─────────────────────────────────────────────────────────────

function showScreen(name) {
  const setupScreen = $('setup-screen');
  const vaultScreen = $('vault-lock-screen');
  const mainScreen  = $('main-screen');

  if (setupScreen) setupScreen.style.display      = name === 'setup' ? 'block' : 'none';
  if (vaultScreen) vaultScreen.style.display      = name === 'vault' ? 'flex'  : 'none';
  if (mainScreen)  mainScreen.style.display       = name === 'main'  ? 'block' : 'none';

  if (!setupScreen || !vaultScreen || !mainScreen) {
    console.warn('showScreen: missing popup section(s)', {
      setup: !!setupScreen,
      vault: !!vaultScreen,
      main: !!mainScreen,
    });
  }
}

// ── SETUP FLOW ────────────────────────────────────────────────────────────

function initSetupFlow() {
  let petName  = '';
  let userName = '';
  let pronoun  = 'el';

  function goStep(n) {
    document.querySelectorAll('.setup-step').forEach(s => s.classList.remove('active'));
    $(`setup-step-${n}`)?.classList.add('active');
  }

  document.querySelectorAll('.pronoun-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pronoun-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      pronoun = btn.dataset.value;
    });
  });

  const goStep1 = () => {
    petName = $('input-pet-name')?.value.trim() ?? '';
    if (!petName) { showToast('¡Ponle un nombre! 🐱'); return; }
    const bubble = $('s2-bubble');
    if (bubble) bubble.textContent = `¡Soy ${petName}! Encantado 🐾 ¿Y tú, cómo te llamas?`;
    goStep(2);
    $('input-user-name')?.focus();
  };
  $('step1-next')?.addEventListener('click', goStep1);
  $('input-pet-name')?.addEventListener('keydown', e => { if (e.key === 'Enter') goStep1(); });

  const goStep2 = () => {
    userName = $('input-user-name')?.value.trim() ?? '';
    if (!userName) { showToast('¡Escribe tu nombre! 😊'); return; }
    const bubble = $('s3-bubble');
    if (bubble) bubble.textContent = `¡Hola, ${userName}! ¿Cómo quieres que te hable?`;
    goStep(3);
  };
  $('step2-next')?.addEventListener('click', goStep2);
  $('input-user-name')?.addEventListener('keydown', e => { if (e.key === 'Enter') goStep2(); });

  $('step3-next')?.addEventListener('click', () => { goStep(4); initSetupNumpad(); });
  $('skip-pin')?.addEventListener('click', () => finishSetup(null));
  $('step5-finish')?.addEventListener('click', () => { showScreen('main'); location.reload(); });

  function initSetupNumpad() {
    let pin = '';
    const dotsEls = document.querySelectorAll('#setup-pin-dots span');
    const updateDots = () => dotsEls.forEach((d,i) => d.classList.toggle('filled', i < pin.length));

    const numpad = $('setup-numpad');
    if (!numpad) return;
    const fresh = numpad.cloneNode(true);
    numpad.parentNode.replaceChild(fresh, numpad);

    fresh.addEventListener('click', async e => {
      const btn = e.target.closest('.num-btn');
      if (!btn) return;
      const num = btn.dataset.num;
      if (num === 'clear')        { pin = pin.slice(0,-1); }
      else if (num === 'ok')      { if (pin.length < 4) { showToast('Ingresa los 4 dígitos'); return; } await finishSetup(pin); return; }
      else if (pin.length < 4)    { pin += num; }
      updateDots();
    });
  }

  async function finishSetup(pin) {
    const article = pronoun === 'ella' ? 'a' : pronoun === 'elle' ? '' : 'o';
    const titleEl  = $('s5-title');
    const bubbleEl = $('s5-bubble');
    if (titleEl)  titleEl.textContent  = `¡Bienvenid${article}, ${userName}!`;
    if (bubbleEl) bubbleEl.textContent = `¡Soy ${petName} y seré tu guardián digital! Te regalo 50 monedas 🎁`;

    const saves = {
      petName, userName, userPronoun: pronoun, setupComplete: true,
      petHealth: 100, petState: 'happy', userPoints: 0, userCoins: 1000, rewardMult: 1,
      userTitle: 'Novato Digital',
      activities: [{ text: `🎉 ¡${petName} ha nacido! Bienvenid${article}, ${userName}.`, date: new Date().toLocaleString() }],
      vaultLocked: pin ? false : true,
    };
    if (pin) {
      // Generar salt único y guardar hash compatible con background.js
      const salt = await generateSalt();
      const pinHash = await hashPinSecure(pin, salt);
      saves.vaultPin = pinHash;
      saves.vaultSalt = salt;
    }
    await chrome.storage.local.set(saves);
    document.querySelectorAll('.setup-step').forEach(s => s.classList.remove('active'));
    $('setup-step-5')?.classList.add('active');
  }

  // Generador de salt único
  async function generateSalt() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Hash de PIN compatible con background.js
  async function hashPinSecure(pin, salt) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(pin + salt);
    const buf = await crypto.subtle.digest('SHA-256', keyData);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

// ── MAIN SCREEN ───────────────────────────────────────────────────────────

async function renderMain(data) {
  showScreen('main');

  const pronoun  = data.userPronoun ?? 'el';
  const greeting = pronoun === 'ella' ? 'Bienvenida' : 'Bienvenido';
  setText('greeting-text',    `¡${greeting}, ${data.userName ?? 'Navegante'}!`);
  setText('user-title-badge', data.userTitle ?? 'Novato Digital');

  const famBadge = $('family-badge');
  if (famBadge) {
    famBadge.textContent = data.familyModeEnabled ? 'ON' : 'OFF';
    famBadge.className   = data.familyModeEnabled ? 'badge-on' : 'badge-off';
  }

  const hp = data.petHealth ?? 100;
  const petState = hp >= 70 ? 'happy' : hp >= 50 ? 'neutral' : 'sick';
  if (data.petState !== petState) {
    chrome.storage.local.set({ petState }).catch(() => {});
    chrome.tabs.query({}).then(tabs => {
      tabs.forEach(tab =>
        chrome.tabs.sendMessage(tab.id, { type: 'FORCE_UPDATE_SPRITE', state: petState }).catch(() => {})
      );
    }).catch(() => {});
  }
  
  setText('pet-name-display', data.petName ?? 'CyberPet');
  setText('pet-state-emoji',  STATE_EMOJI[petState] ?? '😐');

const petImg = $('pet-base');
if (petImg) {
  petImg.src = chrome.runtime.getURL(`assets/sprites/${petState}.png`);
}

// Multi-layer outfit overlay — {} vacío es truthy, usar helper
function _resolveOutfit(outfitObj, legacyCloth) {
  if (outfitObj && typeof outfitObj === 'object' && Object.values(outfitObj).some(Boolean)) return outfitObj;
  return legacyCloth || null;
}
updatePopupClothLayers(_resolveOutfit(data.equippedOutfit, data.equippedCloth));

const bar = $('health-bar');
if (bar) {
  bar.style.width = hp + '%';
  bar.classList.remove('medium','low');
  if      (hp < 30) bar.classList.add('low');
  else if (hp < 60) bar.classList.add('medium');
}
setText('health-pct', hp + '%');

  setText('points-val', Math.floor(data.userPoints ?? 0));
  setText('coins-val',  data.userCoins ?? 0);
  setText('streak-val', data.streakStats?.currentStreak ?? 0);

  try {
    const { minutes = 0 } = await chrome.runtime.sendMessage({ type: 'GET_SCREEN_TIME' });
    setText('time-val', minutes < 60 ? `${Math.round(minutes)}m` : `${Math.floor(minutes/60)}h ${Math.round(minutes%60)}m`);
  } catch (error) {
    console.warn('Could not get screen time:', error);
    setText('time-val','0m');
  }

  setText('last-activity-text', data.activities?.[0]?.text ?? data.lastActivity ?? '¡Todo tranquilo!');

  const featureMap = {
    'set-pwdcheck': data.passwordCheckEnabled   !== false,
    'set-keywords': data.keywordCensorEnabled   !== false,
    'set-phishing': data.phishingDetectEnabled  !== false,
    'set-notif':    data.notificationsEnabled   !== false,
    'set-movement': data.petMovementEnabled      !== false,
  };
  for (const [id, val] of Object.entries(featureMap)) {
    const el = $(id);
    if (el) el.checked = val;
  }

  setDisplay('family-setup-view', data.familyModeEnabled ? 'none'  : 'block');
  setDisplay('family-manage-view', data.familyModeEnabled ? 'block' : 'none');
  if (data.familyModeEnabled) {
    const fs = data.familySettings ?? {};
    setText('fam-usage', Math.round(data.dailyStats?.screenMinutes ?? 0));
    setText('fam-max',   fs.maxDailyMinutes ?? 120);
  }

  setText('shop-coins',  data.userCoins  ?? 0);
  setText('shop-points', Math.floor(data.userPoints ?? 0));
  updateToggleBtn();
}

function setText(id, val) {
  const el = $(id);
  if (el) el.textContent = String(val ?? '');
}

function updateToggleBtn() {
  setText('toggle-eye',   _petVisible ? '👁️' : '🙈');
  setText('toggle-label', _petVisible ? 'Ocultar Gato' : 'Mostrar Gato');
}

// ── EVENT LISTENERS ───────────────────────────────────────────────────────

function registerListeners(data) {

  // FIX: abrir dashboard — ambos botones funcionan
  const openDash = () => chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' });
  $('btn-dashboard')?.addEventListener('click',     openDash);
  $('btn-open-dashboard')?.addEventListener('click', openDash);

  // Toggle visibilidad del gato
  $('btn-toggle-pet')?.addEventListener('click', async () => {
    _petVisible = !_petVisible;
    await chrome.storage.local.set({ petVisible: _petVisible, shimeijiEnabled: _petVisible });
    const tabs = await chrome.tabs.query({});
    tabs.forEach(tab =>
      chrome.tabs.sendMessage(tab.id, { type: _petVisible ? 'SHOW_PET' : 'HIDE_PET' }).catch(() => {})
    );
    updateToggleBtn();
    showToast(_petVisible ? 'Gato visible 👁️' : 'Gato oculto 🙈');
  });

  // FIX: click en la mascota — sin outline azul (resuelto en CSS),
  // petWrapper NO tiene tabindex para evitar el anillo de focus del OS
  const petWrapper = $('pet-wrapper');
  if (petWrapper) {
    petWrapper.addEventListener('click', () => {
      petWrapper.style.animation = '';
      requestAnimationFrame(() => { petWrapper.style.animation = 'bounce .3s'; });
      chrome.runtime.sendMessage({ type: 'GOOD_PRACTICE', action: 'interactuar con el gato' }).catch(() => {});
      showToast('¡Miau! 😺');
    });
  }

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      btn.setAttribute('aria-selected','true');
      $(`tab-${btn.dataset.tab}`)?.classList.add('active');

      if (btn.dataset.tab === 'vault') renderVaultTab();
      if (btn.dataset.tab === 'shop')  renderShopTab(data);
      if (btn.dataset.tab === 'chat')  initChatTab();
    });
  });

  // Herramientas externas
  for (const [id, url] of Object.entries(TOOL_URLS)) {
    $(id)?.addEventListener('click', () => chrome.tabs.create({ url }));
  }
  const toggleMiniPanel = (panelId) => {
    ['pwdgen-panel', 'hibp-mini-panel', 'pwned-mini-panel'].forEach(id => {
      const el = $(id);
      if (!el) return;
      el.style.display = id === panelId && el.style.display === 'none' ? 'block' : 'none';
    });
  };
  $('tool-hibp')?.addEventListener('click', () => toggleMiniPanel('hibp-mini-panel'));
  $('tool-pwned-pwd')?.addEventListener('click', () => toggleMiniPanel('pwned-mini-panel'));
  $('close-hibp-mini')?.addEventListener('click', () => { const p = $('hibp-mini-panel'); if (p) p.style.display = 'none'; });
  $('close-pwned-mini')?.addEventListener('click', () => { const p = $('pwned-mini-panel'); if (p) p.style.display = 'none'; });
  $('hibp-mini-check')?.addEventListener('click', () => {
    const email = $('hibp-mini-email')?.value.trim() ?? '';
    const out = $('hibp-mini-result');
    if (!out) return;
    if (!email.includes('@') || !email.includes('.')) {
      out.textContent = '❌ Email inválido.';
      return;
    }
    out.innerHTML = `<button class="btn-secondary" id="hibp-mini-open" type="button" style="width:100%;margin-top:4px;">Abrir verificación oficial →</button>`;
    $('hibp-mini-open')?.addEventListener('click', () => {
      chrome.tabs.create({ url: `https://haveibeenpwned.com/account/${encodeURIComponent(email)}` });
    });
  });
  $('pwned-mini-check')?.addEventListener('click', async () => {
    const pwd = $('pwned-mini-password')?.value ?? '';
    const out = $('pwned-mini-result');
    if (!out || !pwd) return;
    out.textContent = '🔍 Verificando...';
    try {
      const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(pwd));
      const sha1 = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      const prefix = sha1.slice(0, 5);
      const suffix = sha1.slice(5);
      const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, { headers: { 'Add-Padding': 'true' } });
      if (!res.ok) throw new Error('Error al consultar API');
      const text = await res.text();
      const match = text.split(/\r?\n/).find(line => line.toUpperCase().startsWith(suffix));
      if (match) {
        const count = parseInt(match.split(':')[1] ?? '0', 10).toLocaleString();
        out.textContent = `⚠️ Filtrada ${count} veces.`;
      } else {
        out.textContent = '✅ No aparece en filtraciones conocidas.';
      }
    } catch {
      out.textContent = '❌ No se pudo verificar ahora.';
    }
  });

  // Generador
  $('tool-password-gen')?.addEventListener('click', () => {
    toggleMiniPanel('pwdgen-panel');
  });
  $('close-gen')?.addEventListener('click', () => { const p=$('pwdgen-panel'); if(p) p.style.display='none'; });
  $('gen-len')?.addEventListener('input', e => setText('gen-len-val', e.target.value));
  $('gen-now')?.addEventListener('click', () => {
    const len = parseInt($('gen-len')?.value ?? '16', 10);
    const pwd = genPassword(len);
    setText('gen-pwd-text', pwd);
    const res=$('gen-result'); if(res) res.style.display='flex';
  });
  $('gen-copy')?.addEventListener('click', () => {
    const v = $('gen-pwd-text')?.textContent ?? '';
    if (v) navigator.clipboard.writeText(v).then(() => showToast('✅ Copiada'));
  });

  // Toggles settings
  const settingsMap = {
    'set-pwdcheck': 'passwordCheckEnabled',
    'set-keywords': 'keywordCensorEnabled',
    'set-phishing': 'phishingDetectEnabled',
    'set-notif':    'notificationsEnabled',
    'set-movement': 'petMovementEnabled',
  };
  for (const [id, key] of Object.entries(settingsMap)) {
    $(id)?.addEventListener('change', async e => {
      await chrome.storage.local.set({ [key]: e.target.checked });
      const tabs = await chrome.tabs.query({});
      tabs.forEach(tab =>
        chrome.tabs.sendMessage(tab.id, { type:'CONFIG_UPDATED', key, value:e.target.checked }).catch(()=>{})
      );
    });
  }

  // FIX: Theme picker — 10 temas
  document.querySelectorAll('.theme-dot').forEach(btn => {
    btn.addEventListener('click', async () => {
      const theme = btn.dataset.theme;
      applyTheme(theme);
      await chrome.storage.local.set({ themeColor: theme });
      // Sincronizar con el dashboard también
      await chrome.runtime.sendMessage({ type: 'SAVE_THEME', themeColor: theme }).catch(() => {});
      showToast(`🎨 Tema ${btn.title} aplicado`);
    });
  });

  // Family modal
  const openFamily = async () => {
    setDisplay('family-modal', 'flex');
    const status = await chrome.runtime.sendMessage({ type: 'FAMILY_STATUS' }).catch(() => null);
    const setupView  = $('family-setup-view');
    const manageView = $('family-manage-view');

    // Comprobar si ya hay recovery guardado para no pedirlo de nuevo
    const { familyRecoveryAnswerHash } = await chrome.storage.local.get('familyRecoveryAnswerHash');
    const hasRecovery = !!familyRecoveryAnswerHash;

    // Ocultar/mostrar los campos de recovery según si ya existen
    const recoverySection = $('family-recovery-section');
    const recoveryDoneMsg = $('family-recovery-done');
    if (recoverySection) recoverySection.style.display = hasRecovery ? 'none'  : 'block';
    if (recoveryDoneMsg) recoveryDoneMsg.style.display = hasRecovery ? 'block' : 'none';

    if (status?.enabled) {
      // Family mode activo → mostrar gestión, no setup
      if (setupView)  setupView.style.display  = 'none';
      if (manageView) manageView.style.display = 'block';
      const fam = await chrome.storage.local.get(['dailyStats','familySettings']);
      const setText_local = (id, val) => {
        const el = $(id);
        if (el) el.textContent = String(val ?? '');
      };
      setText_local('fam-usage', Math.round(fam.dailyStats?.screenMinutes ?? 0));
      setText_local('fam-max',   (fam.familySettings?.maxDailyMinutes ?? 120));
    } else {
      // No activo → mostrar setup
      if (setupView)  setupView.style.display  = 'block';
      if (manageView) manageView.style.display = 'none';
    }

    // Rellenar pregunta de seguridad en la vista de gestión
    const q = $('family-recovery-question-text');
    if (q) q.textContent = status?.recoveryQuestion
      ? `Pregunta: ${status.recoveryQuestion}`
      : 'No hay pregunta de seguridad configurada todavía.';

    // Mostrar "¿Olvidaste el PIN?" en la vista de activación solo si ya hay recovery guardado
    // (útil cuando el modo está desactivado pero hubo un PIN anterior)
    const forgotSection = $('family-forgot-pin-section');
    const forgotQ = $('family-forgot-question-text');
    if (forgotSection) forgotSection.style.display = hasRecovery ? 'block' : 'none';
    if (forgotQ && status?.recoveryQuestion) forgotQ.textContent = `Pregunta: ${status.recoveryQuestion}`;
  };
  $('btn-family-mode')?.addEventListener('click', openFamily);
  $('btn-family-quick')?.addEventListener('click', openFamily);
  $('close-family-modal')?.addEventListener('click', closeModal);
  $('family-modal')?.addEventListener('click', e => { if (e.target===$('family-modal')) closeModal(); });
  // Link "Ver guía completa" → abre dashboard en sección family
  $('family-modal')?.addEventListener('click', e => {
    if (e.target?.id === 'fam-open-guide-link') {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html#family') });
      closeModal();
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('family-modal')?.style.display === 'flex') closeModal();
  });

  function closeModal() {
    setDisplay('family-modal', 'none');
    clearFamilyErrors();
  }
  function clearFamilyErrors() {
    [$('family-setup-error'),$('family-manage-error')].forEach(el => {
      if (el) { el.textContent=''; el.style.display='none'; }
    });
  }
  function showFamilyError(elId, msg) {
    const el=$(elId); if(el){el.textContent=msg;el.style.display='block';}
  }

  $('btn-activate-family')?.addEventListener('click', async () => {
    clearFamilyErrors();
    const p1 = $('family-pin-input')?.value  ?? '';
    const p2 = $('family-pin-confirm')?.value ?? '';
    const mt = parseInt($('family-max-time')?.value ?? '120', 10);
    const recoveryQuestion = $('family-recovery-question')?.value?.trim() ?? '';
    const recoveryAnswer   = $('family-recovery-answer')?.value?.trim()   ?? '';
    if (!/^\d{4}$/.test(p1)) { showFamilyError('family-setup-error','El PIN debe ser 4 dígitos.'); return; }
    if (p1 !== p2)            { showFamilyError('family-setup-error','Los PINs no coinciden.');    return; }
    if (isNaN(mt) || mt < 0) { showFamilyError('family-setup-error','Tiempo inválido.');           return; }

    // Solo validar recovery si no hay uno guardado ya (Patch 3 lo comprueba también en background)
    const { familyRecoveryAnswerHash } = await chrome.storage.local.get('familyRecoveryAnswerHash');
    const hasRecovery = !!familyRecoveryAnswerHash;
    if (!hasRecovery && (!recoveryQuestion || recoveryAnswer.length < 3)) {
      showFamilyError('family-setup-error','Agrega una pregunta y respuesta de seguridad.');
      return;
    }

    const setup = await chrome.runtime.sendMessage({
      type:'FAMILY_SETUP',
      pin: p1,
      recoveryQuestion: recoveryQuestion || undefined,
      recoveryAnswer:   recoveryAnswer   || undefined,
      settings:{ maxDailyMinutes:mt }
    });
    if (!setup?.ok) {
      showFamilyError('family-setup-error', setup?.error || 'No se pudo activar Family Mode.');
      return;
    }
    closeModal();
    const badge=$('family-badge');
    if(badge){badge.textContent='ON';badge.className='badge-on';}
    setDisplay('family-setup-view', 'none');
    setDisplay('family-manage-view', 'block');
    showToast('✅ Family Mode activado');
  });

  $('btn-disable-family')?.addEventListener('click', async () => {
    clearFamilyErrors();
    const pin = $('family-admin-pin')?.value ?? '';
    if (!pin) { showFamilyError('family-manage-error','Ingresa el PIN.'); return; }
    const res = await chrome.runtime.sendMessage({ type:'FAMILY_DISABLE', pin });
    if (res?.ok) {
      closeModal();
      const badge=$('family-badge');
      if(badge){badge.textContent='OFF';badge.className='badge-off';}
      setDisplay('family-setup-view', 'block');
      setDisplay('family-manage-view', 'none');
      showToast('Family Mode desactivado');
    } else {
      showFamilyError('family-manage-error','❌ PIN incorrecto.');
    }
  });

  // Recuperar PIN desde la vista de GESTIÓN (family-manage-view)
  $('btn-reset-family-pin')?.addEventListener('click', async () => {
    clearFamilyErrors();
    const answer = $('family-recovery-answer-check')?.value.trim() ?? '';
    const p1 = $('family-new-pin')?.value ?? '';
    const p2 = $('family-new-pin-confirm')?.value ?? '';
    const errEl = $('family-manage-recovery-error');
    const showErr = msg => { if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; } };
    if (!answer) { showErr('Ingresa la respuesta de seguridad.'); return; }
    if (!/^\d{4}$/.test(p1)) { showErr('El nuevo PIN debe tener exactamente 4 dígitos.'); return; }
    if (p1 !== p2) { showErr('Los PINs no coinciden.'); return; }
    const res = await chrome.runtime.sendMessage({ type:'FAMILY_RESET_PIN', answer, newPin:p1 });
    if (res?.ok) {
      ['family-admin-pin','family-recovery-answer-check','family-new-pin','family-new-pin-confirm']
        .forEach(id => { const el=$(id); if(el) el.value=''; });
      if (errEl) errEl.style.display = 'none';
      showToast('✅ PIN actualizado correctamente');
    } else {
      showErr(res?.error || 'Respuesta incorrecta.');
    }
  });

  // Recuperar PIN desde la vista de ACTIVACIÓN (family-setup-view) — cuando el modo está desactivado
  $('btn-family-forgot-recover')?.addEventListener('click', async () => {
    const answer = $('family-forgot-answer')?.value.trim() ?? '';
    const p1     = $('family-forgot-newpin')?.value ?? '';
    const p2     = $('family-forgot-newpin-confirm')?.value ?? '';
    const errEl  = $('family-forgot-error');
    const showErr = msg => { if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; } };
    const clearErr = () => { if (errEl) errEl.style.display = 'none'; };
    clearErr();
    if (!answer) { showErr('Ingresa tu respuesta de seguridad.'); return; }
    if (!/^\d{4}$/.test(p1)) { showErr('El nuevo PIN debe tener exactamente 4 dígitos.'); return; }
    if (p1 !== p2) { showErr('Los PINs no coinciden.'); return; }
    const res = await chrome.runtime.sendMessage({ type:'FAMILY_RESET_PIN', answer, newPin:p1 });
    if (res?.ok) {
      // Limpiar campos y cerrar el details
      ['family-forgot-answer','family-forgot-newpin','family-forgot-newpin-confirm']
        .forEach(id => { const el=$(id); if(el) el.value=''; });
      $('family-forgot-pin-section')?.querySelector('details')?.removeAttribute('open');
      showToast('✅ PIN recuperado. Ahora puedes reactivar Family Mode.');
    } else {
      showErr(res?.error || 'Respuesta incorrecta. Inténtalo de nuevo.');
    }
  });

  // Vault
  initVaultListeners();

  // FIX SYNC: reaccionar en tiempo real cuando el dashboard (u otra pestaña) activa/desactiva Family Mode
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.familyModeEnabled !== undefined) {
      const enabled = !!changes.familyModeEnabled.newValue;
      const badge = $('family-badge');
      if (badge) { badge.textContent = enabled ? 'ON' : 'OFF'; badge.className = enabled ? 'badge-on' : 'badge-off'; }
      // Si el modal está abierto, actualizar vistas
      if ($('family-modal')?.style.display === 'flex') {
        setDisplay('family-setup-view',  enabled ? 'none'  : 'block');
        setDisplay('family-manage-view', enabled ? 'block' : 'none');
      }
    }
    if (changes.userCoins !== undefined) {
      // Actualizar monedas en popup si está visible
      const el = $('coins-val');
      if (el) el.textContent = String(changes.userCoins.newValue ?? 0);
    }
    if (changes.userPoints !== undefined) {
      const el = $('points-val');
      if (el) el.textContent = String(Math.floor(changes.userPoints.newValue ?? 0));
    }
  });
}

// ── VAULT ─────────────────────────────────────────────────────────────────

function initVaultListeners() {
  $('btn-open-vault')?.addEventListener('click', () => { showScreen('vault'); initVaultNumpad(); });
  $('vault-back-btn')?.addEventListener('click', () => showScreen('main'));

  $('btn-lock-vault')?.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type:'VAULT_LOCK' });
    setDisplay('vault-unlocked-view', 'none');
    setDisplay('vault-locked-view', 'block');
    showToast('🔒 Bóveda bloqueada');
  });

  $('vault-search')?.addEventListener('input', e => renderVaultEntries(e.target.value.trim()));

  $('btn-add-vault')?.addEventListener('click', () => {
    const f=$('vault-add-form');
    if(!f) return;
    const isOpen = f.style.display !== 'none';
    f.style.display = isOpen ? 'none' : 'block';
    $('btn-add-vault').textContent = isOpen ? '➕ Añadir Contraseña' : '✕ Cancelar';
    if(!isOpen) $('v-site')?.focus();
  });

  $('v-cancel')?.addEventListener('click', () => {
    setDisplay('vault-add-form', 'none');
    $('btn-add-vault').textContent    = '➕ Añadir Contraseña';
    clearVaultForm();
  });

  $('v-toggle-pwd')?.addEventListener('click', () => { const i=$('v-pwd'); if(i) i.type=i.type==='password'?'text':'password'; });
  $('v-gen-pwd')?.addEventListener('click', () => {
    const pwd=genPassword(16);
    const inp=$('v-pwd');
    if(inp){inp.type='text';inp.value=pwd;inp.dispatchEvent(new Event('input'));}
  });
  $('v-pwd')?.addEventListener('input', e => updateStrengthBar(e.target.value));

  $('v-save')?.addEventListener('click', async () => {
    const site=$('v-site')?.value.trim()??'';
    const user=$('v-user')?.value.trim()??'';
    const pwd =$('v-pwd')?.value??'';
    if(!site||!user||!pwd){showToast('Completa todos los campos');return;}
    await chrome.runtime.sendMessage({ type:'VAULT_SAVE', entry:{site,username:user,password:pwd} });
    showToast('✅ Guardado en la bóveda');
    setDisplay('vault-add-form', 'none');
    $('btn-add-vault').textContent='➕ Añadir Contraseña';
    clearVaultForm();
    renderVaultTab();
  });
}

function initVaultNumpad() {
  let pin = '';
  const dotsEls = document.querySelectorAll('#vault-pin-dots span');
  const updateDots = () => dotsEls.forEach((d,i)=>d.classList.toggle('filled',i<pin.length));

  const errEl   = $('vault-pin-error');
  const clearErr= () => { if(errEl){errEl.textContent='';errEl.style.display='none';} };
  const showErr = msg => { if(errEl){errEl.textContent=msg;errEl.style.display='block';} };

  const old   = $('vault-numpad');
  const fresh = old.cloneNode(true);
  old.parentNode.replaceChild(fresh, old);
  pin = '';
  updateDots();
  clearErr();

  fresh.addEventListener('click', async e => {
    const btn = e.target.closest('.num-btn');
    if (!btn) return;
    const num = btn.dataset.num;
    if (num === 'clear') { pin=pin.slice(0,-1); clearErr(); }
    else if (num === 'ok') {
      if (pin.length < 4) { showErr('Ingresa los 4 dígitos.'); return; }
      const { unlocked } = await chrome.runtime.sendMessage({ type:'VAULT_UNLOCK', pin });
      if (unlocked) {
        clearErr();
        showScreen('main');
        document.querySelectorAll('.tab-btn').forEach(t=>{t.classList.remove('active');t.setAttribute('aria-selected','false');});
        document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
        document.querySelector('[data-tab="vault"]')?.classList.add('active');
        document.querySelector('[data-tab="vault"]')?.setAttribute('aria-selected','true');
        $('tab-vault')?.classList.add('active');
        renderVaultUnlocked();
      } else {
        pin=''; updateDots(); showErr('❌ PIN incorrecto.');
        dotsEls.forEach(d=>{d.style.borderColor='var(--danger)';setTimeout(()=>{d.style.borderColor='';},800);});
      }
      return;
    } else if (pin.length < 4) { pin+=num; clearErr(); }
    updateDots();
  });
}

async function renderVaultTab() {
  const { vaultLocked } = await chrome.storage.local.get('vaultLocked');
  if (vaultLocked === false) renderVaultUnlocked();
  else { setDisplay('vault-locked-view','block'); setDisplay('vault-unlocked-view','none'); }
}

function renderVaultUnlocked() {
  setDisplay('vault-locked-view','none');
  setDisplay('vault-unlocked-view','block');
  renderVaultEntries('');
}

async function renderVaultEntries(filter='') {
  const { vault=[] } = await chrome.runtime.sendMessage({ type:'VAULT_GET' });
  const container = $('vault-entries');
  if (!container) return;

  const lower = filter.toLowerCase();
  const list  = filter
    ? vault.filter(e=>e.site.toLowerCase().includes(lower)||e.username.toLowerCase().includes(lower))
    : vault;

  if (!list.length) {
    container.innerHTML=`<p style="text-align:center;color:var(--text-muted);padding:14px;font-size:.84rem;">
      ${filter?'Sin resultados':'Sin contraseñas guardadas'}
    </p>`;
    return;
  }

  container.innerHTML = list.map(e=>`
    <div class="vault-entry" role="listitem">
      <div class="vault-entry-icon">${getFavicon(e.site)}</div>
      <div class="vault-entry-info">
        <div class="vault-entry-site">${escHtml(e.site)}</div>
        <div class="vault-entry-user" id="vup-${e.id}">${escHtml(e.username)}</div>
      </div>
      <div class="vault-entry-actions">
        <button class="btn-entry-act" data-action="copy" data-pwd="${escHtml(e.password)}" title="Copiar contraseña" type="button">📋</button>
        <button class="btn-entry-act" data-action="del"  data-id="${e.id}" title="Eliminar" type="button">🗑️</button>
      </div>
    </div>`).join('');

  container.onclick = async e => {
    const btn=e.target.closest('.btn-entry-act');
    if (!btn) return;
    if (btn.dataset.action==='copy') {
      let pwd=btn.dataset.pwd??'';
      try{pwd=decodeURIComponent(pwd);}catch{}
      await navigator.clipboard.writeText(pwd);
      showToast('✅ Contraseña copiada');
    } else if (btn.dataset.action==='del') {
      await chrome.runtime.sendMessage({ type:'VAULT_DELETE', id:btn.dataset.id });
      showToast('🗑️ Eliminado');
      renderVaultEntries($('vault-search')?.value??'');
    }
  };
}

// ── SHOP ──────────────────────────────────────────────────────────────────

async function renderShopTab(data) {
  setText('shop-coins',  data.userCoins  ?? 0);
  setText('shop-points', Math.floor(data.userPoints ?? 0));

  document.querySelectorAll('.shop-tab-pop').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.shop-tab-pop').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      _shopTab = tab.dataset.stab;
      drawShopGrid(data);
    };
  });
  await drawShopGrid(data);
  renderInventoryMini(data);
}

async function drawShopGrid(data) {
  const grid=$('shop-grid-pop');
  if (!grid) return;

  if (!_shopCatalog) {
    const res    = await chrome.runtime.sendMessage({ type:'GET_SHOP_CATALOG' });
    _shopCatalog = res?.catalog ?? [];
  }

  // FIX M4: ocultar la tab de Tiempo Extra si Family Mode no está activo
  // o si allowCoinPurchases está desactivado
  const familyActive     = !!(data.familyModeEnabled);
  const coinPurchasesOn  = data.familySettings?.allowCoinPurchases !== false;
  const showExtraTime    = familyActive && coinPurchasesOn;
  const extraTimeTabEl   = document.getElementById('shop-tab-extra-time');
  if (extraTimeTabEl) {
    extraTimeTabEl.style.display = showExtraTime ? '' : 'none';
    // Si la tab activa es extra_time y ahora está oculta, volver a cloth
    if (_shopTab === 'extra_time' && !showExtraTime) {
      _shopTab = 'cloth';
      document.querySelectorAll('.shop-tab-pop').forEach(t => {
        t.classList.toggle('active', t.dataset.stab === 'cloth');
      });
    }
  }

  // Filtrar catálogo por tab activa; excluir extra_time si no aplica
  const filtered = _shopCatalog.filter(item => {
    if (item.type === 'extra_time' && !showExtraTime) return false;
    return item.type === _shopTab;
  });
  const inventory = data.shopInventory ?? [];

  if (!filtered.length) {
    grid.innerHTML='<p style="color:var(--text-muted);padding:10px;font-size:.84rem;">Sin items aquí</p>';
    return;
  }

  grid.innerHTML = filtered.map(item=>{
    const owned      = inventory.includes(item.id);
    const canAfford  = item.currency==='coins'?(data.userCoins??0)>=item.price:(data.userPoints??0)>=item.price;
    const icon       = SHOP_ICONS[item.id]??'🎁';
    const comingSoon = !!item.comingSoon;
    return `
    <div class="shop-item-pop${owned?' owned':''}${!canAfford&&!owned&&!comingSoon?' cant-afford':''}${comingSoon?' coming-soon-pop':''}">
      <span class="shop-item-icon-pop">${icon}</span>
      <div class="shop-item-name-pop">${escHtml(item.name)}</div>
      ${comingSoon
        ? '<div style="font-size:.73rem;color:var(--text-muted);font-style:italic;">✨ Próximamente</div>'
        : `<div class="shop-item-price-pop ${item.currency==='coins'?'price-c':'price-p'}">
             ${item.currency==='coins'?'🪙':'🏆'} ${item.price}
           </div>
           ${owned
             ? '<div style="color:var(--accent2);font-weight:700;font-size:.79rem;">✓ Lo tienes</div>'
             : `<button class="btn-shop-buy-pop" data-id="${item.id}" ${!canAfford?'disabled':''} type="button">
                  ${canAfford?'Comprar':'Sin fondos'}
                </button>`}`}
    </div>`;
  }).join('');

  grid.onclick = async e => {
    const btn=e.target.closest('.btn-shop-buy-pop:not([disabled])');
    if (!btn) return;
    const res=await chrome.runtime.sendMessage({type:'SHOP_BUY',item:btn.dataset.id});
    if (res?.ok) {
      showToast('✅ ¡Comprado!');
      const fresh=await chrome.storage.local.get(['userCoins','userPoints','shopInventory','equippedCloth','equippedItem','equippedOutfit']);
      data.userCoins=fresh.userCoins??0;
      data.userPoints=fresh.userPoints??0;
      data.shopInventory=fresh.shopInventory??[];
      data.equippedCloth=fresh.equippedCloth??null;
      data.equippedOutfit=fresh.equippedOutfit??{};
      data.equippedItem=fresh.equippedItem??null;
      setText('shop-coins',data.userCoins);
      setText('shop-points',Math.floor(data.userPoints));
      drawShopGrid(data);
      renderInventoryMini(data);
    } else { showToast('❌ '+(res?.error??'Sin fondos')); }
  };
}

function renderInventoryMini(data) {
  let box = $('shop-inventory-pop');
  if (!box) {
    box = document.createElement('div');
    box.id = 'shop-inventory-pop';
    box.className = 'gen-panel';
    const host = $('tab-shop');
    if (!host) return;
    host.appendChild(box);
  }
  const inv = data.shopInventory ?? [];
  const clothItems = inv.filter(id => id.startsWith('cloth_'));
  if (!clothItems.length) {
    box.innerHTML = '<div class="gen-header"><span>🎒 Inventario</span></div><div style="font-size:.78rem;color:var(--text-muted);">Aún no tienes accesorios comprados.</div>';
    return;
  }
  box.innerHTML = `<div class="gen-header"><span>🎒 Inventario</span></div>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;">
      ${clothItems.map(id => {
        const icon = SHOP_ICONS[id] ?? '🎁';
        const outfit = data.equippedOutfit ?? {};
        const active = Object.values(outfit).includes(id);
        return `<button class="btn-secondary inv-equip-btn" data-id="${id}" style="width:100%;padding:7px;font-size:.75rem;${active ? 'border-color:var(--accent2);color:var(--accent2);' : ''}">
          ${icon} ${active ? '✓ Puesto' : 'Equipar'}
        </button>`;
      }).join('')}
    </div>`;
  box.querySelectorAll('.inv-equip-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ type: 'EQUIP_ITEM', itemType: 'cloth', itemId: btn.dataset.id });
      const fresh = await chrome.storage.local.get(['equippedOutfit','equippedCloth']);
      data.equippedOutfit = fresh.equippedOutfit ?? {};
      data.equippedCloth  = fresh.equippedCloth ?? null;
      updatePopupClothLayers(_resolveOutfit(data.equippedOutfit, data.equippedCloth));
      renderInventoryMini(data);
      showToast('✅ Accesorio equipado');
    });
  });
}

// ── UTILIDADES ────────────────────────────────────────────────────────────

function updatePopupClothLayers(outfitOrId) {
  const wrapper = $('pet-wrapper');
  if (!wrapper) return;
  wrapper.querySelectorAll('.pop-cloth-layer').forEach(l => l.remove());
  const legacy = $('pet-cloth-overlay');
  if (legacy) legacy.style.display = 'none';
  let items = [];
  if (!outfitOrId) items = [];
  else if (typeof outfitOrId === 'string') items = [outfitOrId];
  else if (typeof outfitOrId === 'object') items = Object.values(outfitOrId).filter(Boolean);
  items.forEach(id => {
    const img = document.createElement('img');
    img.className = 'pop-cloth-layer';
    img.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;pointer-events:none;';
    img.src = chrome.runtime.getURL(`assets/clothes/${id}.png`);
    img.onerror = () => img.remove();
    wrapper.appendChild(img);
  });
}

async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin+'cyberpet_salt_v4'));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function pwdScore(p) {
  if (!p) return 0;
  let s=0;
  if(p.length>=8)  s+=20;
  if(p.length>=12) s+=15;
  if(p.length>=16) s+=15;
  if(/[a-z]/.test(p)) s+=10;
  if(/[A-Z]/.test(p)) s+=10;
  if(/\d/.test(p))    s+=10;
  if(/[^A-Za-z0-9]/.test(p)) s+=15;
  if(/(.)\1{2,}/.test(p))               s-=10;
  if(/123|abc|password|qwerty/i.test(p)) s-=15;
  return Math.max(0,Math.min(100,s));
}

function genPassword(len=16) {
  const sets=['abcdefghijklmnopqrstuvwxyz','ABCDEFGHIJKLMNOPQRSTUVWXYZ','0123456789','!@#$%^&*()_+-=[]{}|;:,.<>?'];
  const all=sets.join('');
  let p=sets.map(s=>s[Math.floor(Math.random()*s.length)]).join('');
  for(let i=p.length;i<len;i++) p+=all[Math.floor(Math.random()*all.length)];
  return p.split('').sort(()=>Math.random()-.5).join('');
}

function updateStrengthBar(pwd) {
  const score=pwdScore(pwd);
  const bar=$('v-strength-bar');
  const label=$('v-strength-label');
  if(!bar) return;
  bar.style.width=score+'%';
  bar.style.background=score>=80?'#22c55e':score>=60?'#f59e0b':'#ef4444';
  if(label) label.textContent=pwd?(score>=80?'💪 Fuerte':score>=60?'😐 Media':'⚠️ Débil'):'';
}

function clearVaultForm() {
  ['v-site','v-user','v-pwd'].forEach(id=>{const el=$(id);if(el)el.value='';});
  const bar=$('v-strength-bar'),label=$('v-strength-label');
  if(bar){bar.style.width='0';bar.style.background='';}
  if(label) label.textContent='';
}

function getFavicon(site='') {
  const s=site.toLowerCase();
  for(const [k,v] of Object.entries(VAULT_ICONS)) if(s.includes(k)) return v;
  return '🌐';
}

// FIX: escHtml corregido — usaba literales en vez de entidades HTML
function escHtml(str) {
  return String(str??'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function showToast(msg, duration=2500) {
  const t=$('toast');
  if (!t) return;
  t.textContent=msg;
  t.classList.remove('show');
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    t.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer=setTimeout(()=>t.classList.remove('show'),duration);
  }));
}

// ── CHAT ──────────────────────────────────────────────────────────────────

const _chat = { currentNode:'root', petName:'CyberPet', userName:'', inited:false };

async function initChatTab() {
  if (_chat.inited) return;
  _chat.inited = true;
  const { petName, userName, setupTutorialComplete } = 
    await chrome.storage.local.get(['petName','userName','setupTutorialComplete']);
  _chat.petName  = petName  || 'CyberPet';
  _chat.userName = userName || '';
  setText('chat-pet-name', _chat.petName);
 
  // Primera vez → mostrar tutorial en vez del menú normal
  const startNode = setupTutorialComplete ? 'root' : 'tutorial';
  // NO marcar aquí — se marca cuando el usuario elige "Ya entendí, vamos al menú"
  // (al navegar a root desde un nodo tut_*), garantizando que realmente lo vio.
  showChatNode(startNode);
 
  $('chat-clear')?.addEventListener('click', clearChat);
  $('chat-send')?.addEventListener('click', sendChatMessage);
  $('chat-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });
}


function showChatNode(nodeId) {
  // Si el usuario viene de cualquier nodo del tutorial y navega a root,
  // es porque eligió "Ya entendí" → marcar el tutorial como completado.
  if (nodeId === 'root' && typeof _chat.currentNode === 'string' && _chat.currentNode.startsWith('tut')) {
    chrome.storage.local.set({ setupTutorialComplete: true }).catch(() => {});
  }
  _chat.currentNode = nodeId;
  const response = getDialogResponse(nodeId, _chat.userName, _chat.petName);
  appendChatMessage('bot', response.message);
  renderChatOptions(response.options);
}

function renderChatOptions(options) {
  const container=$('chat-options-container');
  if (!container) return;
  container.innerHTML='';
  options.forEach(opt => {
    const btn=document.createElement('button');
    btn.className='chat-option-btn';
    btn.textContent=opt.text;
    btn.addEventListener('click',()=>{
      appendChatMessage('user',opt.text);
      setTimeout(()=>showChatNode(opt.next),300);
    });
    container.appendChild(btn);
  });
}

function appendChatMessage(type, text) {
  const container=$('chat-messages');
  if (!container) return;
  const msgEl=document.createElement('div');
  msgEl.className=`chat-msg ${type}`;
  if (type==='bot') {
    const av=document.createElement('span');
    av.className='chat-msg-avatar'; av.textContent='🐱'; av.setAttribute('aria-hidden','true');
    msgEl.appendChild(av);
  }
  const bubble=document.createElement('div');
  bubble.className='chat-bubble';
  bubble.innerHTML=text.replace(/\n/g,'<br>');
  msgEl.appendChild(bubble);
  container.appendChild(msgEl);
  container.scrollTop=container.scrollHeight;
}

function clearChat() {
  const container=$('chat-messages');
  if (!container) return;
  container.innerHTML='';
  _chat.currentNode='root';
  showChatNode('root');
  showToast('Conversación limpiada 🗑️');
}

// ── NLP: mapa de intención → nodo del árbol de diálogo ──────────────────────
// Cada entrada tiene un array de patrones (substring, ignorando acentos/case)
// y el nodo destino en getDialogResponse().
const INTENT_MAP = [
  // ── Tutorial / ayuda general ─────────────────────────────────────────────
  {
    patterns: [
      'como funciona','cómo funciona','que haces','qué haces',
      'para que sirves','para qué sirves','que eres','qué eres',
      'cuentame','cuéntame','explicame','explícame',
      'ayuda','help','tutorial','quien eres','quién eres',
      'como te uso','cómo te uso','instrucciones',
    ],
    node: 'tut_pet',
  },
  // ── Economía / puntos / monedas ──────────────────────────────────────────
  {
    patterns: [
      'puntos','monedas','coins','como gano','cómo gano',
      'recompensa','recompensas','ganar','economia','economía',
      'tienda','comprar','compro','shop',
    ],
    node: 'tut_economy',
  },
  // ── Family Mode ──────────────────────────────────────────────────────────
  {
    patterns: [
      'family','familiar','control parental','apoderado','padre',
      'tiempo pantalla','tiempo de pantalla','limite','límite',
      'bloqueo familiar','modo familia',
    ],
    node: 'tut_family',
  },
  // ── Bóveda / vault ───────────────────────────────────────────────────────
  {
    patterns: [
      'boveda','bóveda','vault','guardar contraseña','contraseñas guardadas',
      'contrasenas guardadas','gestor de contraseñas','gestor de contrasenas',
    ],
    node: 'tut_vault',
  },
  // ── Phishing ─────────────────────────────────────────────────────────────
  {
    patterns: [
      'phishing','estafa','engaño','engano','falso','fake',
      'link sospechoso','url falsa','sitio peligroso','correo falso',
      'email sospechoso','fraude','scam',
    ],
    node: 'phishing_topic',
  },
  // ── Contraseñas ──────────────────────────────────────────────────────────
  {
    patterns: [
      'contraseña','contrasena','password','clave','pin',
    ],
    node: 'password_topic',
  },
  // ── Privacidad ───────────────────────────────────────────────────────────
  {
    patterns: [
      'privacidad','privaci','vpn','rastreo','tracker','cookies',
      'anonimo','anónimo','privado','seguimiento',
    ],
    node: 'privacy_topic',
  },
  // ── Redes sociales ───────────────────────────────────────────────────────
  {
    patterns: [
      'redes sociales','redes','instagram','facebook','tiktok','twitter',
      'social','publicar','perfil','x.com','snap',
    ],
    node: 'social_topic',
  },
  // ── 2FA ──────────────────────────────────────────────────────────────────
  {
    patterns: [
      '2fa','doble factor','verificacion','verificación',
      'autenticacion','autenticación','codigo sms','código sms',
      'doble paso','segundo factor',
    ],
    node: 'phishing_clicked', // reutilizamos el nodo que ya explica 2FA en contexto
  },
  // ── Saludo ───────────────────────────────────────────────────────────────
  {
    patterns: ['hola','hey ','buenas','saludos','hi ','hello','ey '],
    node: 'greeting_random',
  },
];

/**
 * Normaliza texto (quita acentos, pasa a minúsculas) y busca el primer nodo
 * cuyo array de patrones tenga al menos una coincidencia como substring.
 * @param {string} text
 * @returns {string|null} nodeId o null si no hay match
 */
function detectIntent(text) {
  const normalize = s =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const q = normalize(text);
  for (const { patterns, node } of INTENT_MAP) {
    if (patterns.some(p => q.includes(normalize(p)))) return node;
  }
  return null;
}

async function sendChatMessage() {
  const input = $('chat-input');
  const text  = input?.value.trim() ?? '';
  if (!text) return;

  appendChatMessage('user', text);
  if (input) input.value = '';

  // Intentar resolver intención con NLP local
  const detectedNode = detectIntent(text);
  if (detectedNode) {
    setTimeout(() => showChatNode(detectedNode), 300);
    return;
  }

  // Fallback: mensaje genérico + mostrar menú raíz
  appendChatMessage(
    'bot',
    '🤔 No entendí bien ese mensaje, pero puedo ayudarte con estos temas:'
  );
  setTimeout(() => showChatNode('root'), 300);
}

function getDialogResponse(nodeId, userName='', petName='CyberPet') {
  const DIALOG_TREE = {
    root: {
      message: `¡Hola${userName?', '+userName:''}! Soy ${petName}, tu guardián digital 🐱\n\n¿En qué puedo ayudarte hoy?`,
      options: [
        { text:"🔐 Contraseñas seguras",     next:"password_topic"  },
        { text:"🎣 Detectar phishing",        next:"phishing_topic"  },
        { text:"🛡️ Navegación privada",       next:"privacy_topic"   },
        { text:"📱 Redes sociales seguras",   next:"social_topic"    },
        { text:"😺 ¡Solo saludar!",           next:"greeting_random" },
      ]
    },
    password_topic: {
      message:"Las contraseñas son tu primera línea de defensa 🛡️\n\n¿Qué quieres saber?",
      options:[
        {text:"¿Cómo creo una contraseña fuerte?",        next:"password_strong" },
        {text:"¿Debo usar la misma en todo?",             next:"password_unique" },
        {text:"¿Qué es un gestor de contraseñas?",        next:"password_manager"},
        {text:"← Volver al menú",                         next:"root"            },
      ]
    },
    password_strong: {
      message:"✅ Una contraseña FUERTE tiene:\n\n• 12+ caracteres\n• Mayúsculas Y minúsculas\n• Números y símbolos\n• Nada personal\n\n💡 Ejemplo: 'Gat0$Segur0_2024!'",
      options:[{text:"← Volver",next:"password_topic"}]
    },
    password_unique: {
      message:"🚨 ¡NUNCA uses la misma contraseña en varios sitios!\n\nSi un sitio es hackeado, prueban esa contraseña en TODAS tus cuentas. ¡Podrían acceder a tu banco! 💸",
      options:[{text:"¿Y cómo las recuerdo todas?",next:"password_manager"},{text:"← Menú",next:"root"}]
    },
    password_manager: {
      message:"🔑 Un gestor es como una BÓVEDA digital 🔐\n\nSolo recuerdas UNA contraseña maestra.\n\n✅ Genera contraseñas ultra-fuertes\n✅ Las autocompleta\n✅ Cifrado AES-256\n\n🏆 Populares: Bitwarden (gratis), 1Password",
      options:[{text:"← Menú",next:"root"}]
    },
    phishing_topic: {
      message:"🎣 El phishing es cuando atacantes fingen ser sitios legítimos.\n\n¿Qué quieres aprender?",
      options:[
        {text:"¿Cómo sé si un email es falso?",              next:"phishing_email"  },
        {text:"¿Qué hago si hice clic en algo sospechoso?",  next:"phishing_clicked"},
        {text:"¿Cómo verifico si una URL es segura?",        next:"phishing_url"    },
        {text:"← Volver al menú",                            next:"root"            },
      ]
    },
    phishing_email: {
      message:"🔍 Señales de phishing:\n\n• Remitente extraño: 'paypa1.com' (¡1 en vez de l!)\n• Urgencia: '¡Tu cuenta cierra en 24h!'\n• Errores ortográficos\n• Links que no coinciden\n• Promesas demasiado buenas",
      options:[{text:"← Volver",next:"phishing_topic"}]
    },
    phishing_clicked: {
      message:"😱 ¡No entres en pánico!\n\n1️⃣ CAMBIA tu contraseña INMEDIATAMENTE\n2️⃣ Si era un banco: LLAMA al banco\n3️⃣ Activa 2FA\n4️⃣ Escanea tu dispositivo con antivirus",
      options:[{text:"Gracias 🙏",next:"root"},{text:"← Volver",next:"phishing_topic"}]
    },
    phishing_url: {
      message:"✅ Verifica la URL:\n\n• 'paypal.com' ≠ 'paypal-secure.xyz'\n• Sin errores: 'g0ogle.com' (con 0) es falso\n• Muchos subdominios = sospechoso\n\n💡 Pasa el cursor sobre el link SIN hacer clic para ver la URL real.",
      options:[{text:"← Volver",next:"phishing_topic"}]
    },
    privacy_topic: {
      message:"🛡️ La privacidad en internet es importante.\n\n¿Qué quieres saber?",
      options:[
        {text:"¿Qué son las cookies y trackers?",    next:"privacy_cookies"},
        {text:"¿Debo usar una VPN?",                 next:"privacy_vpn"    },
        {text:"← Volver al menú",                    next:"root"           },
      ]
    },
    privacy_cookies: {
      message:"🍪 COOKIES: Archivos que los sitios guardan en tu navegador.\n\n👁️ TRACKERS: Scripts que te siguen de sitio en sitio.\n\nFacebook Pixel sabe lo que ves aunque no estés en Facebook. 😮\n\n💡 Usa extensiones como uBlock Origin para bloquearlos.",
      options:[{text:"← Volver",next:"privacy_topic"}]
    },
    privacy_vpn: {
      message:"🔒 VPN = Oculta tu IP y cifra tu tráfico.\n\n✅ Muy útil en WiFi público ☕\n⚠️ No te hace 100% anónimo\n\n💡 Opciones confiables: ProtonVPN (gratis), Mullvad",
      options:[{text:"← Volver",next:"privacy_topic"},{text:"← Menú",next:"root"}]
    },
    social_topic: {
      message:"📱 Las redes sociales pueden ser riesgosas.\n\n¿Qué quieres saber?",
      options:[
        {text:"¿Cómo configuro mi privacidad?", next:"social_privacy"    },
        {text:"¿Qué NO debo publicar nunca?",   next:"social_dont_post"  },
        {text:"← Volver al menú",               next:"root"              },
      ]
    },
    social_privacy: {
      message:"🔒 Configuración esencial:\n\n✅ Solo amigos ven tus posts\n✅ Desactiva ubicación\n✅ Activa 2FA\n✅ Revisa apps conectadas\n✅ Haz auditoría de privacidad mensual",
      options:[{text:"← Volver",next:"social_topic"}]
    },
    social_dont_post: {
      message:"🚫 NUNCA publiques:\n\n❌ Documentos de identidad\n❌ Tu dirección o rutina exacta\n❌ Información financiera\n❌ Fotos íntimas\n\n💡 Recuerda: Internet es PARA SIEMPRE.",
      options:[{text:"← Volver",next:"social_topic"},{text:"← Menú",next:"root"}]
    },
    greeting_random: {
      message:`¡Miau! 😺 ¡Qué gusto saludarte${userName?', '+userName:''}!\n\nSoy ${petName}, tu guardián de ciberseguridad. 🐱`,
      options:[
        {text:"🔐 Contraseñas",      next:"password_topic"},
        {text:"🎣 Phishing",         next:"phishing_topic"},
        {text:"😺 ¡Hasta luego!",    next:"greeting_bye"  },
      ]
    },
    greeting_bye: {
      message:`¡Fue un placer charlar contigo${userName?', '+userName:''}! 🐾\n\n¡Vuelve cuando quieras! 😺`,
      options:[{text:"🔄 Empezar de nuevo",next:"root"}]
    },

    tutorial: {
  message: `¡Hola! Soy ${petName} y voy a explicarte todo 🐾\n\n¿Por dónde quieres empezar?`,
  options: [
    { text: '🐱 ¿Qué eres y cómo funciona?',    next: 'tut_pet'      },
    { text: '🔐 ¿Cómo gano puntos y monedas?',   next: 'tut_economy'  },
    { text: '🎣 ¿Cómo me proteges del phishing?', next: 'tut_phishing' },
    { text: '🔒 ¿Qué es la bóveda?',             next: 'tut_vault'    },
    { text: '👨‍👩‍👧 ¿Qué es el Family Mode?',         next: 'tut_family'   },
    { text: '✅ Ya entendí, vamos al menú',        next: 'root'         },
  ]
},
tut_pet: {
  message: `Soy tu mascota digital de seguridad 🐱\n\nMi salud (❤️) refleja qué tan seguro navegas:\n• 70-100% → 😺 Feliz (navegas bien)\n• 50-69%  → 😐 Neutral (algunas alertas)\n• 0-49%  → 😷 Enfermo (¡cuidado!)\n\nCuando llego a 0% muero y pierdes puntos. Me puedes revivir desde el Dashboard.`,
  options: [{ text: '← Volver al tutorial', next: 'tutorial' }]
},
tut_economy: {
  message: `Sistema de puntos y monedas 🏆🪙\n\n✅ GANAS puntos/monedas cuando:\n• Usas contraseñas fuertes\n• Interactúas conmigo\n• Completas el modo educativo\n• Llevas días sin amenazas\n\n❌ PIERDES cuando:\n• Usas contraseñas débiles\n• Entras a sitios sospechosos\n• Me dejas morir\n\nLas monedas se usan en la Tienda 🛍️ para ropa, títulos y más tiempo de pantalla.`,
  options: [{ text: '← Volver al tutorial', next: 'tutorial' }]
},
tut_phishing: {
  message: `Detecto sitios peligrosos automáticamente 🎣\n\nAnalizo cada URL que visitas buscando:\n• Dominios falsos (paypa1.com en vez de paypal.com)\n• TLDs sospechosos (.xyz, .top, .tk...)\n• Subdominios trampa (secure.verify.login.algo.com)\n• Direcciones IP directas\n\nCuando detecto algo, aparece un banner de aviso. Si confirmas el peligro, pierdo algo de salud.\n\n📝 Puedes añadir sitios de confianza en Ajustes → Whitelist.`,
  options: [{ text: '← Volver al tutorial', next: 'tutorial' }]
},
tut_vault: {
  message: `La bóveda guarda tus contraseñas de forma segura 🔐\n\nUsa cifrado AES-256-GCM con una clave derivada de tu PIN. Ni yo puedo leer tus contraseñas sin el PIN.\n\nDesde la pestaña 🔐 puedes:\n• Guardar usuario + contraseña de cualquier sitio\n• Buscar y copiar contraseñas guardadas\n• Generar contraseñas seguras automáticamente\n\n⚠️ Si olvidas el PIN puedes recuperarlo con la pregunta de seguridad que configuraste.`,
  options: [{ text: '← Volver al tutorial', next: 'tutorial' }]
},
tut_family: {
  message: `Family Mode es para control parental 👨‍👩‍👧\n\nEl apoderado configura un PIN y establece:\n• ⏱️ Límite diario de minutos de navegación\n• 🔒 Nivel de filtro de contenido\n• ✅ URLs siempre permitidas\n• 💬 Mensaje personalizado al agotar el tiempo\n\nCuando se acaba el tiempo, todas las pestañas se redirigen a la pantalla de pausa. El apoderado puede desbloquear tiempo extra, o el usuario puede comprar más tiempo con monedas.\n\nSe activa desde el popup o el Dashboard → Family Mode.`,
  options: [{ text: '← Volver al tutorial', next: 'tutorial' }]
},

  };

  const node = DIALOG_TREE[nodeId] || DIALOG_TREE.root;
  return { message: node.message, options: node.options || [] };
}