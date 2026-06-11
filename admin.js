let fullMenuData = {};
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
function setEditorMessage(msg) {
    editor.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--text-color-muted);">${msg}</div>`;
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

function validateInput(input) {
    input.classList.toggle('invalid-link', !isValidUrl(input.value));
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
            setEditorMessage('✅ Dados carregados. Selecione um mês para começar.');
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

            document.getElementById('login-overlay').style.display = 'flex';
            setEditorMessage('❌ Sessão expirada ou acesso negado.');
        }
    } catch (err) {
        setEditorMessage('❌ Erro ao conectar com o servidor. Verifique se o login foi realizado.');
    }
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
    } else if (month && (!fullMenuData[year] || !fullMenuData[year][month])) {
        setEditorMessage(`⚠️ O mês de <strong>${month}</strong> ainda não existe no arquivo JSON.`);
    } else {
        setEditorMessage('Selecione um mês para editar as semanas.');
    }
});

weekSelect.addEventListener('change', (e) => {
    const month = monthSelect.value;
    const val = e.target.value;
    if (month) {
        renderMonth(month, (val === 'all' || val === '') ? null : val);
    }
});

function renderMonth(month, specificIndex = null) {
    const allWeeks = fullMenuData[year][month] || [];
    editor.innerHTML = `<h2>📅 ${month.toUpperCase()} ${year}</h2>`;

    allWeeks.forEach((week, index) => {
        // Se uma semana específica foi selecionada no filtro, ignora as outras
        if (specificIndex !== null && index.toString() !== specificIndex.toString()) return;

        const weekDiv = document.createElement('div');
        weekDiv.className = 'week-edit-card';
        
        let linksHtml = '';
        for (const [key, label] of Object.entries(linkLabels)) {
            linksHtml += `
                <div class="input-group admin-input-group school-input-group" data-school-type="${key}">
                    <label><span class="school-icon">${label.icon}</span> ${label.text}:</label>
                    <input type="text" value="${week.links[key] || '#'}" 
                        data-month="${month}" data-index="${index}" data-key="${key}" class="link-input">
                </div>
            `;
        }

        weekDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid var(--medium-gray); padding-bottom: 5px;">
                <div>
                    <h3 style="margin:0">${week.title}</h3>
                    <div class="week-toolbar" style="margin-top: 5px; display: flex; gap: 8px;">
                        <button class="btn-small action-clear" data-index="${index}" title="Limpar todos os links desta semana">🗑️ Limpar</button>
                        ${index > 0 ? `<button class="btn-small action-copy" data-index="${index}" title="Copiar links da semana anterior">📋 Copiar da Anterior</button>` : ''}
                    </div>
                </div>
                <div style="text-align: right;">
                    <span style="font-size: 0.75rem; font-weight: bold; display: block; margin-bottom: 4px; color: var(--text-color-muted);">ATIVO</span>
                    <label class="modern-switch">
                        <input type="checkbox" ${week.active ? 'checked' : ''} data-month="${month}" data-index="${index}" class="active-checkbox">
                        <span class="modern-slider"></span>
                    </label>
                </div>
            </div>
            ${linksHtml}
        `;
        editor.appendChild(weekDiv);
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

    editor.querySelectorAll('.action-copy').forEach(btn => {
        btn.onclick = (e) => {
            const idx = parseInt(e.target.dataset.index);
            fullMenuData[year][month][idx].links = { ...fullMenuData[year][month][idx - 1].links };
            renderMonth(month, specificIndex);
        };
    });

    // Listeners para salvar alterações em tempo real no objeto local
    editor.querySelectorAll('.link-input').forEach(input => {
        validateInput(input); // Validação inicial ao carregar o mês
        input.oninput = (e) => {
            const { month, index, key } = e.target.dataset;
            fullMenuData[year][month][index].links[key] = e.target.value;
            validateInput(e.target);
        };
    });

    editor.querySelectorAll('.active-checkbox').forEach(cb => {
        cb.onchange = (e) => {
            const { month, index } = e.target.dataset;
            fullMenuData[year][month][index].active = e.target.checked;
        };
    });
}

async function saveData(notify = false) {
    // Bloqueia o salvamento se houver URLs inválidas
    const invalidInputs = editor.querySelectorAll('.link-input.invalid-link');
    if (invalidInputs.length > 0) {
        alert("⚠️ Existem URLs inválidas. Corrija os campos destacados em vermelho antes de salvar.");
        invalidInputs[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        invalidInputs[0].focus();
        return;
    }

    const btn = notify ? document.getElementById('notify-btn') : document.getElementById('save-btn');
    const originalText = btn.innerText;
    btn.innerText = "⏳ Salvando...";
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
                alert("✅ Alterações salvas e notificações enviadas!");
            } else {
                alert("✅ Alterações salvas com sucesso!");
            }
        } else {
            alert("❌ Erro ao salvar dados no servidor.");
        }
    } catch (err) {
        alert("❌ Falha na conexão com o servidor.");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

document.getElementById('save-btn').onclick = () => saveData(false);
document.getElementById('notify-btn').onclick = () => {
    if (!monthSelect.value) return alert("Selecione um mês antes de notificar.");
    if (confirm("Deseja salvar e enviar notificação PUSH para todos os usuários?")) saveData(true);
};

document.addEventListener('DOMContentLoaded', init);