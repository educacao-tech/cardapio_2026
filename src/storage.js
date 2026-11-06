const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

// Fila de operações de escrita para evitar race conditions simultâneas no mesmo arquivo
const writeQueues = new Map();

/**
 * Grava dados em arquivo JSON de forma atômica utilizando arquivo temporário e rename
 * @param {string} filePath - Caminho absoluto do arquivo
 * @param {any} data - Dados a serem serializados em JSON
 */
async function atomicWriteJson(filePath, data) {
    // Garante execução sequencial de escritas no mesmo arquivo
    const currentQueue = writeQueues.get(filePath) || Promise.resolve();
    
    const writeTask = currentQueue.then(async () => {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            await fsPromises.mkdir(dir, { recursive: true });
        }

        const tempPath = `${filePath}.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
        const content = JSON.stringify(data, null, 4);

        try {
            await fsPromises.writeFile(tempPath, content, 'utf8');
            await fsPromises.rename(tempPath, filePath);
        } catch (err) {
            // Limpa o arquivo temporário se algo falhar
            try {
                if (fs.existsSync(tempPath)) {
                    await fsPromises.unlink(tempPath);
                }
            } catch (_) {}
            throw err;
        }
    });

    writeQueues.set(filePath, writeTask);
    return writeTask;
}

/**
 * Lê e analisa um arquivo JSON de forma segura sem crashar o processo
 * @param {string} filePath - Caminho absoluto do arquivo
 * @param {any} defaultValue - Valor retornado caso o arquivo não exista ou esteja corrompido
 */
async function readJsonSafe(filePath, defaultValue = null) {
    try {
        if (!fs.existsSync(filePath)) return defaultValue;
        const raw = await fsPromises.readFile(filePath, 'utf8');
        if (!raw || !raw.trim()) return defaultValue;
        return JSON.parse(raw);
    } catch (err) {
        console.error(`⚠️ [Storage] Falha ao ler ou analisar JSON em ${filePath}:`, err.message);
        return defaultValue;
    }
}

/**
 * Cria backup assíncrono seguro do arquivo antes de alterações destrutivas
 */
async function createBackup(sourceFile, backupDir) {
    try {
        if (!fs.existsSync(sourceFile)) return null;
        if (!fs.existsSync(backupDir)) {
            await fsPromises.mkdir(backupDir, { recursive: true });
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFileName = `menu-links-bkp-${timestamp}.json`;
        const backupPath = path.join(backupDir, backupFileName);
        await fsPromises.copyFile(sourceFile, backupPath);
        return backupPath;
    } catch (err) {
        console.error('⚠️ [Storage] Falha ao gerar backup:', err.message);
        return null;
    }
}

module.exports = {
    atomicWriteJson,
    readJsonSafe,
    createBackup
};

