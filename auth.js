const express = require('express');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const router = express.Router();

// Configurações de acesso e segredos
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'madscold@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const CAPTCHA_SECRET = process.env.CAPTCHA_SECRET || 'batatais-2026-secret-key';

if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    console.warn("⚠️ AVISO: Usando ADMIN_EMAIL e ADMIN_PASSWORD padrão para desenvolvimento local.");
}

const BYPASS_2FA = process.env.NODE_ENV === 'development' || !process.env.EMAIL_USER;

// Armazenamento em memória com controle de vazamento (LRU / TTL Map)
const failedAttempts = new Map();
const pending2FA = new Map();

// Rotina periódica para evitar vazamento de memória (Memory Leak)
setInterval(() => {
    const now = Date.now();
    for (const [ip, item] of failedAttempts.entries()) {
        if (now - item.timestamp > 15 * 60 * 1000) failedAttempts.delete(ip);
    }
    for (const [user, item] of pending2FA.entries()) {
        if (now > item.expires) pending2FA.delete(user);
    }
}, 5 * 60 * 1000).unref();

// Configuração do serviço de e-mail
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * Comparação de strings segura contra Timing Attacks
 */
function safeTimingCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Gera um token de sessão assinado (HMAC-SHA256) com tempo de expiração
 */
function generateSessionToken(email, durationHours = 4) {
    const expiresAt = Date.now() + (durationHours * 60 * 60 * 1000);
    const payload = JSON.stringify({
        email: email.toLowerCase(),
        expiresAt,
        nonce: crypto.randomBytes(12).toString('hex')
    });
    const base64Payload = Buffer.from(payload).toString('base64url');
    const signature = crypto.createHmac('sha256', SESSION_SECRET).update(base64Payload).digest('base64url');
    return `${base64Payload}.${signature}`;
}

/**
 * Valida o token de sessão assinado
 */
function verifySessionToken(token) {
    if (!token || typeof token !== 'string' || !token.includes('.')) return null;
    const [base64Payload, signature] = token.split('.');
    if (!base64Payload || !signature) return null;

    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(base64Payload).digest('base64url');
    if (!safeTimingCompare(signature, expectedSig)) return null;

    try {
        const payload = JSON.parse(Buffer.from(base64Payload, 'base64url').toString('utf8'));
        if (!payload || !payload.expiresAt || Date.now() > payload.expiresAt) return null;
        return payload;
    } catch (_) {
        return null;
    }
}

/**
 * Endpoint de Login com geração de Token de Sessão Assinado
 */
router.post('/login', (req, res) => {
    const { password, email, twoFa, captchaAns, captchaToken } = req.body || {};
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const failRecord = failedAttempts.get(ip) || { count: 0, timestamp: Date.now() };

    // Validação de CAPTCHA se houver histórico de falhas
    if (failRecord.count >= 2 && process.env.NODE_ENV !== 'development') {
        if (!captchaAns || !captchaToken) {
            return res.status(401).json({ error: 'Captcha obrigatório.', requireCaptcha: true });
        }
        const [cNonce, cExpires, cHash] = String(captchaToken).split(':');
        if (!cNonce || !cExpires || !cHash || Date.now() > parseInt(cExpires, 10)) {
            return res.status(401).json({ error: 'Captcha expirado. Solicite outro.', requireCaptcha: true });
        }
        const expectedHash = crypto.createHmac('sha256', CAPTCHA_SECRET).update(`${cNonce}:${cExpires}:${captchaAns}`).digest('hex');
        if (!safeTimingCompare(cHash, expectedHash)) {
            return res.status(401).json({ error: 'Resposta do Captcha incorreta.', requireCaptcha: true });
        }
    }

    const authUser = (email && typeof email === 'string' && email.trim()) ? email.trim() : ADMIN_EMAIL;
    const isPasswordValid = safeTimingCompare(String(password), ADMIN_PASSWORD);
    const isEmailValid = authUser.toLowerCase() === ADMIN_EMAIL.toLowerCase();

    if (!isPasswordValid || !isEmailValid) {
        failRecord.count += 1;
        failRecord.timestamp = Date.now();
        failedAttempts.set(ip, failRecord);
        return res.status(401).json({
            error: 'Credenciais incorretas.',
            requireCaptcha: failRecord.count >= 2
        });
    }

    // Sucesso na senha: zera falhas
    failedAttempts.delete(ip);

    // Validação de 2FA
    if (!BYPASS_2FA && process.env.NODE_ENV !== 'development') {
        const record = pending2FA.get(authUser);
        if (twoFa && record && safeTimingCompare(String(twoFa), record.code) && Date.now() < record.expires) {
            pending2FA.delete(authUser);
        } else {
            if (!record || Date.now() > record.expires) {
                const code = Math.floor(100000 + Math.random() * 900000).toString();
                pending2FA.set(authUser, { code, expires: Date.now() + 5 * 60 * 1000 });
                
                transporter.sendMail({
                    from: '"Sistema de Cardápio" <noreply@batatais.sp.gov.br>',
                    to: authUser,
                    subject: 'Seu Código de Acesso - Admin',
                    text: `Seu código de verificação é: ${code}. Ele expira em 5 minutos.`
                }).catch(err => console.error('Erro ao enviar e-mail 2FA:', err.message));
            }
            return res.status(401).json({ error: 'Código de verificação enviado ao seu e-mail.', require2FA: true });
        }
    }

    // Gera token de sessão assinado
    const token = generateSessionToken(authUser, 4);
    res.json({
        success: true,
        token,
        email: authUser,
        expiresInHours: 4
    });
});

/**
 * Middleware Centralizado de Autenticação
 * Valida tanto tokens de sessão assinados quanto senha mestra para compatibilidade
 */
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers['authorization'] || req.headers['x-admin-token'];
    const rawAuthUser = req.headers['x-admin-user'];
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    if (!authHeader) {
        return res.status(401).json({ error: 'Acesso negado. Token ausente.' });
    }

    // 1. Tenta validar como Token de Sessão Assinado
    const cleanToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
    const sessionData = verifySessionToken(cleanToken);

    if (sessionData) {
        req.user = sessionData.email;
        return next();
    }

    // 2. Fallback de compatibilidade para senha direta (com comparação segura)
    const isPasswordValid = safeTimingCompare(cleanToken, ADMIN_PASSWORD);
    const authUser = rawAuthUser ? rawAuthUser.split(',')[0].trim().toLowerCase() : ADMIN_EMAIL.toLowerCase();

    if (isPasswordValid && authUser === ADMIN_EMAIL.toLowerCase()) {
        req.user = authUser;
        return next();
    }

    return res.status(401).json({ error: 'Sessão expirada ou credenciais inválidas.' });
};

/**
 * Rota de Desafio de CAPTCHA Criptográfico (com Nonce e Expiração)
 */
router.get('/get-captcha', (req, res) => {
    const n1 = Math.floor(Math.random() * 10);
    const n2 = Math.floor(Math.random() * 10);
    const answer = String(n1 + n2);
    const nonce = crypto.randomBytes(8).toString('hex');
    const expiresAt = Date.now() + (3 * 60 * 1000); // 3 minutos
    const hmacHash = crypto.createHmac('sha256', CAPTCHA_SECRET).update(`${nonce}:${expiresAt}:${answer}`).digest('hex');
    const token = `${nonce}:${expiresAt}:${hmacHash}`;

    res.json({ question: `Quanto é ${n1} + ${n2}?`, token });
});

module.exports = {
    router,
    authMiddleware,
    generateSessionToken,
    verifySessionToken
};
