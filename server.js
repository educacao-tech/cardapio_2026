const express = require('express');
const webpush = require('web-push');
const path = require('path');
const cors = require('cors');
const open = require('open');
const { execFile } = require('child_process');

const { router: authRoutes, authMiddleware } = require('./auth');
const { atomicWriteJson, readJsonSafe, createBackup } = require('./src/storage');
const { validateMenuSchema, isSafeUrl, sanitizeUser } = require('./src/validator');
const { sendPushNotificationsInBatches } = require('./src/pushService');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Logger simples para diagnóstico
app.use((req, res, next) => {
    console.log(`${new Date().toLocaleTimeString()} - ${req.method} ${req.url}`);
    next();
});

// Rotas de autenticação (/api/login, /api/get-captcha)
app.use('/api', authRoutes);

// Rate limiter de segurança
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    skip: () => process.env.NODE_ENV === 'development',
    message: 'Muitas requisições deste IP, tente novamente em 15 minutos.'
});

// Configuração VAPID para Web Push
const publicVapidKey = 'BPoKCZuBpJ-g5oLho2InYbeTD0zFCajVglfB0xVyvMVMGRsnHfWOx-EmkEqVpQuMn04F9CvDvICLD5Zn5YcbfzI';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || '';

if (publicVapidKey && privateVapidKey) {
    webpush.setVapidDetails('mailto:suporte@batatais.sp.gov.br', publicVapidKey, privateVapidKey);
} else {
    console.warn('⚠️ Notificações Push desativadas: Chave privada VAPID não configurada.');
}

const MENU_FILE = path.join(__dirname, 'menu-links.json');
const LOG_FILE = path.join(__dirname, 'audit-log.json');
const SUBS_FILE = path.join(__dirname, 'subscriptions.json');

let subscriptions = [];
readJsonSafe(SUBS_FILE, []).then(subs => { subscriptions = subs || []; });

/**
 * 1. Rota para ler o cardápio (segura contra crash de JSON malformado)
 */
app.get('/api/menu', loginLimiter, authMiddleware, async (req, res) => {
    const data = await readJsonSafe(MENU_FILE, null);
    if (!data) {
        return res.status(500).json({ error: 'Erro ao carregar cardápio ou arquivo corrompido.' });
    }
    res.json(data);
});

/**
 * 2. Rota para salvar o cardápio (com validação de schema, backup e escrita atômica)
 */
app.post('/api/menu', loginLimiter, authMiddleware, async (req, res) => {
    const menuData = req.body;
    
    // Validação de Schema (P2)
    const validation = validateMenuSchema(menuData);
    if (!validation.valid) {
        return res.status(422).json({ error: validation.error });
    }

    // Backup automático (P1)
    const BACKUP_DIR = path.join(__dirname, 'backups');
    await createBackup(MENU_FILE, BACKUP_DIR);

    try {
        // Gravação atômica (.tmp -> rename) para erradicar corrupção de dados (P1)
        await atomicWriteJson(MENU_FILE, menuData);
        console.log('✅ Cardápio salvo atômica e fisicamente em menu-links.json.');

        // Registro de Auditoria atômico
        const adminUser = sanitizeUser(req.user || req.headers['x-admin-user']);
        const logEntry = {
            user: adminUser,
            action: 'Atualização do Cardápio',
            timestamp: new Date().toISOString()
        };

        const logs = (await readJsonSafe(LOG_FILE, [])) || [];
        logs.push(logEntry);
        await atomicWriteJson(LOG_FILE, logs.slice(-100));

        // Auto Git Push imune a command injection (P0)
        autoGitPush(adminUser);

        res.json({ success: true, message: 'Cardápio salvo de forma atômica e publicado no GitHub.' });
    } catch (err) {
        console.error('❌ Erro crítico ao gravar cardápio:', err);
        res.status(500).json({ error: 'Erro ao salvar arquivo JSON', details: err.message });
    }
});

/**
 * Função para automação segura de Git Add, Commit e Push
 */
function autoGitPush(user = 'Desconhecido') {
    const cwd = __dirname;
    const sanitizedUser = sanitizeUser(user);
    const nowStr = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const commitMsg = `Atualização do cardápio via Admin por ${sanitizedUser} (${nowStr})`;

    console.log(`🚀 [Git Auto-Push Seguro] Enviando alterações para o GitHub via execFile...`);

    execFile('git', ['add', 'menu-links.json', 'audit-log.json'], { cwd }, (addErr) => {
        if (addErr) return console.error('❌ [Git Auto-Push] Falha no git add:', addErr.message);

        execFile('git', ['commit', '-m', commitMsg], { cwd }, (commitErr, commitOut) => {
            if (commitErr && !commitErr.message.includes('nothing to commit') && (!commitOut || !commitOut.includes('nothing to commit'))) {
                return console.error('❌ [Git Auto-Push] Falha no git commit:', commitErr.message);
            }

            execFile('git', ['push', 'origin', 'main'], { cwd }, (pushErr, pushOut) => {
                if (pushErr) return console.error('❌ [Git Auto-Push] Falha no git push:', pushErr.message);
                console.log('✅ [Git Auto-Push] Publicado com sucesso no GitHub:\n', pushOut);
                cachedCommitInfo = null;
                lastCommitFetchTime = 0;
            });
        });
    });
}

/**
 * Rota para status do ambiente
 */
app.get('/api/env-status', loginLimiter, authMiddleware, (req, res) => {
    res.json({ isDevelopment: process.env.NODE_ENV === 'development' });
});

let cachedCommitInfo = null;
let lastCommitFetchTime = 0;

/**
 * Rota pública de informações do commit
 */
app.get('/api/github-commit', async (req, res) => {
    const now = Date.now();
    if (cachedCommitInfo && (now - lastCommitFetchTime < 5 * 60 * 1000)) {
        return res.json(cachedCommitInfo);
    }

    try {
        const response = await fetch('https://api.github.com/repos/educacao-tech/cardapio_2026/commits/main', {
            headers: { 'User-Agent': 'Cardapio-Batatais-App' }
        });
        if (response.ok) {
            const data = await response.json();
            cachedCommitInfo = {
                hash: data.sha ? data.sha.substring(0, 7) : '',
                fullHash: data.sha || '',
                message: data.commit?.message || '',
                date: data.commit?.committer?.date || data.commit?.author?.date || new Date().toISOString(),
                author: data.commit?.author?.name || 'educacao-tech',
                url: data.html_url || 'https://github.com/educacao-tech/cardapio_2026'
            };
            lastCommitFetchTime = now;
            return res.json(cachedCommitInfo);
        }
    } catch (_) {}

    try {
        const { execSync } = require('child_process');
        const gitLog = execSync('git log -1 --format="%h|%H|%cd|%s"', { encoding: 'utf8', cwd: __dirname }).trim();
        const parts = gitLog.split('|');
        if (parts.length >= 4) {
            const [hash, fullHash, dateStr, message] = parts;
            cachedCommitInfo = {
                hash,
                fullHash,
                message,
                date: new Date(dateStr).toISOString(),
                author: 'educacao-tech',
                url: `https://github.com/educacao-tech/cardapio_2026/commit/${fullHash}`
            };
            lastCommitFetchTime = now;
            return res.json(cachedCommitInfo);
        }
    } catch (_) {}

    return res.status(500).json({ error: 'Não foi possível obter dados de commit' });
});

/**
 * Rota para histórico de auditoria
 */
app.get('/api/audit-log', loginLimiter, authMiddleware, async (req, res) => {
    const logs = await readJsonSafe(LOG_FILE, []);
    res.json(logs.reverse().slice(0, 50));
});

/**
 * Rota para validação de links externos (SSRF-Protected)
 */
app.post('/api/proxy-check', loginLimiter, authMiddleware, async (req, res) => {
    const { url } = req.body || {};
    const check = isSafeUrl(url);

    if (!check.safe) {
        return res.status(400).json({ reachable: false, error: check.error });
    }

    try {
        const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
        res.json({ reachable: response.ok });
    } catch (_) {
        res.json({ reachable: false, error: 'Timeout ou indisponível.' });
    }
});

/**
 * Rota de inscrição Web Push com gravação atômica
 */
app.post('/api/subscribe', async (req, res) => {
    const { subscription } = req.body || {};
    if (!subscription || !subscription.endpoint || typeof subscription.endpoint !== 'string') {
        return res.status(400).json({ error: 'Assinatura inválida.' });
    }

    if (!subscriptions.some(s => s.endpoint === subscription.endpoint)) {
        subscriptions.push(subscription);
        await atomicWriteJson(SUBS_FILE, subscriptions);
    }
    res.status(201).json({ success: true });
});

/**
 * Rota para disparar notificações em lotes com purga de canceladas (P2)
 */
app.post('/api/notify-update', loginLimiter, authMiddleware, async (req, res) => {
    const { mes } = req.body || {};
    const sanitizedMes = String(mes || '').replace(/[^a-zA-ZÀ-ÿ0-9]/g, '').trim();

    if (!sanitizedMes) {
        return res.status(400).json({ error: 'Mês não informado ou inválido.' });
    }

    const payload = JSON.stringify({
        title: 'Cardápio Atualizado! 🍴',
        body: `Os links para o mês de ${sanitizedMes} já estão disponíveis no app.`,
        url: `/#month-${sanitizedMes.toLowerCase()}`
    });

    try {
        const result = await sendPushNotificationsInBatches(subscriptions, payload, 25);
        if (result.removedCount > 0) {
            subscriptions = result.activeSubscriptions;
            await atomicWriteJson(SUBS_FILE, subscriptions);
        }
        res.status(200).json({ success: true, sent: result.sentCount, removed: result.removedCount });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Proteção do servidor de estáticos
const SENSITIVE_STATIC_FILES = new Set([
    'server.js', 'auth.js', 'menu-links.json', 'subscriptions.json', 'audit-log.json',
    'package.json', 'package-lock.json', 'nodemon.json', '.gitignore', '.env'
]);

app.use((req, res, next) => {
    try {
        const rawPath = decodeURIComponent(req.path);
        const cleanPath = path.normalize(rawPath).replace(/^[/\\]+/, '');
        const baseName = path.basename(cleanPath).toLowerCase();
        const firstSegment = cleanPath.split(/[/\\]/)[0].toLowerCase();

        if (baseName.startsWith('.') || firstSegment.startsWith('.')) {
            return res.status(403).json({ error: 'Acesso negado a arquivos ocultos.' });
        }
        if (firstSegment === 'backups' || cleanPath.endsWith('.bak') || cleanPath.endsWith('.tmp')) {
            return res.status(403).json({ error: 'Acesso negado a backups.' });
        }
        if (SENSITIVE_STATIC_FILES.has(baseName)) {
            return res.status(403).json({ error: 'Acesso negado a este recurso do backend.' });
        }
        next();
    } catch (_) {
        return res.status(400).json({ error: 'Caminho inválido.' });
    }
});

app.use(express.static(path.join(__dirname, '.'), {
    dotfiles: 'deny',
    index: 'index.html'
}));

let PORT = parseInt(process.env.PORT, 10) || 5500;

function startServer(portToTry) {
    const server = app.listen(portToTry, async () => {
        const url = `http://localhost:${portToTry}/admin.html`;
        console.log(`🚀 Servidor Administrativo rodando em: ${url}`);

        if (process.env.NODE_ENV !== 'production') {
            try {
                await open(url);
                console.log(`🌐 Navegador aberto automaticamente em: ${url}`);
            } catch (err) {
                console.warn(`⚠️ Erro ao abrir o navegador automaticamente:`, err.message);
            }
        }
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`⚠️ Porta ${portToTry} ocupada. Tentando a porta ${portToTry + 1}...`);
            startServer(portToTry + 1);
        } else {
            console.error('❌ Erro crítico no servidor:', err);
        }
    });
}

// Inicia servidor apenas se executado diretamente (permite testes via supertest/node:test sem conflito de portas)
if (require.main === module) {
    startServer(PORT);
}

process.on('SIGINT', () => {
    console.log('🛑 Encerrando servidor...');
    process.exit();
});

module.exports = app;
