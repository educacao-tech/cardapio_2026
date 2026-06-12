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
app.use(express.static(path.join(__dirname, '.'))); 

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
        console.log('Cardápio atualizado com sucesso via Admin.');

        // Grava no log de auditoria
        const logEntry = {
            user: req.headers['x-admin-user'] || 'Desconhecido',
            action: 'Atualização do Cardápio',
            timestamp: new Date().toISOString()
        };

        let logs = [];
        if (fs.existsSync(LOG_FILE)) {
            try { logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); } catch(e) {}
        }
        logs.push(logEntry);
        fs.writeFileSync(LOG_FILE, JSON.stringify(logs.slice(-100), null, 4)); // Mantém últimos 100

        res.json({ success: true });
    });
});

// Nova rota para informar o status do ambiente (dev/prod)
app.get('/api/env-status', loginLimiter, authMiddleware, (req, res) => {
    res.json({ isDevelopment: process.env.NODE_ENV === 'development' });
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

    try {
        // Tenta uma requisição HEAD (mais leve) com timeout de 5 segundos
        const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
        res.json({ reachable: response.ok });
    } catch (error) {
        res.json({ reachable: false });
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
    const url = `http://localhost:${PORT}/admin.html`;
    console.log(`🚀 Servidor Administrativo rodando em: ${url}`);

    // Abre o navegador automaticamente apenas em modo de desenvolvimento
    if (process.env.NODE_ENV === 'development') {
        await open(url);
    }
});

// Garante que o processo termine de forma limpa ao reiniciar
process.on('SIGINT', () => {
    console.log('🛑 Encerrando servidor...');
    process.exit();
});