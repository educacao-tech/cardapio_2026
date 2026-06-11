let fullMenuData = {};
const year = "2026";
const editor = document.getElementById('editor-container');
const monthSelect = document.getElementById('select-month');

// Mapeamento amigável para os campos de links
const linkLabels = {
    'creche-m-verde': 'Creche M. Verde',
    'creches': 'Demais Creches',
    'fundamental-braga': 'Braga, Caic, Célia, Alzira e Padre',
    'fundamental-anna': 'Anna, Anselmo, M. Ap., Faggioni, Braguetto',
    'fundamental-aaugusto': 'A. Augusto, Portinari e M. Virgínia',
    'fundamental-esther': 'Esther Vianna',
    'fundamental-gtl': 'GTL, EESA, Castelo e Washington',
    'etec': 'ETEC / Ensino Médio'
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
    if (month && fullMenuData[year] && fullMenuData[year][month]) {
        renderMonth(month);
    } else if (month && (!fullMenuData[year] || !fullMenuData[year][month])) {
        setEditorMessage(`⚠️ O mês de <strong>${month}</strong> ainda não existe no arquivo JSON.`);
    } else {
        setEditorMessage('Selecione um mês para editar as semanas.');
    }
});

function renderMonth(month) {
    const weeks = fullMenuData[year][month] || [];
    editor.innerHTML = `<h2>📅 ${month.toUpperCase()} ${year}</h2>`;

    weeks.forEach((week, index) => {
        const weekDiv = document.createElement('div');
        weekDiv.className = 'week-edit-card';
        
        let linksHtml = '';
        for (const [key, label] of Object.entries(linkLabels)) {
            linksHtml += `
                <div class="input-group">
                    <label>${label}:</label>
                    <input type="text" value="${week.links[key] || '#'}" 
                        data-month="${month}" data-index="${index}" data-key="${key}" class="link-input">
                </div>
            `;
        }

        weekDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid var(--medium-gray); padding-bottom: 5px;">
                <h3 style="margin:0">${week.title}</h3>
                <label style="cursor:pointer; font-size: 0.9rem;">
                    <input type="checkbox" ${week.active ? 'checked' : ''} 
                        data-month="${month}" data-index="${index}" class="active-checkbox"> 
                    Exibir no App
                </label>
            </div>
            ${linksHtml}
        `;
        editor.appendChild(weekDiv);
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