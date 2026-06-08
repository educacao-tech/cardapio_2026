const ERROR_LOG_KEY = 'app_error_logs';
const APP_VERSION = '1.0.2'; // Mantenha sincronizado com script.js

document.addEventListener('DOMContentLoaded', () => {
    const errorLogsContainer = document.getElementById('error-logs');
    const clearLogsBtn = document.getElementById('clear-logs-btn');
    const appVersionDisplay = document.getElementById('app-version-display');

    if (appVersionDisplay) {
        appVersionDisplay.textContent = APP_VERSION;
    }

    function loadAndDisplayErrors() {
        const errors = JSON.parse(localStorage.getItem(ERROR_LOG_KEY) || '[]');
        if (errorLogsContainer) {
            errorLogsContainer.innerHTML = ''; // Limpa o conteúdo existente
            if (errors.length === 0) {
                errorLogsContainer.innerHTML = '<p class="no-logs-message">Nenhum erro registrado ainda.</p>';
            } else {
                errors.forEach((error, index) => {
                    const errorItem = document.createElement('div');
                    errorItem.className = 'error-item';
                    errorItem.innerHTML = `
                        <strong>Erro #${index + 1}</strong><br>
                        <strong>Versão:</strong> ${error.version}<br>
                        <strong>Mensagem:</strong> ${error.message}<br>
                        <strong>URL:</strong> ${error.url}<br>
                        <strong>Timestamp:</strong> ${new Date(error.timestamp).toLocaleString()}<br>
                        <strong>Contexto:</strong> <pre>${JSON.stringify(error.context, null, 2)}</pre>
                        <strong>User Agent:</strong> ${error.userAgent}<br>
                        <strong>Stack:</strong> <pre>${error.stack}</pre>
                    `;
                    errorLogsContainer.appendChild(errorItem);
                });
            }
        }
    }

    function clearAllLogs() {
        if (confirm('Tem certeza que deseja limpar todos os logs de erro?')) {
            localStorage.removeItem(ERROR_LOG_KEY);
            loadAndDisplayErrors();
        }
    }

    if (clearLogsBtn) {
        clearLogsBtn.addEventListener('click', clearAllLogs);
    }

    loadAndDisplayErrors();
});