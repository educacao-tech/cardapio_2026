const express = require('express');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cors = require('cors');
const open = require('open');

// Ajustado para o caminho correto do arquivo auth.js na raiz
const { router: authRoutes, authMiddleware } = require('./auth');

const app = express();
app.use(cors()); // Permite requisições de outras portas (Ex: Live Server)
app.use(bodyParser.json());

// Logger para diagnóstico de rotas
app.use((req, res, next) => {
    console.log(`${new Date().toLocaleTimeString()} - ${req.method} ${req.url}`);
    next();
});

app.use('/api', authRoutes); // Registra rotas de autenticação (ex: /api/get-captcha) 

// Configuração do limitador de tentativas de login
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 500, // Aumentado para 500 para garantir que o admin não seja bloqueado por uso intensivo
    skip: (req, res) => process.env.NODE_ENV === 'development',
    message: 'Muitas tentativas de login a partir deste IP, por favor, tente novamente após 15 minutos.',
    handler: (req, res, next, options) => {
        console.warn(`[RATE_LIMIT] IP ${req.ip} excedeu o limite de tentativas de login.`);
        res.status(options.statusCode).json({ error: options.message });
    },
    standardHeaders: true, // Retorna informações de limite de taxa nos cabeçalhos `RateLimit-*`
    legacyHeaders: false, // Desabilita os cabeçalhos `X-RateLimit-*`
});

// 1. Gere suas chaves uma única vez rodando: npx web-push generate-vapid-keys
const publicVapidKey = 'BPoKCZuBpJ-g5oLho2InYbeTD0zFCajVglfB0xVyvMVMGRsnHfWOx-EmkEqVpQuMn04F9CvDvICLD5Zn5YcbfzI';
const privateVapidKey = ''; // Deixe vazio por enquanto para evitar o crash

if (publicVapidKey && privateVapidKey) {
    webpush.setVapidDetails('mailto:suporte@batatais.sp.gov.br', publicVapidKey, privateVapidKey);
} else {
    console.warn('⚠️ Notificações Push desativadas: Chaves VAPID não configuradas.');
    console.log('👉 Para ativar, rode "npx web-push generate-vapid-keys" e cole as chaves aqui.');
}

// 2. Armazenamento temporário (Em produção, use um Banco de Dados como MongoDB ou SQLite)
const SUBS_FILE = path.join(__dirname, 'subscriptions.json');
let subscriptions = [];

// Carrega inscrições existentes do arquivo, se houver
try {
    if (fs.existsSync(SUBS_FILE)) {
        subscriptions = JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8'));
    }
} catch (e) { console.error("Erro ao carregar inscrições:", e); }

const MENU_FILE = path.join(__dirname, 'menu-links.json');
const LOG_FILE = path.join(__dirname, 'audit-log.json');

// Rota para ler o cardápio atual (usado pelo Admin)
app.get('/api/menu', loginLimiter, authMiddleware, (req, res) => {
    fs.readFile(MENU_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Erro ao ler arquivo JSON' });
        res.json(JSON.parse(data));
    });
});

// Rota para salvar o cardápio atualizado
app.post('/api/menu', loginLimiter, authMiddleware, (req, res) => {
    const menuData = req.body;
    if (!menuData) return res.status(400).json({ error: 'Dados inválidos' });

    // Configuração de Backup
    const BACKUP_DIR = path.join(__dirname, 'backups');
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `menu-links-bkp-${timestamp}.json`);

    // Cria o backup do arquivo atual antes de salvar o novo
    if (fs.existsSync(MENU_FILE)) {
        fs.copyFileSync(MENU_FILE, backupPath);
        console.log(`Backup criado com sucesso: ${backupPath}`);
    }

    fs.writeFile(MENU_FILE, JSON.stringify(menuData, null, 4), 'utf8', (err) => {
        if (err) {
            console.error('❌ Erro crítico ao gravar o arquivo:', err);
            return res.status(500).json({ error: 'Erro ao salvar arquivo JSON', details: err.message });
        }
        console.log('Cardápio atualizado com sucesso via Admin (salvo fisicamente em menu-links.json).');

        // Grava no log de auditoria
        const adminUser = req.headers['x-admin-user'] || 'Desconhecido';
        const logEntry = {
            user: adminUser,
            action: 'Atualização do Cardápio',
            timestamp: new Date().toISOString()
        };

        let logs = [];
        if (fs.existsSync(LOG_FILE)) {
            try { logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); } catch(e) {}
        }
        logs.push(logEntry);
        fs.writeFileSync(LOG_FILE, JSON.stringify(logs.slice(-100), null, 4)); // Mantém últimos 100

        // Executa salvamento no Git (Auto-Push) em segundo plano
        autoGitPush(adminUser);

        res.json({ success: true, message: 'Cardápio salvo fisicamente no arquivo e publicado no GitHub via auto push.' });
    });
});

/**
 * Função para automação segura de Git Add, Commit e Push (Imune a Command Injection)
 */
function autoGitPush(user = 'Desconhecido') {
    const { execFile } = require('child_process');
    const cwd = __dirname;
    const sanitizedUser = String(user).replace(/[^a-zA-Z0-9@._ -]/g, '').slice(0, 50) || 'Admin';
    const nowStr = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const commitMsg = `Atualização do cardápio via Admin por ${sanitizedUser} (${nowStr})`;

    console.log(`🚀 [Git Auto-Push Seguro] Enviando alterações para o GitHub via execFile...`);

    // 1. git add menu-links.json audit-log.json
    execFile('git', ['add', 'menu-links.json', 'audit-log.json'], { cwd }, (addErr, addOut, addErrOut) => {
        if (addErr) {
            console.error('❌ [Git Auto-Push] Falha no git add:', addErr.message);
            if (addErrOut) console.error('Stderr:', addErrOut);
            return;
        }

        // 2. git commit -m "..."
        execFile('git', ['commit', '-m', commitMsg], { cwd }, (commitErr, commitOut, commitErrOut) => {
            if (commitErr) {
                if (commitErr.message.includes('nothing to commit') || (commitOut && commitOut.includes('nothing to commit'))) {
                    console.log('ℹ️ [Git Auto-Push] Nenhuma alteração pendente para commit.');
                    return;
                }
                console.error('❌ [Git Auto-Push] Falha no git commit:', commitErr.message);
                if (commitErrOut) console.error('Stderr:', commitErrOut);
                return;
            }

            // 3. git push origin main
            execFile('git', ['push', 'origin', 'main'], { cwd }, (pushErr, pushOut, pushErrOut) => {
                if (pushErr) {
                    console.error('❌ [Git Auto-Push] Falha no git push:', pushErr.message);
                    if (pushErrOut) console.error('Stderr:', pushErrOut);
                    return;
                }
                console.log('✅ [Git Auto-Push] Publicado com sucesso no GitHub:\n', pushOut);
                cachedCommitInfo = null;
                lastCommitFetchTime = 0;
            });
        });
    });
}

// Nova rota para informar o status do ambiente (dev/prod)
app.get('/api/env-status', loginLimiter, authMiddleware, (req, res) => {
    res.json({ isDevelopment: process.env.NODE_ENV === 'development' });
});

// Cache em memória das informações do último commit do GitHub (expira a cada 5 minutos)
let cachedCommitInfo = null;
let lastCommitFetchTime = 0;

// Rota pública para buscar últimas informações de atualização do GitHub
app.get('/api/github-commit', async (req, res) => {
    const now = Date.now();
    if (cachedCommitInfo && (now - lastCommitFetchTime < 5 * 60 * 1000)) {
        return res.json(cachedCommitInfo);
    }

    // 1. Tenta buscar informações via GitHub API
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
    } catch (err) {
        console.warn('[GitHub API] Aviso ao consultar API do GitHub:', err.message);
    }

    // 2. Fallback via git log local se o repositório estiver rodando localmente
    try {
        const { execSync } = require('child_process');
        const gitLog = execSync('git log -1 --format="%h|%H|%cd|%s"', { encoding: 'utf8', cwd: __dirname }).trim();
        const parts = gitLog.split('|');
        if (parts.length >= 4) {
            const [hash, fullHash, dateStr, message] = parts;
            cachedCommitInfo = {
                hash: hash,
                fullHash: fullHash,
                message: message,
                date: new Date(dateStr).toISOString(),
                author: 'educacao-tech',
                url: `https://github.com/educacao-tech/cardapio_2026/commit/${fullHash}`
            };
            lastCommitFetchTime = now;
            return res.json(cachedCommitInfo);
        }
    } catch (gitErr) {
        console.warn('[Git Local] Aviso ao ler git log local:', gitErr.message);
    }

    return res.status(500).json({ error: 'Não foi possível obter dados de commit' });
});

// Rota para ler o histórico de alterações
app.get('/api/audit-log', loginLimiter, authMiddleware, (req, res) => {
    if (!fs.existsSync(LOG_FILE)) return res.json([]);
    fs.readFile(LOG_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Erro ao ler log' });
        try {
            const logs = JSON.parse(data);
            res.json(logs.reverse().slice(0, 50)); // Retorna os últimos 50 logs
        } catch (e) { res.json([]); }
    });
});

// Rota para verificar se uma URL externa está acessível (Proxy Check)
app.post('/api/proxy-check', loginLimiter, authMiddleware, async (req, res) => {
    const { url } = req.body;
    if (!url || url === '#' || url.trim() === '') {
        return res.json({ reachable: false });
    }

    // Segurança: Permite apenas domínios confiáveis para evitar SSRF
    const allowedDomains = ['drive.google.com', 'docs.google.com', 'google.com'];
    try {
        const parsedUrl = new URL(url);
        if (!allowedDomains.some(domain => parsedUrl.hostname.endsWith(domain))) {
            return res.json({ reachable: false, error: 'Domínio não permitido' });
        }

        const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
        res.json({ reachable: response.ok });
    } catch (error) {
        res.json({ reachable: false, error: 'Timeout ou erro de conexão' });
    }
});

app.post('/api/subscribe', (req, res) => {
    const { subscription } = req.body;
    // Evita duplicatas simples
    if (!subscriptions.find(s => s.endpoint === subscription.endpoint)) {
        subscriptions.push(subscription);
        // Salva a nova lista no arquivo
        fs.writeFile(SUBS_FILE, JSON.stringify(subscriptions, null, 4), (err) => { if(err) console.error(err); });
    }
    res.status(201).json({});
});

// 3. Rota para disparar o aviso de atualização
// Você chama isso quando terminar de atualizar o JSON de Junho
app.post('/api/notify-update', loginLimiter, authMiddleware, (req, res) => {
    const { mes } = req.body; // Ex: "Junho"
    
    const payload = JSON.stringify({
        title: 'Cardápio Atualizado! 🍴',
        body: `Os links para o mês de ${mes} já estão disponíveis no app.`,
        url: `/#month-${mes.toLowerCase()}`
    });

    console.log(`Disparando notificações para ${subscriptions.length} usuários...`);

    // Envia para todos os inscritos
    Promise.all(subscriptions.map(sub => 
        webpush.sendNotification(sub, payload).catch(err => {
            if (err.statusCode === 410) return null; // Inscrição expirada/cancelada
            console.error('Erro ao enviar push:', err);
        })
    ))
    .then(() => res.status(200).json({ success: true }))
    .catch(() => res.status(500).json({ success: false }));
});

// Lista de arquivos confidenciais do backend proibidos para download estático
const SENSITIVE_STATIC_FILES = new Set([
    'server.js',
    'auth.js',
    'subscriptions.json',
    'audit-log.json',
    'package.json',
    'package-lock.json',
    'nodemon.json',
    '.gitignore',
    '.env'
]);

// Middleware de proteção de segurança para arquivos estáticos
app.use((req, res, next) => {
    try {
        const rawPath = decodeURIComponent(req.path);
        const cleanPath = path.normalize(rawPath).replace(/^[/\\]+/, '');
        const baseName = path.basename(cleanPath).toLowerCase();
        const firstSegment = cleanPath.split(/[/\\]/)[0].toLowerCase();

        // 1. Bloqueia dotfiles e dotfolders (.git, .env, etc.)
        if (baseName.startsWith('.') || firstSegment.startsWith('.')) {
            return res.status(403).json({ error: 'Acesso negado a arquivos ocultos ou de configuração.' });
        }

        // 2. Bloqueia diretórios de backup e arquivos temporários/dumps
        if (firstSegment === 'backups' || cleanPath.endsWith('.bak') || cleanPath.endsWith('.tmp')) {
            return res.status(403).json({ error: 'Acesso negado a diretórios de backup.' });
        }

        // 3. Bloqueia código-fonte do servidor, dependências e credenciais
        if (SENSITIVE_STATIC_FILES.has(baseName)) {
            return res.status(403).json({ error: 'Acesso negado a este recurso do backend.' });
        }

        next();
    } catch (e) {
        return res.status(400).json({ error: 'Caminho inválido.' });
    }
});

// Servidor de arquivos estáticos seguro com negação explícita de dotfiles
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

startServer(PORT);

// Garante que o processo termine de forma limpa ao reiniciar
process.on('SIGINT', () => {
    console.log('🛑 Encerrando servidor...');
    process.exit();
});