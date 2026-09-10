/**
 * CyberPet — smart-tips.js
 * 
 * Sistema de diálogos predefinidos tipo "simulación de citas".
 * El usuario elige entre opciones y el CyberPet responde con consejos
 * educativos sobre ciberseguridad, con personalidad amigable.
 * 
 * Uso:
 *   import { getDialogResponse, DIALOG_TREE } from './smart-tips.js';
 *   const response = getDialogResponse('root', 'Juan', 'Pixel');
 */

// ════════════════════════════════════════════════════════════════════════════
//  ÁRBOL DE DIÁLOGOS
//  Cada nodo tiene: message (string) y options (array de {text, next})
// ════════════════════════════════════════════════════════════════════════════

export const DIALOG_TREE = {
  // ── RAÍZ ──────────────────────────────────────────────────────────────────
  root: {
    message: "¡Hola{userName}! Soy {petName}, tu guardián digital 🐱\n\n¿En qué puedo ayudarte hoy?",
    options: [
      { text: "🔐 Contraseñas seguras", next: "password_topic" },
      { text: "🎣 Detectar phishing", next: "phishing_topic" },
      { text: "🛡️ Navegación privada", next: "privacy_topic" },
      { text: "📱 Redes sociales seguras", next: "social_topic" },
      { text: "😺 ¡Solo saludar!", next: "greeting_random" },
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  🔐 CONTRASEÑAS
  // ═══════════════════════════════════════════════════════════════════════════

  password_topic: {
    message: "Las contraseñas son tu primera línea de defensa 🛡️\n\n¿Qué quieres saber?",
    options: [
      { text: "¿Cómo creo una contraseña fuerte?", next: "password_strong" },
      { text: "¿Debo usar la misma contraseña en todo?", next: "password_unique" },
      { text: "¿Qué es un gestor de contraseñas?", next: "password_manager" },
      { text: "¿Cada cuánto debo cambiar mi contraseña?", next: "password_change" },
      { text: "← Volver al menú", next: "root" },
    ]
  },

  password_strong: {
    message: "✅ Una contraseña FUERTE tiene:\n\n• 12+ caracteres (mínimo)\n• Mayúsculas Y minúsculas\n• Números y símbolos\n• Nada personal (no cumpleaños, nombres...)\n\n💡 Ejemplo: 'Gat0$Segur0_2024!🐱'\n\n🚫 Evita: '123456', 'password', 'tu_nombre123'",
    options: [
      { text: "¿Me das más ejemplos?", next: "password_examples" },
      { text: "¿Cómo recuerdo tantas contraseñas?", next: "password_manager" },
      { text: "← Volver a contraseñas", next: "password_topic" },
    ]
  },

  password_examples: {
    message: "🎯 Más ejemplos de contraseñas fuertes:\n\n• 'M1Gat0_C0me_Pescad0!🐟'\n• 'Naveg0#Segur0_2024💻'\n• 'Cyber$3gur1dad_M0la!🔐'\n\n💡 Truco: Usa una FRASE y conviértela:\n'El gato de mi abuela come pescado los martes'\n→ 'Egdmacplm$2024!'",
    options: [
      { text: "¡Eso es genial! Más consejos", next: "password_strong" },
      { text: "← Volver", next: "password_topic" },
    ]
  },

  password_unique: {
    message: "🚨 ¡NUNCA uses la misma contraseña en varios sitios! 🚨\n\nSi un sitio es hackeado (y pasa más de lo que crees 😱), los hackers probarán esa contraseña en TODAS tus cuentas.\n\n💡 Imagina: si tu contraseña de Instagram es la misma que la del banco... ¡un hacker podría acceder a tu dinero! 💸",
    options: [
      { text: "¿Y cómo recuerdo tantas contraseñas?", next: "password_manager" },
      { text: "Entiendo, ¿qué más debo saber?", next: "password_topic" },
      { text: "← Volver al menú", next: "root" },
    ]
  },

  password_manager: {
    message: "🔑 Un gestor de contraseñas es como una BÓVEDA digital 🔐\n\nSolo recuerdas UNA contraseña maestra, y el gestor guarda todas las demás por ti.\n\n✅ Ventajas:\n• Genera contraseñas ultra-fuertes\n• Las autocompleta en los sitios\n• Sincroniza entre dispositivos\n• Te avisa si alguna fue comprometida\n\n🏆 Populares: Bitwarden (gratis), 1Password, KeePass",
    options: [
      { text: "¿Es seguro confiar en un gestor?", next: "password_manager_safe" },
      { text: "← Volver a contraseñas", next: "password_topic" },
    ]
  },

  password_manager_safe: {
    message: "✅ ¡Sí! Los gestores son MUY seguros:\n\n• Usan cifrado militar (AES-256)\n• Tu contraseña maestra NUNCA sale de tu dispositivo\n• Ni siquiera la empresa puede ver tus contraseñas\n\n⚠️ Solo hay UN riesgo: si olvidas tu contraseña maestra, pierdes todo. ¡Anota esa en un papel seguro! 📝",
    options: [
      { text: "¡Voy a usar uno! Gracias 🐱", next: "password_topic" },
      { text: "← Volver al menú", next: "root" },
    ]
  },

  password_change: {
    message: "🔄 ¿Cada cuánto cambiarla?\n\n📅 Antiguo consejo: cada 3 meses\n📅 Nuevo consejo (NIST): SOLO si hay sospecha de compromiso\n\n¿Por qué? Cambiar constantemente hace que la gente use contraseñas MÁS DÉBILES 😅\n\n✅ Mejor: usa una contraseña FUERTE y ÚNICA desde el inicio, y actívala con 2FA.",
    options: [
      { text: "¿Qué es 2FA?", next: "password_2fa" },
      { text: "← Volver a contraseñas", next: "password_topic" },
    ]
  },

  password_2fa: {
    message: "🔐 2FA = Autenticación en Dos Factores\n\nEs como poner DOS cerraduras a tu cuenta 🔒🔒\n\n1️⃣ Algo que SABES: tu contraseña\n2️⃣ Algo que TIENES: tu teléfono (código SMS/app)\n\n✅ Apps recomendadas: Google Authenticator, Authy, Microsoft Authenticator\n\n⚠️ Evita SMS si puedes — las apps son más seguras.",
    options: [
      { text: "¡Excelente info! Volver al menú", next: "root" },
      { text: "← Volver a contraseñas", next: "password_topic" },
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  🎣 PHISHING
  // ═══════════════════════════════════════════════════════════════════════════

  phishing_topic: {
    message: "🎣 El phishing es cuando los atacantes fingen ser sitios legítimos para robar tus datos.\n\n¿Qué quieres aprender?",
    options: [
      { text: "¿Cómo sé si un email es falso?", next: "phishing_email" },
      { text: "¿Qué hago si hice clic en un link sospechoso?", next: "phishing_clicked" },
      { text: "¿Cómo verifico si una URL es segura?", next: "phishing_url" },
      { text: "¿Hay herramientas para detectar phishing?", next: "phishing_tools" },
      { text: "← Volver al menú", next: "root" },
    ]
  },

  phishing_email: {
    message: "🔍 Señales de un email de phishing:\n\n• 📧 Remitente extraño: 'support@paypa1.com' (¡con 1 en vez de l!)\n• ⏰ Urgencia excesiva: '¡Tu cuenta será CERRADA en 24h!'\n• 📝 Errores ortográficos o gramaticales\n• 🔗 Links que no coinciden con el texto (pasa el cursor por encima)\n• 🎁 Promesas demasiado buenas: '¡Ganaste un iPhone!'\n• 📎 Archivos adjuntos inesperados\n\n💡 Regla de oro: Si tienes dudas, NO hagas clic. Ve directamente al sitio web escribiendo la URL.",
    options: [
      { text: "¿Puedes darme ejemplos reales?", next: "phishing_examples" },
      { text: "← Volver a phishing", next: "phishing_topic" },
    ]
  },

  phishing_examples: {
    message: "🎭 Ejemplos REALES de phishing:\n\n❌ 'Netflix: Tu pago falló. Actualiza tu tarjeta AQUÍ'\n→ El link va a 'netflix-billing.xyz', no a netflix.com\n\n❌ 'Banco: Actividad sospechosa detectada. Verifica tu identidad'\n→ Te pide usuario, contraseña Y código SMS\n\n❌ 'Amazon: Pedido #12345 cancelado. Reclama aquí'\n→ Archivo adjunto 'factura.zip' con malware\n\n💡 Consejo: Las empresas SERIAS NUNCA te piden datos sensibles por email.",
    options: [
      { text: "¿Qué hago si recibí uno de estos?", next: "phishing_clicked" },
      { text: "← Volver", next: "phishing_topic" },
    ]
  },

  phishing_clicked: {
    message: "😱 ¡No entres en pánico! Sigue estos pasos:\n\n1️⃣ Si ingresaste datos: CAMBIA tu contraseña INMEDIATAMENTE\n2️⃣ Si era un banco: LLAMA al banco para bloquear la cuenta\n3️⃣ Activa 2FA en todas tus cuentas importantes\n4️⃣ Escanea tu dispositivo con antivirus\n5️⃣ Si descargaste algo: desconecta internet y escanea\n6️⃣ Reporta el phishing en: reportphishing@apwg.org\n\n🐱 ¡Tu CyberPet está aquí para ayudarte a prevenir esto!",
    options: [
      { text: "Gracias, tendré más cuidado 🙏", next: "root" },
      { text: "← Volver a phishing", next: "phishing_topic" },
    ]
  },

  phishing_url: {
    message: "🔍 Cómo verificar una URL:\n\n✅ HTTPS con candado (pero ojo: muchos sitios de phishing TAMBIÉN tienen HTTPS)\n✅ Dominio correcto: 'paypal.com' no 'paypal-secure.xyz'\n✅ Sin errores ortográficos: 'g0ogle.com' (con 0) es falso\n✅ Sin caracteres raros: 'amazon.com.phishing.site' no es Amazon\n\n💡 Truco: Pasa el cursor sobre el link SIN hacer clic para ver la URL real en la esquina inferior del navegador.",
    options: [
      { text: "¿Hay herramientas automáticas?", next: "phishing_tools" },
      { text: "← Volver a phishing", next: "phishing_topic" },
    ]
  },

  phishing_tools: {
    message: "🛠️ Herramientas útiles:\n\n🔬 VirusTotal: Analiza URLs con 70+ antivirus\n🛡️ Google Safe Browsing: Verifica sitios peligrosos\n🎭 EFF Cover Your Tracks: Comprueba tu privacidad\n🔐 SSL Labs: Analiza certificados SSL\n\n💡 ¡Todas estas herramientas están en la sección 'Herramientas' de esta extensión! 🔍",
    options: [
      { text: "¡Voy a revisarlas! Gracias 🐱", next: "root" },
      { text: "← Volver a phishing", next: "phishing_topic" },
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  🛡️ PRIVACIDAD
  // ═══════════════════════════════════════════════════════════════════════════

  privacy_topic: {
    message: "🛡️ La privacidad en internet es importante.\n\n¿Qué quieres saber?",
    options: [
      { text: "¿Qué son las cookies y trackers?", next: "privacy_cookies" },
      { text: "¿Debo usar una VPN?", next: "privacy_vpn" },
      { text: "¿Cómo navego de forma más privada?", next: "privacy_browse" },
      { text: "← Volver al menú", next: "root" },
    ]
  },

  privacy_cookies: {
    message: "🍪 Cookies y trackers:\n\n🍪 COOKIES: Pequeños archivos que los sitios guardan en tu navegador.\n• Útiles: mantienen tu sesión iniciada, carrito de compras\n• Molestas: rastrean lo que ves para mostrarte anuncios\n\n👁️ TRACKERS: Scripts que te siguen de sitio en sitio.\n• Facebook Pixel: sabe qué ves aunque no estés en Facebook\n• Google Analytics: registra cada clic\n• Redes de anuncios: construyen un perfil tuyo\n\n💡 Consejo: Usa el modo incógnito para sitios que no requieren login.",
    options: [
      { text: "¿Cómo bloqueo los trackers?", next: "privacy_browse" },
      { text: "← Volver a privacidad", next: "privacy_topic" },
    ]
  },

  privacy_vpn: {
    message: "🔒 VPN = Red Privada Virtual\n\n¿Para qué sirve?\n✅ Oculta tu IP real\n✅ Cifra tu tráfico (útil en WiFi público ☕)\n✅ Permite acceder a contenido geobloqueado\n\n⚠️ Lo que NO hace:\n❌ No te hace 100% anónimo\n❌ No evita cookies ni trackers\n❌ No protege contra phishing\n\n💡 ¿Necesitas una? Sí, especialmente en WiFi público. Opciones: ProtonVPN (gratis), Mullvad, ExpressVPN.",
    options: [
      { text: "¿Las VPN gratis son seguras?", next: "privacy_vpn_free" },
      { text: "← Volver a privacidad", next: "privacy_topic" },
    ]
  },

  privacy_vpn_free: {
    message: "⚠️ ¡Cuidado con las VPN gratis!\n\n🚨 Muchas VPN 'gratis':\n• Venden tus datos a anunciantes\n• Inyectan anuncios en tu navegación\n• Tienen límites de datos muy bajos\n• Pueden contener malware\n\n✅ VPNs gratis REALES (que no venden datos):\n• ProtonVPN (gratis con límites)\n• Windscribe (10GB/mes gratis)\n• TunnelBear (500MB/mes gratis)\n\n💡 Si quieres privacidad de verdad, paga por una VPN confiable.",
    options: [
      { text: "Entendido, gracias 🐱", next: "privacy_topic" },
      { text: "← Volver al menú", next: "root" },
    ]
  },

  privacy_browse: {
    message: "🔒 Consejos para navegar más privado:\n\n1️⃣ Usa un navegador enfocado en privacidad: Firefox, Brave, o Tor\n2️⃣ Instala extensiones: uBlock Origin, Privacy Badger\n3️⃣ Desactiva cookies de terceros en configuración\n4️⃣ Usa modo incógnito para sitios que no requieren login\n5️⃣ Considera un motor de búsqueda privado: DuckDuckGo, Startpage\n6️⃣ Usa una VPN en WiFi público\n7️⃣ Limpia cookies regularmente\n\n🐱 ¡Yo (CyberPet) puedo ayudarte a detectar amenazas mientras navegas!",
    options: [
      { text: "¡Voy a aplicar estos consejos!", next: "root" },
      { text: "← Volver a privacidad", next: "privacy_topic" },
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  📱 REDES SOCIALES
  // ═══════════════════════════════════════════════════════════════════════════

  social_topic: {
    message: "📱 Las redes sociales pueden ser riesgosas si no las configuras bien.\n\n¿Qué quieres saber?",
    options: [
      { text: "¿Cómo configuro mi privacidad en redes?", next: "social_privacy" },
      { text: "¿Qué no debo publicar nunca?", next: "social_dont_post" },
      { text: "¿Cómo evito el acoso en línea?", next: "social_harassment" },
      { text: "← Volver al menú", next: "root" },
    ]
  },

  social_privacy: {
    message: "🔒 Configuración de privacidad en redes:\n\n✅ Revisa quién puede ver tus publicaciones (mejor: solo amigos)\n✅ Desactiva la ubicación en tus posts\n✅ Limita quién puede etiquetarte\n✅ Revisa las apps conectadas a tu cuenta\n✅ Usa autenticación en dos factores (2FA)\n✅ Revisa tu 'actividad reciente' regularmente\n\n💡 Consejo: Una vez al mes, haz una 'auditoría de privacidad' de tus redes.",
    options: [
      { text: "¿Qué más debo tener en cuenta?", next: "social_dont_post" },
      { text: "← Volver a redes sociales", next: "social_topic" },
    ]
  },

  social_dont_post: {
    message: "🚫 NUNCA publiques esto en redes:\n\n❌ Fotos de tu documento de identidad, tarjetas, boletos de avión\n❌ Tu dirección exacta o rutina diaria\n❌ Fotos que revelen tu ubicación (matrícula del colegio, uniforme)\n❌ Información financiera (sueldo, deudas, compras caras)\n❌ Quejas sobre tu trabajo o jefe (puede costarte el empleo)\n❌ Fotos íntimas o comprometedoras (¡siempre!)\n\n💡 Recuerda: Internet es PARA SIEMPRE. Lo que subes, aunque lo borres, puede haber sido guardado por alguien.",
    options: [
      { text: "¡Qué fuerte! Tendré más cuidado 😅", next: "social_topic" },
      { text: "← Volver al menú", next: "root" },
    ]
  },

  social_harassment: {
    message: "🛡️ Cómo manejar el acoso en línea:\n\n1️⃣ NO respondas — es lo que quieren\n2️⃣ BLOQUEA y REPORTA al acosador\n3️⃣ Guarda pruebas (capturas de pantalla)\n4️⃣ Configura tu cuenta como privada temporalmente\n5️⃣ Si es grave, denuncia a las autoridades\n\n💙 Si estás pasando por esto:\n• Habla con alguien de confianza\n• Recuerda: NO es tu culpa\n• Hay líneas de ayuda disponibles\n\n🐱 Tu seguridad es lo más importante.",
    options: [
      { text: "Gracias, es bueno saberlo 💙", next: "root" },
      { text: "← Volver a redes sociales", next: "social_topic" },
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  😺 SALUDOS Y PERSONALIDAD
  // ═══════════════════════════════════════════════════════════════════════════

  greeting_random: {
    message: "¡Miau! 😺 ¡Qué gusto saludarte{userName}!\n\nSoy {petName}, tu compañero de seguridad digital. 🐱\n\n¿Sabías que los gatos en internet existen desde 1994? ¡El primer video de gato en YouTube tiene más de 100 millones de vistas! 🎥\n\n¿En qué más puedo ayudarte?",
    options: [
      { text: "🔐 Quiero aprender sobre contraseñas", next: "password_topic" },
      { text: "🎣 ¿Y sobre phishing?", next: "phishing_topic" },
      { text: "😺 Solo quería saludar, ¡gracias!", next: "greeting_bye" },
    ]
  },

  greeting_bye: {
    message: "¡Fue un placer charlar contigo{userName}! 🐾\n\nRecuerda: navegar seguro es navegar feliz. 🌟\n\n¡Vuelve cuando quieras! Yo estaré aquí, vigilando tu seguridad. 😺\n\n*se acurruca en su esquina digital* 💤",
    options: [
      { text: "🔄 Empezar de nuevo", next: "root" },
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  NODOS DE RELLENO (fallbacks)
  // ═══════════════════════════════════════════════════════════════════════════

  fallback_unknown: {
    message: "🤔 Mmm, no estoy seguro de entender esa opción. ¡Pero puedo ayudarte con otros temas!\n\n¿Qué te gustaría aprender sobre seguridad digital?",
    options: [
      { text: "🔐 Contraseñas seguras", next: "password_topic" },
      { text: "🎣 Detectar phishing", next: "phishing_topic" },
      { text: "🛡️ Navegación privada", next: "privacy_topic" },
      { text: "📱 Redes sociales seguras", next: "social_topic" },
    ]
  },
};

// ════════════════════════════════════════════════════════════════════════════
//  FUNCIÓN PRINCIPAL: Obtener respuesta del diálogo
// ════════════════════════════════════════════════════════════════════════════

/**
 * Obtiene la respuesta para un nodo del árbol de diálogos.
 * 
 * @param {string} nodeId - ID del nodo (ej: 'root', 'password_topic')
 * @param {string} userName - Nombre del usuario (para personalizar mensajes)
 * @param {string} petName - Nombre de la mascota (CyberPet)
 * @returns {{ message: string, options: Array<{text: string, next: string}> }}
 */
export function getDialogResponse(nodeId, userName = '', petName = 'CyberPet') {
  // Si el nodo no existe, usar fallback
  const node = DIALOG_TREE[nodeId] || DIALOG_TREE.fallback_unknown;
  
  // Personalizar mensaje con nombre del usuario y mascota
  const displayName = userName ? `, ${userName}` : '';
  const displayPet = petName || 'CyberPet';
  
  const message = node.message
    .replace('{userName}', displayName)
    .replace('{petName}', displayPet);
  
  return {
    message,
    options: node.options || [],
  };
}

/**
 * Obtiene un mensaje de bienvenida aleatorio.
 */
export function getRandomGreeting(userName = '', petName = 'CyberPet') {
  const greetings = [
    `¡Hola${userName ? ', ' + userName : ''}! Soy ${petName}, tu guardián digital 🐱`,
    `¡Miau! 😺 ¡Qué gusto verte${userName ? ', ' + userName : ''}! Soy ${petName}.`,
    `¡${userName || 'Navegante'}! ¡Soy ${petName} y estoy aquí para ayudarte con tu seguridad! 🛡️`,
    `¡Hola${userName ? ', ' + userName : ''}! ${petName} al habla 🐾 ¿Listo para navegar seguros?`,
  ];
  
  return greetings[Math.floor(Math.random() * greetings.length)];
}

/**
 * Obtiene un consejo aleatorio basado en el contexto.
 */
export function getRandomTip(context = 'general') {
  const tips = {
    general: [
      "💡 Consejo del día: Usa una contraseña diferente para cada cuenta importante.",
      "🔐 ¿Sabías que el 81% de las filtraciones de datos son por contraseñas robadas o débiles?",
      "🛡️ Activa la verificación en dos pasos en todas tus cuentas importantes.",
      "🎣 Desconfía de los emails que crean urgencia o miedo — es una táctica común de phishing.",
      "🔒 Un gestor de contraseñas es tu mejor amigo para la seguridad digital.",
    ],
    password: [
      "💪 Una contraseña de 12+ caracteres con variedad es 1000 veces más segura que una de 8.",
      "🎯 Usa frases en vez de palabras: 'MiGatoComePescadoLosMartes' es más segura que 'Gat0123!'.",
    ],
    phishing: [
      "🔍 Siempre verifica el remitente de un email antes de hacer clic en cualquier enlace.",
      "🎣 Si un email te pide datos urgentes, contacta a la empresa directamente por su web oficial.",
    ],
  };
  
  const category = tips[context] || tips.general;
  return category[Math.floor(Math.random() * category.length)];
}

export default {
  DIALOG_TREE,
  getDialogResponse,
  getRandomGreeting,
  getRandomTip,
};