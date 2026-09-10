/**
 * CyberPet — password-checker.js
 *
 * Utilidad compartida de contraseñas.
 * Uso en popup/dashboard: <script type="module"> import { ... } from './password-checker.js'
 * O bien: <script src="password-checker.js"> y usar window.PasswordChecker
 *
 * NOTA: content.js incluye su propio isWeakPassword() inline porque los
 * content scripts no soportan ES modules sin bundler. Si en el futuro
 * se añade un paso de build (webpack/rollup), reemplazar con este módulo.
 */

const PasswordChecker = {

    /** Fuerza numérica 0-100 */
    score(password) {
        if (!password) return 0;
        let s = 0;
        if (password.length >= 8)  s += 20;
        if (password.length >= 12) s += 15;
        if (password.length >= 16) s += 15;
        if (/[a-z]/.test(password)) s += 10;
        if (/[A-Z]/.test(password)) s += 10;
        if (/\d/.test(password))    s += 10;
        if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) s += 15;
        if (/(.)\1{2,}/.test(password))               s -= 10;
        if (/123|abc|password|qwerty/i.test(password)) s -= 15;
        return Math.max(0, Math.min(100, s));
    },

    /** { level, label, color } */
    category(password) {
        const s = this.score(password);
        if (s >= 80) return { level: 'strong',    label: 'Fuerte',    color: '#22c55e' };
        if (s >= 60) return { level: 'medium',    label: 'Media',     color: '#f59e0b' };
        if (s >= 40) return { level: 'weak',      label: 'Débil',     color: '#ef4444' };
        return         { level: 'very-weak', label: 'Muy Débil', color: '#dc2626' };
    },

    /** Array de sugerencias de mejora */
    suggestions(password) {
        const tips = [];
        if (!password || password.length < 12)                tips.push('Usa al menos 12 caracteres');
        if (password && !/[A-Z]/.test(password))              tips.push('Añade mayúsculas');
        if (password && !/[a-z]/.test(password))              tips.push('Añade minúsculas');
        if (password && !/\d/.test(password))                 tips.push('Añade números');
        if (password && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) tips.push('Añade símbolos (!@#$%...)');
        if (password && /(.)\1{2,}/.test(password))           tips.push('Evita caracteres repetidos');
        if (password && /123|abc|password|qwerty/i.test(password)) tips.push('Evita patrones comunes');
        return tips;
    },

    /** Genera contraseña segura garantizando variedad de tipos */
    generate(len = 16) {
        const lc  = 'abcdefghijklmnopqrstuvwxyz';
        const uc  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const num = '0123456789';
        const sym = '!@#$%^&*()_+-=[]{}|;:,.<>?';
        const all = lc + uc + num + sym;
        let p = lc[~~(Math.random()*lc.length)] + uc[~~(Math.random()*uc.length)]
               + num[~~(Math.random()*num.length)] + sym[~~(Math.random()*sym.length)];
        for (let i = p.length; i < len; i++) p += all[~~(Math.random() * all.length)];
        return p.split('').sort(() => Math.random() - 0.5).join('');
    },

    /**
     * Hash SHA-256 de una contraseña (para verificar con HIBP k-anonymity).
     * Devuelve el hex del hash en mayúsculas.
     */
    async hash(password) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('').toUpperCase();
    },

    /**
     * Verifica si la contraseña está en la base de datos de HIBP Passwords.
     * Usa k-anonymity: solo envía los primeros 5 chars del hash.
     * Devuelve: { pwned: boolean, count: number }
     */
    async checkHIBP(password) {
        try {
            const fullHash = await this.hash(password);
            const prefix   = fullHash.slice(0, 5);
            const suffix   = fullHash.slice(5);
            const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
                headers: { 'Add-Padding': 'true' }
            });
            if (!res.ok) return { pwned: false, count: 0, error: res.status };
            const text = await res.text();
            const match = text.split('\r\n').find(line => line.startsWith(suffix));
            if (match) {
                const count = parseInt(match.split(':')[1], 10);
                return { pwned: true, count };
            }
            return { pwned: false, count: 0 };
        } catch (err) {
            return { pwned: false, count: 0, error: err.message };
        }
    }
};

// Exportar para popup/dashboard (script clásico → global; ES module → named export)
if (typeof module !== 'undefined') {
    module.exports = PasswordChecker;
} else {
    window.PasswordChecker = PasswordChecker;
}