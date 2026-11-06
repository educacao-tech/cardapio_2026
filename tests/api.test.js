const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');

const app = require('../server.js');
const { isSafeUrl, validateMenuSchema, sanitizeUser } = require('../src/validator.js');
const { atomicWriteJson, readJsonSafe } = require('../src/storage.js');
const { generateSessionToken, verifySessionToken } = require('../auth.js');

/**
 * Utilitário de requisição em memória direto para o Express
 * Evita dependência de sockets TCP externos e funciona com velocidade máxima
 */
function mockApiRequest(options = {}) {
    return new Promise((resolve) => {
        const socket = new EventEmitter();
        socket.remoteAddress = '127.0.0.1';
        socket.encrypted = false;
        socket.destroy = () => {};
        socket.end = () => {};
        socket.write = () => true;

        const req = new http.IncomingMessage(socket);
        req.method = options.method || 'GET';
        req.url = options.url || '/';
        req.socket = socket;
        req.connection = socket;
        req.headers = Object.fromEntries(
            Object.entries(options.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
        );

        let payload = options.body;
        if (payload && typeof payload === 'object') {
            payload = JSON.stringify(payload);
            req.headers['content-type'] = 'application/json';
        }
        if (payload) {
            req.headers['content-length'] = String(Buffer.byteLength(payload));
        }

        const res = new http.ServerResponse(req);
        let resData = '';

        res.write = function (chunk) {
            if (chunk) resData += chunk.toString();
            return true;
        };

        res.end = function (chunk) {
            if (chunk) resData += chunk.toString();
            let json = null;
            try {
                json = JSON.parse(resData);
            } catch (e) {
                // Corpo não é JSON
            }
            resolve({
                status: res.statusCode,
                headers: res.getHeaders(),
                text: resData,
                body: json
            });
        };

        app.handle(req, res);

        if (payload) {
            req.push(payload);
        }
        req.push(null);
    });
}

test('Segurança: Proteção de arquivos confidenciais do backend', async (t) => {
    await t.test('Bloqueia acesso direto a server.js (403 Forbidden)', async () => {
        const res = await mockApiRequest({ url: '/server.js' });
        assert.equal(res.status, 403);
        assert.equal(res.body.error, 'Acesso negado a este recurso do backend.');
    });

    await t.test('Bloqueia acesso a auth.js (403 Forbidden)', async () => {
        const res = await mockApiRequest({ url: '/auth.js' });
        assert.equal(res.status, 403);
        assert.equal(res.body.error, 'Acesso negado a este recurso do backend.');
    });

    await t.test('Bloqueia acesso a package.json (403 Forbidden)', async () => {
        const res = await mockApiRequest({ url: '/package.json' });
        assert.equal(res.status, 403);
    });

    await t.test('Bloqueia acesso a menu-links.json direto (403 Forbidden)', async () => {
        const res = await mockApiRequest({ url: '/menu-links.json' });
        assert.equal(res.status, 403);
    });

    await t.test('Bloqueia acesso a audit-log.json direto (403 Forbidden)', async () => {
        const res = await mockApiRequest({ url: '/audit-log.json' });
        assert.equal(res.status, 403);
    });

    await t.test('Permite acesso a index.html (200 OK)', async () => {
        const res = await mockApiRequest({ url: '/index.html' });
        assert.equal(res.status, 200);
        assert.ok(res.text.includes('<!DOCTYPE html>') || res.text.includes('<html'));
    });
});

test('Autenticação: Endpoint /api/login e Tokens de Sessão HMAC', async (t) => {
    await t.test('Rejeita credenciais incorretas (401)', async () => {
        const res = await mockApiRequest({
            method: 'POST',
            url: '/api/login',
            body: { password: 'senha_errada_123', email: 'madscold@gmail.com' }
        });
        assert.equal(res.status, 401);
        assert.equal(res.body.error, 'Credenciais incorretas.');
    });

    await t.test('Realiza login com sucesso e retorna token de sessão assinado (200)', async () => {
        const res = await mockApiRequest({
            method: 'POST',
            url: '/api/login',
            body: { password: 'admin123', email: 'madscold@gmail.com' }
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.success, true);
        assert.ok(res.body.token, 'Deve retornar token assinado');
        assert.equal(res.body.email, 'madscold@gmail.com');

        // Validação interna do token
        const verified = verifySessionToken(res.body.token);
        assert.ok(verified, 'Token deve ser válido pelo verificador');
        assert.equal(verified.email, 'madscold@gmail.com');
    });

    await t.test('Acesso a rotas protegidas com Token de Sessão Bearer', async () => {
        const login = await mockApiRequest({
            method: 'POST',
            url: '/api/login',
            body: { password: 'admin123', email: 'madscold@gmail.com' }
        });
        const token = login.body.token;

        const res = await mockApiRequest({
            url: '/api/menu',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        assert.equal(res.status, 200);
        assert.ok(typeof res.body === 'object' && res.body !== null, 'Deve responder objeto do menu');
    });

    await t.test('Bloqueia acesso sem token de autenticação (401)', async () => {
        const res = await mockApiRequest({ url: '/api/menu' });
        assert.equal(res.status, 401);
    });

    await t.test('Emissão de desafio CAPTCHA com HMAC e nonce (/api/get-captcha)', async () => {
        const res = await mockApiRequest({ url: '/api/get-captcha' });
        assert.equal(res.status, 200);
        assert.ok(res.body.question.includes('Quanto é'));
        assert.ok(res.body.token.includes(':'));
    });
});

test('Validação de Schema & Sanitização: POST /api/menu', async (t) => {
    let authToken;

    // Login prévio para obter token
    const login = await mockApiRequest({
        method: 'POST',
        url: '/api/login',
        body: { password: 'admin123', email: 'madscold@gmail.com' }
    });
    authToken = login.body.token;

    await t.test('Rejeita payload inválido com 422 Unprocessable Entity', async () => {
        const res = await mockApiRequest({
            method: 'POST',
            url: '/api/menu',
            headers: { 'Authorization': `Bearer ${authToken}` },
            body: { invalidField: true }
        });
        assert.equal(res.status, 422);
        assert.ok(res.body.error, 'Deve retornar mensagem de erro de validação');
    });

    await t.test('Rejeita links que não sejam strings válidas', async () => {
        const res = await mockApiRequest({
            method: 'POST',
            url: '/api/menu',
            headers: { 'Authorization': `Bearer ${authToken}` },
            body: {
                cardapio: {
                    fevereiro: {
                        semana1: {
                            escola1: 12345
                        }
                    }
                }
            }
        });
        assert.equal(res.status, 422);
    });

    await t.test('Sanitização de Usuário em logs', () => {
        assert.equal(sanitizeUser('user<script>alert(1)</script>@test.com'), 'userscriptalert1script@test.com');
        assert.equal(sanitizeUser('Normal_User-123@domain.com'), 'Normal_User-123@domain.com');
    });
});

test('Segurança SSRF: Validação de URL em isSafeUrl', async (t) => {
    const allowed = ['drive.google.com', 'docs.google.com'];

    assert.equal(isSafeUrl('http://127.0.0.1:8080/file', allowed).safe, false, 'Loopback deve ser bloqueado');
    assert.equal(isSafeUrl('http://localhost:3000/api', allowed).safe, false, 'Localhost deve ser bloqueado');
    assert.equal(isSafeUrl('http://192.168.1.50/data', allowed).safe, false, 'IP privado deve ser bloqueado');
    assert.equal(isSafeUrl('http://10.0.0.1/admin', allowed).safe, false, 'IP privado classe A deve ser bloqueado');
    assert.equal(isSafeUrl('https://evil-google.com/drive', allowed).safe, false, 'Bypass de sufixo deve ser bloqueado');
    assert.equal(isSafeUrl('javascript:alert(1)', allowed).safe, false, 'Protocolo malicioso deve ser bloqueado');
    assert.equal(isSafeUrl('https://drive.google.com/file/d/123/view', allowed).safe, true, 'Domínio permitido deve passar');
});

test('Persistência Atômica: src/storage.js', async (t) => {
    const tempFile = path.join(__dirname, 'temp-test-storage.json');

    try {
        const testData = { version: '1.0', items: [1, 2, 3], timestamp: Date.now() };
        await atomicWriteJson(tempFile, testData);

        const readData = await readJsonSafe(tempFile);
        assert.deepEqual(readData, testData);

        // Teste de fallback em arquivo inexistente
        const nonExistent = await readJsonSafe(path.join(__dirname, 'non-existent.json'), { fallback: true });
        assert.deepEqual(nonExistent, { fallback: true });
    } finally {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
});
