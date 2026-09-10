// ════════════════════════════════════════════════
//  CYBERPET v4.1 — BACKGROUND SERVICE WORKER
// ════════════════════════════════════════════════

'use strict';

// Rotating session secret — content scripts must include this to send messages
let _msgSecret = null;
function getSecret() {
  if (!_msgSecret) _msgSecret = Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2);
  return _msgSecret;
}


// ── IMPORTAR UTILIDADES COMPARTIDAS ────────────────────────────────
importScripts('../utils/shared.js');
const { stateFromHealth } = globalThis.CyberPetUtils;
// ── CONSTANTES ────────────────────────────────────────────────────────────

function levenshteinDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}


const SHOP_CATALOG = Object.freeze([
  // ── Accesorios (ropa) ────────────────────────────────────────────
  // Los 4 que ya están dibujados + 2 pendientes marcados como coming soon
  { id:'cloth_bow_neck',    type:'cloth', slot:'neck',  name:'Lazo Verde',       price:30,  currency:'coins',  file:'cloth_bow_neck.png'    },
  { id:'cloth_shoes_beige', type:'cloth', slot:'feet',  name:'Zapatitos Beige',  price:35,  currency:'coins',  file:'cloth_shoes_beige.png' },
  { id:'cloth_bow_tail',    type:'cloth', slot:'tail',  name:'Lazo de Cola',     price:30,  currency:'coins',  file:'cloth_bow_tail.png'    },
  { id:'cloth_hat_cap',     type:'cloth', slot:'hat',   name:'Gorra',            price:50,  currency:'coins',  file:'cloth_hat_cap.png'     },
  { id:'cloth_scarf_pink',  type:'cloth', slot:'neck',  name:'Bufanda Rosa',     price:45,  currency:'coins',  file:'cloth_scarf_pink.png',  comingSoon:true },
  { id:'cloth_glasses_heart',type:'cloth',slot:'acc',   name:'Gafitas Corazón',  price:40,  currency:'coins',  file:'cloth_glasses_heart.png',comingSoon:true },

  // ── Títulos ──────────────────────────────────────────────────────
  { id:'title_guardian',    type:'title',               name:'Guardián Digital', price:150, currency:'points', text:'Guardián Digital' },
  { id:'title_hacker',      type:'title',               name:'Hacker Ético',     price:250, currency:'points', text:'Hacker Ético'     },
  { id:'title_cyber',       type:'title',               name:'CyberGato',        price:350, currency:'points', text:'CyberGato'        },
  { id:'title_shadow',      type:'title',               name:'Sombra Digital',   price:500, currency:'points', text:'Sombra Digital'   },

  // ── Tiempo extra (Family Mode) ───────────────────────────────────
  { id:'extra_time_30',     type:'extra_time',          name:'+30 min hoy',      price:35,  currency:'coins',  minutes:30 },
  { id:'extra_time_60',     type:'extra_time',          name:'+1 hora hoy',      price:60,  currency:'coins',  minutes:60 },
]);

// Dominios raíz que nunca se marcan como phishing
const SAFE_DOMAINS = new Set([
  'google.com','googleapis.com','gstatic.com',
  'youtube.com','youtu.be','ytimg.com',
  'facebook.com','instagram.com','twitter.com','x.com','t.co',
  'tiktok.com','tiktokv.com',
  'amazon.com','amazon.es','amazon.co.uk','amazon.com.mx','amazon.com.br',
  'apple.com','icloud.com',
  'microsoft.com','office.com','live.com','outlook.com','hotmail.com','msn.com',
  'paypal.com','paypalobjects.com',
  'netflix.com','nflxso.net',
  'spotify.com','scdn.co',
  'github.com','githubusercontent.com','gitlab.com',
  'reddit.com','redd.it','redditmedia.com','redditstatic.com',
  'wikipedia.org','wikimedia.org',
  'cloudflare.com',
  'twitch.tv','twitchapps.com',
  'discord.com','discordapp.com','discordcdn.com',
  'whatsapp.com','whatsapp.net',
  'linkedin.com','licdn.com',
]);

// Marcas que tienen dominios regionales legítimos (google.cl, amazon.com.ar, etc.)
// Se validan por prefijo de marca, no por TLD exacto.
const SAFE_BRAND_PREFIXES = [
  'google.', 'youtube.', 'amazon.', 'microsoft.', 'apple.',
  'netflix.', 'spotify.', 'facebook.', 'instagram.', 'twitter.',
  'linkedin.', 'wikipedia.', 'reddit.',
];

/**
 * Devuelve true si el hostname pertenece a una marca de confianza con dominio regional.
 * Ejemplos que pasan: google.cl, accounts.google.com.ar, amazon.com.mx
 * Ejemplos que NO pasan: google-login.cl, fakegoogle.com
 */
function isSafeBrandDomain(cleanHost) {
  return SAFE_BRAND_PREFIXES.some(prefix => {
    const brand = prefix.slice(0, -1); // "google." → "google"
    return (
      cleanHost === brand ||                      // exacto (raro, pero cubre)
      cleanHost.startsWith(prefix) ||             // "google.cl", "google.com.ar"
      cleanHost.includes('.' + brand + '.')       // "accounts.google.cl"
    );
  });
}

// ─── FAMILY CONTENT FILTER — listas de categorías bloqueadas ────────────────

/**
 * Dominios de contenido adulto / pornográfico.
 * Lista representativa — no exhaustiva, se complementa con análisis por keywords.
 */
const ADULT_DOMAINS = new Set([
  'pornhub.com','xvideos.com','xnxx.com','xhamster.com','redtube.com',
  'youporn.com','tube8.com','spankbang.com','beeg.com','tnaflix.com',
  'drtuber.com','sunporno.com','xtube.com','fuq.com','txxx.com',
  'hclips.com','porn.com','sex.com','brazzers.com','bangbros.com',
  'naughtyamerica.com','reality kings.com','mofos.com','babes.com',
  'playboy.com','penthouse.com','hustler.com',
  'onlyfans.com','fansly.com','manyvids.com',
  'rule34.xxx','rule34.paheal.net','e621.net','gelbooru.com','danbooru.donmai.us',
  'nhentai.net','hentaihaven.xxx','hanime.tv',
  // Cams
  'chaturbate.com','cam4.com','bongacams.com','stripchat.com','myfreecams.com',
  'livejasmin.com','camsoda.com',
]);

/**
 * Dominios de apuestas / gambling.
 */
const GAMBLING_DOMAINS = new Set([
  'bet365.com','williamhill.com','betway.com','888casino.com','pokerstars.com',
  'partypoker.com','fulltiltpoker.com','unibet.com','bwin.com','betfair.com',
  'casumo.com','leovegas.com','casinoroom.com','jackpotcity.com','royalvegas.com',
  'spinpalace.com','gaming-club.com','all-slots.com','zodiac-casino.com',
  'stake.com','rollbit.com','roobet.com','bc.game','1xbet.com','mostbet.com',
  'betano.com','sportingbet.com','codere.com','luckia.com','kirolbet.com',
  'pokerstars.es','888sport.com','betsson.com','nordicbet.com',
  // Loterías y raspaditos online
  'lottoland.com','wintrillions.com','lotterie.de',
]);

/**
 * Dominios / patrones de descarga masiva, torrents y warez.
 */
const DOWNLOAD_DOMAINS = new Set([
  'thepiratebay.org','piratebay.party','1337x.to','rarbg.to','nyaa.si',
  'kickasstorrents.cr','limetorrents.info','torrentz2.eu','zooqle.com',
  'torrentgalaxy.to','magnetdl.com','ettv.tv','yts.mx','eztv.re',
  // Warez / cracks
  'crackedpc.com','steamunlocked.net','oceansofgames.com','igg-games.com',
  'skidrowreloaded.com','fitgirl-repacks.site','dodi-repacks.site',
  'getintopc.com','softlay.net','filecr.com',
  // Mega descargas directas de software no oficial
  'softonic.com','cnet.com/downloads','download.com',
]);

/**
 * Dominios de contenido violento extremo.
 */
const VIOLENCE_DOMAINS = new Set([
  'liveleak.com','bestgore.com','goregrish.com','crazyshit.com',
  'kaotic.com','rotten.com','ogrish.com','documentingreality.com',
  'worldstarhiphop.com',
]);

// ─── Tablas de keywords por categoría con nivel de activación ────────────────
//
// Cada entrada define:
//   levels  — niveles donde esta categoría está activa ('low'|'medium'|'high')
//   scope   — qué parte de la URL se escanea según el nivel activo:
//               'host'      → solo hostname (usado como mínimo en todos los niveles)
//               'path'      → hostname + pathname
//               'full'      → hostname + pathname + querystring
//             El scope real en runtime se intersecta con el nivel:
//               low    → máximo 'host'
//               medium → máximo 'path'
//               high   → máximo 'full'
//   re      — RegExp que identifica la categoría en la cadena de texto

const FILTER_RULES = [
  // ── ADULTO (medio+alto) ──────────────────────────────────────────────────
  {
    category: 'adult',
    levels: ['medium', 'high'],
    scope: 'path',
    re: /\b(porn|xxx|hentai|sex(?:y|cam|tube|chat|video|shop|toy)?|nude|naked|erotic|nsfw|onlyfans|fansly|manyvids|cam(?:girl|boy|live|show|sex|4|soda)|strip(?:tease|per|club|chat)|escort|milf|teen[-_]?(?:porn|sex)|hardcore|fetish|bdsm|lesbian[-_]?porn|gay[-_]?porn|adult[-_]?(?:content|site|video|shop|chat)|cumshot|orgasm|masturbat|blowjob|handjob|anal[-_]?(?:sex|porn)|incest|voyeur|granny[-_]?porn|mature[-_]?porn|amateur[-_]?porn|creampie|gangbang|threesome|cam(?:4|soda|turbate)|stripchat|livejasmin|myfreecams|chaturbate)\b/i,
    reason: 'Contenido adulto detectado en la URL',
  },
  // ── GAMBLING (medio+alto) ────────────────────────────────────────────────
  {
    category: 'gambling',
    levels: ['medium', 'high'],
    scope: 'path',
    re: /\b(casino|poker|blackjack|roulette|slot[-_]?(?:machine|game|s)?|sports[-_]?bet(?:ting)?|online[-_]?bet(?:ting)?|gambling|bookie|bookmaker|wager|jackpot|free[-_]?spins|live[-_]?casino|bet365|betway|apuesta(?:s)?|ruleta|tragaperras|tragamonedas|maquina[-_]?tragaperras|juego[-_]?(?:azar|casino)|juegos[-_]?casino|ruleta[-_]?online|apuesta[-_]?deportiva)\b/i,
    reason: 'Apuestas o casino detectado en la URL',
  },
  // ── DESCARGAS / WAREZ (medio+alto) ──────────────────────────────────────
  {
    category: 'downloads',
    levels: ['medium', 'high'],
    scope: 'path',
    re: /\b(torrent|thepiratebay|piratebay|1337x|rarbg|nyaa|kickasstorrent|warez|crack(?:ed)?[-_]?(?:pc|software|game|s)|keygen|serial[-_]?key|nulled|skidrow|fitgirl[-_]?repacks?|igg[-_]?games?|steamunlocked|free[-_]?download[-_]?(?:crack|full)|full[-_]?version[-_]?free|repacks?[-_]?(?:site|games?)|dodi[-_]?repacks?)\b/i,
    reason: 'Descargas no autorizadas o piratería detectada en la URL',
  },
  // ── VIOLENCIA EXTREMA (todos los niveles) ────────────────────────────────
  {
    category: 'violence',
    levels: ['low', 'medium', 'high'],
    scope: 'path',
    re: /\b(gore|bestgore|goregrish|liveleak|kaotic|rotten\.com|beheading|decapitation|snuff|torture[-_]?video|mutilation|execution[-_]?video|murder[-_]?video|brutal[-_]?kill|death[-_]?video|real[-_]?gore|crazyshit|ogrish)\b/i,
    reason: 'Contenido de violencia extrema detectado en la URL',
  },
  // ── ARMAS (medio+alto) ───────────────────────────────────────────────────
  {
    category: 'weapons',
    levels: ['medium', 'high'],
    scope: 'path',
    re: /\b(gunshop|gun[-_]?(?:store|sale|shop|buy|dealer)|buy[-_]?guns?|firearms?[-_]?(?:store|sale|shop|buy)|ammo(?:nition)?[-_]?(?:store|shop|buy)|ak[-_]?47|ar[-_]?15|weapon(?:s)?[-_]?(?:store|buy|shop|sale)|explosiv(?:es?)?[-_]?(?:diy|how|buy|make)|bomb[-_]?(?:making|build|diy|how)|grenade[-_]?buy|silencer[-_]?(?:buy|shop|gun)|ghost[-_]?gun|untraceable[-_]?gun)\b/i,
    reason: 'Contenido relacionado con armas detectado en la URL',
  },
  // ── DROGAS ILEGALES (medio+alto) ─────────────────────────────────────────
  {
    category: 'drugs',
    levels: ['medium', 'high'],
    scope: 'full',
    re: /\b(buy[-_]?(?:cocaine|heroin|fentanyl|meth|lsd|mdma|cannabis|weed|crack|xanax[-_]?online)|drug[-_]?(?:deal|market|shop|buy|store)|darknet[-_]?market|onion[-_]?(?:market|drugs?)|narco[-_]?(?:shop|market|buy)|meth(?:amphetamine)?[-_]?(?:buy|shop)|cocaine[-_]?(?:buy|shop|online)|heroin[-_]?(?:buy|shop)|fentanyl[-_]?(?:buy|shop)|silk[-_]?road|alphabay|hydra[-_]?market)\b/i,
    reason: 'Contenido de drogas ilegales detectado en la URL',
  },
  // ── ODIO / EXTREMISMO (solo alto) ────────────────────────────────────────
  {
    category: 'hate',
    levels: ['high'],
    scope: 'path',
    re: /\b(neo[-_]?nazi|neonazi|white[-_]?supremac|kkk[-_]?(?:site|forum)|hate[-_]?speech[-_]?site|fascist[-_]?(?:content|forum)|jihadist|jihadi[-_]?(?:forum|recruit)|isis[-_]?(?:propaganda|recruit)|terrorist[-_]?(?:propaganda|recruit)|extremist[-_]?forum|racismo[-_]?foro|antisemit)\b/i,
    reason: 'Contenido de odio o extremismo detectado en la URL',
  },
  // ── VIOLENCIA MODERADA (solo alto) ───────────────────────────────────────
  {
    category: 'violence_moderate',
    levels: ['high'],
    scope: 'path',
    re: /\b(comprar[-_]?arma(?:s)?|buy[-_]?weapon|snuff[-_]?film|cartel[-_]?video|narco[-_]?video|drug[-_]?war[-_]?video|execution[-_]?footage)\b/i,
    reason: 'Contenido de violencia moderada detectado en la URL',
  },
];

/**
 * Nivel → profundidad de escaneo de URL.
 * low = solo host | medium = host+path | high = host+path+query
 */
const SCAN_DEPTH = { low: 1, medium: 2, high: 3 };
const RULE_SCOPE_DEPTH = { host: 1, path: 2, full: 3 };

/**
 * Devuelve la cadena de URL a escanear en función del nivel y el scope de la regla.
 */
function getScanTarget(cleanHost, pathname, fullPath, ruleScope, level) {
  const levelDepth = SCAN_DEPTH[level] ?? 2;
  const ruleDepth  = RULE_SCOPE_DEPTH[ruleScope] ?? 2;
  const depth      = Math.min(levelDepth, ruleDepth);
  if (depth === 1) return cleanHost;
  if (depth === 2) return cleanHost + pathname;
  return cleanHost + fullPath;
}

/**
 * Comprueba keywords personalizadas del apoderado contra la URL.
 * La profundidad de escaneo sigue las mismas reglas de nivel.
 */
function checkCustomKeywords(cleanHost, pathname, fullPath, keywords, level) {
  if (!keywords?.length) return { matched: false, keyword: '' };
  const levelDepth = SCAN_DEPTH[level] ?? 2;
  const target = levelDepth === 1
    ? cleanHost
    : levelDepth === 2
      ? cleanHost + pathname
      : cleanHost + fullPath;

  for (const kw of keywords) {
    if (!kw?.trim()) continue;
    const escaped = kw.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(escaped, 'i').test(target)) return { matched: true, keyword: kw.trim() };
  }
  return { matched: false, keyword: '' };
}

/**
 * Umbrales de phishing por nivel de filtro familiar.
 */
const FAMILY_PHISHING_THRESHOLD = { low: 65, medium: 40, high: 20 };

/**
 * Función central de filtrado familiar.
 * Orden de precedencia:
 *   0. Dominios bloqueados por el apoderado → block (antes que todo)
 *   1. Safe URLs del apoderado              → allow (excepto paso 0)
 *   2. Listas estáticas de dominios         → block según nivel
 *   3. Reglas FILTER_RULES (keywords en URL)→ block según nivel
 *   4. Keywords personalizadas del apoderado→ block
 *   5. Nivel alto: dominios no verificados  → warn
 *
 * @param {string} url
 * @param {object} familySettings
 * @returns {{ action: 'allow'|'warn'|'block', reason: string, category: string, keyword?: string }}
 */
function applyFamilyContentFilter(url, familySettings = {}) {
  const level          = familySettings.contentFilter     || 'medium';
  const safeUrls       = (familySettings.safeUrls         || []).map(s => s.toLowerCase().replace(/^www\./, ''));
  const blockedUrls    = (familySettings.blockedUrls       || []).map(s => s.toLowerCase().replace(/^www\./, ''));
  const customKeywords = (familySettings.blockedKeywords   || []).map(s => s.toLowerCase());

  let cleanHost = '', pathname = '', fullPath = '';
  try {
    const p = new URL(url);
    cleanHost = p.hostname.toLowerCase().replace(/^www\./, '');
    pathname  = p.pathname.toLowerCase();
    fullPath  = (p.pathname + p.search).toLowerCase();
  } catch {
    return { action: 'allow', reason: '', category: 'none' };
  }

  const parts      = cleanHost.split('.');
  const rootDomain = parts.length >= 2 ? parts.slice(-2).join('.') : cleanHost;

  // ── 0. Lista negra manual del apoderado (prioridad máxima) ───────────────
  if (blockedUrls.some(b => cleanHost === b || cleanHost.endsWith('.' + b) || rootDomain === b)) {
    return { action: 'block', reason: 'Sitio bloqueado por el apoderado', category: 'manual' };
  }

  // ── 1. Whitelist del apoderado — siempre permitir ─────────────────────────
  if (safeUrls.some(s => cleanHost === s || cleanHost.endsWith('.' + s) || rootDomain === s)) {
    return { action: 'allow', reason: '', category: 'none' };
  }

  // ── 2. Listas estáticas de dominios ──────────────────────────────────────
  if (level === 'medium' || level === 'high') {
    if (ADULT_DOMAINS.has(rootDomain) || ADULT_DOMAINS.has(cleanHost))
      return { action: 'block', reason: 'Sitio de contenido adulto', category: 'adult' };
    if (GAMBLING_DOMAINS.has(rootDomain) || GAMBLING_DOMAINS.has(cleanHost))
      return { action: 'block', reason: 'Sitio de apuestas / casino', category: 'gambling' };
    if (DOWNLOAD_DOMAINS.has(rootDomain) || DOWNLOAD_DOMAINS.has(cleanHost))
      return { action: 'block', reason: 'Sitio de descargas no autorizadas', category: 'downloads' };
  }
  if (VIOLENCE_DOMAINS.has(rootDomain) || VIOLENCE_DOMAINS.has(cleanHost))
    return { action: 'block', reason: 'Sitio de contenido violento extremo', category: 'violence' };

  // ── 3. Reglas de keywords en URL (FILTER_RULES) ───────────────────────────
  for (const rule of FILTER_RULES) {
    if (!rule.levels.includes(level)) continue;
    const target = getScanTarget(cleanHost, pathname, fullPath, rule.scope, level);
    if (rule.re.test(target)) {
      return { action: 'block', reason: rule.reason, category: rule.category };
    }
  }

  // ── 4. Keywords personalizadas del apoderado ──────────────────────────────
  const kwHit = checkCustomKeywords(cleanHost, pathname, fullPath, customKeywords, level);
  if (kwHit.matched) {
    return {
      action:   'block',
      reason:   `Palabra bloqueada detectada: "${kwHit.keyword}"`,
      category: 'custom_keyword',
      keyword:  kwHit.keyword,
    };
  }

  // ── 5. Nivel alto: dominios no verificados → advertencia ─────────────────
  if (level === 'high' && !SAFE_DOMAINS.has(rootDomain) && !isSafeBrandDomain(cleanHost)) {
    return { action: 'warn', reason: 'Dominio no verificado (modo de filtrado alto)', category: 'unverified' };
  }

  return { action: 'allow', reason: '', category: 'none' };
}

// ─── Constantes de deteccion avanzada de phishing (v4.3) ────────────────────

/**
 * Plataformas de hosting gratuito y servicios de tunnel frecuentemente
 * abusados para alojar paginas de phishing.
 */
const PHISHING_HOSTING_PLATFORMS = new Set([
  'netlify.app','github.io','gitlab.io','firebaseapp.com','web.app',
  'pages.dev','vercel.app','surge.sh','glitch.me','repl.co','replit.dev',
  'weebly.com','wixsite.com','webflow.io',
  '000webhostapp.com','byethost.com','infinityfree.net',
  'ngrok.io','ngrok-free.app','loca.lt','localtunnel.me','pagekite.me',
]);

/**
 * Rutas/segmentos que implican una accion sensible del usuario.
 * HTTP en estas rutas = alerta inmediata.
 */
const SENSITIVE_PATH_RE = /\/(login|log[_-]?in|signin|sign[_-]?in|logon|log-?on|auth(?:enticate|orize)?|account|password|passwd|credential|verify|validation|confirm|secure|banking|payment|checkout|billing|wallet|recovery|reset|update[_-]?info|customer[_-]?(?:center|service)|webscr|cmd=_login|mfa|2fa|otp|twofactor)/i;

/** Parametros de redirección — indican redirect phishing. */
const REDIRECT_PARAM_RE = /[?&](url|redirect|next|return|goto|target|link|continue|forward|dest(?:ination)?|redir|ref(?:er)?|callback|returnUrl|back)=/i;

/**
 * Entropia de Shannon de una cadena.
 * Valor > 3.5 en un subdominio indica caracteres aleatorios → bot/phishing.
 */
function domainEntropy(str) {
  if (!str || str.length < 6) return 0;
  const freq = {};
  for (const c of str) freq[c] = (freq[c] || 0) + 1;
  return -Object.values(freq).reduce((sum, f) => {
    const p = f / str.length;
    return sum + p * Math.log2(p);
  }, 0);
}

// Dominios populares para deteccion de typosquatting via Levenshtein.
// Cubre servicios globales, banca, cripto y servicios frecuentes en ES/LATAM.
const POPULAR_DOMAINS = new Set([
  // Busqueda y plataformas
  'google.com','youtube.com','facebook.com','wikipedia.org','reddit.com',
  'yahoo.com','bing.com','duckduckgo.com','baidu.com',
  // Compras y pagos
  'amazon.com','ebay.com','aliexpress.com','etsy.com','shopify.com',
  'mercadolibre.com','mercadopago.com',
  // Redes sociales y mensajeria
  'instagram.com','twitter.com','tiktok.com','linkedin.com','pinterest.com',
  'whatsapp.com','telegram.org','discord.com','snapchat.com','tumblr.com',
  // Tecnologia y desarrollo
  'microsoft.com','apple.com','github.com','gitlab.com','stackoverflow.com',
  'adobe.com','dropbox.com','notion.so','slack.com','zoom.us','canva.com',
  // Streaming y entretenimiento
  'netflix.com','spotify.com','twitch.tv','vimeo.com','soundcloud.com',
  'hbomax.com','disneyplus.com','primevideo.com',
  // Banca y finanzas (objetivos habituales de phishing)
  'paypal.com','santander.com','bbva.com','chase.com','wellsfargo.com',
  'bankofamerica.com','hsbc.com','ing.com','caixabank.es','openbank.es',
  'americanexpress.com','visa.com','mastercard.com',
  // Criptomonedas (sector muy atacado)
  'coinbase.com','binance.com','kraken.com','blockchain.com','metamask.io',
  'crypto.com','bybit.com','kucoin.com',
  // Correo y productividad
  'gmail.com','outlook.com','protonmail.com','icloud.com','office.com',
  // Gaming
  'steampowered.com','epicgames.com','roblox.com','ea.com','blizzard.com',
  // Noticias y otros comunes
  'cnn.com','bbc.com','nytimes.com','medium.com','wordpress.com',
]);

const PHISHING_PATTERNS = [
  // Marca conocida usada con separador (guion o punto) en dominio no oficial
  { re: /paypal[-.]|amazon[-.]|apple[-.]|google[-.]|microsoft[-.]|instagram[-.]|netflix[-.]|facebook[-.]|discord[-.]|binance[-.]|ebay[-.]|tiktok[-.]|coinbase[-.]|metamask[-.]|bancosantander[-.]|bbva[-.]|caixabank[-.]|banco[-.]|bank[-.]/i,
    weight: 40, reason: 'Marca conocida usada en dominio no oficial' },

  // Palabras clave trampa en dominio o path (ingenieria social)
  { re: /-secure|-verify|-update|-login|-account|-signin|-confirm|-validate|-recover|-billing|-payment|-support|-helpdesk|-service|-alert|-urgent|-suspension/i,
    weight: 25, reason: 'Palabras clave de ingenieria social en la URL' },

  // TLDs de alto riesgo — baratos, anonimos y usados masivamente en phishing
  { re: /[.](xyz|top|loan|click|gq|ml|cf|tk|pw|cc|icu|buzz|monster|fun|bid|win|racing|date|party|review|trade|men|rocks|store|online|site|space|tech|work|website|zip|mov|gdn|kim|country|cricket|science|faith|accountant|download|stream)$/i,
    weight: 35, reason: 'TLD de alto riesgo' },

  // Punycode / IDN homoglyph (ya cubierto tambien en analyzeURL directamente)
  { re: /xn--[a-z0-9-]+/i, weight: 40, reason: 'Punycode IDN — posible homoglyph spoofing' },

  // Sustitucion de caracteres clasica (0→o, 1→l, 3→e, 5→s, @→a)
  { re: /paypa[l1]|[gq]oogle|g00gle|g[o0][o0]gle|arnazon|am[a@]z[o0]n|micros[o0]ft|m1crosoft|faceb[o0][o0]k|netf[l1][il1]x|[s5]team|t[e3]l[e3]gram|disc[o0]rd|sp[o0]tify|tw1tter|[il1]nstagram|c[o0]inbase|b[il1]nance/i,
    weight: 55, reason: 'Sustitucion de caracteres (typosquatting clasico)' },

  // Subdominio sospechoso — palabras de accion usadas como subdominio
  { re: /^(login|signin|sign-in|secure|account|verify|update|confirm|recover|banking|payment|webscr|client|customers?|auth|mfa|2fa)[.]/i,
    weight: 30, reason: 'Subdominio con palabra de accion sensible' },

  // Steam especifico — muy atacado para robo de cuentas
  { re: /st[e3][a@]m(?:powered|community|games?|trade|store|gift|wallet)/i,
    weight: 50, reason: 'Suplantacion de Steam' },

  // Patrones de phishing de criptomonedas
  { re: /(?:crypto|wallet|token|nft|web3|defi|airdrop|claim|connect-wallet|metamask)[.-]/i,
    weight: 20, reason: 'Patron de phishing crypto/Web3' },

  // Sitios de test de seguridad conocidos
  { re: /testingmcafeesites[.]com|eicar[.]org/i, weight: 80, reason: 'Sitio de test de seguridad' },
];

// Rate limiting para good practice — tabId → timestamp (solo en memoria del SW)
const _goodPracticeCooldown = new Map();

// PIN del vault — solo en memoria, nunca en storage (FIX #8)
let _vaultSessionPin = null;

// ── MODO EDUCATIVO (PHISHING TEST) ──────────────────────────────────────────
const PHISHING_SAMPLES = [
  { url: 'https://paypa1-security.com/login', real: false, reason: 'Typosquatting (paypa1)' },
  { url: 'https://paypal.com/signin', real: true },
  { url: 'https://google-accounts-verify.net', real: false, reason: 'Dominio no oficial .net' },
  { url: 'https://accounts.google.com', real: true },
  { url: 'http://mybank-login.xyz', real: false, reason: 'Sin HTTPS y TLD sospechoso' },
  { url: 'https://amazon.es/orders', real: true },
  { url: 'https://xn--ggle-0nda.com/signin', real: false, reason: 'Punycode: intenta parecer Google' },
  { url: 'https://google-verify-account.top/update', real: false, reason: 'Dominio no oficial con urgencia de verificación' },
  { url: 'http://192.168.1.1/login/account/verify', real: false, reason: 'IP directa con ruta de credenciales' },
  { url: 'https://www.microsoft.com/security', real: true },
  { url: 'https://secure.verify.login.account.somedomain.com', real: false, reason: 'Exceso de subdominios y palabras trampa' },
  { url: 'https://www.testingmcafeesites.com/testcat_cs.html', real: false, reason: 'Sitio de prueba de seguridad' }
];

let _eduSession = {
  active: false,
  level: 'normal',
  currentStep: 0,
  hits: 0,
  questions: []
};

// ── INSTALACIÓN & ARRANQUE ─────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  // FIX #3: limpiar alarmas antes de recrearlas → evita duplicados en updates
  await chrome.alarms.clearAll();
  chrome.alarms.create('time-tick',    { periodInMinutes: 1 });
  chrome.alarms.create('health-regen', { periodInMinutes: 5 });
  chrome.alarms.create('daily-reset',  { when: nextMidnight(), periodInMinutes: 24 * 60 });

  if (reason === 'install') {
    chrome.notifications.create('install-notif', {
      type: 'basic', iconUrl: 'assets/sprites/happy.png',
      title: '¡CyberPet instalado! 🐱',
      message: '¡Hola! Soy tu nuevo compañero de seguridad digital.',
    });
  }
});

chrome.runtime.onStartup.addListener(startTimeTracking);

function defaultState() {
  return {
    petState: 'neutral', petHealth: 100,
    petName: '', userName: '', userPronoun: 'el',
    setupComplete: false,
    userPoints: 0, userCoins: 1000, threatsBlocked: 0,
    activities: [], threatHistory: [],
    keywords: [
      'gore','sangre','blood','violencia','violence',
      'suicide','suicidio','self-harm','drogas','drugs',
      'arma','gun','weapon','xxx','porn','porno',
    ],
    whitelist: [],
    notificationsEnabled: true, shimeijiEnabled: true,
    petVisible: true, petMovementEnabled: true,
    passwordCheckEnabled: true, keywordCensorEnabled: true,
    phishingDetectEnabled: true,
    // FIX #8: currentVaultPin eliminado del estado inicial — nunca va a storage
    vaultLocked: true, vaultPin: null, vaultSalt: null, passwordVault: [],
    // Sistema de recuperación de PIN (pregunta de seguridad)
    vaultRecoveryQuestion: null, vaultRecoveryAnswer: null,
    familyModeEnabled: false, familyPin: null,
    familyPinHash: null, familyPinSalt: null,
    familyRecoveryQuestion: null, familyRecoveryAnswerHash: null, familyRecoverySalt: null,
    familySettings: {
      maxDailyMinutes: 120, safeUrls: [], blockedUrls: [], blockedKeywords: [], contentFilter: 'medium',
      allowCoinPurchases: true, dailyUsage: 0,
      lastUsageDate: new Date().toDateString(),
      timeUpMessage: '¡Se acabó el tiempo de navegación por hoy! Descansa un poco 🐱',
    },
    dailyStats: {
      date: new Date().toDateString(),
      screenMinutes: 0, pagesVisited: 0, threatsSeen: 0, keywordsCensored: 0,
    },
    weeklyStats: [], streakStats: { currentStreak: 0, bestStreak: 0 },
    pageHistory: {},
    shopInventory: [], equippedCloth: null, equippedItem: null,
    // Multi-slot outfit (hat, neck, tail, feet, acc) — un item por slot
    equippedOutfit: { hat: null, neck: null, tail: null, feet: null, acc: null },
    userTitle: 'Novato Digital',
    trackingStart: null, lastActiveTick: null, timeLimitReached: false,
    groqEnabled: false, groqApiKey: null,
    themeColor: 'blue',
    blockedSites: [],
  };
}

// ── SCREEN TIME ────────────────────────────────────────────────────────────

async function startTimeTracking() {
  const today = new Date().toDateString();
  const { trackingStart, dailyStats = {} } =
    await chrome.storage.local.get(['trackingStart', 'dailyStats']);

  if (dailyStats.date && dailyStats.date !== today) {
    await archiveDayAndReset();
    return;
  }
  // FIX: Si trackingStart es de un día anterior o de hace más de 16h (service worker reiniciado),
  // descartarlo y empezar desde ahora para evitar acumulación falsa.
  const MAX_SESSION_MS = 16 * 60 * 60 * 1000; // 16 horas
  if (trackingStart && (Date.now() - trackingStart) > MAX_SESSION_MS) {
    await flushScreenTime();
    await chrome.storage.local.set({ trackingStart: Date.now(), lastActiveTick: Date.now() });
    return;
  }
  if (!trackingStart) {
    await chrome.storage.local.set({ trackingStart: Date.now(), lastActiveTick: Date.now() });
  }
}

// Cache en memoria del tiempo ya contabilizado para evitar doble conteo
let _flushing = false;
 
async function flushScreenTime() {
  if (_flushing) return;
  _flushing = true;
  try {
    const { trackingStart, lastActiveTick, dailyStats, familyModeEnabled } =
      await chrome.storage.local.get(['trackingStart', 'lastActiveTick', 'dailyStats', 'familyModeEnabled']);
 
    if (!trackingStart || typeof trackingStart !== 'number' || isNaN(trackingStart)) return;
 
    const now = Date.now();
    const today = new Date().toDateString();
    const lastTick = typeof lastActiveTick === 'number' ? lastActiveTick : trackingStart;
    const elapsedMs = now - lastTick;
 
    if (elapsedMs > 2.5 * 60 * 1000) {
      await chrome.storage.local.set({ trackingStart: now, lastActiveTick: now });
      return;
    }
 
    const elapsed = elapsedMs / 60000;
    if (elapsed < 0.1) return;
 
    const base = (dailyStats?.date === today)
      ? { ...dailyStats }
      : { date: today, screenMinutes: 0, pagesVisited: 0, threatsSeen: 0, keywordsCensored: 0 };
 
    const newTotal = Math.round(((base.screenMinutes || 0) + elapsed) * 10) / 10;
 
    if (newTotal > (base.screenMinutes || 0)) {
      base.screenMinutes = newTotal;
      await chrome.storage.local.set({ dailyStats: base, trackingStart: now, lastActiveTick: now });
      if (familyModeEnabled) await checkAndEnforceTimeLimit(base.screenMinutes);
    }
  } finally {
    _flushing = false;
  }

  // Al final de flushScreenTime(), antes del finally:
// Recompensar cada 30 minutos de navegación limpia
const { dailyStats, threatsBlocked, lastRewardMinute = 0 } =
  await chrome.storage.local.get(['dailyStats', 'threatsBlocked', 'lastRewardMinute']);

const currentMinutes = Math.floor(dailyStats?.screenMinutes ?? 0);
const rewardInterval = 30; // cada 30 minutos
const minutesMark = Math.floor(currentMinutes / rewardInterval) * rewardInterval;

if (minutesMark > 0 && minutesMark > lastRewardMinute) {
  // Solo recompensar si no hubo amenazas en la sesión actual
  if ((dailyStats?.threatsSeen ?? 0) === 0) {
    const { userPoints = 0, userCoins = 0 } = await chrome.storage.local.get(['userPoints', 'userCoins']);
    await chrome.storage.local.set({
      userPoints: Math.round((userPoints + 5) * 100) / 100,
      userCoins: userCoins + 2,
      lastRewardMinute: minutesMark,
    });
    await logActivity('⏱️ +5 pts por 30 min de navegación segura');
  }
}

}

async function stopTimeTracking() {
  await flushScreenTime();
  await chrome.storage.local.remove('trackingStart');
}

chrome.windows.onFocusChanged.addListener(async windowId => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) await stopTimeTracking();
  else await startTimeTracking();
});

chrome.tabs.onActivated.addListener(async () => {
  const { trackingStart } = await chrome.storage.local.get('trackingStart');
  if (!trackingStart) await startTimeTracking();
});

chrome.webNavigation.onCompleted.addListener(async ({ frameId, url }) => {
  if (frameId !== 0) return;
  await flushScreenTime();
  try {
    const today = new Date().toDateString();
    const { dailyStats = {}, pageHistory = {} } =
      await chrome.storage.local.get(['dailyStats', 'pageHistory']);
    if (dailyStats.date !== today) return;

    const host         = new URL(url).hostname.replace(/^www\./, '');
    const updatedStats = { ...dailyStats, pagesVisited: (dailyStats.pagesVisited || 0) + 1 };
    pageHistory[host]  = (pageHistory[host] || 0) + 1;

    const trimmed = Object.fromEntries(
      Object.entries(pageHistory).sort((a, b) => b[1] - a[1]).slice(0, 50)
    );
    await chrome.storage.local.set({ dailyStats: updatedStats, pageHistory: trimmed });
  } catch {}
}, { url: [{ schemes: ['http', 'https'] }] });

chrome.webNavigation.onBeforeNavigate.addListener(async ({ frameId, url, tabId }) => {
  if (frameId !== 0 || !isBlockable(url)) return;
  const {
    phishingDetectEnabled = true, whitelist = [],
    familyModeEnabled = false, familySettings = {}
  } = await chrome.storage.local.get(['phishingDetectEnabled', 'whitelist', 'familyModeEnabled', 'familySettings']);

  // ── Family content filter ──────────────────────────────────────────────
  if (familyModeEnabled) {
    const filterResult = applyFamilyContentFilter(url, familySettings);
    if (filterResult.action === 'block') {
      handleFamilyBlock(url, filterResult, tabId).catch(() => {});
      return;
    }
  }

  if (!phishingDetectEnabled) return;

  const threshold = familyModeEnabled
    ? (FAMILY_PHISHING_THRESHOLD[familySettings.contentFilter] ?? 40)
    : 40;

  const analysis = analyzeURL(url, whitelist, threshold);
  if (analysis.suspicious) handlePhishing(url, analysis).catch(() => {});
}, { url: [{ schemes: ['http', 'https'] }] });

chrome.webNavigation.onErrorOccurred.addListener(async ({ frameId, url, error }) => {
  if (frameId !== 0 || !isBlockable(url)) return;
  if (!/ERR_NAME_NOT_RESOLVED|DNS|NXDOMAIN/i.test(String(error))) return;
  const { phishingDetectEnabled = true, whitelist = [] } =
    await chrome.storage.local.get(['phishingDetectEnabled', 'whitelist']);
  if (!phishingDetectEnabled) return;
  const analysis = analyzeURL(url, whitelist);
  if (!analysis.suspicious) return;
  await logActivity(`DNS no resolvió sitio sospechoso: ${new URL(url).hostname}`, url);
  await sendNotification('Sitio sospechoso no resolvió', analysis.reasons?.[0] || 'Dominio riesgoso', 'sick');
}, { url: [{ schemes: ['http', 'https'] }] });

// ── FAMILY MODE ────────────────────────────────────────────────────────────

async function checkAndEnforceTimeLimit(minutes) {
  const { familySettings = {}, timeLimitReached } =
    await chrome.storage.local.get(['familySettings', 'timeLimitReached']);
 
  const base = familySettings.maxDailyMinutes || 0;
  const bonus = familySettings.bonusMinutesToday || 0;
  const max = base + bonus;
 
  if (max === 0 || timeLimitReached) return;
  if (minutes < max) return;
 
  await chrome.storage.local.set({ timeLimitReached: true });
 
  const safeUrls   = (familySettings.safeUrls || []).map(s => s.toLowerCase());
  const timeOutUrl = chrome.runtime.getURL('time-out.html');
  const tabs       = await chrome.tabs.query({});
 
  for (const tab of tabs) {
    if (!isBlockable(tab.url)) continue;
    if (safeUrls.some(s => tab.url.toLowerCase().includes(s))) continue;
    chrome.tabs.update(tab.id, { url: timeOutUrl });
  }
 
  await sendNotification(
    '⏰ Tiempo de pantalla agotado',
    familySettings.timeUpMessage || '¡Se acabó el tiempo! 🐱',
    'sick'
  );
}

chrome.tabs.onUpdated.addListener(async (tabId, { status }, tab) => {
  if (status !== 'loading' || !isBlockable(tab.url)) return;
 
  const { familyModeEnabled, timeLimitReached, familySettings = {}, dailyStats = {} } =
    await chrome.storage.local.get(['familyModeEnabled', 'timeLimitReached', 'familySettings', 'dailyStats']);
 
  if (!familyModeEnabled) return;

  // ── Family content filter (bloqueo proactivo por categoría) ─────────────
  const filterResult = applyFamilyContentFilter(tab.url, familySettings);
  if (filterResult.action === 'block') {
    handleFamilyBlock(tab.url, filterResult, tabId).catch(() => {});
    return;
  }
 
  // Re-verificar si el tiempo actual ya supera el límite (incluye bonus)
  if (!timeLimitReached) {
    const base  = familySettings.maxDailyMinutes || 0;
    const bonus = familySettings.bonusMinutesToday || 0;
    const max   = base + bonus;
    const used  = dailyStats.screenMinutes || 0;
    if (max === 0 || used < max) return;
    // Tiempo superado pero flag no seteado aún — setear y continuar
    await chrome.storage.local.set({ timeLimitReached: true });
  }
 
  const safeUrls = (familySettings.safeUrls || []).map(s => s.toLowerCase());
  if (safeUrls.some(s => tab.url.toLowerCase().includes(s))) return;
 
  const timeOutUrl = chrome.runtime.getURL('time-out.html');
  if (!tab.url.startsWith(timeOutUrl)) {
    chrome.tabs.update(tabId, { url: timeOutUrl });
  }
});


// ── ALARMAS ────────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async ({ name }) => {
  if (name === 'time-tick')    await flushScreenTime();
  if (name === 'health-regen') await regenHealth();
  if (name === 'daily-reset')  await archiveDayAndReset();
});

async function regenHealth() {
  const { petHealth = 100 } = await chrome.storage.local.get('petHealth');
  if (petHealth >= 100 || petHealth === 0) return;
  const hp    = Math.min(100, petHealth + 2);
  const state = stateFromHealth(hp);
  await chrome.storage.local.set({ petHealth: hp, petState: state });
  notifyHttpTabs('UPDATE_PET_STATE', { state });
}

async function archiveDayAndReset() {
  const today = new Date().toDateString();
  const { dailyStats = {}, weeklyStats = [], streakStats = {}, familySettings = {} } =
    await chrome.storage.local.get(['dailyStats', 'weeklyStats', 'streakStats', 'familySettings']);

  if (dailyStats.date && dailyStats.date !== today) {
    weeklyStats.push({ ...dailyStats });
    if (weeklyStats.length > 7) weeklyStats.shift();

    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (dailyStats.date === yesterday && (dailyStats.pagesVisited || 0) > 0) {
      streakStats.currentStreak = (streakStats.currentStreak || 0) + 1;
      streakStats.bestStreak    = Math.max(streakStats.bestStreak || 0, streakStats.currentStreak);
    } else {
      streakStats.currentStreak = 0;
    }
  }

  await chrome.storage.local.set({
    dailyStats:  { date: today, screenMinutes: 0, pagesVisited: 0, threatsSeen: 0, keywordsCensored: 0 },
    weeklyStats,
    streakStats,
    timeLimitReached: false,
    trackingStart:    null,
    // FIX #18: resetear dailyUsage dentro de familySettings también
    familySettings: { ...familySettings, dailyUsage: 0, lastUsageDate: today, bonusMinutesToday: 0 },
  });

  // Bonus de día limpio — si no hubo amenazas
if ((dailyStats?.threatsSeen ?? 0) === 0 && (dailyStats?.pagesVisited ?? 0) > 5) {
  const { userPoints = 0, userCoins = 0 } = await chrome.storage.local.get(['userPoints', 'userCoins']);
  await chrome.storage.local.set({
    userPoints: Math.round((userPoints + 15) * 100) / 100,
    userCoins: userCoins + 10,
  });
  await logActivity('🌟 +15 pts por día de navegación limpia!');
}
// Resetear el marcador de minutos recompensados
await chrome.storage.local.set({ lastRewardMinute: 0 });

}

// ── ROUTER DE MENSAJES ─────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') {
    if (sendResponse) sendResponse({ error: 'Invalid message' });
    return false;
  }

  (async () => {
    try {
      // Validate secret on sensitive messages (not GET_STATE which popup uses too)
      const SENSITIVE=['WEAK_PASSWORD_DETECTED','STRONG_PASSWORD_DETECTED','GOOD_PRACTICE','BAD_KEYWORD_DETECTED','PHISHING_ACKNOWLEDGED','REDUCE_HEALTH'];
      if (sender.tab && SENSITIVE.includes(msg.type) && msg._secret !== getSecret()) {
        sendResponse({error:'invalid secret'}); return true;
      }

      switch (msg.type) {

        case 'GET_STATE': {
          await flushScreenTime();
          const data = await chrome.storage.local.get([
            'petState','petHealth','userPoints','userCoins','threatsBlocked',
            'dailyStats','weeklyStats','pageHistory','petName','userName',
            'userTitle','timeLimitReached','familyModeEnabled','familySettings',
            'streakStats','activities','themeColor','shopInventory','equippedCloth','equippedItem','equippedOutfit','rewardMult',
          ]);
          sendResponse(data);
          break;
        }

        case 'GET_SCREEN_TIME': {
          await flushScreenTime();
          const { dailyStats = {} } = await chrome.storage.local.get('dailyStats');
          sendResponse({ minutes: dailyStats.screenMinutes || 0 });
          break;
        }

        case 'CHECK_PHISHING': {
          const { phishingDetectEnabled = true, whitelist = [], familyModeEnabled = false, familySettings = {} } =
            await chrome.storage.local.get(['phishingDetectEnabled', 'whitelist', 'familyModeEnabled', 'familySettings']);

          if (!phishingDetectEnabled) { sendResponse({ suspicious: false }); break; }

          // ── Family content filter (CHECK_PHISHING también actúa como hook para content.js)
          if (familyModeEnabled) {
            const filterResult = applyFamilyContentFilter(msg.url, familySettings);
            if (filterResult.action === 'block' || filterResult.action === 'warn') {
              sendResponse({
                suspicious: true,
                familyBlock: true,
                filterResult,
                analysis: { reasons: [filterResult.reason], riskLevel: 'high', score: 100 }
              });
              if (filterResult.action === 'block') {
                handleFamilyBlock(msg.url, filterResult).catch(() => {});
              }
              break;
            }
          }

          // Umbral dinámico según nivel de filtro familiar
          const threshold = familyModeEnabled
            ? (FAMILY_PHISHING_THRESHOLD[familySettings.contentFilter] ?? 40)
            : 40;

          const analysis = analyzeURL(msg.url, whitelist, threshold);

          // FIX #1: sendResponse SIEMPRE se llama antes de cualquier await posterior
          sendResponse({ suspicious: analysis.suspicious, analysis });

          // El procesamiento pesado ocurre después, sin bloquear el content script
          if (analysis.suspicious) handlePhishing(msg.url, analysis).catch(() => {});
          break;
        }

        // content.js manda este type cuando detecta phishing por patrones de texto (sin IA externa).
        // Históricamente este handler existía para Groq; ahora lo tratamos como "detección local".
        case 'ANALYZE_WITH_AI': {
          // Responder inmediato para no bloquear el content script.
          if (sendResponse) sendResponse({ ok: true });

          // Penalt y registro se hacen async.
          (async () => {
            const url = msg.url;
            const reasonsText = typeof msg.text === 'string' ? msg.text : '';
            if (!url) return;

            // Si phishing está desactivado, no hacemos nada.
            const { phishingDetectEnabled = true } = await chrome.storage.local.get('phishingDetectEnabled');
            if (!phishingDetectEnabled) return;

            // Convertir razones en array para que encaje con el modelo de handlePhishing.
            const reasons = reasonsText
              ? reasonsText.split('.').map(s => s.trim()).filter(Boolean)
              : ['Patrones de ingeniería social detectados'];

            // Reutilizar lógica existente de penalización + logging + notificación.
            await handlePhishing(url, { reasons, riskLevel: 'medium' });
          })().catch(() => {});
          break;
        }

        case 'PHISHING_ACKNOWLEDGED':
          await handlePhishingPenalty(10);
          checkBadgeProgress('phishing_clicked').catch(() => {});
          await logActivity('Phishing: usuario confirmó alerta y recibió penalización', msg.url || sender.tab?.url);
          sendResponse({ ok: true });
          break;

        case 'REDUCE_HEALTH':
          await handlePhishingPenalty(Number(msg.amount) || 5);
          sendResponse({ ok: true });
          break;

        case 'WEAK_PASSWORD_DETECTED':
          await handleWeakPassword(sender.tab?.url);
          checkBadgeProgress('weak_password').catch(() => {});
          sendResponse({ warned: true });
          break;

        case 'STRONG_PASSWORD_DETECTED':
          await handleStrongPassword(sender.tab?.url, sender.tab?.id);
          sendResponse({ rewarded: true });
          break;

        case 'EDU_START':
          _eduSession = {
            active: true,
            level: msg.level || 'normal',
            currentStep: 0,
            hits: 0,
            questions: PHISHING_SAMPLES.slice().sort(() => 0.5 - Math.random()).slice(0, 5),
          };
          sendResponse({ ok: true, question: _eduSession.questions[0], step: 1, total: 5 });
          break;

        case 'EDU_ANSWER': {
          if (!_eduSession.active) { sendResponse({ ok: false, error: 'No hay test activo' }); break; }
          const q = _eduSession.questions[_eduSession.currentStep];
          const correct = !!msg.real === !!q.real;
          if (correct) _eduSession.hits += 1;
          _eduSession.currentStep += 1;
          const done = _eduSession.currentStep >= _eduSession.questions.length;
          const result = done ? await finishEduSession() : null;
          sendResponse({
            ok: true,
            correct,
            explanation: q.real ? 'Es una URL legítima del servicio oficial.' : q.reason,
            done,
            result,
            question: done ? null : _eduSession.questions[_eduSession.currentStep],
            step: Math.min(_eduSession.currentStep + 1, _eduSession.questions.length),
            total: _eduSession.questions.length,
          });
          break;
        }

        case 'EDU_FINISH':
          sendResponse({ ok: true, result: await finishEduSession() });
          break;

        case 'GOOD_PRACTICE':
          await handleGoodPractice(msg.action, sender.tab?.url, sender.tab?.id);
          sendResponse({ rewarded: true });
          break;

        case 'BAD_KEYWORD_DETECTED':
          // FIX #1 pattern: responder de inmediato, luego hacer trabajo async
          sendResponse({ ok: true });
          incrementDailyStat('keywordsCensored').catch(() => {});
          checkBadgeProgress('keyword_censored').catch(() => {});
          logActivity(`🔤 Censurado: "${msg.keyword}"`, sender.tab?.url).catch(() => {});
          break;

        case 'EXPORT_STATE': {
          const blob=await exportState(msg.password);
          sendResponse({ok:true,data:blob});
          break;
        }
        case 'IMPORT_STATE': {
          const result=await importState(msg.data,msg.password);
          sendResponse(result);
          break;
        }

        case 'GET_MSG_SECRET':
          sendResponse({ secret: getSecret() });
          break;

        case 'REVIVE_PET':
          await revivePet();
          sendResponse({ revived: true });
          break;

        // FIX #6: case SHOW_NOTIFICATION que faltaba
        case 'SHOW_NOTIFICATION':
          await sendNotification(msg.title || '🐱 CyberPet', msg.message || '', msg.sprite || 'neutral');
          sendResponse({ ok: true });
          break;

        case 'OPEN_DASHBOARD':
          chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
          sendResponse({ opened: true });
          break;

        case 'VAULT_UNLOCK':
          sendResponse({ unlocked: await unlockVault(msg.pin) });
          break;

        case 'VAULT_LOCK':
          _vaultSessionPin = null; // limpiar de memoria
          await chrome.storage.local.set({ vaultLocked: true });
          sendResponse({ locked: true });
          break;

        case 'VAULT_SAVE':
          await saveVaultEntry(msg.entry);
          sendResponse({ saved: true });
          break;

        case 'VAULT_DELETE':
          await deleteVaultEntry(msg.id);
          sendResponse({ deleted: true });
          break;

        case 'VAULT_GET':
          sendResponse({ vault: await getVault() });
          break;

        case 'VAULT_HAS_RECOVERY': {
          const { vaultRecoveryQuestion } = await chrome.storage.local.get('vaultRecoveryQuestion');
          sendResponse({ hasRecovery: !!vaultRecoveryQuestion });
          break;
        }

        case 'VAULT_SET_RECOVERY': {
          const { question, answer } = msg;
          if (!question && !answer) {
            await chrome.storage.local.set({
              vaultRecoveryQuestion: null,
              vaultRecoveryAnswer: null,
            });
            sendResponse({ ok: true });
            break;
          }
          if (!question || !answer) {
            sendResponse({ ok: false, error: 'Pregunta y respuesta requeridas' });
            break;
          }
          // Guardar respuesta hasheada (no en texto plano)
          const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(answer.toLowerCase().trim()));
          const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
          await chrome.storage.local.set({
            vaultRecoveryQuestion: question,
            vaultRecoveryAnswer: hash,
          });
          sendResponse({ ok: true });
          break;
        }

        case 'VAULT_RECOVER_PIN': {
          const { answer } = msg;
          const { vaultRecoveryAnswer, vaultPin, vaultSalt } = await chrome.storage.local.get(['vaultRecoveryAnswer', 'vaultPin', 'vaultSalt']);
          if (!vaultRecoveryAnswer || !vaultPin) {
            sendResponse({ ok: false, error: 'No hay recuperación configurada' });
            break;
          }
          const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(answer.toLowerCase().trim()));
          const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
          if (hash === vaultRecoveryAnswer) {
            // Resetear vault (las contraseñas antiguas se pierden porque no podemos descifrarlas sin el PIN original)
            await chrome.storage.local.set({
              vaultLocked: true,
              vaultPin: null,
              vaultSalt: null,
              passwordVault: [],
            });
            sendResponse({ ok: true, message: 'PIN reseteado. Las contraseñas antiguas se han perdido por seguridad.' });
          } else {
            sendResponse({ ok: false, error: 'Respuesta incorrecta' });
          }
          break;
        }

        case 'FAMILY_SETUP': {
          // Si ya hay recovery guardado y no se manda uno nuevo, reusar el existente
          const existingRecovery = await chrome.storage.local.get([
            'familyRecoveryQuestion','familyRecoveryAnswerHash','familyRecoverySalt'
          ]);
          const rq = msg.recoveryQuestion || existingRecovery.familyRecoveryQuestion || '';
          const ra = msg.recoveryAnswer   || '';
          // Solo validar recovery si es primera vez (no hay hash guardado)
          const isFirstTime = !existingRecovery.familyRecoveryAnswerHash;
          if (isFirstTime && (!rq || String(ra).trim().length < 3)) {
            sendResponse({ ok: false, error: 'La primera vez debes configurar una pregunta de seguridad.' });
            break;
          }
          await setupFamilyMode(msg.pin, msg.settings, rq, ra, isFirstTime);
          sendResponse({ ok: true });
          break;
        }

        case 'FAMILY_STATUS': {
          const s = await chrome.storage.local.get([
            'familyModeEnabled','familyPin','familyPinHash','familyRecoveryQuestion','familySecQ'
          ]);
          sendResponse({
            enabled: !!s.familyModeEnabled,
            hasPin: !!(s.familyPinHash || s.familyPin),
            recoveryQuestion: s.familyRecoveryQuestion || s.familySecQ || '',
          });
          break;
        }

        case 'FAMILY_VERIFY_PIN':
          sendResponse({ valid: await verifyFamilyPin(msg.pin) });
          break;

        case 'FAMILY_RESET_PIN':
          sendResponse(await resetFamilyPinWithRecovery(msg.answer, msg.newPin));
          break;

        case 'FAMILY_UPDATE_SETTINGS': {
          const { familySettings = {} } = await chrome.storage.local.get('familySettings');
          await chrome.storage.local.set({ familySettings: { ...familySettings, ...msg.settings } });
          sendResponse({ ok: true });
          break;
        }

        case 'FAMILY_DISABLE': {
          const ok = await verifyFamilyPin(msg.pin);
          if (ok) {
            // Preservar familySettings → no se pierde el tiempo comprado (maxDailyMinutes acumulado).
            // Recovery (pregunta/hash/salt) también se mantiene → no se vuelve a pedir al reactivar.
            await chrome.storage.local.set({
              familyModeEnabled: false,
              familyPin:     null,
              familyPinHash: null,
              familyPinSalt: null,
              timeLimitReached: false,
            });
          }
          sendResponse({ ok });
          break;
        }

        case 'FAMILY_GRANT_TIME':
          sendResponse(await grantFamilyTime(msg.itemId));
          break;

        case 'FAMILY_GET_BLOCKED_SITES': {
          const { blockedSites = [] } = await chrome.storage.local.get('blockedSites');
          sendResponse({ blockedSites });
          break;
        }

        case 'FAMILY_CLEAR_BLOCKED_SITES': {
          await chrome.storage.local.set({ blockedSites: [] });
          sendResponse({ ok: true });
          break;
        }

        case 'FAMILY_REMOVE_BLOCKED_SITE': {
          // Elimina una entrada concreta del historial de bloqueos por índice o por url+date
          const { blockedSites = [] } = await chrome.storage.local.get('blockedSites');
          const filtered = typeof msg.index === 'number'
            ? blockedSites.filter((_, i) => i !== msg.index)
            : blockedSites.filter(s => !(s.url === msg.url && s.date === msg.date));
          await chrome.storage.local.set({ blockedSites: filtered });
          sendResponse({ ok: true });
          break;
        }

        // ── RECLAMAR RECOMPENSA DE LOGRO ─────────────────────────────────────
        case 'CLAIM_BADGE_REWARD': {
          const badgeId = msg.badgeId;
          if (!badgeId) { sendResponse({ ok: false, error: 'badgeId requerido' }); break; }

          const s = await chrome.storage.local.get([
            'badges', 'badgesClaimedRewards', 'userPoints', 'userCoins',
          ]);
          const badges  = s.badges || [];
          const claimed = s.badgesClaimedRewards || [];

          // El badge debe estar desbloqueado
          if (!badges.includes(badgeId)) {
            sendResponse({ ok: false, error: 'Logro no desbloqueado' }); break;
          }
          // No permitir reclamar dos veces
          if (claimed.includes(badgeId)) {
            sendResponse({ ok: false, error: 'Ya reclamado' }); break;
          }

          const def = BADGE_DEFS.find(d => d.id === badgeId);
          if (!def) { sendResponse({ ok: false, error: 'Logro desconocido' }); break; }

          const pts   = def.points || 0;
          const coins = def.coins  || 0;

          const newPoints = Math.round(((s.userPoints || 0) + pts) * 100) / 100;
          const newCoins  = Math.max(0, (s.userCoins  || 0) + coins);

          claimed.push(badgeId);
          await chrome.storage.local.set({
            badgesClaimedRewards: claimed,
            userPoints: newPoints,
            userCoins:  newCoins,
          });

          const label  = `${def.icon} ${def.name}`;
          const reward = [
            pts   ? (pts   > 0 ? `+${pts}`   : `${pts}`)   + ' pts' : '',
            coins ? (coins > 0 ? `+${coins}` : `${coins}`) + ' 🪙'  : '',
          ].filter(Boolean).join(', ');

          await logActivity(`🎁 Recompensa reclamada: ${label} (${reward})`);

          if (pts < 0 || coins < 0) {
            await sendNotification('⚠️ Logro negativo reclamado', `${label}: ${reward}`, 'sick');
          } else {
            await sendNotification('🎁 ¡Recompensa recibida!', `${label}: ${reward}`, 'happy');
          }

          sendResponse({ ok: true, points: newPoints, coins: newCoins, gained: { pts, coins } });
          break;
        }

        // ── CONSULTAR QUÉ LOGROS ESTÁN PENDIENTES DE RECLAMAR ───────────────
        case 'GET_CLAIMABLE_BADGES': {
          const { badges = [], badgesClaimedRewards = [] } =
            await chrome.storage.local.get(['badges', 'badgesClaimedRewards']);
          const claimable = badges.filter(id => !badgesClaimedRewards.includes(id));
          sendResponse({ claimable, claimed: badgesClaimedRewards });
          break;
        }

        case 'SHOP_BUY':
          sendResponse(await buyShopItem(msg.item));
          break;

        case 'EQUIP_ITEM': {
          if (msg.itemType === 'cloth') {
            // Multi-slot: guardar en equippedOutfit por slot
            const item = SHOP_CATALOG.find(i => i.id === msg.itemId);
            if (item && item.slot) {
              const { equippedOutfit = {} } = await chrome.storage.local.get('equippedOutfit');
              const updated = { hat: null, neck: null, tail: null, feet: null, acc: null, ...equippedOutfit };
              if (msg.itemId === '__unequip__') {
                updated[item.slot] = null;
              } else {
                updated[item.slot] = msg.itemId;
              }
              await chrome.storage.local.set({ equippedOutfit: updated, equippedCloth: msg.itemId });
            } else if (msg.itemId === null) {
              // Desequipar slot específico
              const { equippedOutfit = {} } = await chrome.storage.local.get('equippedOutfit');
              const updated = { hat: null, neck: null, tail: null, feet: null, acc: null, ...equippedOutfit };
              if (msg.slot) updated[msg.slot] = null;
              await chrome.storage.local.set({ equippedOutfit: updated });
            } else {
              await chrome.storage.local.set({ equippedCloth: msg.itemId });
            }
          } else if (msg.itemType === 'outfit') {
            // Guardar outfit completo de una vez
            await chrome.storage.local.set({ equippedOutfit: msg.outfit ?? {} });
          } else if (msg.itemType === 'item') {
            await chrome.storage.local.set({ equippedItem: msg.itemId });
          }
          sendResponse({ ok: true });
          break;
        }

        case 'GET_SHOP_CATALOG':
          sendResponse({ catalog: SHOP_CATALOG });
          break;

        case 'SAVE_THEME':
          await chrome.storage.local.set({ themeColor: msg.themeColor });
          sendResponse({ ok: true });
          break;

        case 'SYNC_ALL_BADGES': {
          // Sincronizar todos los badges con el estado actual.
          // IMPORTANTE: NO entrega puntos/monedas automáticamente — quedan
          // pendientes de reclamar por el usuario desde la UI de logros.
          const s = await chrome.storage.local.get([
            'badges','badgesClaimedRewards','badgeCounters','streakStats','passwordVault','notificationsEnabled',
            'userPoints','userCoins','threatsBlocked','deathCount','educationStats',
          ]);
          const badges  = s.badges || [];
          let newBadges = 0;

          for (const d of BADGE_DEFS) {
            if (badges.includes(d.id)) continue;
            if (d.check(s)) {
              badges.push(d.id);
              newBadges++;

              if (s.notificationsEnabled !== false) {
                const rewardMsg = d.points ? `${d.points > 0 ? '+' : ''}${d.points} pts` : '';
                const coinMsg   = d.coins  ? `${d.coins  > 0 ? '+' : ''}${d.coins}  🪙` : '';
                const reward    = [rewardMsg, coinMsg].filter(Boolean).join(' ');
                chrome.notifications.create('badge-' + d.id, {
                  type: 'basic', iconUrl: 'assets/sprites/happy.png',
                  title: '¡Nuevo logro desbloqueado!',
                  message: d.icon + ' ' + d.name + (reward ? ` → ${reward} pendiente de reclamar` : ''),
                  priority: 1,
                });
              }
              await logActivity('🏆 Logro desbloqueado: ' + d.icon + ' ' + d.name + ' (pendiente de reclamar)');
            }
          }

          // Solo guardar badges[], sin tocar puntos/monedas
          await chrome.storage.local.set({ badges });
          sendResponse({ ok: true, synced: newBadges, total: badges.length });
          break;
        }

        default:
          sendResponse({ error: `Unknown type: ${msg.type}` });
      }
    } catch (err) {
      // FIX #1 pattern: nunca dejar un mensaje sin respuesta
      console.error(`[CyberPet BG] ${msg.type}:`, err);
      sendResponse({ error: err.message });
    }
  })();

  return true; // canal abierto para respuesta async
});

// ── HANDLERS ──────────────────────────────────────────────────────────────

async function handlePhishingPenalty(amount) {
  const { petHealth = 100 } = await chrome.storage.local.get('petHealth');
  const hp = Math.max(0, petHealth - amount);
  const state = stateFromHealth(hp);
  await chrome.storage.local.set({ petHealth: hp, petState: state });
  if (hp === 0) await handlePetDeath();
  notifyHttpTabs('UPDATE_PET_STATE', { state });
  notifyHttpTabs('DAMAGE_EFFECT');
}

async function handlePhishing(url, analysis) {
  const { petHealth = 100, threatsBlocked = 0, dailyStats = {}, notificationsEnabled = true } =
    await chrome.storage.local.get(['petHealth','threatsBlocked','dailyStats','notificationsEnabled']);

  let host = url;
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch {}

  const { threatHistory = [] } = await chrome.storage.local.get('threatHistory');

  // Evitar registrar la MISMA URL más de una vez en los últimos 5 eventos.
  // Dedupe por hostname rompe casos donde la amenaza está en otra ruta del mismo dominio.
  if (threatHistory.slice(0, 5).some(t => t.url === url)) return;

  const hp    = petHealth;
  const state = stateFromHealth(hp);
  const today = new Date().toDateString();
  const stats = dailyStats.date === today
    ? { ...dailyStats, threatsSeen: (dailyStats.threatsSeen || 0) + 1 }
    : { date: today, screenMinutes: 0, pagesVisited: 0, threatsSeen: 1, keywordsCensored: 0 };

  threatHistory.unshift({
    type: 'Phishing/Sospechoso', url, hostname: host,
    date: new Date().toLocaleString(),
    reasons: analysis.reasons?.join(', ') || '',
    riskLevel: analysis.riskLevel || 'medium',
  });
  if (threatHistory.length > 50) threatHistory.pop();

  await chrome.storage.local.set({
    petHealth: hp, petState: state,
    threatsBlocked: threatsBlocked + 1,
    threatHistory, dailyStats: stats,
  });

  await logActivity(`🎣 Sitio sospechoso: ${host}`, url);

  await checkBadgeProgress('phishing_detected');
  if(notificationsEnabled){
    await sendNotification('Sitio Sospechoso',host+': '+(analysis.reasons?.[0]||'Amenaza'),'sick');
  }
  notifyHttpTabs('UPDATE_PET_STATE',{state});
  notifyHttpTabs('DAMAGE_EFFECT');
}

async function handleWeakPassword(url) {
  const { petHealth = 100, notificationsEnabled = true } =
    await chrome.storage.local.get(['petHealth', 'notificationsEnabled']);

  const hp    = Math.max(0, petHealth - 8);
  const state = stateFromHealth(hp);

  await chrome.storage.local.set({ petHealth: hp, petState: state });
  await logActivity('🔐 Contraseña débil detectada (−8 HP)', url);

  if (hp === 0) { await handlePetDeath(); return; }

  await sendNotification('🔐 Contraseña Débil', `¡Mejora tu contraseña! Salud: ${hp}%`, 'sick');
  notifyHttpTabs('UPDATE_PET_STATE', { state });
  notifyHttpTabs('DAMAGE_EFFECT');
}

async function handleStrongPassword(url, tabId) {
  // Rate limiting: 1 recompensa por tab cada 30 segundos
  if (tabId) {
    const last = _goodPracticeCooldown.get(tabId) || 0;
    if (Date.now() - last < 30000) return;
    _goodPracticeCooldown.set(tabId, Date.now());
  }

  const { petHealth = 100, userPoints = 0, userCoins = 0, rewardMult = 1 } =
    await chrome.storage.local.get(['petHealth', 'userPoints', 'userCoins', 'rewardMult']);

  const hp      = Math.min(100, petHealth + 2);
  const gained  = CyberPetUtils.applyMultiplier(Math.random() * 2 + 3, rewardMult); // 3 a 5 pts
  const coins   = userCoins + Math.round(8 * rewardMult); // 8 monedas
  const state   = stateFromHealth(hp);

  await chrome.storage.local.set({
    petHealth:  hp,
    petState:   state,
    userPoints: userPoints + gained,
    userCoins:  coins,
  });
  await logActivity(`🔐 Contraseña fuerte usada (+${gained} pts, +8 🪙)`, url);
  await sendNotification('🔐 ¡Contraseña Segura!', `+8 monedas y +${gained} pts. ¡Sigue así!`, 'happy');
  notifyHttpTabs('UPDATE_PET_STATE', { state });
}

async function handleGoodPractice(action, url, tabId) {
  // FIX #14: rate limiting — 1 recompensa por tab cada 10 segundos
  if (tabId) {
    const last = _goodPracticeCooldown.get(tabId) || 0;
    if (Date.now() - last < 10000) return;
    _goodPracticeCooldown.set(tabId, Date.now());
    // Limpiar entradas antiguas para no crecer infinidamente
    if (_goodPracticeCooldown.size > 100) {
      const cutoff = Date.now() - 60000;
      for (const [id, ts] of _goodPracticeCooldown) {
        if (ts < cutoff) _goodPracticeCooldown.delete(id);
      }
    }
  }

  const { petHealth = 100, userPoints = 0, rewardMult = 1 } =
    await chrome.storage.local.get(['petHealth', 'userPoints', 'rewardMult']);

  const hp     = Math.min(100, petHealth + 1);
  const gained = CyberPetUtils.applyMultiplier(Math.random() * 0.3 + 0.1, rewardMult);
  const state  = stateFromHealth(hp);

  await chrome.storage.local.set({
    petHealth:  hp,
    petState:   state,
    userPoints: userPoints + gained,
  });
  await logActivity(`✅ ${action} (+${gained} pts)`, url);
  notifyHttpTabs('UPDATE_PET_STATE', { state });
}

async function finishEduSession() {
  if (!_eduSession.active) return { hits: 0, total: 0, points: 0, health: 0 };
  const hits = _eduSession.hits;
  const total = _eduSession.questions.length;
  const misses = total - hits;
  _eduSession.active = false;

  const { userPoints = 0, petHealth = 100, educationStats = {} } =
    await chrome.storage.local.get(['userPoints', 'petHealth', 'educationStats']);

  const points = hits >= 4 ? 25 : hits >= 3 ? 10 : 0;
  const healthPenalty = misses >= 3 ? 10 : misses >= 2 ? 5 : 0;
  const hp = Math.max(0, petHealth - healthPenalty);
  const state = stateFromHealth(hp);

  await chrome.storage.local.set({
    userPoints: Math.round((userPoints + points) * 100) / 100,
    petHealth: hp,
    petState: state,
    educationStats: {
      completed: (educationStats.completed || 0) + 1,
      bestScore: Math.max(educationStats.bestScore || 0, hits),
      infectedBadge: misses >= 3 || !!educationStats.infectedBadge,
    },
  });

  await logActivity(`Modo educativo completado: ${hits}/${total} aciertos (+${points} pts${healthPenalty ? `, -${healthPenalty} HP` : ''})`);
  if (hp === 0) await handlePetDeath();
  notifyHttpTabs('UPDATE_PET_STATE', { state });
  if (healthPenalty) notifyHttpTabs('DAMAGE_EFFECT');
  return { hits, total, points, healthPenalty };
}

async function handlePetDeath() {
  const { userPoints = 0, userCoins = 0, rewardMult = 1, deathCount = 0 } =
    await chrome.storage.local.get(['userPoints', 'userCoins', 'rewardMult', 'deathCount']);
  const nextMult = Math.max(0.25, Math.round((rewardMult - 0.25) * 100) / 100);

  await chrome.storage.local.set({
    petState:   'sick', petHealth: 0, rewardMult: nextMult, deathCount: deathCount + 1,
    userPoints: Math.round((userPoints - 30) * 100) / 100, // Permitir negativos
    userCoins:  Math.max(0, userCoins - 15),
  });
  await logActivity('💀 CyberPet ha muerto (−30 pts, −15 monedas)');

  await logActivity('Tareas de recuperación: usa una contraseña fuerte, revisa la bóveda y completa el modo educativo');

  chrome.notifications.create('pet-death', {
    type: 'basic', iconUrl: 'assets/sprites/sick.png',
    title: '💀 ¡Tu CyberPet ha muerto!',
    message: 'Perdiste 30 pts y 15 monedas. Haz clic para revivirlo.',
    priority: 2, requireInteraction: true,
  });
  notifyHttpTabs('PET_DIED');
  // Comprobar logros negativos relacionados con muerte
  checkBadgeProgress('pet_death').catch(() => {});
}

async function revivePet() {
  const { userPoints = 0 } = await chrome.storage.local.get('userPoints');
  await chrome.storage.local.set({
    petHealth: 50, petState: 'neutral',
    userPoints: Math.round((userPoints - 50) * 100) / 100,
  });
  await logActivity('💚 CyberPet revivido (−50 puntos)');
  await sendNotification('💚 CyberPet Revivido', '¡Ha vuelto con 50 HP!', 'neutral');
  notifyHttpTabs('PET_REVIVED');
  notifyHttpTabs('FORCE_UPDATE_SPRITE', { state: 'neutral' });
}


// ══ EXPORT / IMPORT .cyberpet ══════════════════════
// Format: AES-GCM encrypted JSON, key from user password via PBKDF2
// { version, salt, iv, data } where data = encrypted JSON blob

async function exportState(password) {
  const keys=['petName','petHealth','petState','userPoints','userCoins','streakStats',
    'passwordVault','vaultPin','vaultSalt','badges','badgeCounters','inventory',
    'equippedCloth','equippedTitle','themeColor','notificationsEnabled',
    'passwordCheckEnabled','keywordCensorEnabled','phishingDetectEnabled',
    'petMovementEnabled','dailyStats','deathCount','rewardMult'];
  const state=await chrome.storage.local.get(keys);

  const enc=new TextEncoder();
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const iv=crypto.getRandomValues(new Uint8Array(12));

  const keyMat=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey(
    {name:'PBKDF2',salt,iterations:200000,hash:'SHA-256'},
    keyMat,{name:'AES-GCM',length:256},false,['encrypt']
  );
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(JSON.stringify(state)));

  return JSON.stringify({
    version:1,
    salt:Array.from(salt).map(b=>b.toString(16).padStart(2,'0')).join(''),
    iv:Array.from(iv).map(b=>b.toString(16).padStart(2,'0')).join(''),
    data:Array.from(new Uint8Array(cipher)).map(b=>b.toString(16).padStart(2,'0')).join(''),
  });
}

async function importState(json, password) {
  try {
    const {version,salt,iv,data}=JSON.parse(json);
    if (version!==1) return {ok:false,error:'Versión incompatible'};
    const fromHex=h=>new Uint8Array(h.match(/.{2}/g).map(b=>parseInt(b,16)));
    const enc=new TextEncoder();
    const keyMat=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);
    const key=await crypto.subtle.deriveKey(
      {name:'PBKDF2',salt:fromHex(salt),iterations:200000,hash:'SHA-256'},
      keyMat,{name:'AES-GCM',length:256},false,['decrypt']
    );
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromHex(iv)},key,fromHex(data));
    const state=JSON.parse(new TextDecoder().decode(plain));
    // Restore — skip sensitive session-only keys
    delete state.vaultLocked; // will re-lock on next load
    await chrome.storage.local.set(state);
    return {ok:true};
  } catch(e) {
    return {ok:false,error:'Contraseña incorrecta o archivo corrupto'};
  }
}


// BADGES — definiciones completas (positivos + negativos)
const BADGE_DEFS = [
  // ── POSITIVOS ────────────────────────────────────────────────────────────
  { id:'cyber_rookie',    name:'Cyber Rookie',        desc:'Alcanza 100 puntos',                  icon:'🎯', points:15, coins:10,
    check:s=>(s.userPoints||0)>=100 },
  { id:'safe_navigator',  name:'Navegante Seguro',    desc:'7 dias seguros sin amenazas',         icon:'🛡️', points:40, coins:20,
    check:s=>(s.streakStats?.currentStreak||0)>=7 },
  { id:'streak_legend',   name:'Leyenda del Streak',  desc:'30 dias seguros consecutivos',        icon:'🔥', points:100, coins:50,
    check:s=>(s.streakStats?.currentStreak||0)>=30 },
  { id:'fort_knox',       name:'Fort Knox',           desc:'10 contrasenas fuertes detectadas',   icon:'🏰', points:20, coins:15,
    check:s=>(s.badgeCounters?.strongPasswords||0)>=10 },
  { id:'password_pro',    name:'Password Pro',        desc:'25 contrasenas fuertes detectadas',   icon:'🔑', points:50, coins:25,
    check:s=>(s.badgeCounters?.strongPasswords||0)>=25 },
  { id:'hawk_eye',        name:'Ojo de Halcon',       desc:'Detecta 5 sitios de phishing',        icon:'🦅', points:30, coins:20,
    check:s=>(s.badgeCounters?.phishingDetected||0)>=5 },
  { id:'phishing_hunter', name:'Cazador de Phishing', desc:'Detecta 20 sitios de phishing',       icon:'🎣', points:80, coins:40,
    check:s=>(s.badgeCounters?.phishingDetected||0)>=20 },
  { id:'vault_master',    name:'Maestro del Vault',   desc:'Guarda 5 contrasenas en el Vault',    icon:'🔐', points:25, coins:20,
    check:s=>(s.passwordVault?.length||0)>=5 },
  { id:'vault_guardian',  name:'Guardian del Vault',  desc:'Guarda 15 contrasenas en el Vault',   icon:'🏛️', points:60, coins:30,
    check:s=>(s.passwordVault?.length||0)>=15 },
  { id:'educator',        name:'Estudiante Aplicado', desc:'Completa 3 tests anti-phishing',      icon:'📚', points:20, coins:15,
    check:s=>(s.educationStats?.completed||0)>=3 },
  { id:'perfect_student', name:'Nota Perfecta',       desc:'Consigue 5/5 en el test educativo',   icon:'🎓', points:90, coins:45,
    check:s=>(s.educationStats?.bestScore||0)>=5 },
  { id:'coin_hoarder',    name:'Ahorrador Digital',   desc:'Acumula 500 monedas',                 icon:'🪙', points:30, coins:25,
    check:s=>(s.userCoins||0)>=500 },
  { id:'shield_wall',     name:'Muro de Escudo',      desc:'Bloquea 25 amenazas en total',        icon:'⚔️', points:40, coins:25,
    check:s=>(s.threatsBlocked||0)>=25 },
  { id:'millionaire',     name:'Cyber Millonario',    desc:'Acumula 1000 puntos',                 icon:'💎', points:150, coins:75,
    check:s=>(s.userPoints||0)>=1000 },

  // ── NEGATIVOS ────────────────────────────────────────────────────────────
  { id:'first_blood',     name:'Primera Caida',       desc:'Tu CyberPet murio por primera vez',   icon:'💀', points:-10, coins:-5,
    check:s=>(s.deathCount||0)>=1 },
  { id:'reckless',        name:'Imprudente',           desc:'Tu CyberPet murio 3 veces',          icon:'☠️', points:-30, coins:-15,
    check:s=>(s.deathCount||0)>=3 },
  { id:'weak_chain',      name:'Eslabon Debil',        desc:'Usaste 10 contrasenas inseguras',    icon:'🔓', points:-15, coins:-10,
    check:s=>(s.badgeCounters?.weakPasswords||0)>=10 },
  { id:'keyword_magnet',  name:'Iman de Palabras',     desc:'20 palabras censuradas en total',    icon:'🤐', points:-25, coins:-15,
    check:s=>(s.badgeCounters?.totalKeywordsCensored||0)>=20 },
  { id:'phishing_bait',   name:'Cebo de Phishing',     desc:'Ignoraste 5 alertas de phishing',   icon:'🪝', points:-40, coins:-20,
    check:s=>(s.badgeCounters?.phishingClicked||0)>=5 },
];

async function checkBadgeProgress(event) {
  const s = await chrome.storage.local.get([
    'badges','badgeCounters','streakStats','passwordVault','notificationsEnabled',
    'userPoints','userCoins','threatsBlocked','deathCount','educationStats',
  ]);
  const badges   = s.badges   || [];
  const counters = { ...s.badgeCounters };

  // Incrementar el contador correspondiente al evento
  if (event === 'strong_passwords')   counters.strongPasswords         = (counters.strongPasswords         || 0) + 1;
  if (event === 'phishing_detected')  counters.phishingDetected        = (counters.phishingDetected        || 0) + 1;
  if (event === 'weak_password')      counters.weakPasswords           = (counters.weakPasswords           || 0) + 1;
  if (event === 'phishing_clicked')   counters.phishingClicked         = (counters.phishingClicked         || 0) + 1;
  if (event === 'keyword_censored')   counters.totalKeywordsCensored   = (counters.totalKeywordsCensored   || 0) + 1;

  await chrome.storage.local.set({ badgeCounters: counters });

  // Re-leer todo con los contadores actualizados
  const fresh = await chrome.storage.local.get([
    'badgeCounters','streakStats','passwordVault',
    'userPoints','userCoins','threatsBlocked','deathCount','educationStats',
  ]);

  // Solo registrar los badges desbloqueados, sin dar recompensas automáticamente
  for (const d of BADGE_DEFS) {
    if (badges.includes(d.id)) continue;
    if (d.check(fresh)) {
      badges.push(d.id);
      
      if (s.notificationsEnabled !== false) {
        const rewardMsg = d.points ? `${d.points > 0 ? '+' : ''}${d.points} pts` : '';
        const coinMsg = d.coins ? `${d.coins > 0 ? '+' : ''}${d.coins} 🪙` : '';
        const reward = [rewardMsg, coinMsg].filter(Boolean).join(' ');
        chrome.notifications.create('badge-' + d.id, {
          type: 'basic', iconUrl: 'assets/sprites/happy.png',
          title: '¡Nuevo logro desbloqueado!', message: d.icon + ' ' + d.name + (reward ? ` → ${reward} pendiente de reclamar` : ''), priority: 1,
        });
      }
      await logActivity('🏆 Logro desbloqueado: ' + d.icon + ' ' + d.name);
    }
  }

  // Guardar logros sin actualizar puntos/monedas (se darán al reclamar)
  await chrome.storage.local.set({ badges });
}

chrome.notifications.onClicked.addListener(id => {
  if (id === 'pet-death') {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html#home') });
  }
});

// ── ANÁLISIS DE PHISHING ─────────────────────────────────────────────────── (v4.3)

function analyzeURL(url, whitelist = [], threshold = 40) {
  try {
    const { hostname, protocol, pathname, search, href } = new URL(url);
    const cleanHost  = hostname.toLowerCase().replace(/^www\./, '');
    const parts      = cleanHost.split('.');
    const rootDomain = parts.length >= 2 ? parts.slice(-2).join('.') : cleanHost;
    const sld        = parts.length >= 2 ? parts[parts.length - 2] : cleanHost; // 2nd-level domain
    const subdomain  = parts.length > 2  ? parts.slice(0, -2).join('.') : '';
    const fullPath   = pathname + search;

    // ── 1. Whitelist del usuario ──────────────────────────────────────────
    if (whitelist.some(w => {
      const wl = w.toLowerCase().replace(/^www\./, '');
      return cleanHost === wl || cleanHost.endsWith('.' + wl);
    })) return { score: 0, reasons: [], suspicious: false, riskLevel: 'low' };

    // ── 2. Lista segura estatica (dominios raiz exactos) ──────────────────
    if (SAFE_DOMAINS.has(rootDomain))
      return { score: 0, reasons: [], suspicious: false, riskLevel: 'low' };

    // ── 3. Dominios regionales de marcas conocidas (Patch 1) ──────────────
    if (isSafeBrandDomain(cleanHost))
      return { score: 0, reasons: [], suspicious: false, riskLevel: 'low' };

    let score = 0;
    const reasons = [];
    const flag = (w, msg) => { score += w; reasons.push(msg); };

    // ── 4. Protocolo HTTP ─────────────────────────────────────────────────
    // +15 por HTTP; si ademas la ruta implica login/pago/cuenta se suman +35
    // → HTTP en pagina sensible siempre supera el umbral de alerta (40 pts).
    if (protocol === 'http:') {
      flag(15, 'Conexion sin cifrar (HTTP) — los datos viajan en texto plano');
      if (SENSITIVE_PATH_RE.test(fullPath))
        flag(35, 'HTTP en pagina sensible (login / pago / cuenta) — peligro critico');
    }

    // ── 5. IP directa ─────────────────────────────────────────────────────
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(cleanHost)) {
      flag(35, 'IP directa en lugar de nombre de dominio');
      if (SENSITIVE_PATH_RE.test(fullPath))
        flag(20, 'IP directa con ruta sensible (login/pago)');
    }

    // ── 6. Punycode / IDN homoglyph ───────────────────────────────────────
    if (/xn--[a-z0-9-]+/i.test(cleanHost))
      flag(40, 'Punycode IDN — posible suplantacion con caracteres similares');

    // ── 7. Typosquatting — Levenshtein DOBLE (hostname + SLD) ────────────
    // (a) Hostname completo vs dominio popular completo
    // (b) SLD vs SLD popular → detecta 'paypa1.io', 'g00gle.co', etc.
    let levMatched = false;
    outer: for (const pop of POPULAR_DOMAINS) {
      const popSld = pop.split('.')[0];

      const dFull = levenshteinDistance(cleanHost, pop);
      if (dFull > 0 && dFull <= 2 &&
          cleanHost.length >= pop.length - 1 &&
          cleanHost.length <= pop.length + 1) {
        flag(60, `Typosquatting — URL muy similar a ${pop}`);
        levMatched = true;
        break outer;
      }

      if (sld.length >= 4) {
        const dSld = levenshteinDistance(sld, popSld);
        if (dSld === 1 &&
            sld.length >= popSld.length - 1 &&
            sld.length <= popSld.length + 1) {
          flag(55, `Typosquatting en nombre de dominio — similar a ${pop}`);
          levMatched = true;
          break outer;
        }
      }
    }

    // ── 8. Marca conocida usada como SUBDOMINIO de dominio ajeno ──────────
    // 'paypal.attacker-site.com' — el SLD NO es la marca, pero el subdominio si.
    if (!levMatched && subdomain) {
      for (const prefix of SAFE_BRAND_PREFIXES) {
        const brand = prefix.slice(0, -1);
        if (sld !== brand && subdomain.split('.').some(seg => seg === brand)) {
          flag(50, `Marca conocida ('${brand}') usada como subdominio en dominio ajeno`);
          break;
        }
      }
    }

    // ── 9. Patrones regex de phishing ─────────────────────────────────────
    const testTarget = `${cleanHost}${fullPath}`;
    for (const { re, weight, reason } of PHISHING_PATTERNS) {
      if (re.test(testTarget)) flag(weight, reason);
    }

    // ── 10. Hosting gratuito / tunneling ──────────────────────────────────
    if (PHISHING_HOSTING_PLATFORMS.has(rootDomain)) {
      if (SENSITIVE_PATH_RE.test(fullPath))
        flag(45, 'Plataforma de hosting gratuito con ruta sensible (login/pago)');
      else
        flag(10, 'Plataforma de hosting gratuito — verificar legitimidad');
    }
    if (/ngrok\.|localtunnel|pagekite|loca\.lt/i.test(cleanHost))
      flag(55, 'Servicio de tunel temporal (ngrok/localtunnel) — muy sospechoso');

    // ── 11. Redireccion embebida en la URL ────────────────────────────────
    if (REDIRECT_PARAM_RE.test(search))
      flag(20, 'Parametro de redireccion sospechoso en la URL');
    if (/https?:\/\/.+https?:\/\//i.test(href))
      flag(30, 'URL anidada — patron clasico de redirect phishing');
    if (/(%2F|%3A){3,}/i.test(href))
      flag(15, 'Codificacion URL excesiva — posible evasion de filtros');

    // ── 12. Entropia alta en subdominio ───────────────────────────────────
    // Subdominios aleatorios son tipicos de infraestructura de phishing masivo.
    if (subdomain && subdomain.length > 8 && domainEntropy(subdomain) > 3.5)
      flag(20, 'Subdominio con caracteres aleatorios (patron de bot/phishing)');

    // ── 13. Guiones excesivos ─────────────────────────────────────────────
    const hyphens = (cleanHost.match(/-/g) || []).length;
    if      (hyphens >= 4) flag(20, 'Dominio con excesivos guiones (>=4) — patron de phishing');
    else if (hyphens === 3) flag(10, 'Dominio con multiples guiones');

    // ── 14. Longitud de dominio ───────────────────────────────────────────
    if      (cleanHost.length > 50) flag(20, 'Dominio extremadamente largo (>50 chars)');
    else if (cleanHost.length > 40) flag(10, 'Dominio inusualmente largo (>40 chars)');

    // ── 15. Exceso de niveles de subdominio ───────────────────────────────
    if      (parts.length > 5) flag(25, 'Exceso de subdominios (>5 niveles)');
    else if (parts.length > 4) flag(15, 'Exceso de subdominios (>4 niveles)');

    // ── 16. Ruta sensible en dominio desconocido (senyal combinada debil) ──
    // Solo aporta puntos si el score aun no supera el umbral — evita inflar.
    if (!levMatched && score < threshold && SENSITIVE_PATH_RE.test(fullPath))
      flag(10, 'Ruta con accion de cuenta en dominio desconocido');

    const suspicious = score >= threshold;
    return {
      score,
      reasons:   [...new Set(reasons)],
      suspicious,
      riskLevel: score >= 80 ? 'high' : score >= 40 ? 'medium' : 'low',
    };

  } catch {
    return { score: 0, reasons: [], suspicious: false, riskLevel: 'low' };
  }
}


// ── VAULT — CIFRADO AES-256-GCM ──────────────────────────────────────────

// Cache de clave derivada en memoria (solo mientras el vault está desbloqueado)
let _vaultKey = null;

/**
 * Hash simple de PIN para Family Mode (sin salt único, para compatibilidad).
 * Usa un salt fijo porque el PIN de family no necesita tanto nivel de seguridad.
 */
async function hashPin(pin) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(pin + 'cyberpet_family_salt_v4')
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hash seguro de PIN con salt único por usuario (para Vault).
 */
async function hashPinSecure(pin, salt) {
  return CyberPetUtils.hashPinSecure(pin, salt);
}

/**
 * Deriva clave AES-GCM desde PIN + salt.
 */
async function deriveVaultKey(pin, salt) {
  return CyberPetUtils.deriveVaultKey(pin, salt);
}

/**
 * Cifra contraseña con AES-256-GCM.
 */
async function encryptPassword(text, key) {
  return CyberPetUtils.encryptAES(text, key);
}

/**
 * Descifra contraseña con AES-256-GCM.
 */
async function decryptPassword(ciphertext, iv, key) {
  return CyberPetUtils.decryptAES(ciphertext, iv, key);
}

/**
 * Desbloquea el vault.
 * - Si es la primera vez (no hay vaultPin), crea el PIN con salt aleatorio.
 * - Si ya existe, verifica el PIN contra el hash guardado.
 */
async function unlockVault(pin) {
  if (!pin || typeof pin !== 'string') return false;

  const { vaultPin, vaultSalt } = await chrome.storage.local.get(['vaultPin', 'vaultSalt']);

  if (!vaultPin) {
    // Primera vez: generar salt único y guardar PIN hash
    const salt = await CyberPetUtils.generateSalt();
    const pinHash = await hashPinSecure(pin, salt);
    _vaultSessionPin = pin;
    _vaultKey = await deriveVaultKey(pin, salt);

    await chrome.storage.local.set({
      vaultPin: pinHash,
      vaultSalt: salt,
      vaultLocked: false,
    });
    return true;
  }

  // Verificar PIN existente
  let valid = false;
  let saltToUse = vaultSalt;

  if (vaultSalt) {
    const pinHash = await hashPinSecure(pin, vaultSalt);
    valid = pinHash === vaultPin;
  }

  // Compatibilidad con versiones antiguas que guardaban hash sin salt único.
  if (!valid) {
    const legacyHashBuf = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(pin + 'cyberpet_salt_v4')
    );
    const legacyHash = Array.from(new Uint8Array(legacyHashBuf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    if (legacyHash === vaultPin) {
      valid = true;
      // Migrar automáticamente al esquema seguro actual con salt único.
      const newSalt = await CyberPetUtils.generateSalt();
      const newHash = await hashPinSecure(pin, newSalt);
      await chrome.storage.local.set({ vaultSalt: newSalt, vaultPin: newHash });
      saltToUse = newSalt;
    }
  }

  if (valid) {
    _vaultSessionPin = pin; // solo en memoria
    _vaultKey = await deriveVaultKey(pin, saltToUse);
    await chrome.storage.local.set({ vaultLocked: false });
    return true;
  }

  return false;
}

/**
 * Guarda una entrada en el vault (cifrado AES-GCM).
 */
async function saveVaultEntry(entry) {
  if (!_vaultSessionPin || !_vaultKey) {
    throw new Error('Vault bloqueado — re-autentícate');
  }

  const { passwordVault = [] } = await chrome.storage.local.get('passwordVault');
  const encrypted = await encryptPassword(String(entry.password || ''), _vaultKey);

  passwordVault.push({
    id:         Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    site:       String(entry.site     || '').trim(),
    username:   String(entry.username || '').trim(),
    password:   encrypted.ciphertext,
    passwordIv: encrypted.iv,
    date:       new Date().toLocaleString(),
  });

  await chrome.storage.local.set({ passwordVault });
  await logActivity(`🔐 Contraseña guardada: ${entry.site}`);
}

/**
 * Elimina una entrada del vault.
 */
async function deleteVaultEntry(id) {
  const { passwordVault = [] } = await chrome.storage.local.get('passwordVault');
  await chrome.storage.local.set({
    passwordVault: passwordVault.filter(e => e.id !== id)
  });
}

/**
 * Obtiene todas las entradas del vault (descifradas).
 */
async function getVault() {
  const { passwordVault = [], vaultLocked } =
    await chrome.storage.local.get(['passwordVault', 'vaultLocked']);

  if (vaultLocked || !_vaultKey) return [];

  const decrypted = [];
  for (const e of passwordVault) {
    try {
      const pwd = await decryptPassword(e.password, e.passwordIv, _vaultKey);
      decrypted.push({ ...e, password: pwd });
    } catch {
      decrypted.push({ ...e, password: '[error al descifrar]' });
    }
  }
  return decrypted;
}

// ── FAMILY MODE ────────────────────────────────────────────────────────────

async function hashText(value, salt) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(String(value ?? '').trim().toLowerCase() + salt)
  );
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function setupFamilyMode(pin, settings = {}, recoveryQuestion = '', recoveryAnswer = '', saveRecovery = true) {
  if (!/^\d{4}$/.test(String(pin || ''))) throw new Error('PIN inválido');
  const familyPinSalt = await CyberPetUtils.generateSalt();
  const saves = {
    familyModeEnabled: true,
    familyPin:     await hashPin(pin),
    familyPinHash: await hashPinSecure(pin, familyPinSalt),
    familyPinSalt,
    familySecQ: null,
    familySecA: null,
    familySettings: {
      maxDailyMinutes: 120, safeUrls: [], contentFilter: 'medium',
      allowCoinPurchases: true, dailyUsage: 0,
      lastUsageDate: new Date().toDateString(),
      timeUpMessage: '¡Se acabó el tiempo! Descansa un poco 🐱',
      ...settings,
    },
  };
  // Solo guardar/sobreescribir recovery si es primera vez
  if (saveRecovery && recoveryQuestion && String(recoveryAnswer).trim().length >= 3) {
    const familyRecoverySalt = await CyberPetUtils.generateSalt();
    saves.familyRecoveryQuestion     = String(recoveryQuestion).trim();
    saves.familyRecoveryAnswerHash   = await hashText(recoveryAnswer, familyRecoverySalt);
    saves.familyRecoverySalt         = familyRecoverySalt;
  }
  await chrome.storage.local.set(saves);
  await logActivity('👨‍👩‍👧 Modo Familia activado');
}

async function verifyFamilyPin(pin) {
  if (!pin || typeof pin !== 'string') return false;
  const { familyPin, familyPinHash, familyPinSalt } =
    await chrome.storage.local.get(['familyPin', 'familyPinHash', 'familyPinSalt']);

  if (familyPinHash && familyPinSalt) {
    return (await hashPinSecure(pin, familyPinSalt)) === familyPinHash;
  }

  if (!familyPin) return false;
  const validLegacy = (await hashPin(pin)) === familyPin;
  if (validLegacy) {
    const salt = await CyberPetUtils.generateSalt();
    await chrome.storage.local.set({
      familyPinHash: await hashPinSecure(pin, salt),
      familyPinSalt: salt,
    });
  }
  return validLegacy;
}

async function resetFamilyPinWithRecovery(answer, newPin) {
  if (!/^\d{4}$/.test(String(newPin || ''))) {
    return { ok: false, error: 'El nuevo PIN debe tener 4 dígitos' };
  }

  const data = await chrome.storage.local.get([
    'familyRecoveryAnswerHash','familyRecoverySalt','familySecA'
  ]);

  let valid = false;
  if (data.familyRecoveryAnswerHash && data.familyRecoverySalt) {
    valid = (await hashText(answer, data.familyRecoverySalt)) === data.familyRecoveryAnswerHash;
  } else if (data.familySecA) {
    valid = String(answer || '').trim().toLowerCase() === String(data.familySecA).trim().toLowerCase();
  }

  if (!valid) return { ok: false, error: 'Respuesta incorrecta' };

  const salt = await CyberPetUtils.generateSalt();
  await chrome.storage.local.set({
    familyPin: await hashPin(newPin),
    familyPinHash: await hashPinSecure(newPin, salt),
    familyPinSalt: salt,
  });
  await logActivity('Family Mode: PIN actualizado con pregunta de seguridad');
  return { ok: true };
}

async function grantFamilyTime(itemId) {
  const item = SHOP_CATALOG.find(i => i.id === itemId && i.type === 'extra_time');
  if (!item) return { ok: false, error: 'Item no encontrado' };
 
  const { userCoins = 0, familySettings = {} } =
    await chrome.storage.local.get(['userCoins', 'familySettings']);
 
  if (!familySettings.allowCoinPurchases) return { ok: false, error: 'No permitido' };
  if (userCoins < item.price) return { ok: false, error: `Necesitas ${item.price} monedas` };
 
  const bonus = (familySettings.bonusMinutesToday || 0) + item.minutes;
  const updatedSettings = { ...familySettings, bonusMinutesToday: bonus };
 
  await chrome.storage.local.set({
    userCoins: userCoins - item.price,
    familySettings: updatedSettings,
    timeLimitReached: false,   // desbloquear navegación inmediatamente
  });
 
  await logActivity(`⏰ Tiempo extra comprado: +${item.minutes}min (monedas usadas: ${item.price})`);
  return { ok: true, addedMinutes: item.minutes };
}


// ── SHOP ───────────────────────────────────────────────────────────────────

async function buyShopItem(itemId) {
  const item = SHOP_CATALOG.find(i => i.id === itemId);
  if (!item) return { ok: false, error: 'Item no encontrado' };

  // Bloquear compra de items marcados como próximamente
  if (item.comingSoon) return { ok: false, error: 'Este accesorio llegará pronto 🎨' };

  const { shopInventory = [], userCoins = 0, userPoints = 0 } =
    await chrome.storage.local.get(['shopInventory', 'userCoins', 'userPoints']);

  if (item.type !== 'extra_time' && shopInventory.includes(itemId))
    return { ok: false, error: 'Ya tienes este item' };

  if (item.currency === 'coins') {
    if (userCoins < item.price)  return { ok: false, error: 'Monedas insuficientes' };
    await chrome.storage.local.set({ userCoins: userCoins - item.price });
  } else {
    if (userPoints < item.price) return { ok: false, error: 'Puntos insuficientes' };
    await chrome.storage.local.set({ userPoints: Math.round((userPoints - item.price) * 100) / 100 });
  }

  if (item.type === 'extra_time') {
    const { familySettings = {} } = await chrome.storage.local.get('familySettings');
    await chrome.storage.local.set({
      familySettings:   { ...familySettings, maxDailyMinutes: (familySettings.maxDailyMinutes || 120) + item.minutes },
      timeLimitReached: false,
    });
  } else if (item.type === 'title') {
    shopInventory.push(itemId);
    await chrome.storage.local.set({ shopInventory, userTitle: item.text });
  } else {
    shopInventory.push(itemId);
    await chrome.storage.local.set({ shopInventory });
  }

  await logActivity(`🛍️ Comprado: ${item.name}`);
  return { ok: true };
}

// ── UTILIDADES ─────────────────────────────────────────────────────────────
// stateFromHealth ahora se importa de utils/shared.js

// FIX #2: lectura+escritura atómica para contadores de dailyStats
async function incrementDailyStat(key) {
  const today = new Date().toDateString();
  const { dailyStats = {} } = await chrome.storage.local.get('dailyStats');
  const stats = dailyStats.date === today
    ? { ...dailyStats }
    : { date: today, screenMinutes: 0, pagesVisited: 0, threatsSeen: 0, keywordsCensored: 0 };
  stats[key] = (stats[key] || 0) + 1;
  await chrome.storage.local.set({ dailyStats: stats });
}

async function logActivity(text, url = null) {
  const { activities = [] } = await chrome.storage.local.get('activities');
  let label = text;
  if (url) { try { label += ` (${new URL(url).hostname.replace(/^www\./, '')})`; } catch {} }
  activities.unshift({ text: label, date: new Date().toLocaleString() });
  if (activities.length > 50) activities.pop();
  await chrome.storage.local.set({ activities, lastActivity: label });
}

// FIX #21: solo enviar a tabs con URLs navegables (http/https)
function notifyHttpTabs(type, data = {}) {
  chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }, tabs => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type, ...data }).catch(() => {});
    }
  });
}

async function sendNotification(title, message, sprite = 'neutral') {
  const { notificationsEnabled = true } = await chrome.storage.local.get('notificationsEnabled');
  if (!notificationsEnabled) return;
  chrome.notifications.create({
    type: 'basic',
    iconUrl: `assets/sprites/${sprite}.png`,
    title,
    message,
  });
}

function nextMidnight() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function isBlockable(url) {
  return !!url && (url.startsWith('http://') || url.startsWith('https://'));
}

// ── FAMILY BLOCK HANDLER ────────────────────────────────────────────────────

const CATEGORY_LABELS = {
  adult:      'Contenido adulto',
  gambling:   'Apuestas / Casino',
  downloads:  'Descargas no autorizadas',
  violence:   'Violencia extrema',
  unverified: 'Dominio no verificado',
   manual:     'Bloqueado por apoderado',
  weapons:    'Armas / Contenido peligroso',
  drugs:      'Drogas / Sustancias ilícitas',
  hate:       'Discurso de odio / Extremismo',
  none:       'Filtro general',
};

const CATEGORY_ICONS = {
  adult:      '🔞',
  gambling:   '🎰',
  downloads:  '⬇️',
  violence:   '⚠️',
  unverified: '❓',
  manual:     '🛑',
  weapons:    '🔫',
  drugs:      '💊',
  hate:       '☣️',
  none:       '🚫',
};

/**
 * Redirige la pestaña a la página de bloqueo familiar y registra el evento.
 * @param {string} url
 * @param {{ action, reason, category }} filterResult
 * @param {number|null} tabId
 */
async function handleFamilyBlock(url, filterResult, tabId = null) {
  let hostname = url;
  try { hostname = new URL(url).hostname.replace(/^www\./, ''); } catch {}

  const icon  = CATEGORY_ICONS[filterResult.category] || '🚫';
  const label = CATEGORY_LABELS[filterResult.category] || 'Contenido bloqueado';

  // Registrar en blockedSites (historial de bloqueos)
  const { blockedSites = [] } = await chrome.storage.local.get('blockedSites');
  blockedSites.unshift({
    url,
    hostname,
    category:      filterResult.category,
    categoryLabel: label,
    reason:        filterResult.reason,
    date:          new Date().toLocaleString(),
  });
  if (blockedSites.length > 100) blockedSites.pop();
  await chrome.storage.local.set({ blockedSites });

  await logActivity(`${icon} Bloqueado [${label}]: ${hostname}`, url);
  await incrementDailyStat('threatsSeen');

  // Penalización leve de HP por intentar acceder a contenido bloqueado
  const { petHealth = 100 } = await chrome.storage.local.get('petHealth');
  if (petHealth > 0) {
    const hp    = Math.max(0, petHealth - 3);
    const state = stateFromHealth(hp);
    await chrome.storage.local.set({ petHealth: hp, petState: state });
    notifyHttpTabs('UPDATE_PET_STATE', { state });
  }

  // Redirigir pestaña a página de bloqueo con parámetros de contexto
  if (tabId !== null) {
    const encodedReason   = encodeURIComponent(filterResult.reason);
    const encodedCategory = encodeURIComponent(filterResult.category);
    const encodedHost     = encodeURIComponent(hostname);
    const blockUrl = chrome.runtime.getURL(
      `blocked.html?blocked=1&reason=${encodedReason}&category=${encodedCategory}&host=${encodedHost}`
    );
    chrome.tabs.update(tabId, { url: blockUrl }).catch(() => {});
  }
}

// ───────────────────────────────────────────────────────────────────────────
startTimeTracking();
lockVaultOnWorkerStart();

async function lockVaultOnWorkerStart() {
  const { vaultPin } = await chrome.storage.local.get('vaultPin');
  if (vaultPin) await chrome.storage.local.set({ vaultLocked: true });
}