let fullMenuData = {};
let hasUnsavedChanges = false;
const year = "2026";
const editor = document.getElementById('editor-container');
const monthSelect = document.getElementById('select-month');
const weekSelect = document.getElementById('select-week');

// Mapeamento amigável para os campos de links
const linkLabels = {
    'creche-m-verde': { text: 'Creche M. Verde', icon: '🌱' },
    'creches': { text: 'Demais Creches', icon: '👶' },
    'fundamental-braga': { text: 'Braga, Caic, Célia, Alzira e Padre', icon: '📚' },
    'fundamental-anna': { text: 'Anna, Anselmo, M. Ap., Faggioni, Braguetto', icon: '✏️' },
    'fundamental-aaugusto': { text: 'A. Augusto, Portinari e M. Virgínia', icon: '🏫' },
    'fundamental-esther': { text: 'Esther Vianna', icon: '🎓' },
    'fundamental-gtl': { text: 'GTL, EESA, Castelo e Washington', icon: '📝' },
    'etec': { text: 'ETEC / Ensino Médio', icon: '🔬' }
};

/**
 * Exibe uma mensagem no container do editor
 */
function setEditorMessage(msg, type = 'info') {
    editor.innerHTML = `<div class="editor-message editor-message-${type}">${msg}</div>`;
}

/**
 * Atualiza as estatísticas do dashboard (links totais, preenchidos e faltando)
 */
function updateDashboard() {
    const month = monthSelect.value;
    const dashboard = document.getElementById('admin-dashboard');
    
    if (!month || !fullMenuData[year] || !fullMenuData[year][month]) {
        if (dashboard) dashboard.style.display = 'none';
        return;
    }

    if (dashboard) dashboard.style.display = 'flex';
    const weeks = fullMenuData[year][month];
    const schoolKeys = Object.keys(linkLabels);
    
    let totalLinks = weeks.length * schoolKeys.length;
    let filledLinks = 0;

    weeks.forEach(week => {
        schoolKeys.forEach(key => {
            const url = week.links[key];
            if (url && url !== '#' && url.trim() !== '') {
                filledLinks++;
            }
        });
    });

    const percentage = totalLinks > 0 ? Math.round((filledLinks / totalLinks) * 100) : 0;
    const statPercent = document.getElementById('stat-percent');
    statPercent.textContent = `${percentage}%`;
    statPercent.style.color = percentage === 100 ? 'var(--btn-creche-m-verde)' : 'var(--primary-color)';
}

/**
 * Valida se uma string é uma URL válida ou um marcador aceitável (#).
 */
function isValidUrl(string) {
    if (!string || string === '#' || string.trim() === '') return true;
    try {
        const url = new URL(string);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch (_) {
        return false;
    }
}

/**
 * Limpa URLs do Google Drive/Docs removendo parâmetros desnecessários
 */
function cleanGoogleUrl(url) {
    if (!url || url.indexOf('drive.google.com') === -1 && url.indexOf('docs.google.com') === -1) return url;
    try {
        const urlObj = new URL(url);
        return `${urlObj.origin}${urlObj.pathname}`;
    } catch (e) { return url; }
}

function validateInput(input) {
    const cleaned = cleanGoogleUrl(input.value.trim());
    if (input.value !== cleaned) input.value = cleaned;

    const isValid = isValidUrl(cleaned);
    input.classList.toggle('invalid-link', !isValid);
    
    const isRealLink = cleaned && cleaned !== '#' && cleaned !== '';
    input.classList.toggle('valid-link', isValid && isRealLink);
}

async function init(force = false) {
    const token = sessionStorage.getItem('admin_token');
    const email = sessionStorage.getItem('admin_email');
    if ((!token || !email) && !force) {
        document.getElementById('login-overlay').style.display = 'flex';
        return;
    }
    
    const apiUrl = (['5500', '5501', '5502', '3000'].includes(window.location.port)) ? 'http://localhost:5000/api' : '/api';

    try {
        setEditorMessage('⏳ Carregando dados do cardápio...');
        const res = await fetch(`${apiUrl}/menu`);
        if (res.ok) {
            fullMenuData = await res.json();
            setEditorMessage('✅ Dados carregados. Selecione um mês para começar.', 'success');
            monthSelect.disabled = false; // Habilita o seletor de mês
            document.getElementById('login-overlay').style.display = 'none';

            // Verifica o status do ambiente e exibe a tarja se for desenvolvimento
            const envRes = await fetch(`${apiUrl}/env-status`);
            if (envRes.ok) {
                const envData = await envRes.json();
                if (envData.isDevelopment) {
                    document.getElementById('dev-mode-banner').style.display = 'block';
                }
            }
        } else if (res.status === 401) {
            const data = await res.json().catch(() => ({}));
            if (data.require2FA || data.requireCaptcha) return; // Não faz nada, o wrapper do admin.html cuida disso
            showToast(data.error || 'Sessão expirada ou acesso negado.', 'error');
            document.getElementById('login-overlay').style.display = 'flex';
            setEditorMessage('❌ Sessão expirada ou acesso negado.', 'error');
        }
    } catch (err) {
        setEditorMessage('❌ Erro ao conectar com o servidor. Verifique se o login foi realizado.');
    }
}

/**
 * Alterna o estado de todas as categorias do editor
 */
function toggleAllCategories(expand = true) {
    editor.querySelectorAll('.admin-category-section').forEach(section => {
        section.classList.toggle('collapsed', !expand);
        const btn = section.querySelector('.action-toggle-category');
        if (btn) btn.textContent = expand ? '🔽' : '▶️';
    });
}

monthSelect.addEventListener('change', (e) => {
    const month = e.target.value;
    
    // Limpa e desabilita o seletor de semanas ao trocar o mês
    weekSelect.innerHTML = '<option value="">Selecione uma semana...</option>';
    weekSelect.disabled = true;

    if (month && fullMenuData[year] && fullMenuData[year][month]) {
        // Popula o seletor de semanas com as opções do mês selecionado
        weekSelect.innerHTML += '<option value="all">👁️ Ver Todas as Semanas</option>';
        fullMenuData[year][month].forEach((week, index) => {
            const opt = document.createElement('option');
            opt.value = index;
            // Reformatar o título para destacar as datas
            const parts = week.title.split(' - ');
            if (parts.length === 2) {
                opt.textContent = `${parts[0]} (${parts[1]})`; // Ex: "1ª SEM. (02/02 a 06/02)"
            } else {
                opt.textContent = week.title; // Fallback se o formato for diferente
            }
            weekSelect.appendChild(opt);
        });
        
        weekSelect.disabled = false;
        weekSelect.value = 'all'; // Define "Ver Todas" como padrão inicial

        renderMonth(month);
        updateDashboard();
    } else if (month && (!fullMenuData[year] || !fullMenuData[year][month])) {
        setEditorMessage(`⚠️ O mês de <strong>${month}</strong> ainda não existe no arquivo JSON.`, 'warning');
        updateDashboard();
    } else {
        setEditorMessage('Selecione um mês para editar as semanas.');
        updateDashboard();
    }
});

weekSelect.addEventListener('change', (e) => {
    const month = monthSelect.value;
    const val = e.target.value;
    if (month) {
        renderMonth(month, (val === 'all' || val === '') ? null : val);
    }
});

/**
 * Solicita ao servidor que verifique se a URL é acessível
 */
async function checkAccessibility(input) {
    const url = input.value.trim();
    const container = input.closest('.school-input-group');
    const statusEl = container.querySelector('.accessibility-status');
    
    if (!url || url === '#' || !isValidUrl(url)) {
        statusEl.textContent = '';
        return;
    }

    statusEl.textContent = '⏳';
    try {
        const res = await fetch('/api/proxy-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        const data = await res.json();
        statusEl.textContent = data.reachable ? '✅' : '❌';
        statusEl.title = data.reachable ? 'Link acessível' : 'Link inacessível ou erro de conexão';
    } catch {
        statusEl.textContent = '⚠️';
    }
}

function renderMonth(month, specificIndex = null) {
    const allWeeks = fullMenuData[year][month] || [];
    editor.innerHTML = `<h2>📅 ${month.toUpperCase()} ${year}</h2>`;
    
    // Adiciona botões de controle global
    const globalActions = document.createElement('div');
    globalActions.style = "margin-bottom: 1rem; display: flex; gap: 10px;";
    globalActions.innerHTML = `
        <button class="btn-small" onclick="toggleAllCategories(true)">📂 Expandir Todas Categorias</button>
        <button class="btn-small" onclick="toggleAllCategories(false)">📁 Recolher Todas</button>
    `;
    editor.appendChild(globalActions);

    const categories = [
        { title: "🏠 Infantil / Creches", keys: ['creche-m-verde', 'creches'] },
        { title: "🏫 Ensino Fundamental", keys: ['fundamental-braga', 'fundamental-anna', 'fundamental-aaugusto', 'fundamental-esther', 'fundamental-gtl'] },
        { title: "🔬 Ensino Médio", keys: ['etec'] }
    ];

    allWeeks.forEach((week, index) => {
        // Se uma semana específica foi selecionada no filtro, ignora as outras
        if (specificIndex !== null && index.toString() !== specificIndex.toString()) return;

        const weekDiv = document.createElement('div');
        weekDiv.className = 'week-edit-card';
        
        let categoriesHtml = '';
        categories.forEach(cat => {
            let inputsHtml = '';
            cat.keys.forEach(key => {
                const label = linkLabels[key];
                inputsHtml += `
                    <div class="input-group admin-input-group school-input-group" data-school-type="${key}">
                        <label class="compact-label"><span class="school-icon" style="cursor: pointer;" title="Clique para testar este link">${label.icon}</span> ${label.text}:</label>
                        <div class="compact-input-wrapper">
                            <input type="text" value="${week.links[key] || '#'}" 
                                data-month="${month}" data-index="${index}" data-key="${key}" class="link-input">
                            <span class="accessibility-status" style="font-size: 0.9rem; min-width: 20px;"></span>
                            <button class="btn-small action-preview-pdf" title="Pré-visualizar PDF">👁️</button>
                        </div>
                    </div>
                `;
            });
            categoriesHtml += `
                <div class="admin-category-section collapsed">
                    <div class="admin-category-header">
                        <h4 class="admin-category-title">${cat.title}</h4>
                        <div style="display: flex; gap: 8px;">

                            <button class="btn-small action-toggle-category" title="Ocultar/Expandir Categoria">▶️</button>
                            <button class="btn-small action-bulk-paste" data-keys="${cat.keys.join(',')}" data-index="${index}" title="Colar mesmo link para toda esta categoria">📋 Colar p/ todos</button>
                        </div>
                    </div>
                    <div class="admin-inputs-grid">${inputsHtml}</div>
                </div>
            `;
        });

        weekDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; border-bottom: 1px solid var(--medium-gray); padding-bottom: 3px;">
                <div>
                    <h3 style="margin:0; font-size: 1rem;">${week.title}</h3>
                    <div class="week-toolbar" style="margin-top: 3px; display: flex; gap: 4px;">
                        <button class="btn-small action-clear" data-index="${index}" title="Limpar todos os links desta semana">🗑️ Limpar</button>
                        ${index > 0 ? `<button class="btn-small action-copy" data-index="${index}" title="Copiar links da semana anterior">📋 Copiar da Anterior</button>` : ''}
                    </div>
                </div>
                <div style="text-align: right;">
                    <span style="font-size: 0.65rem; font-weight: bold; display: block; margin-bottom: 2px; color: var(--text-color-muted);">ATIVO</span>
                    <label class="modern-switch">
                        <input type="checkbox" ${week.active ? 'checked' : ''} data-month="${month}" data-index="${index}" class="active-checkbox">
                        <span class="modern-slider"></span>
                    </label>
                </div>
            </div>
            ${categoriesHtml}
        `;
        editor.appendChild(weekDiv);
    });

    // Listener para Ocultar/Expandir categorias
    editor.querySelectorAll('.action-toggle-category').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            const section = e.currentTarget.closest('.admin-category-section');
            section.classList.toggle('collapsed');
            e.currentTarget.textContent = section.classList.contains('collapsed') ? '▶️' : '🔽';
        };
    });

    // Listeners para os novos botões de ação rápida
    editor.querySelectorAll('.action-clear').forEach(btn => {
        btn.onclick = (e) => {
            const idx = e.target.dataset.index;
            if (confirm("Limpar todos os campos desta semana?")) {
                Object.keys(fullMenuData[year][month][idx].links).forEach(k => fullMenuData[year][month][idx].links[k] = '#');
                renderMonth(month, specificIndex);
            }
        };
    });

    // Listener para colagem em massa por categoria
    editor.querySelectorAll('.action-bulk-paste').forEach(btn => {
        btn.onclick = async (e) => {
            const keys = e.target.dataset.keys.split(',');
            const idx = e.target.dataset.index;
            const link = prompt(`Digite ou cole o link para aplicar a todos em "${e.target.previousElementSibling.innerText}":`);
            
            if (link !== null) {
                const cleanedLink = cleanGoogleUrl(link.trim()) || '#';
                keys.forEach(key => {
                    fullMenuData[year][month][idx].links[key] = cleanedLink;
                });
                hasUnsavedChanges = true;
                renderMonth(month, specificIndex);
                showToast("Links atualizados na categoria!", "info");
            }
        };
    });

    editor.querySelectorAll('.action-copy').forEach(btn => {
        btn.onclick = (e) => {
            const idx = parseInt(e.target.dataset.index);
            fullMenuData[year][month][idx].links = { ...fullMenuData[year][month][idx - 1].links };
            renderMonth(month, specificIndex);
        };
    });

    // Listener para abrir o link ao clicar no ícone da escola
    editor.querySelectorAll('.school-icon').forEach(icon => {
        icon.onclick = (e) => {
            const input = e.target.closest('.school-input-group').querySelector('.link-input');
            const url = input.value.trim();
            if (isValidUrl(url) && url !== '#') {
                window.open(url, '_blank');
            } else if (url !== '#') {
                showToast("⚠️ O link atual é inválido ou não foi preenchido (#).", 'warning');
            }
        };
    });

    // Listener para pré-visualização de PDF
    editor.querySelectorAll('.action-preview-pdf').forEach(btn => {
        btn.onclick = (e) => {
            const input = e.target.closest('.compact-input-wrapper').querySelector('.link-input');
            const url = input.value.trim();
            if (isValidUrl(url) && url !== '#') {
                openPdfPreview(url);
            } else {
                showToast("⚠️ O link atual é inválido ou vazio (#).", 'warning');
            }
        };
    });

    // Listeners para salvar alterações em tempo real no objeto local
    editor.querySelectorAll('.link-input').forEach(input => {
        validateInput(input); // Validação inicial ao carregar o mês
        input.oninput = (e) => {
            const { month, index, key } = e.target.dataset;
            fullMenuData[year][month][index].links[key] = e.target.value;
            hasUnsavedChanges = true;
            document.getElementById('save-btn').classList.add('btn-dirty');
            updateDashboard();
            validateInput(e.target);
        };
        // Verifica acessibilidade ao perder o foco (blur) ou ao carregar
        input.onblur = () => checkAccessibility(input);
        checkAccessibility(input);
    });

    editor.querySelectorAll('.active-checkbox').forEach(cb => {
        cb.onchange = (e) => {
            const { month, index } = e.target.dataset;
            fullMenuData[year][month][index].active = e.target.checked;
            hasUnsavedChanges = true;
        };
    });

    updateDashboard(); // Garante que o dashboard atualize após ações de massa (limpar, copiar, etc)
}

async function saveData(notify = false) {
    // Bloqueia o salvamento se houver URLs inválidas
    const invalidInputs = editor.querySelectorAll('.link-input.invalid-link');
    if (invalidInputs.length > 0) {
        showToast("⚠️ Existem URLs inválidas. Corrija os campos destacados em vermelho antes de salvar.", 'error');
        invalidInputs[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        invalidInputs[0].focus();
        return;
    }

    const btn = notify ? document.getElementById('notify-btn') : document.getElementById('save-btn');
    const originalText = btn.innerText;
    btn.innerHTML = '<span class="btn-spinner"></span> Salvando...';
    btn.disabled = true;

    try {
        const res = await fetch('/api/menu', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fullMenuData)
        });

        if (res.ok) {
            if (notify) {
                const month = monthSelect.value;
                await fetch('/api/notify-update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mes: month.charAt(0).toUpperCase() + month.slice(1) })
                });
                showToast("✅ Alterações salvas e notificações enviadas!", 'success');
            } else {
                showToast("✅ Alterações salvas com sucesso!", 'success');
            }
            hasUnsavedChanges = false;
            document.getElementById('save-btn').classList.remove('btn-dirty');
        } else {
            showToast("❌ Erro ao salvar dados no servidor.", 'error');
        }
    } catch (err) {
        showToast("❌ Falha na conexão com o servidor.", 'error');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

/**
 * Exibe uma notificação toast na tela.
 * @param {string} message - A mensagem a ser exibida.
 * @param {'success'|'error'|'warning'|'info'} type - O tipo de notificação.
 * @param {number} duration - Duração em milissegundos antes de desaparecer.
 */
function showToast(message, type = 'info', duration = 3000) {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        console.warn('Toast container não encontrado. Exibindo alert:', message);
        alert(message);
        return;
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    
    toastContainer.appendChild(toast);

    // Força o reflow para a animação de entrada
    void toast.offsetWidth; 
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hide');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, duration);
}

/**
 * Inicializa o tema (claro/escuro) baseado na preferência salva ou do sistema.
 */
function initTheme() {
    const themeToggleButton = document.getElementById('theme-toggle');
    const docElement = document.documentElement;

    const applyTheme = (theme) => {
        if (theme === 'dark') {
            docElement.classList.add('dark-mode');
            if (themeToggleButton) themeToggleButton.textContent = '☀️';
        } else {
            docElement.classList.remove('dark-mode');
            if (themeToggleButton) themeToggleButton.textContent = '🌙';
        }
    };

    const toggleTheme = () => {
        const currentTheme = docElement.classList.contains('dark-mode') ? 'light' : 'dark';
        localStorage.setItem('theme', currentTheme);
        applyTheme(currentTheme);
    };

    const savedTheme = localStorage.getItem('theme');
    const themeToApply = savedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(themeToApply);

    if (themeToggleButton) {
        themeToggleButton.addEventListener('click', toggleTheme);
    }
}

/**
 * Busca e exibe o histórico de alterações no modal
 */
async function showAuditLog() {
    const modal = document.getElementById('audit-modal');
    const list = document.getElementById('audit-log-list');
    const apiUrl = (['5500', '5501', '5502', '3000'].includes(window.location.port)) ? 'http://localhost:5000/api' : '/api';

    list.innerHTML = '<li>Carregando histórico...</li>';
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');

    try {
        const res = await fetch(`${apiUrl}/audit-log`);
        const logs = await res.json();

        if (logs.length === 0) {
            list.innerHTML = '<li>Nenhum registro encontrado.</li>';
            return;
        }

        list.innerHTML = logs.map(log => {
            const date = new Date(log.timestamp).toLocaleString('pt-BR');
            return `
                <li>
                    <strong>${date}</strong><br>
                    <span style="color: var(--text-color-muted)">Usuário:</span> ${log.user}<br>
                    <span style="color: var(--primary-color)">Ação:</span> ${log.action}
                </li>
            `;
        }).join('');
    } catch (err) {
        list.innerHTML = '<li>Erro ao carregar histórico.</li>';
    }
}

/**
 * Abre o modal de pré-visualização de PDF
 */
function openPdfPreview(url) {
    let previewUrl = url;
    
    // Converte links do Google Drive para o formato de visualização incorporada (preview)
    if (url.includes('drive.google.com')) {
        previewUrl = url.replace(/\/view.*/, '/preview').replace(/\/edit.*/, '/preview');
    }

    const modal = document.getElementById('pdf-preview-modal');
    const iframe = document.getElementById('pdf-preview-iframe');
    
    if (modal && iframe) {
        iframe.src = previewUrl;
        modal.classList.add('show');
        modal.setAttribute('aria-hidden', 'false');
    }
}

document.getElementById('view-history-btn').onclick = showAuditLog;
document.getElementById('close-audit-modal').onclick = () => {
    const modal = document.getElementById('audit-modal');
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
};

document.getElementById('close-pdf-modal').onclick = () => {
    const modal = document.getElementById('pdf-preview-modal');
    const iframe = document.getElementById('pdf-preview-iframe');
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    iframe.src = ''; // Limpa o iframe para economizar recursos e parar carregamentos em background
};

document.getElementById('save-btn').onclick = () => saveData(false);
document.getElementById('notify-btn').onclick = () => {
    if (!monthSelect.value) {
        showToast("Selecione um mês antes de notificar.", 'warning');
        return;
    }
    if (confirm("Deseja salvar e enviar notificação PUSH para todos os usuários?")) saveData(true);
};

// Alerta o usuário se houver alterações não salvas antes de fechar a aba
window.onbeforeunload = (e) => {
    if (hasUnsavedChanges) {
        e.preventDefault();
        return "Você tem alterações não salvas. Deseja realmente sair?";
    }
};

/**
 * Inicializa o botão de voltar ao topo
 */
function initBackToTop() {
    const backToTopButton = document.getElementById("back-to-top");
    if (!backToTopButton) return;

    window.addEventListener("scroll", () => {
        const shouldShow = window.scrollY > 300;
        backToTopButton.classList.toggle("show", shouldShow);
    }, { passive: true });

    backToTopButton.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.addEventListener('DOMContentLoaded', () => {
    initTheme(); // Carrega o tema imediatamente para evitar "flash" de branco
    initBackToTop();
    init();
});