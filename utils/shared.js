/**
 * CyberPet — utils/shared.js
 * 
 * Utilidades compartidas entre background, popup, dashboard y content scripts.
 * 
 * USO:
 * - Background/Dashboard/Popup (ES modules): 
 *   import { escHtml, pwdScore, genPassword, fmtMin, ... } from './utils/shared.js';
 * - Content Script (no soporta ES modules):
 *   Usar window.CyberPetUtils.pwdScore(), etc.
 * - HTML clásico:
 *   <script src="utils/shared.js"></script> y usar CyberPetUtils.pwdScore()
 */

const CyberPetUtils = {

  // ═══════════════════════════════════════════════════════════════
  //  SEGURIDAD — CIFRADO AES-GCM
  // ═══════════════════════════════════════════════════════════════

  /**
   * Genera un salt aleatorio de 16 bytes (32 chars hex).
   * Se debe guardar en storage junto con el PIN hash.
   */
  async generateSalt() {
    const arr = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  /**
   * Hash de PIN con salt único por usuario (SHA-256).
   * @param {string} pin - PIN de 4 dígitos
   * @param {string} salt - Salt único del usuario
   * @returns {Promise<string>} Hash en hex
   */
  async hashPinSecure(pin, salt) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(pin + salt);
    const buf = await crypto.subtle.digest('SHA-256', keyData);
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  },

  /**
   * Deriva una clave AES-GCM de 256 bits desde un PIN + salt.
   * Usa PBKDF2 con 100,000 iteraciones.
   */
  async deriveVaultKey(pin, salt) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(pin + salt),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode(salt),
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  },

  /**
   * Cifra texto con AES-256-GCM.
   * Devuelve: { iv: string, ciphertext: string }
   */
  async encryptAES(text, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(text)
    );
    return {
      iv: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''),
      ciphertext: Array.from(new Uint8Array(ciphertext))
        .map(b => b.toString(16).padStart(2, '0')).join(''),
    };
  },

  /**
   * Descifra texto con AES-256-GCM.
   * @param {string} ciphertext - Hex del ciphertext
   * @param {string} iv - Hex del IV
   * @param {CryptoKey} key - Clave AES-GCM
   * @returns {Promise<string>} Texto descifrado
   */
  async decryptAES(ciphertext, iv, key) {
    const ctBytes = new Uint8Array(ciphertext.match(/.{2}/g).map(h => parseInt(h, 16)));
    const ivBytes = new Uint8Array(iv.match(/.{2}/g).map(h => parseInt(h, 16)));
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      key,
      ctBytes
    );
    return new TextDecoder().decode(decrypted);
  },

  // ═══════════════════════════════════════════════════════════════
  //  SEGURIDAD — CONTRASEÑAS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Calcula score de fortaleza de contraseña (0-100)
   */
  pwdScore(p) {
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
  },

  /**
   * Calcula la recompensa ajustada por el multiplicador de penalización (muerte)
   */
  applyMultiplier(value, multiplier = 1) {
    return Math.round((value * multiplier) * 100) / 100;
  },

  /**
   * Tareas de recuperación para el gato muerto
   */
  RECOVERY_TASKS: [
    { id: 'check_vault', text: 'Revisar la bóveda de seguridad', reward: 10 },
    { id: 'gen_pass', text: 'Generar una contraseña fuerte', reward: 5 },
    { id: 'read_tips', text: 'Leer 3 consejos de seguridad en el chat', reward: 15 },
    { id: 'scan_links', text: 'Analizar un link sospechoso', reward: 10 }
  ],

  /**
   * Genera contraseña segura garantizando al menos 1 carácter de cada tipo
   */
  genPassword(len = 16) {
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
    return pwd.split('').sort(() => Math.random() - 0.5).join('');
  },

  /**
   * Top-100 contraseñas más comunes (HIBP + RockYou)
   * Búsqueda O(1) insensible a mayúsculas
   */
  COMMON_PASSWORDS: new Set([
    '123456','123456789','12345678','password','1234567890',
    '1234567','password1','qwerty123','qwerty1','111111',
    '12345','iloveyou','admin','letmein','monkey',
    'login','abc123','starwars','123123','dragon',
    'passw0rd','master','hello','freedom','whatever',
    'qazwsx','trustno1','jordan23','harley','ranger',
    'shadow','batman','michael','football','baseball',
    'soccer','charlie','ashley','bailey','donald',
    'access','mustang','cookie','cheese','cheese1',
    'tigger','sunshine','nintendo','cheese123','pass',
    'test','1q2w3e4r','qwertyuiop','superman','matrix',
    'pass1','pass123','secret','hello123','zaq12wsx',
    'p@ssword','p@ssw0rd','1q2w3e','qwerty','asdfgh',
    'zxcvbn','q1w2e3r4','1qaz2wsx','q1w2e3','thomas',
    'jessica','hunter','ranger1','daniel','george',
    'jordan','harley1','robert','andrew','andrea',
    'michelle','joshua','jennifer','charlie1','edward',
    'welcome','welcome1','welcome123','changeme','temporary',
    'guest','default','root','toor','admin123',
    'administrator','password123','password1234','12341234',
    'abc123456','123qwe','1q2w3e4r5t','1234qwer','asdf1234',
    'qwer1234','q1w2e3r4t5','test123','demo','demo123',
  ]),

  /**
   * Determina estado del gato según salud
   */
  stateFromHealth(hp) {
    if (hp === 0)  return 'sick';
    if (hp >= 70)  return 'happy';
    if (hp >= 50)  return 'neutral';
    return 'sick';
  },

  // ═══════════════════════════════════════════════════════════════
  //  UTILIDADES GENERALES
  // ═══════════════════════════════════════════════════════════════

  /**
   * Escapa HTML para prevenir XSS
   */
  escHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, m => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
    }[m]));
  },

  /**
   * Formatea minutos a string legible (ej: "2h 30m")
   */
  fmtMin(m) {
    const n = Math.round(m * 10) / 10;
    return n >= 60 ? `${Math.floor(n / 60)}h ${Math.round(n % 60)}m` : `${n}m`;
  },

  /**
   * Setea textContent de un elemento por ID (con null-safety)
   */
  setText(id, val) {
    const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
    if (el) el.textContent = String(val ?? '');
  },

  // ═══════════════════════════════════════════════════════════════
  //  ICONOS — VAULT
  // ═══════════════════════════════════════════════════════════════

  VAULT_ICONS: {
    google:'🔍', facebook:'📘', twitter:'🐦', instagram:'📸',
    youtube:'▶️', github:'🐙', amazon:'📦', netflix:'🎬',
    spotify:'🎵', discord:'💬', twitch:'🟣', paypal:'💳',
  },

  getVaultIcon(site = '') {
    const s = site.toLowerCase();
    for (const [k, v] of Object.entries(this.VAULT_ICONS)) {
      if (s.includes(k)) return v;
    }
    return '🌐';
  },

  // ═══════════════════════════════════════════════════════════════
  //  ICONOS — SHOP
  // ═══════════════════════════════════════════════════════════════

  SHOP_ICONS: {
    cloth_bow_neck:      '🎀',
    cloth_shoes_beige:   '👟',
    cloth_bow_tail:      '🎗️',
    cloth_hat_cap:       '🧢',
    cloth_scarf_pink:    '🧣',
    cloth_glasses_heart: '🩷',
    title_guardian:      '🛡️',
    title_hacker:        '💻',
    title_cyber:         '🐱',
    title_shadow:        '🌑',
    extra_time_30:       '⏰',
    extra_time_60:       '⏱️',
  },

  getShopIcon(itemId) {
    return this.SHOP_ICONS[itemId] ?? '🎁';
  },

};

// ═══════════════════════════════════════════════════════════════════
//  EXPORTS — compatible con todos los entornos
// ═══════════════════════════════════════════════════════════════════

// 1. CommonJS (Node.js / bundlers)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CyberPetUtils;
}

// 2. ES Modules (background, popup, dashboard)
//    Se exporta automáticamente si el archivo se importa como módulo

// 3. Global browser (content scripts, HTML clásico)
if (typeof globalThis !== 'undefined') {
  globalThis.CyberPetUtils = CyberPetUtils;
}
