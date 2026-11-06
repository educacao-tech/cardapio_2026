/**
 * Módulo de Validação e Sanitização de Dados
 */

const VALID_MONTHS = new Set([
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
]);

/**
 * Valida rigorosamente a estrutura do payload do cardápio recebido via API
 * @param {any} payload - Dados recebidos na requisição
 * @returns {{ valid: boolean, error?: string }}
 */
function validateMenuSchema(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return { valid: false, error: 'O payload deve ser um objeto JSON raiz.' };
    }

    const years = Object.keys(payload);
    if (years.length === 0) {
        return { valid: false, error: 'O cardápio não contém nenhum ano configurado.' };
    }

    for (const year of years) {
        if (!/^\d{4}$/.test(year)) {
            return { valid: false, error: `Chave de ano inválida: "${year}". Esperado formato AAAA (ex: 2026).` };
        }

        const yearData = payload[year];
        if (!yearData || typeof yearData !== 'object' || Array.isArray(yearData)) {
            return { valid: false, error: `Os dados do ano ${year} devem ser um objeto contendo os meses.` };
        }

        for (const month of Object.keys(yearData)) {
            const lowerMonth = month.toLowerCase();
            if (!VALID_MONTHS.has(lowerMonth)) {
                return { valid: false, error: `Mês desconhecido ou inválido: "${month}".` };
            }

            const weeks = yearData[month];
            if (!Array.isArray(weeks)) {
                return { valid: false, error: `O mês "${month}" deve conter uma lista (array) de semanas.` };
            }

            for (let i = 0; i < weeks.length; i++) {
                const week = weeks[i];
                if (!week || typeof week !== 'object') {
                    return { valid: false, error: `Semana #${i + 1} em ${month} inválida.` };
                }

                if (!week.weekId || typeof week.weekId !== 'string') {
                    return { valid: false, error: `Semana #${i + 1} em ${month} não possui weekId válido.` };
                }

                if (!week.links || typeof week.links !== 'object') {
                    return { valid: false, error: `Semana "${week.weekId}" não possui o mapa de links das escolas.` };
                }
            }
        }
    }

    return { valid: true };
}

/**
 * Validação rigorosa contra Server-Side Request Forgery (SSRF)
 * Bloqueia esquemas perigosos (file:, gopher:), IPs privados de intranet e bypass de domínio
 * @param {string} urlString
 * @param {string[]} allowedDomains
 * @returns {{ safe: boolean, error?: string, parsedUrl?: URL }}
 */
function isSafeUrl(urlString, allowedDomains = ['drive.google.com', 'docs.google.com', 'google.com']) {
    if (!urlString || typeof urlString !== 'string' || urlString === '#' || !urlString.trim()) {
        return { safe: false, error: 'URL vazia ou não preenchida.' };
    }

    let parsed;
    try {
        parsed = new URL(urlString.trim());
    } catch (_) {
        return { safe: false, error: 'Formato de URL inválido.' };
    }

    // Permite estritamente HTTP e HTTPS
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { safe: false, error: 'Protocolo não permitido. Use apenas https.' };
    }

    const host = parsed.hostname.toLowerCase();

    // Bloqueia hostnames locais e endereços de loopback/intranet
    const privateHostnames = ['localhost', '127.0.0.1', '::1', '0.0.0.0'];
    if (privateHostnames.includes(host)) {
        return { safe: false, error: 'Acesso a endereços locais não é permitido.' };
    }

    // Bloqueia IPs privados (RFC 1918)
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/.test(host)) {
        return { safe: false, error: 'Acesso a faixas de rede privada não é permitido.' };
    }

    // Validação estrita de domínio (igualdade exata ou subdomínio precedido por ponto)
    const isDomainAllowed = allowedDomains.some(allowed => 
        host === allowed || host.endsWith('.' + allowed)
    );

    if (!isDomainAllowed) {
        return { safe: false, error: `Domínio "${host}" não está na lista de permissões.` };
    }

    return { safe: true, parsedUrl: parsed };
}

/**
 * Sanitiza o nome do operador para gravação em logs e comandos Git
 * @param {string} user 
 * @returns {string}
 */
function sanitizeUser(user) {
    if (!user || typeof user !== 'string') return 'Desconhecido';
    return user.replace(/[^a-zA-Z0-9@._ -]/g, '').slice(0, 60).trim() || 'Admin';
}

module.exports = {
    VALID_MONTHS,
    validateMenuSchema,
    isSafeUrl,
    sanitizeUser
};

