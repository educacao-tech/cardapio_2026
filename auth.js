const express = require('express');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const router = express.Router();

// Configurações de acesso (Mantenha seguras!)
const ADMIN_EMAIL = 'madscold@gmail.com';
const ADMIN_PASSWORD = 'qwe123';
const CAPTCHA_SECRET = 'batatais-2026-secret-key';

// Defina como true para pular o envio de e-mail e o código 2FA nos testes locais
const BYPASS_2FA = true; 

// Estados temporários em memória
const failedAttempts = {}; 
const pending2FA = {}; 

// Configuração do serviço de e-mail
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'seu-email@gmail.com',
        pass: 'sua-senha-de-app'
    }
});

const maskValue = (value) => {
    if (!value) return 'ausente';
    return value.length > 4 ? `${value.slice(0, 2)}****${value.slice(-2)}` : '****';
};

/**
 * Middleware de Autenticação Centralizado
 */
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers['x-admin-token'];
    const authUser = req.headers['x-admin-user'];
    const twoFaHeader = req.headers['x-admin-2fa'];
    const ip = req.ip;
    const failures = failedAttempts[ip] || 0;
    
    // Log detalhado para identificar o motivo da rejeição
    console.log(`[AUTH] Tentativa de Login:
      - E-mail recebido: "${authUser}"
      - E-mail esperado: "${ADMIN_EMAIL}"
      - Token/Senha: ${maskValue(authHeader)}
      - IP: ${ip}`);

    if (!authHeader || authHeader.length < 6) {
        return res.status(401).json({ error: 'Acesso negado. Senha muito curta ou ausente.' });
    }

    // Comparação de e-mail ignorando maiúsculas/minúsculas
    const isEmailValid = authUser && authUser.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();

    if (isEmailValid && authHeader !== ADMIN_PASSWORD) {
        console.log(`[AUTH DEBUG] ❌ Senha incorreta para o usuário: ${authUser}`);
    }

    if (isEmailValid && authHeader === ADMIN_PASSWORD) {
        // Se a senha básica está correta, limpamos o contador de falhas de IP
        // para evitar que o CAPTCHA fique travando o acesso legítimo.
        if (failures > 0) delete failedAttempts[ip];

        // Pula a verificação de 2FA se o bypass estiver ativo ou em ambiente de dev
        if (BYPASS_2FA || process.env.NODE_ENV === 'development') {
            console.log(`[AUTH] Login automático (2FA Ignorado) para ${authUser}`);
            return next();
        }

        const record = pending2FA[authUser];

        if (record && record.verified) return next();

        if (twoFaHeader && record && record.code === twoFaHeader && Date.now() < record.expires) {
            record.verified = true;
            return next();
        }

        if (!record || Date.now() > record.expires) {
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            pending2FA[authUser] = { code, expires: Date.now() + 5 * 60 * 1000, verified: false };
            
            transporter.sendMail({
                from: '"Sistema de Cardápio" <seu-email@gmail.com>',
                to: authUser,
                subject: 'Seu Código de Acesso - Admin',
                text: `Seu código de verificação é: ${code}. Ele expira em 5 minutos.`
            })
            .then(() => console.log(`[2FA] E-mail enviado com sucesso para: ${authUser} (Código: ${code})`))
            .catch(err => console.error('Erro ao enviar e-mail 2FA:', err));
        }

        return res.status(401).json({ error: 'Código de verificação enviado ao seu e-mail.', require2FA: true });
    }

    if (failures >= 2 && process.env.NODE_ENV !== 'development') {
        const captchaAns = req.headers['x-captcha-ans'];
        const captchaToken = req.headers['x-captcha-token'];
        
        if (!captchaAns || !captchaToken) {
            return res.status(401).json({ error: 'Captcha obrigatório', requireCaptcha: true });
        }

        const expectedHash = crypto.createHmac('sha256', CAPTCHA_SECRET).update(captchaAns).digest('hex');
        if (expectedHash !== captchaToken) {
            return res.status(401).json({ error: 'Captcha incorreto', requireCaptcha: true });
        }
    }

    failedAttempts[ip] = failures + 1;
    console.warn(`[AUTH] Tentativa negada de ${req.ip}. Valor: ${maskValue(authHeader)}`);
    res.status(401).json({ 
        error: 'Acesso negado. Senha incorreta.', 
        requireCaptcha: failedAttempts[ip] >= 2 
    });
};

/**
 * Rota de desafio de CAPTCHA
 */
router.get('/get-captcha', (req, res) => {
    const n1 = Math.floor(Math.random() * 10);
    const n2 = Math.floor(Math.random() * 10);
    const answer = (n1 + n2).toString();
    const token = crypto.createHmac('sha256', CAPTCHA_SECRET).update(answer).digest('hex');
    res.json({ question: `Quanto é ${n1} + ${n2}?`, token });
});

module.exports = { router, authMiddleware };