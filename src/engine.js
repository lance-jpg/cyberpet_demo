const KEY = 'cyberpet-demo-state';

export const DEMO_LIMIT_SECONDS = 90;
const initialState = {
  setupComplete: false,
  petName: '',
  userName: '',
  pronoun: 'el',
  health: 100,
  points: 120,
  coins: 180,
  threats: 0,
  pages: 0,
  keywords: 0,
  minutes: 0,
  family: false,
  familyPin: '2026',
  familyStarted: 0,
  timeOut: false,
  blocked: 0,
  equipped: null,
  activity: ['Sandbox listo: configura tu CyberPet'],
  keywordsList: ['gore', 'sangre', 'violencia', 'drogas', 'arma', 'xxx', 'porn'],
  vault: [{ site: 'demo-bank.demo', user: 'demo@cyberpet.test', password: 'Dummy-only-123!' }],
  badges: [],
  theme: 'blue',
  censored: true,
  demoOver: false,
};

const clone = value => JSON.parse(JSON.stringify(value));
let state;
try { state = { ...clone(initialState), ...JSON.parse(sessionStorage.getItem(KEY) || '{}') }; } catch { state = clone(initialState); }
if (!Array.isArray(state.keywordsList)) state.keywordsList = clone(initialState.keywordsList);
if (!Array.isArray(state.activity)) state.activity = clone(initialState.activity);

const listeners = new Set();
const save = () => { sessionStorage.setItem(KEY, JSON.stringify(state)); listeners.forEach(listener => listener(clone(state))); };
export const store = { get: () => clone(state), subscribe: listener => (listeners.add(listener), () => listeners.delete(listener)), patch: patch => { state = { ...state, ...patch }; save(); } };

export const chromeShim = {
  storage: {
    local: { get: async () => store.get(), set: async patch => store.patch(patch) },
    onChanged: { addListener: listener => store.subscribe(next => listener(next, 'local')) },
  },
  runtime: {
    getURL: path => `/assets/${path.replace(/^assets\//, '')}`,
    sendMessage: async message => handle(message),
    onMessage: { addListener: listener => store.subscribe(() => listener({ type: 'STATE_CHANGED', state: store.get() })) },
  },
};

const popular = ['paypal.com', 'google.com', 'amazon.com', 'microsoft.com', 'netflix.com'];
const keywordRules = [/\b(porn|xxx|gore|sangre|violencia|drugs|drogas|weapon|arma)\b/i, /casino|betting|apuestas|torrent/i];
const levenshtein = (left, right) => { const row = Array.from({ length: right.length + 1 }, (_, index) => index); for (let i = 1; i <= left.length; i += 1) { let previous = row[0]; row[0] = i; for (let j = 1; j <= right.length; j += 1) { const current = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1)); previous = current; } } return row[right.length]; };

export function analyzePhishing(raw) {
  let url; try { url = new URL(raw); } catch { return { score: 0, reasons: [], risk: 'low' }; }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const root = host.split('.').slice(-2).join('.');
  if (popular.includes(root)) return { score: 0, reasons: [], risk: 'low' };
  let score = url.protocol === 'http:' ? 15 : 0;
  const reasons = url.protocol === 'http:' ? ['Conexión sin cifrar (HTTP)'] : [];
  if (/login|signin|verify|account|payment|pago|banco/i.test(`${host}${url.pathname}`)) { score += 25; reasons.push('Ruta sensible de acceso o pago'); }
  const slug = host.split('.')[0].split('-')[0];
  for (const safe of popular) { const brand = safe.split('.')[0]; if (levenshtein(slug, brand) === 1) { score += 60; reasons.push(`Typosquatting: similar a ${safe}`); break; } }
  if (/secure|official|support|wallet|verify/i.test(host)) { score += 15; reasons.push('Dominio con lenguaje de suplantación'); }
  return { score: Math.min(score, 100), reasons, risk: score >= 65 ? 'high' : score >= 40 ? 'medium' : 'low' };
}

export function inspectPage(url, body = '') {
  const text = `${url} ${body}`;
  const phishing = analyzePhishing(url);
  const matched = state.keywordsList.find(keyword => new RegExp(keyword, 'i').test(text)) || keywordRules.find(rule => rule.test(text))?.source;
  if (state.family && (matched || /adult|casino|torrent|violence|apuestas/i.test(text))) return { action: 'block', reason: matched ? 'Palabra o categoría bloqueada por Family Mode' : 'Contenido bloqueado por Family Mode', phishing, keyword: matched || '' };
  if (phishing.risk !== 'low') return { action: 'warn', reason: phishing.reasons[0] || 'URL sospechosa', phishing, keyword: '' };
  return { action: 'allow', reason: '', phishing, keyword: '' };
}

const addActivity = message => [message, ...state.activity].slice(0, 10);
export function completeSetup(petName, userName, pronoun) { state = { ...state, setupComplete: true, petName: petName.trim() || 'Pixel', userName: userName.trim() || 'Visitante', pronoun, activity: ['👋 Configuración completada: el pet está listo', ...state.activity] }; save(); }
function unlockBadge(id) { if (state.badges.includes(id)) return; state.badges = [...state.badges, id]; }
export function visit(url, body = '') { const result = inspectPage(url, body); const patch = { pages: state.pages + 1, minutes: Math.round((state.minutes + 0.05) * 100) / 100 }; if (result.action !== 'allow') { patch.threats = state.threats + 1; patch.health = Math.max(0, state.health - 10); } if (result.action === 'block') { patch.blocked = state.blocked + 1; unlockBadge('family'); } if (result.keyword) { patch.keywords = state.keywords + 1; unlockBadge('keywords'); } if (result.phishing.risk !== 'low') unlockBadge('phishing'); if (result.action === 'allow') unlockBadge('first-safe'); patch.demoOver = Math.max(0, state.health - (result.action === 'allow' ? 0 : 10)) === 0; patch.activity = addActivity(`${result.action === 'allow' ? '✅' : result.action === 'warn' ? '⚠️' : '⛔'} ${new URL(url).hostname}: ${result.reason || 'navegación limpia'}`); state = { ...state, ...patch }; save(); return result; }
export function recordWeakPassword(password) { const weak = password.length < 10 || /^(123456|password|qwerty|demo|admin)/i.test(password); state = { ...state, health: weak ? Math.max(0, state.health - 10) : state.health, threats: weak ? state.threats + 1 : state.threats, demoOver: weak && state.health - 10 <= 0, activity: addActivity(weak ? '🔑 Contraseña débil detectada en formulario.demo' : '🔐 Contraseña fuerte detectada en formulario.demo') }; if (!weak) unlockBadge('password'); save(); return weak; }
export function toggleFamily(enabled) { state = { ...state, family: enabled, familyStarted: enabled ? Date.now() : 0, timeOut: false, activity: addActivity(enabled ? '🛡️ Family Mode activado' : '🔓 Family Mode desactivado') }; save(); }
export function checkFamilyPin(pin) { return String(pin) === String(state.familyPin); }
export function setFamilyPin(pin) { if (/^\d{4}$/.test(pin)) { state = { ...state, familyPin: pin }; save(); return true; } return false; }
export function setTheme(theme) { if (!['blue', 'pink', 'mint', 'night'].includes(theme)) return; state = { ...state, theme }; save(); }
export function setCensor(enabled) { state = { ...state, censored: enabled }; save(); }
export function updateFamilyClock() { if (!state.family || !state.familyStarted) return state; const elapsed = Math.floor((Date.now() - state.familyStarted) / 1000); if (elapsed >= DEMO_LIMIT_SECONDS && !state.timeOut) { state = { ...state, timeOut: true, family: false, activity: addActivity('⏰ Tiempo demo agotado: Family Mode pausado') }; save(); } return state; }
export function simulateTimeOut() { state = { ...state, timeOut: true, family: false, activity: addActivity('⏰ Time-out simulado: descanso recomendado') }; save(); }
export function revive() { if (state.points < 50) return false; state = { ...state, health: 65, points: state.points - 50, activity: addActivity('❤️ CyberPet revivido por 50 puntos') }; save(); return true; }
export function buy(item) { if (state.coins < item.price) return false; state = { ...state, coins: state.coins - item.price, equipped: item, activity: addActivity(`🛍️ Equipado: ${item.name}`) }; save(); return true; }
export function handle(message) { if (message?.type === 'GET_MSG_SECRET') return { secret: 'demo-session' }; return { state: store.get() }; }

export const catalog = [
  { id: 'hat', name: 'Gorra de guardián', price: 50, file: 'clothes/cloth_hat_cap.png' },
  { id: 'bow', name: 'Lazo verde', price: 30, file: 'clothes/cloth_bow_neck.png' },
  { id: 'shoes', name: 'Zapatitos beige', price: 35, file: 'clothes/cloth_shoes_beige.png' },
];
export const demoSites = [
  { host: 'noticias.demo', label: 'Página limpia', title: 'El mundo digital, explicado', body: 'Consejos para cuidar tu privacidad y tus cuentas.' },
  { host: 'paypa1-secure.demo', label: 'Alerta phishing', title: 'Verifica tu cuenta PayPal', body: 'Urgente: inicia sesión para evitar el bloqueo de tu cuenta.' },
  { host: 'formulario.demo', label: 'Password débil', title: 'Encuesta de seguridad', body: 'Prueba el formulario de credenciales dummy.' },
  { host: 'familia.demo', label: 'Keyword demo', title: 'Página con contenido sensible', body: 'Este sitio contiene casino, apuestas y palabras de prueba.' },
];
