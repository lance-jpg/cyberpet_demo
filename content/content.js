// ════════════════════════════════════════════════
//  CYBERPET v4.1 — CONTENT SCRIPT
// ════════════════════════════════════════════════

// ── GUARD: no correr en páginas internas ─────────────────────────────────
{
  const u = window.location.href;
  if (
    u.startsWith('chrome-extension://') ||
    u.startsWith('moz-extension://') ||
    u.startsWith('chrome://') ||
    u.startsWith('about:') ||
    u.startsWith('file://')
  ) { throw new Error('CyberPet: página interna, abortando.'); }
}

const _notified  = new Set();
// _processed usa un wrapper con referencia mutable para poder "limpiar" el WeakSet
// al desactivar y reactivar el toggle de censura (WeakSet no tiene .clear()).
const _processedRef = {
  _ws: new WeakSet(),
  has(node)  { return this._ws.has(node); },
  add(node)  { this._ws.add(node); return this; },
  reset()    { this._ws = new WeakSet(); },
};
// Alias para no cambiar todas las llamadas existentes a _processed.*
const _processed = _processedRef;

// ── CONFIG ────────────────────────────────────────────────────────────────
// Valores por defecto seguros. Se sobreescriben con lo que hay en storage.
const config = {
  keywords:              [],
  whitelist:             [],
  passwordCheckEnabled:  true,
  keywordCensorEnabled:  true,
  phishingDetectEnabled: true,
  petVisible:            true,
  petMovementEnabled:    true,
  themeColor:            'blue',
};

let _cpSecret = '';

// Colores por tema para el menú contextual
const themeColors = {
  blue:    { accent: '#26639d', accent2: '#70ad47', danger: '#ff483d', c1: '#cce0f5', text: '#0f2238', surface: '#ffffff', border: 'rgba(38,99,157,0.15)', shadow: '0 6px 28px rgba(38,99,157,0.17)' },
  pink:    { accent: '#c9184a', accent2: '#ff6b9d', danger: '#ff483d', c1: '#ffd6e8', text: '#3a0018', surface: '#fff8fb', border: 'rgba(201,24,74,0.14)', shadow: '0 6px 28px rgba(201,24,74,0.17)' },
  purple:  { accent: '#6d28d9', accent2: '#a855f7', danger: '#ff483d', c1: '#ede9fe', text: '#1e0a3c', surface: '#faf8ff', border: 'rgba(109,40,217,0.14)', shadow: '0 6px 28px rgba(109,40,217,0.17)' },
  mint:    { accent: '#1a6b44', accent2: '#34d399', danger: '#ff483d', c1: '#b7e4c7', text: '#052e16', surface: '#f0fdf4', border: 'rgba(26,107,68,0.14)', shadow: '0 6px 28px rgba(26,107,68,0.17)' },
  peach:   { accent: '#c75b2a', accent2: '#fb923c', danger: '#ff483d', c1: '#ffd7ba', text: '#431407', surface: '#fffaf0', border: 'rgba(199,91,42,0.14)', shadow: '0 6px 28px rgba(199,91,42,0.17)' },
  ocean:   { accent: '#0369a1', accent2: '#38bdf8', danger: '#ff483d', c1: '#cffafe', text: '#0c1929', surface: '#f0f9ff', border: 'rgba(3,105,161,0.14)', shadow: '0 6px 28px rgba(3,105,161,0.17)' },
  forest:  { accent: '#166534', accent2: '#4ade80', danger: '#ff483d', c1: '#dcfce7', text: '#052e16', surface: '#f0fdf4', border: 'rgba(22,101,52,0.14)', shadow: '0 6px 28px rgba(22,101,52,0.17)' },
  candy:   { accent: '#db2777', accent2: '#f472b6', danger: '#ff483d', c1: '#fce7f3', text: '#500724', surface: '#fff1f2', border: 'rgba(219,39,119,0.14)', shadow: '0 6px 28px rgba(219,39,119,0.17)' },
  night:   { accent: '#6366f1', accent2: '#818cf8', danger: '#ff483d', c1: '#e0e7ff', text: '#1e1b4b', surface: '#1e1b4b', border: 'rgba(99,102,241,0.3)', shadow: '0 6px 28px rgba(0,0,0,0.4)' },
  sunset:  { accent: '#ea580c', accent2: '#fb923c', danger: '#ff483d', c1: '#ffedd5', text: '#431407', surface: '#fff7ed', border: 'rgba(234,88,12,0.14)', shadow: '0 6px 28px rgba(234,88,12,0.17)' },
};

function getThemeColors() {
  return themeColors[config.themeColor] || themeColors.blue;
}

chrome.storage.local.get(Object.keys(config), data => {
  Object.assign(config, data);
  // Normalizar booleans: undefined → true (feature habilitada por defecto)
  ['passwordCheckEnabled','keywordCensorEnabled','phishingDetectEnabled','petMovementEnabled']
    .forEach(k => { if (config[k] === undefined) config[k] = true; });
  if (config.petVisible === undefined) config.petVisible = true;
  if (!Array.isArray(config.keywords))  config.keywords  = [];
  if (!Array.isArray(config.whitelist)) config.whitelist = [];
  if (!config.themeColor) config.themeColor = 'blue';
  chrome.runtime.sendMessage({ type: 'GET_MSG_SECRET' }, res => {
    _cpSecret = res?.secret || '';
    init();
  });
});

// ── INIT ──────────────────────────────────────────────────────────────────
function init() {
  // Listener para cambios de tema en tiempo real
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.themeColor) {
      config.themeColor = changes.themeColor.newValue;
    }
  });

  // Crear el gato
  if (config.petVisible) {
    const spawnPet = () => {
      if (window._cyberPet?.destroy) window._cyberPet.destroy();
      window._cyberPet = new ShimejiPet();
    };
    document.readyState === 'loading'
      ? document.addEventListener('DOMContentLoaded', spawnPet, { once: true })
      : spawnPet();
  }

  // Arrancar features de seguridad con un pequeño delay
  // para dejar que la página termine su render inicial
  setTimeout(initSecurityFeatures, 700);
}

function initSecurityFeatures() {
  if (config.keywordCensorEnabled)  censorContent();
  if (config.passwordCheckEnabled)  monitorPasswords();
  if (config.phishingDetectEnabled) checkPhishing();

  // FIX #19 + #20: MutationObserver más inteligente
  // Solo re-procesa si hay cambios reales en nodos de texto o inputs
  let censorTimer  = null;
  let passwordTimer = null;

  const observer = new MutationObserver(mutations => {
    let hasTextChange  = false;
    let hasInputChange = false;

    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === Node.TEXT_NODE)    hasTextChange  = true;
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.querySelector?.('input[type="password"]')) hasInputChange = true;
          // Texto añadido como elemento
          if (node.textContent?.length > 0) hasTextChange = true;
        }
      }
      if (hasTextChange && hasInputChange) break; // ya sabemos todo lo que necesitamos
    }

    if (hasTextChange && config.keywordCensorEnabled) {
      clearTimeout(censorTimer);
      censorTimer = setTimeout(censorContent, 1200);
    }
    if (hasInputChange && config.passwordCheckEnabled) {
      clearTimeout(passwordTimer);
      passwordTimer = setTimeout(monitorPasswords, 500);
    }
  });

  // FIX: observar body con subtree:true para capturar inputs de contraseña
  // que se insertan dinámicamente (SPAs como Google Sign-up, React, etc.)
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

// ════════════════════════════════════════════════
//  SHIMEJI PET
// ════════════════════════════════════════════════
class ShimejiPet {
  constructor() {
    // Posición inicial: esquina inferior derecha con margen
    this.x = window.innerWidth  - 120;
    this.y = window.innerHeight - 120;

    // Estado
    this.isDragging   = false;
    this.isDead       = false;
    this.currentState = 'neutral';
    this._savedState  = null;

    // Timers — guardados para poder cancelarlos
    this._inactivityTimer = null;
    this._walkTimer       = null;
    this._walkInterval    = null;
    this._isBusy          = false;

    // FIX #17: referencias a los handlers para poder removerlos si el gato se destruye
    this._onMouseMove = e => this._handleMouseMove(e);
    this._onMouseUp   = e => this._handleMouseUp(e);

    this._buildDOM();
    this._bindEvents();
    this._startInactivity();
    this._startBehavior();
    this._syncWithBackground();

    window.addEventListener('resize', () => this._clamp(), { passive: true });
  }

  // ── DOM ──────────────────────────────────────
  _buildDOM() {
    document.getElementById('cyberpet-shimeji-host')?.remove();

    // Host element — only this ID is visible to page JS/CSS
    const host=document.createElement('div');
    host.id='cyberpet-shimeji-host';
    host.style.cssText='position:fixed!important;width:80px!important;height:80px!important;z-index:999999!important;pointer-events:auto!important;outline:none!important;';
    host.style.left=`${this.x}px`; host.style.top=`${this.y}px`;

    // Closed Shadow DOM — page JS cannot access internals
    const shadow=host.attachShadow({mode:'closed'});
    this._shadow=shadow;

    // Styles inside shadow
    const style=document.createElement('style');
    style.textContent=`
      :host{display:block;position:fixed;width:80px;height:80px;cursor:grab;user-select:none;}
      :host(:active){cursor:grabbing;}
      #sprite{width:100%;height:100%;object-fit:contain;display:block;filter:drop-shadow(0 4px 8px rgba(0,0,0,0.25));pointer-events:none;}
      #overlay{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;pointer-events:none;display:none;}
    `;
    const img=document.createElement('img');
    img.id='sprite'; img.src=chrome.runtime.getURL('assets/sprites/neutral.png');
    img.alt='CyberPet'; img.draggable=false;
    const overlay=document.createElement('img');
    overlay.id='overlay'; overlay.draggable=false;

    shadow.appendChild(style);
    shadow.appendChild(img);
    shadow.appendChild(overlay);
    document.body.appendChild(host);

    this.el=host; this.img=img; this.overlay=overlay;
  }

  // ── MENÚ CONTEXTUAL ──────────────────────────
  _buildContextMenu(clientX, clientY) {
    // FIX #27: reusar si ya existe, solo reposicionar
    let menu = document.getElementById('cyberpet-context-menu');
    const theme = getThemeColors();
    
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'cyberpet-context-menu';
      document.body.appendChild(menu);

      // Cerrar al click fuera
      document.addEventListener('click', e => {
        if (!menu.contains(e.target)) menu.style.display = 'none';
      });
    }

    // Aplicar colores del tema
    menu.style.cssText = `
      position: fixed !important;
      background: ${theme.surface} !important;
      border: 1px solid ${theme.border} !important;
      border-radius: 14px !important;
      padding: 6px !important;
      box-shadow: ${theme.shadow} !important;
      z-index: 1000000 !important;
      min-width: 195px !important;
      font-family: 'Roboto Condensed', -apple-system, sans-serif !important;
      animation: cyberpet-menuIn 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
    `;

    // Reconstruir items con estado actual
    menu.innerHTML = '';
    const items = [
      {
        icon:   '📊',
        label:  'Abrir Dashboard',
        action: () => chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' }),
      },
      {
        icon:   config.petVisible ? '🙈' : '🐱',
        label:  config.petVisible ? 'Ocultar CyberPet' : 'Mostrar CyberPet',
        action: () => {
          config.petVisible = !config.petVisible;
          chrome.storage.local.set({ petVisible: config.petVisible });
          if (config.petVisible) {
            if (!window._cyberPet) window._cyberPet = new ShimejiPet();
          } else if (window._cyberPet?.el) {
            window._cyberPet.el.remove();
            window._cyberPet = null;
          }
          menu.style.display = 'none';
        },
      },
      {
        icon:   config.petMovementEnabled ? '⏸' : '▶',
        label:  config.petMovementEnabled ? 'Detener movimiento' : 'Reanudar movimiento',
        action: () => {
          config.petMovementEnabled = !config.petMovementEnabled;
          chrome.storage.local.set({ petMovementEnabled: config.petMovementEnabled });
          menu.style.display = 'none';
        },
      },
    ];

    items.forEach(({ icon, label, action }) => {
      const btn = document.createElement('button');
      btn.className = 'cyberpet-menu-item';
      btn.style.cssText = `
        display: flex !important;
        align-items: center !important;
        gap: 10px !important;
        padding: 10px 14px !important;
        margin: 2px 0 !important;
        background: transparent !important;
        color: ${theme.text} !important;
        border: none !important;
        border-radius: 10px !important;
        font-family: 'Roboto Condensed', -apple-system, sans-serif !important;
        font-size: 0.9rem !important;
        font-weight: 600 !important;
        cursor: pointer !important;
        width: 100% !important;
        text-align: left !important;
        transition: all 0.15s ease !important;
        outline: none !important;
        user-select: none !important;
      `;
      btn.innerHTML = `<span class="cyberpet-menu-icon" style="color: ${theme.accent} !important;">${icon}</span><span>${label}</span>`;
      btn.addEventListener('mouseenter', () => {
        btn.style.background = `${theme.c1} !important`;
        btn.style.color = `${theme.accent} !important`;
        btn.style.transform = 'translateX(2px)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'transparent !important';
        btn.style.color = `${theme.text} !important`;
        btn.style.transform = 'none';
      });
      btn.addEventListener('click', (e) => { 
        e.stopPropagation();
        action(); 
        menu.style.display = 'none'; 
      });
      menu.appendChild(btn);
    });

    // Posicionar y ajustar si sale de pantalla
    menu.style.display = 'block';
    menu.style.left    = `${clientX}px`;
    menu.style.top     = `${clientY}px`;

    // Ajuste en el siguiente frame cuando tengamos dimensiones reales
    requestAnimationFrame(() => {
      const r = menu.getBoundingClientRect();
      if (r.right  > window.innerWidth)  menu.style.left = `${window.innerWidth  - r.width  - 10}px`;
      if (r.bottom > window.innerHeight) menu.style.top  = `${window.innerHeight - r.height - 10}px`;
    });
  }

  // ── EVENTOS ───────────────────────────────────
  _bindEvents() {
    this.el.addEventListener('mouseenter', () => {
      this.el.style.transform = 'scale(1.15)';
      // Si estaba en wait, salir al hacer hover
      if (this.currentState === 'wait' && !this.isDead) {
        this._exitWait();
      }
    });
    this.el.addEventListener('mouseleave', () => {
      this.el.style.transform = 'scale(1)';
    });

    this.el.addEventListener('mousedown', e => this._onMouseDown(e));
    // Menú contextual custom desactivado para evitar UI invasiva.
    // Se mantiene el menú nativo del navegador.

    // FIX #17: listeners en document guardados como referencias para poder limpiarlos
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mouseup',   this._onMouseUp);
  }

  _onMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    this.isDragging = true;
    this._dragStart = { x: e.clientX, y: e.clientY, t: Date.now() };
    this._offset    = { x: e.clientX - this.x, y: e.clientY - this.y };
    this.el.style.cursor = 'grabbing';
    // Detener walk mientras se arrastra
    if (this._walkInterval) { clearInterval(this._walkInterval); this._isBusy = false; }
  }

  _handleMouseMove(e) {
    if (!this.isDragging) return;
    this.x = e.clientX - this._offset.x;
    this.y = e.clientY - this._offset.y;
    this._clamp();
    this._updatePos();
  }

  _handleMouseUp(e) {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.el.style.cursor = 'grab';

    const dx   = e.clientX - this._dragStart.x;
    const dy   = e.clientY - this._dragStart.y;
    const dist = Math.hypot(dx, dy);
    const dt   = Math.max(1, Date.now() - this._dragStart.t);

    // Soltar en el aire → caída con gravedad
    if (this.y < window.innerHeight - 110) this._fall();

    const speed = dist / dt * 1000; // px/s

    if (speed > 300 && dist > 150 && !this.isDead) {
      // Zarandeo fuerte → mareo
      this._dizzy();
    } else if (dist < 8 && !this.isDead) {
      // Tap simple → buena práctica
      chrome.runtime.sendMessage({ type: 'GOOD_PRACTICE', _secret: _cpSecret, action: 'interactuar con el gato' });
      // Animación de salto
      this._bounce();
    }
  }

  // ── FÍSICA ────────────────────────────────────
  _fall() {
    const ground = window.innerHeight - 88;
    let vy = 0;

    const tick = setInterval(() => {
      if (this.isDragging) { clearInterval(tick); return; }
      vy += 0.9; // gravedad
      this.y = Math.min(this.y + vy, ground);
      this._updatePos();

      if (this.y >= ground) {
        vy *= -0.45; // rebote amortiguado
        if (Math.abs(vy) < 1.5) {
          this.y = ground;
          this._updatePos();
          clearInterval(tick);
        }
      }
    }, 16);
  }

  _bounce() {
    let t = 0;
    const tick = setInterval(() => {
      this.el.style.transform = `scale(1) translateY(${Math.sin(t * 0.4) * -8}px)`;
      if (++t > 12) { clearInterval(tick); this.el.style.transform = ''; }
    }, 50);
  }

  _dizzy() {
    let t = 0;
    const spin = setInterval(() => {
      this.el.style.transform = `rotate(${Math.sin(t++ * 0.5) * 20}deg)`;
      if (t > 30) { clearInterval(spin); this.el.style.transform = ''; }
    }, 50);
    // FIX #6: usa el case SHOW_NOTIFICATION que ahora existe en background
    chrome.runtime.sendMessage({
      type:    'SHOW_NOTIFICATION',
      title:   '🌀 ¡Me mareaste!',
      message: 'Ten cuidado con tu compañero 🐱',
      sprite:  'sick',
    });
  }

  // ── INACTIVIDAD ───────────────────────────────
  _startInactivity() {
    const INACTIVITY_MS = 30000; // 30 segundos

    const reset = () => {
      clearTimeout(this._inactivityTimer);
      // Salir de wait si el usuario vuelve a estar activo
      if (this.currentState === 'wait' && !this.isDead) {
        this._exitWait();
      }
      this._inactivityTimer = setTimeout(() => {
        if (!this.isDragging && !this.isDead) this._enterWait();
      }, INACTIVITY_MS);
    };

    // FIX #17: passive: true para no bloquear scroll; guardamos como ref pero
    // no necesitamos removerlos porque son del documento, no del gato
    ['mousemove','keypress','click','scroll'].forEach(ev =>
      document.addEventListener(ev, reset, { passive: true })
    );
    reset();
  }

  _enterWait() {
    this._savedState = this.currentState;
    this._setState('wait');
    this.el.style.opacity = '0.55';
    // Mover a esquina inferior derecha
    this.x = window.innerWidth  - 90;
    this.y = window.innerHeight - 90;
    this._clamp();
    this._updatePos();
  }

  _exitWait() {
    this._setState(this._savedState || 'neutral');
    this.el.style.opacity = '1';
  }

  // ── MOVIMIENTO AUTÓNOMO ───────────────────────
_startBehavior() {
  const schedule = () => {
    if (this.isDead) return;  // ← FIX: corta la recursión tras handleDeath()
    this._walkTimer = setTimeout(() => {
      if (!this.isDead && config.petMovementEnabled && this.currentState !== 'wait') {
        this._walk();
      }
      schedule();
    }, 5000 + Math.random() * 4000);
  };
  schedule();
}

  _walk() {
    if (this._isBusy || this.isDragging) return;
    this._isBusy = true;

    const DIRS = [
      [1,0], [-1,0], [0,1],  [0,-1],  // ortogonal
      [1,1], [1,-1], [-1,1], [-1,-1], // diagonal
    ];
    const [dx, dy]  = DIRS[Math.floor(Math.random() * DIRS.length)];
    const SPEED     = 1.8; // px por frame
    const duration  = 1800 + Math.random() * 2000;
    const deadline  = Date.now() + duration;

    this._walkInterval = setInterval(() => {
      if (this.isDragging || !config.petMovementEnabled || this.currentState === 'wait') {
        clearInterval(this._walkInterval);
        this._isBusy = false;
        return;
      }
      this.x += dx * SPEED;
      this.y += dy * SPEED;
      this._clamp();
      this._updatePos();
      if (Date.now() >= deadline) {
        clearInterval(this._walkInterval);
        this._isBusy = false;
      }
    }, 16);
  }

  // ── HELPERS ───────────────────────────────────
  _clamp() {
    this.x = Math.max(4,  Math.min(this.x, window.innerWidth  - 84));
    this.y = Math.max(4,  Math.min(this.y, window.innerHeight - 84));
  }

  _updatePos() {
    this.el.style.left = `${this.x}px`;
    this.el.style.top  = `${this.y}px`;
  }

  _setState(state) {
    this.currentState = state;
    if (this.img) {
      this.img.src = chrome.runtime.getURL(`assets/sprites/${state}.png`);
    }
  }

  _updateClothOverlay(outfitOrId){
    if(!this.overlay)return;
    const parent=this.overlay.parentNode;
    if(parent){parent.querySelectorAll('.cp-cloth-layer').forEach(l=>l.remove());}
    let items=[];
    if(!outfitOrId||outfitOrId==='none'){items=[];}
    else if(typeof outfitOrId==='string'){items=[outfitOrId];}
    else if(typeof outfitOrId==='object'){items=Object.values(outfitOrId).filter(Boolean);}
    this.overlay.style.setProperty('display','none','important');
    if(!items.length)return;
    items.forEach(id=>{
      const img=document.createElement('img');
      img.className='cp-cloth-layer';
      img.style.cssText='position:absolute!important;top:0!important;left:0!important;width:100%!important;height:100%!important;object-fit:contain!important;pointer-events:none!important;';
      img.src=chrome.runtime.getURL('assets/clothes/'+id+'.png');
      img.onerror=()=>img.remove();
      if(parent)parent.appendChild(img);
    });
  }
  _syncWithBackground() {
    chrome.runtime.sendMessage({type:'GET_STATE'},res=>{
      if(chrome.runtime.lastError||!res)return;
      const hp=res.petHealth??100,state=res.petState||_stateFromHp(hp);
      this._setState(state);
      this._updateClothOverlay(res.equippedOutfit||res.equippedCloth||null);
      if(hp===0)this.handleDeath();
    });
    chrome.storage.onChanged.addListener((changes,area)=>{
      if(area!=='local')return;
      if(changes.equippedOutfit!==undefined)this._updateClothOverlay(changes.equippedOutfit.newValue||null);
      else if(changes.equippedCloth!==undefined)this._updateClothOverlay(changes.equippedCloth.newValue||null);
    });
  }

  // ── API PÚBLICA ───────────────────────────────
  show() {
    this.el.style.display = 'block';
    config.petVisible     = true;
    this._clamp();
    this._updatePos();
  }

  hide() {
    this.el.style.display = 'none';
    config.petVisible     = false;
  }

  handleDeath() {
    this.isDead=true; this._setState('sick'); this.el.style.opacity='0.45';
    if(this._walkInterval){clearInterval(this._walkInterval);this._isBusy=false;}
    clearTimeout(this._walkTimer);
    if(document.getElementById('cp-death-overlay'))return;
    const d=document.createElement('div'); d.id='cp-death-overlay';
    d.style.cssText='position:fixed!important;inset:0!important;z-index:2147483646!important;background:rgba(0,0,0,0.85)!important;display:flex!important;align-items:center!important;justify-content:center!important;font-family:system-ui,sans-serif!important;';
    d.innerHTML=`<div style="text-align:center;max-width:380px;padding:32px;background:#1a1a2e;border:2px solid #ef4444;border-radius:20px;box-shadow:0 0 60px rgba(239,68,68,0.5);">
      <div style="font-size:5rem;margin-bottom:8px;">💀</div>
      <h2 style="color:#ef4444;font-size:1.5rem;margin:0 0 8px;">Tu CyberPet ha muerto</h2>
      <p style="color:#aaa;font-size:.9rem;margin:0 0 6px;">Perdiste <strong style="color:#f87171;">30 puntos</strong> y <strong style="color:#f87171;">15 monedas</strong>.</p>
      <p style="color:#666;font-size:.8rem;margin:0 0 18px;">Tus recompensas se reducen hasta que mejores tus hábitos.</p>
      <button id="cp-death-revive" style="background:#ef4444;color:white;border:none;padding:11px 24px;border-radius:10px;font-size:.95rem;font-weight:700;cursor:pointer;margin-right:8px;" aria-label="Revivir CyberPet">Revivir (−50 pts)</button>
      <button id="cp-death-close" style="background:transparent;color:#666;border:1px solid #444;padding:11px 16px;border-radius:10px;font-size:.85rem;cursor:pointer;" aria-label="Cerrar notificación">Cerrar</button>
    </div>`;
    document.body.appendChild(d);
    document.getElementById('cp-death-revive')?.addEventListener('click',()=>{chrome.runtime.sendMessage({type:'REVIVE_PET'});d.remove();});
    document.getElementById('cp-death-close')?.addEventListener('click',()=>d.remove());
    setTimeout(()=>d?.remove(),30000);
  }

destroy() {
  document.removeEventListener('mousemove', this._onMouseMove);
  document.removeEventListener('mouseup',   this._onMouseUp);
  clearTimeout(this._walkTimer);
  clearInterval(this._walkInterval);
  clearTimeout(this._inactivityTimer);
  this.el?.remove();
  this.isDead = true;  // evita que timers pendientes sigan corriendo
}


  revive() {
    this.isDead = false;
    this._setState('neutral');
    this.el.style.opacity = '1';
    // Retomar movimiento si el usuario lo tenía habilitado
    if (config.petMovementEnabled) this._startBehavior();
  }

  showDamageEffect() {
    // Overlay rojo sobre toda la pantalla
    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'background:rgba(255,0,0,0.22)',
      'z-index:999997', 'pointer-events:none',
      'animation:cyberpet-fadeOut 0.9s forwards',
    ].join(';');
    document.body.appendChild(overlay);

    this.el.style.animation = 'cyberpet-shake 0.5s';
    setTimeout(() => {
      overlay.remove();
      this.el.style.animation = '';
    }, 900);
  }
}

// Función pura auxiliar — no mezclar con el estado de instancia
function _stateFromHp(hp) {
  // Usar la versión de shared.js si ya está cargada
  if (typeof CyberPetUtils !== 'undefined' && CyberPetUtils.stateFromHealth) {
    return CyberPetUtils.stateFromHealth(hp);
  }
  if (hp === 0)  return 'sick';
  if (hp >= 70)  return 'happy';
  if (hp >= 50)  return 'neutral';
  return 'sick';
}

// ════════════════════════════════════════════════
//  CENSURA DE CONTENIDO
// ════════════════════════════════════════════════

// Tabla leet speak extendida
const _LEET = { o:'0', a:'4', e:'3', i:'1', s:'5', g:'9', t:'7', l:'1', z:'2' };

// Caché del regex — se reconstruye solo si las keywords cambian
let _censorRegex    = null;
let _censorCacheKey = '';
// Map de nodo → texto original, para poder revertir la censura cuando se desactiva el toggle
const _censoredNodes = new Map();

function _buildCensorRegex(keywords) {
  if (!keywords.length) return null;

  const esc     = v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const variants = new Set();

  for (const kw of keywords) {
    const base = kw.toLowerCase().trim();
    if (!base || base.length < 3) continue;

    variants.add(base);

    // Variante leet speak
    const leet = base.replace(/[oaeisgtlz]/g, c => _LEET[c] || c);
    if (leet !== base) variants.add(leet);

    // Stemming simple — quitar sufijos comunes en ES/EN
    const stem = base.replace(/(?:ción|tion|ness|ment|ando|ados|idas|ing|ed|er|es|s)$/, '');
    if (stem.length >= 3 && stem !== base) {
      variants.add(stem);
      for (const suf of ['s','es','ing','ed','er','ión','tion','ado','ada','ando']) {
        const v = stem + suf;
        if (v !== base && v.length >= 4) variants.add(v);
      }
    }
  }

  // \b no funciona bien con acentos/unicode — usar lookaround más amplio
  const pattern = [...variants].map(esc).join('|');
  return new RegExp(`(?<![\\w\\d\\.\\u00C0-\\u017E])(${pattern})(?![\\w\\d\\.\\u00C0-\\u017E])`, 'gi');
}

// Tags que NUNCA se censuran — evita romper funcionalidad
const _SKIP_TAGS = new Set([
  'SCRIPT','STYLE','NOSCRIPT','INPUT','TEXTAREA',
  'CODE','PRE','KBD','SAMP','VAR',
]);

function censorContent() {
  if (!config.keywords.length || !document.body) return;
  if (/(^|\.)claude\.ai$|(^|\.)chatgpt\.com$|(^|\.)openai\.com$/i.test(location.hostname)) return;

  // Reconstruir regex solo si las keywords cambiaron
  const cacheKey = config.keywords.join('\x00');
  if (cacheKey !== _censorCacheKey) {
    _censorRegex    = _buildCensorRegex(config.keywords);
    _censorCacheKey = cacheKey;
  }
  if (!_censorRegex) return;

  // Set de keywords ya notificadas — persiste por sesión de página
  // Usando variables de módulo declaradas al inicio del archivo
  // const notified = _notified;  (ya declarada globalmente)
  // const processed = _processed;  (ya declarada globalmente)

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        // Saltar nodos dentro del propio shimeji o menú contextual
        const host = node.parentElement;
        if (!host) return NodeFilter.FILTER_REJECT;
        if (host.closest('#cyberpet-shimeji, #cyberpet-context-menu')) {
          return NodeFilter.FILTER_REJECT;
        }
        // Saltar tags que no deben censurarse
        if (_SKIP_TAGS.has(host.tagName)) return NodeFilter.FILTER_REJECT;
        // FIX #20: saltar nodos ya procesados que no cambiaron
        if (_processed.has(node)) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  // Reset lastIndex antes del bucle (regex global guarda estado)
  _censorRegex.lastIndex = 0;

  for (const node of nodes) {
    const original = node.nodeValue;
    if (!original?.trim()) continue;

    // Test rápido antes del replace completo
    _censorRegex.lastIndex = 0;
    if (!_censorRegex.test(original)) {
      // Sin match: marcar como procesado para no revisarlo en la próxima pasada
      _processed.add(node);
      continue;
    }

    _censorRegex.lastIndex = 0;
    const censored = original.replace(_censorRegex, match => {
      const kw = match.toLowerCase();
      if (!_notified.has(kw)) {
        _notified.add(kw);
        // Enviar sin await — no bloquea el DOM
        chrome.runtime.sendMessage({ type: 'BAD_KEYWORD_DETECTED', _secret: _cpSecret, keyword: kw }).catch(() => {});
      }
      return '█'.repeat(match.length);
    });

    if (censored !== original) {
      // FIX M2: guardar el texto original ANTES de sobrescribir, para poder revertir
      if (!_censoredNodes.has(node)) _censoredNodes.set(node, original);
      node.nodeValue = censored;
      // Nodo modificado — no marcarlo como procesado, podría recibir más contenido
    } else {
      _processed.add(node);
    }
  }
}

// FIX M2: revierte todos los nodos censurados a su texto original
// Se llama cuando el toggle de censura se pone en OFF
function uncensorContent() {
  for (const [node, originalText] of _censoredNodes) {
    // Verificar que el nodo sigue conectado al DOM antes de modificarlo
    if (node.isConnected) {
      node.nodeValue = originalText;
    }
  }
  _censoredNodes.clear();
  _notified.clear(); // reset de keywords notificadas para que se re-notifiquen si se vuelve a activar
  // FIX toggle bidireccional: limpiar _processed para que censorContent()
  // vuelva a recorrer todos los nodos cuando el toggle se reactive.
  // _processed es un WeakSet — no tiene .clear(), hay que reasignarlo.
  // La referencia global se actualiza y el walker usará el nuevo WeakSet vacío.
  _processedRef.reset();
}

// ════════════════════════════════════════════════
//  MONITOR DE CONTRASEÑAS
// ════════════════════════════════════════════════

// Toast de advertencia inyectado directamente en la página
// No usa confirm() para no bloquear el hilo principal
function _showPasswordWarning(form, input, handleSubmit, secret) {
  // Evitar duplicados
  document.getElementById('cp-pwd-warn')?.remove();

  const warn = document.createElement('div');
  warn.id = 'cp-pwd-warn';
  warn.setAttribute('role', 'alert');
  warn.style.cssText = [
    'position:fixed', 'top:20px', 'right:20px', 'z-index:999998',
    'background:#fff', 'border:2px solid #ef4444', 'border-radius:14px',
    'padding:14px 18px', 'font-family:system-ui,sans-serif', 'font-size:14px',
    'box-shadow:0 4px 20px rgba(0,0,0,0.15)', 'max-width:290px', 'line-height:1.5',
    'animation:cyberpet-slideIn 0.3s ease',
  ].join(';');

  warn.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <span style="font-size:1.4rem">⚠️</span>
      <strong style="color:#ef4444">Contraseña Débil</strong>
    </div>
    <p style="color:#555;margin-bottom:12px;font-size:13px;">
      Esta contraseña es fácil de adivinar. ¿Deseas continuar de todas formas?
    </p>
    <div style="display:flex;gap:8px;">
      <button id="cp-warn-yes" style="flex:1;padding:8px;background:#ef4444;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px;">
        Continuar igual
      </button>
      <button id="cp-warn-no" style="flex:1;padding:8px;background:#f3f4f6;color:#374151;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px;">
        Cancelar
      </button>
    </div>
  `;

  document.body.appendChild(warn);

  const cleanup = () => warn.remove();

  warn.querySelector('#cp-warn-yes').addEventListener('click', () => {
    cleanup();
    // FIX C3: penalizar SOLO aquí, cuando el usuario acepta usar la contraseña débil
    chrome.runtime.sendMessage({ type: 'WEAK_PASSWORD_DETECTED', _secret: secret }).catch(() => {});
    window._cyberPet?.showDamageEffect();
    // Reenviar submit sin volver a activar nuestro listener
    form.removeEventListener('submit', handleSubmit);
    if (form.requestSubmit) form.requestSubmit();
    else form.submit();
  });

  warn.querySelector('#cp-warn-no').addEventListener('click', cleanup);

  // Auto-cierre si el usuario no interactúa
  setTimeout(cleanup, 9000);
}

function monitorPasswords() {
  // Seleccionar solo inputs NO marcados aún
  document.querySelectorAll('input[type="password"]:not([data-cp-mon])').forEach(input => {
    input.dataset.cpMon = '1';
    
    // FIX: Interceptar botones que no son tipo submit pero actúan como tales (SPAs)
    const parentForm = input.closest('form') || document.body;
    
    input.addEventListener('input',()=>{
      if(!config.passwordCheckEnabled){input.style.removeProperty('outline');input.style.removeProperty('box-shadow');return;}
      if(!input.value){input.style.removeProperty('outline');input.style.removeProperty('box-shadow');return;}
      const weak=_isWeakPassword(input.value),color=weak?'#ef4444':'#22c55e';
      input.style.outline='2px solid '+color;input.style.boxShadow='0 0 6px '+(weak?'rgba(239,68,68,0.3)':'rgba(34,197,94,0.3)');
    });
    const form=input.closest('form');
    const _doValidate=(e,sourceForm)=>{
      if(!config.passwordCheckEnabled)return;
      const pwd=input.value; if(!pwd)return;

      if (!_isWeakPassword(pwd)) {
        // Contraseña fuerte — premiar con monedas y puntos
        chrome.runtime.sendMessage({ type: 'STRONG_PASSWORD_DETECTED', _secret: _cpSecret }).catch(() => {});
        chrome.runtime.sendMessage({ type: 'GOOD_PRACTICE', _secret: _cpSecret, action: 'usar contraseña fuerte' }).catch(() => {});
        return;
      }

      // Contraseña débil — interceptar y mostrar advertencia
      if (e) e.preventDefault();
      // FIX C3: NO penalizar todavía. La penalización ocurre solo si el usuario
      // confirma "Continuar igual". Si cancela, no pierde vida.
      input.style.outline = '3px solid #ef4444';
      if (sourceForm) _showPasswordWarning(sourceForm, input, handleSubmit, _cpSecret);
    };

    const handleSubmit = e => _doValidate(e, form);

    // Listener para botones SPA
    const buttons = parentForm.querySelectorAll('button, input[type="button"], div[role="button"]');
    buttons.forEach(btn => {
       if (!btn.dataset.cpSbtn) {
         btn.dataset.cpSbtn = "1";
         btn.addEventListener('click', (e) => {
            if (input.value.length > 0) _doValidate(e, parentForm);
         }, true);
       }
    });

    // FIX: también interceptar clicks en botones submit cercanos
    // (Google Sign-up y SPAs usan botones fuera o con JS custom — no disparan form submit)
    setTimeout(() => {
      // Buscar botones submit visualmente próximos al input
      const root = form || document.body;
      root.querySelectorAll(
        'button[type="submit"]:not([data-cp-sbtn]), button:not([type]):not([data-cp-sbtn]), input[type="submit"]:not([data-cp-sbtn])'
      ).forEach(btn => {
        // Solo botones que comparten un ancestro cercano con el input
        let ancestor = input.parentElement;
        let found = false;
        for (let i = 0; i < 10 && ancestor; i++) {
          if (ancestor.contains(btn)) { found = true; break; }
          ancestor = ancestor.parentElement;
        }
        if (!found && root !== document.body) return;
        btn.dataset.cpSbtn = '1';
        btn.addEventListener('click', e => {
          _doValidate(e, form);
        }, true); // capture phase
      });
    }, 300);
  });
}

// ════════════════════════════════════════════════
//  PHISHING CHECK
// ════════════════════════════════════════════════

// ════════════════════════════════════════════════
//  B3 — PHISHING: ANÁLISIS DE TEXTO DE PÁGINA
//  Además de la URL (que analiza background.js),
//  el content script analiza el texto visible de
//  la página buscando patrones de ingeniería social.
//  Idea adaptada del artículo LSMT: NLP ligero,
//  sin librerías externas, sin servidor.
// ════════════════════════════════════════════════

// Frases de ingeniería social — español e inglés
// Ordenadas por peso (mayor = más sospechoso)
const _SOCIAL_PATTERNS = [
  // Urgencia y amenaza directa — peso alto
  { re:/su\s+cuenta\s+(ha\s+sido\s+|fue\s+)?(bloqueada|suspendida|comprometida|hackeada)/i, w:40, r:'Cuenta bloqueada/hackeada' },
  { re:/verif[ií]que?\s+su\s+(identidad|cuenta|datos?)\s+(ahora|inmediatamente|urgente)/i,  w:35, r:'Verificación urgente' },
  { re:/your\s+account\s+(has\s+been\s+)?(suspended|blocked|compromised|hacked)/i,           w:40, r:'Account suspended (EN)' },
  { re:/verify\s+your\s+(identity|account|details?)\s+(now|immediately|urgently)/i,           w:35, r:'Urgent verify (EN)' },

  // Premios y ganancias falsas — peso alto
  { re:/ha\s+(ganado?|sido\s+seleccionado)\s+(un\s+premio|un\s+regalo|\$|€)/i,               w:38, r:'Premio falso' },
  { re:/you\s+have\s+(won|been\s+selected)\s+(a\s+prize|a\s+gift|\$|€)/i,                    w:38, r:'Fake prize (EN)' },
  { re:/reclame?\s+(su\s+)?(premio|recompensa|regalo)\s+(ahora|hoy)/i,                       w:35, r:'Reclamar premio' },
  { re:/claim\s+(your\s+)?(prize|reward|gift)\s+(now|today)/i,                               w:35, r:'Claim prize (EN)' },

  // Solicitud de credenciales — peso muy alto
  { re:/ingrese?\s+(su\s+)?(contraseña|clave|pin|número\s+de\s+tarjeta)/i,                  w:45, r:'Solicitud de credenciales' },
  { re:/enter\s+(your\s+)?(password|pin|card\s+number|credit\s+card)/i,                     w:45, r:'Credential request (EN)' },
  { re:/confirme?\s+(sus?\s+)?(datos\s+bancarios?|información\s+de\s+pago|tarjeta)/i,       w:45, r:'Datos bancarios' },
  { re:/confirm\s+(your\s+)?(bank\s+details?|payment\s+info|card\s+details?)/i,             w:45, r:'Bank details (EN)' },

  // Tiempo limitado — peso medio
  { re:/oferta\s+(válida\s+)?(solo\s+)?por\s+(\d+\s+)?(hora|minuto|día)/i,                 w:20, r:'Oferta tiempo limitado' },
  { re:/limited\s+time\s+offer|offer\s+expires?\s+in/i,                                     w:20, r:'Limited time (EN)' },
  { re:/[úu]ltimas?\s+horas?|solo\s+quedan?\s+\d+/i,                                       w:18, r:'Últimas horas' },

  // Amenazas legales/policiales falsas — peso muy alto
  { re:/será\s+(arrestad|multa|denunciad|procesad)/i,                                       w:50, r:'Amenaza legal falsa' },
  { re:/you\s+will\s+be\s+(arrested|fined|prosecuted|reported\s+to)/i,                     w:50, r:'Fake legal threat (EN)' },
  { re:/(policía|interpol|fbi|hacendaria)\s+(ha\s+)?(detectado|bloqueado)/i,               w:50, r:'Autoridad falsa' },

  // Actualización/acción requerida urgente — peso medio
  { re:/actualiz(a|e|ación)\s+(requerida|obligatoria|inmediata)/i,                          w:25, r:'Actualización urgente' },
  { re:/action\s+required|update\s+(required|immediately|now)/i,                            w:25, r:'Action required (EN)' },
  { re:/haga\s+clic\s+(aquí|en\s+el\s+enlace)\s+(para\s+)?(evitar|confirmar|verificar)/i, w:30, r:'CTA sospechoso' },
  { re:/click\s+here\s+(to\s+)?(avoid|confirm|verify|prevent)/i,                           w:30, r:'Suspicious CTA (EN)' },
];

// Peso mínimo para disparar alerta de contenido (separado del umbral de URL)
const _PAGE_PHISH_THRESHOLD = 40;

// Garantizar que no se analiza la misma página más de una vez por sesión
// (el MutationObserver podría redispachar)
let _pageAnalyzed = false;

function checkPhishing() {
  // Paso 1: análisis de URL (background.js maneja la lógica pesada)
  chrome.runtime.sendMessage({
    type: 'CHECK_PHISHING',
    url:  window.location.href,
  }, res => {
    // Mostrar banner visual si la URL es sospechosa
    if (res?.suspicious && !document.getElementById('cp-phish-banner')) {
      _showPhishingBanner(res.analysis?.reasons ?? [], res.analysis?.riskLevel ?? 'medium');
    }
  });

  // Paso 2: análisis de texto de la página (B3 — NLP ligero local)
  // Diferimos 2s para dejar que la página termine de cargar su contenido dinámico
  if (!_pageAnalyzed) {
    _pageAnalyzed = true;
    setTimeout(_analyzePageContent, 2000);
  }
}

// Banner visual de phishing — se muestra en la página, no solo como notificación del sistema
function _showPhishingBanner(reasons, riskLevel) {
  // No mostrar en páginas de extensión
  if (window.location.protocol === 'chrome-extension:') return;
  // Evitar duplicados
  if (document.getElementById('cp-phish-banner')) return;

  const colors = {
    high:   { bg: '#fef2f2', border: '#ef4444', icon: '🔴', label: 'ALTO RIESGO' },
    medium: { bg: '#fffbeb', border: '#f59e0b', icon: '🟡', label: 'Sospechoso' },
    low:    { bg: '#f0fdf4', border: '#22c55e', icon: '🟢', label: 'Bajo riesgo' },
  };
  const c = colors[riskLevel] ?? colors.medium;

  const banner = document.createElement('div');
  banner.id = 'cp-phish-banner';
  banner.setAttribute('role', 'alert');
  banner.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:2147483647',
    `background:${c.bg}`, `border-bottom:3px solid ${c.border}`,
    'padding:10px 16px', 'font-family:system-ui,sans-serif', 'font-size:13px',
    'display:flex', 'align-items:center', 'gap:10px',
    'box-shadow:0 2px 12px rgba(0,0,0,0.15)',
    'animation:cyberpet-slideIn 0.3s ease',
  ].join(';');

  const reasonText = reasons.length
    ? reasons.slice(0, 2).join(' · ')
    : 'Posible sitio de phishing';

  banner.innerHTML = `
    <span style="font-size:1.3rem">${c.icon}</span>
    <div style="flex:1;line-height:1.4;">
      <strong style="color:${c.border};">⚠️ CyberPet: Sitio sospechoso (${c.label})</strong>
      <span style="color:#555;margin-left:8px;font-size:12px;">${reasonText}</span>
    </div>
    <button id="cp-phish-ok" style="padding:5px 12px;background:${c.border};color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;white-space:nowrap;">
      Entendido
    </button>
    <button id="cp-phish-close" style="padding:5px 8px;background:transparent;border:none;cursor:pointer;font-size:16px;color:#888;" aria-label="Cerrar">×</button>
  `;

  document.body.prepend(banner);
  // Empujar el contenido hacia abajo para que no tape nada
  document.body.style.marginTop = (banner.offsetHeight + 'px');

  const close = () => {
    banner.remove();
    document.body.style.marginTop = '';
  };
  banner.querySelector('#cp-phish-ok')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'PHISHING_ACKNOWLEDGED', url: window.location.href, _secret: _cpSecret });
    close();
  });
  banner.querySelector('#cp-phish-close')?.addEventListener('click', close);
  setTimeout(close, 15000); // auto-cierre 15s
}

function _analyzePageContent() {
  // Extraer texto visible — ignorar scripts, estilos y nuestros propios elementos
  const SKIP = new Set(['SCRIPT','STYLE','NOSCRIPT','HEAD','META','LINK']);
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const tag = node.parentElement?.tagName?.toUpperCase();
        if (SKIP.has(tag)) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.closest('#cyberpet-shimeji')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  // Concatenar hasta 8000 chars de texto visible — suficiente para detectar patrones
  // sin recorrer todo el DOM de páginas grandes
  let text = '';
  while (walker.nextNode() && text.length < 8000) {
    text += ' ' + walker.currentNode.nodeValue;
  }

  if (!text.trim()) return;

  // Analizar contra los patrones de ingeniería social
  let score = 0;
  const reasons = [];

  for (const { re, w, r } of _SOCIAL_PATTERNS) {
    if (re.test(text)) {
      score += w;
      reasons.push(r);
      if (score >= 100) break; // cap — no acumular infinitamente
    }
  }

  if (score < _PAGE_PHISH_THRESHOLD) return;

  // Umbral alcanzado — notificar al background
  // El background decide si ya procesó esta URL recientemente (deduplicación)
  chrome.runtime.sendMessage({
    type:    'ANALYZE_WITH_AI',   // reutiliza el handler existente para loggear + penalizar
    url:     window.location.href,
    text:    reasons.join('. '),  // enviamos las razones como "texto" para el log
  }).catch(() => {});

  // Efecto visual inmediato — no esperar al background
  _showPhishingBanner(reasons, score >= 80 ? 'high' : 'medium');
  window._cyberPet?.showDamageEffect();
}

// ════════════════════════════════════════════════
//  B4 — PASSWORD: usa utils/shared.js
//  _isWeakPassword ahora usa CyberPetUtils.COMMON_PASSWORDS
//  y CyberPetUtils.pwdScore() para análisis completo
// ════════════════════════════════════════════════

function _isWeakPassword(pw) {
  if (!pw || pw.length < 10) return true;

  // Usar lista compartida de contraseñas comunes
  const common = window.CyberPetUtils?.COMMON_PASSWORDS;
  if (common && common.has(pw.toLowerCase())) return true;

  // Patrones estructuralmente malos
  const badPatterns = [
    /^(123|abc|qwert|password|pass|1234|asdf|admin|user|login|iloveyou|welcome)/i,
    /^[a-zA-Z]+$/,       // solo letras
    /^\d+$/,             // solo números
    /^(.)\1{4,}/,        // mismo char repetido 5+
    /^[a-z]+\d{1,4}$/i, // palabra + 1-4 dígitos al final (nombre1234)
    /^[a-z]+[._-]\d+$/i, // nombre.año (ej: ana.1990)
  ];
  if (badPatterns.some(p => p.test(pw))) return true;

  // Usar score compartido si está disponible
  const score = window.CyberPetUtils?.pwdScore?.(pw);
  if (score !== undefined) return score < 50;

  // Fallback: requiere al menos 3 de 4 tipos de carácter
  const types = [/[A-Z]/, /[a-z]/, /\d/, /[^A-Za-z0-9]/];
  return types.filter(p => p.test(pw)).length < 3;
}

// ════════════════════════════════════════════════
//  MENSAJES DEL BACKGROUND
// ════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const pet = window._cyberPet;

  switch (msg.type) {
    case 'UPDATE_PET_STATE':
      pet?._setState(msg.state);
      break;

    case 'FORCE_UPDATE_SPRITE':
      if (pet) { pet.currentState = msg.state; pet._setState(msg.state); }
      break;

    case 'SHOW_PET':
      if (pet) pet.show();
      else     window._cyberPet = new ShimejiPet();
      break;

    case 'HIDE_PET':
      pet?.hide();
      break;

    case 'DAMAGE_EFFECT':
      pet?.showDamageEffect();
      break;

    case 'PET_DIED':
      pet?.handleDeath();
      break;

    case 'PET_REVIVED':
      pet?.revive();
      break;

    case 'CONFIG_UPDATED': {
      const { key, value } = msg;
      if (key in config) {
        config[key] = value;
        // Re-arrancar features si se habilitaron
        if (key === 'keywordCensorEnabled') {
          if (value) {
            censorContent();
          } else {
            // FIX M2: revertir censura del DOM al desactivar el toggle
            uncensorContent();
          }
        }
        if (key === 'passwordCheckEnabled'  && value) monitorPasswords();
        if (key === 'phishingDetectEnabled' && value) {
          _pageAnalyzed = false; // permitir re-análisis al reactivar
          checkPhishing();
        }
        if (key === 'petVisible') {
          if (value) {
            if (pet) pet.show();
            else window._cyberPet = new ShimejiPet();
          } else {
            pet?.hide();
          }
        }
        if (key === 'keywords') {
          // Keywords actualizadas desde el dashboard — invalidar caché y re-censurar
          _censorCacheKey = '';
          if (config.keywordCensorEnabled) censorContent();
        }
      }
      break;
    }

    default:
      break;
  }

  sendResponse({ ok: true });
  return true;
});

// ════════════════════════════════════════════════
//  ESTILOS DE ANIMACIÓN INYECTADOS
// ════════════════════════════════════════════════

(function injectStyles() {
  // Evitar doble inyección si el script corre varias veces (ej: SPA con navegación)
  if (document.getElementById('cyberpet-anim-styles')) return;

  const style = document.createElement('style');
  style.id    = 'cyberpet-anim-styles';
  style.textContent = `
    @keyframes cyberpet-shake {
      0%,100% { transform: translateX(0);  }
      25%      { transform: translateX(-10px); }
      75%      { transform: translateX(10px);  }
    }
    @keyframes cyberpet-fadeOut {
      from { opacity: 0.3; }
      to   { opacity: 0;   }
    }
    @keyframes cyberpet-slideIn {
      from { opacity: 0; transform: translateY(-10px); }
      to   { opacity: 1; transform: translateY(0);     }
    }
  `;
  (document.head || document.documentElement).appendChild(style);
})();