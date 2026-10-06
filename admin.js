let fullMenuData = {};
let originalMenuData = {};
let hasUnsavedChanges = false;
let showOnlyPending = false;
const year = "2026";
const DRAFT_KEY = 'admin_menu_draft_2026';
const editor = document.getElementById('editor-container');
const monthSelect = document.getElementById('select-month');
const weekSelect = document.getElementById('select-week');

const accessibilityCache = new Map();

/**
 * Salva o rascunho atual no localStorage para recuperação automática
 */
function saveDraftToStorage() {
    if (!hasUnsavedChanges || !monthSelect.value) return;
    try {
        const draft = {
            month: monthSelect.value,
            fullMenuData: fullMenuData,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch (e) { console.warn('Erro ao salvar rascunho local:', e); }
}

/**
 * Limpa o rascunho salvo do localStorage
 */
function clearDraftFromStorage() {
    localStorage.removeItem(DRAFT_KEY);
}

/**
 * Verifica se existe um rascunho salvo e exibe a barra de recuperação se necessário
 */
function checkDraftBanner() {
    const draftStr = localStorage.getItem(DRAFT_KEY);
    if (!draftStr) return;
    try {
        const draft = JSON.parse(draftStr);
        if (!draft || !draft.timestamp) return;

        const timeFormatted = new Date(draft.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        
        let banner = document.getElementById('draft-recovery-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'draft-recovery-banner';
            banner.className = 'draft-banner';
            editor.prepend(banner);
        }
        
        banner.innerHTML = `
            <span>⚠️ Rascunho não salvo encontrado (Salvo às ${timeFormatted}). Deseja restaurar?</span>
            <div class="draft-actions">
                <button class="btn-small" id="restore-draft-btn">Restaurar Rascunho</button>
                <button class="btn-small" id="discard-draft-btn" style="background:#dc3545; color:white; border-color:#dc3545;">Descartar</button>
            </div>
        `;

        document.getElementById('restore-draft-btn').onclick = () => {
            if (draft.fullMenuData) {
                fullMenuData = JSON.parse(JSON.stringify(draft.fullMenuData));
                hasUnsavedChanges = true;
                document.getElementById('save-btn').classList.add('btn-dirty');
                if (monthSelect.value) renderMonth(monthSelect.value);
                showToast("✅ Rascunho restaurado com sucesso!", "success");
            }
        };

        document.getElementById('discard-draft-btn').onclick = () => {
            clearDraftFromStorage();
            banner.remove();
            showToast("Rascunho descartado.", "info");
        };
    } catch(e) {}
}

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

const monthNames = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

/**
 * Identifica o nome do mês atual ou o mais apropriado para o ano
 */
function getCurrentMonthName() {
    const today = new Date();
    const monthIndex = today.getMonth(); // 0 a 11
    const detectedMonth = monthNames[monthIndex];
    
    // Se o mês atual detectado existir no cardápio de 2026, usa ele
    if (fullMenuData[year] && fullMenuData[year][detectedMonth]) {
        return detectedMonth;
    }
    
    // Caso não exista ainda no JSON, procura o mês disponível mais próximo
    if (fullMenuData[year]) {
        const availableMonths = Object.keys(fullMenuData[year]);
        // Tenta encontrar o mês mais recente disponível até o mês atual
        for (let i = monthIndex; i >= 0; i--) {
            if (availableMonths.includes(monthNames[i])) return monthNames[i];
        }
        if (availableMonths.length > 0) return availableMonths[0];
    }
    return detectedMonth || 'fevereiro';
}

/**
 * Calcula o status de preenchimento de um mês específico
 * @returns {'status-complete'|'status-pending'|'status-empty'}
 */
function calculateMonthStatus(month) {
    if (!fullMenuData[year] || !fullMenuData[year][month] || !Array.isArray(fullMenuData[year][month])) {
        return 'status-empty';
    }
    const weeks = fullMenuData[year][month];
    if (weeks.length === 0) return 'status-empty';

    const schoolKeys = Object.keys(linkLabels);
    const totalSlots = weeks.length * schoolKeys.length;
    let filledSlots = 0;

    weeks.forEach(week => {
        schoolKeys.forEach(k => {
            const url = week.links ? week.links[k] : '';
            if (url && url !== '#' && url.trim() !== '') {
                filledSlots++;
            }
        });
    });

    if (filledSlots === 0) return 'status-empty';
    if (filledSlots === totalSlots) return 'status-complete';
    return 'status-pending';
}

/**
 * Renderiza os chips de seleção de mês com indicadores visuais de status
 */
function renderMonthChips() {
    const container = document.getElementById('month-chips-container');
    if (!container) return;

    container.innerHTML = '';
    const currentMonth = monthSelect.value;
    const realCurrentMonth = getCurrentMonthName();

    // Atualiza o texto do atalho no cabeçalho se o elemento existir
    const currentMonthDisplay = document.getElementById('current-month-name-display');
    if (currentMonthDisplay && realCurrentMonth) {
        currentMonthDisplay.textContent = realCurrentMonth.charAt(0).toUpperCase() + realCurrentMonth.slice(1);
    }

    monthNames.forEach(month => {
        const status = calculateMonthStatus(month);
        const isSelected = month === currentMonth;
        const isCurrent = month === realCurrentMonth;

        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `month-chip ${isSelected ? 'active' : ''} ${isCurrent ? 'is-current-month' : ''}`;
        chip.dataset.month = month;
        if (isCurrent) {
            chip.title = `${month.charAt(0).toUpperCase() + month.slice(1)} é o mês atual do calendário`;
        }
        
        const capMonth = month.charAt(0).toUpperCase() + month.slice(1);
        chip.innerHTML = `
            <span class="chip-status-dot ${status}"></span>
            <span class="chip-name">${capMonth}</span>
            ${isCurrent ? '<span class="chip-current-badge">ATUAL</span>' : ''}
        `;

        chip.onclick = () => {
            if (monthSelect.value !== month) {
                monthSelect.value = month;
                monthSelect.dispatchEvent(new Event('change'));
            }
            chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        };

        container.appendChild(chip);
    });

    // Centraliza suavemente o chip ativo (ou o mês atual) no seletor horizontal
    setTimeout(() => {
        const activeChip = container.querySelector('.month-chip.active') || container.querySelector('.month-chip.is-current-month');
        if (activeChip) {
            activeChip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }, 100);
}

/**
 * Calcula o status de preenchimento de uma semana específica
 */
function calculateWeekStatus(week) {
    const schoolKeys = Object.keys(linkLabels);
    const totalSlots = schoolKeys.length;
    let filledSlots = 0;
    const missingKeys = [];

    schoolKeys.forEach(k => {
        const url = week.links ? week.links[k] : '';
        if (url && url !== '#' && url.trim() !== '') {
            filledSlots++;
        } else {
            missingKeys.push(k);
        }
    });

    return {
        totalSlots,
        filledSlots,
        missingCount: totalSlots - filledSlots,
        missingKeys,
        isComplete: filledSlots === totalSlots,
        status: (filledSlots === 0) ? 'status-empty' : ((filledSlots === totalSlots) ? 'status-complete' : 'status-pending')
    };
}

/**
 * Atualiza visualmente o badge da categoria (ex: ⚠️ Faltam X ou ✅ Completa)
 */
function updateCategoryHeaderBadge(inputElement) {
    const section = inputElement.closest('.admin-category-section');
    if (!section) return;

    const inputs = Array.from(section.querySelectorAll('.link-input'));
    const pendingCount = inputs.filter(inp => !inp.value || inp.value === '#' || inp.value.trim() === '').length;

    let badge = section.querySelector('.category-pending-pill, .category-done-pill');
    if (badge) {
        if (pendingCount > 0) {
            badge.className = 'category-pending-pill';
            badge.textContent = `⚠️ Faltam ${pendingCount}`;
        } else {
            badge.className = 'category-done-pill';
            badge.textContent = '✅ Completa';
        }
    }
}

/**
 * Atualiza visualmente o badge de progresso da semana no card
 */
function updateWeekCardBadge(inputElement) {
    const card = inputElement.closest('.week-edit-card');
    if (!card) return;

    const inputs = Array.from(card.querySelectorAll('.link-input'));
    const totalSlots = inputs.length;
    const filledSlots = inputs.filter(inp => inp.value && inp.value !== '#' && inp.value.trim() !== '').length;

    const badge = card.querySelector('.week-progress-badge');
    if (badge) {
        const isWeekDone = filledSlots === totalSlots;
        badge.className = `week-progress-badge ${isWeekDone ? 'badge-success' : (filledSlots > 0 ? 'badge-warning' : 'badge-danger')}`;
        badge.textContent = `${isWeekDone ? '✅' : (filledSlots > 0 ? '⚠️' : '❌')} ${filledSlots}/${totalSlots} Concluído`;
    }
}

/**
 * Função unificada chamada em tempo real sempre que um link é inserido, colado ou modificado
 */
function handleLinkChange(inputElement) {
    const { month, index, key } = inputElement.dataset;
    if (!month || index === undefined || !key) return;

    validateInput(inputElement);
    const cleanedVal = inputElement.value.trim();

    // Atualiza os dados locais imediatamente
    if (fullMenuData[year] && fullMenuData[year][month] && fullMenuData[year][month][index]) {
        fullMenuData[year][month][index].links[key] = cleanedVal;
    }

    saveDraftToStorage();

    // Atualiza classe is-pending-input dinamicamente
    const isValReal = cleanedVal && cleanedVal !== '#' && cleanedVal !== '';
    inputElement.classList.toggle('is-pending-input', !isValReal);

    // Micro-pulso visual ao inserir link válido
    if (inputElement.classList.contains('valid-link')) {
        inputElement.classList.remove('valid-link-pulse');
        void inputElement.offsetWidth;
        inputElement.classList.add('valid-link-pulse');
    }

    // Atualiza badges visuais no card e categoria
    updateCategoryHeaderBadge(inputElement);
    updateWeekCardBadge(inputElement);

    // Atualiza imediatamente a lista de pendências e todos os componentes reativos
    updateUnsavedChangesUI();
    updateDashboard();
    updateKpiCards();
    renderMonthChips();
    renderWeekChips(month);
    updatePendingPanel(month);
}

/**
 * Renderiza o seletor visual de semanas (pílulas / mini-timeline)
 */
function renderWeekChips(month) {
    const wrapper = document.getElementById('week-chips-wrapper');
    const container = document.getElementById('week-chips-container');
    const summary = document.getElementById('week-chips-summary');
    if (!wrapper || !container) return;

    if (!month || !fullMenuData[year] || !fullMenuData[year][month]) {
        wrapper.style.display = 'none';
        return;
    }

    const weeks = fullMenuData[year][month];
    if (weeks.length === 0) {
        wrapper.style.display = 'none';
        return;
    }

    wrapper.style.display = 'block';
    container.innerHTML = '';

    const todayIso = new Date().toISOString().split('T')[0];
    let completedWeeksCount = 0;
    let totalMissingLinks = 0;

    weeks.forEach(w => {
        const st = calculateWeekStatus(w);
        if (st.isComplete) completedWeeksCount++;
        totalMissingLinks += st.missingCount;
    });

    if (summary) {
        summary.textContent = `${completedWeeksCount} de ${weeks.length} semanas completas ${totalMissingLinks > 0 ? `• ⚠️ ${totalMissingLinks} link${totalMissingLinks > 1 ? 's' : ''} pendente${totalMissingLinks > 1 ? 's' : ''}` : '• ✨ 100% Preenchido'}`;
    }

    const currentWeekVal = weekSelect.value || 'all';

    // Chip "Todas as Semanas"
    const allChip = document.createElement('button');
    allChip.type = 'button';
    allChip.className = `week-chip ${currentWeekVal === 'all' || currentWeekVal === '' ? 'active' : ''}`;
    allChip.innerHTML = `
        <span class="week-chip-title">👁️ Todas</span>
        <span class="week-chip-badge ${totalMissingLinks === 0 ? 'badge-all-complete' : 'badge-all-pending'}">
            ${totalMissingLinks === 0 ? '✅ 100%' : `⚠️ ${totalMissingLinks} pendentes`}
        </span>
    `;
    allChip.onclick = () => {
        if (weekSelect.value !== 'all') {
            weekSelect.value = 'all';
            renderMonth(month, null);
            renderWeekChips(month);
        }
    };
    container.appendChild(allChip);

    // Chips individuais para cada semana
    weeks.forEach((week, index) => {
        const st = calculateWeekStatus(week);
        const isCurrentCalendarWeek = week.startDate && week.endDate && (todayIso >= week.startDate && todayIso <= week.endDate);
        const isSelected = currentWeekVal.toString() === index.toString();

        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `week-chip ${isSelected ? 'active' : ''} ${isCurrentCalendarWeek ? 'is-current-week-chip' : ''}`;

        const parts = week.title.split(' - ');
        const shortName = parts[0];
        const dateRange = parts[1] || '';

        chip.innerHTML = `
            <span class="chip-status-dot ${st.status}"></span>
            <div class="week-chip-info">
                <span class="week-chip-name">${shortName} ${isCurrentCalendarWeek ? '⭐' : ''}</span>
                <span class="week-chip-dates">${dateRange}</span>
            </div>
            <span class="week-chip-badge ${st.isComplete ? 'badge-week-ok' : 'badge-week-alert'}">
                ${st.isComplete ? '✅ 8/8' : `⚠️ Faltam ${st.missingCount}`}
            </span>
        `;

        chip.onclick = () => {
            weekSelect.value = index.toString();
            renderMonth(month, index);
            renderWeekChips(month);
            
            setTimeout(() => {
                const targetCard = editor.querySelector('.week-edit-card');
                if (targetCard) targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 50);
        };

        container.appendChild(chip);
    });
}

/**
 * Atualiza o painel da Central de Pendências
 */
function updatePendingPanel(month) {
    const panel = document.getElementById('pending-links-panel');
    const heading = document.getElementById('pending-panel-heading');
    const list = document.getElementById('pending-links-list');
    if (!panel || !heading || !list) return;

    if (!month || !fullMenuData[year] || !fullMenuData[year][month]) {
        panel.style.display = 'none';
        return;
    }

    const weeks = fullMenuData[year][month];
    const pendingItems = [];
    const schoolKeys = Object.keys(linkLabels);

    weeks.forEach((week, weekIndex) => {
        schoolKeys.forEach(k => {
            const url = week.links ? week.links[k] : '';
            if (!url || url === '#' || url.trim() === '') {
                pendingItems.push({
                    weekIndex,
                    weekTitle: week.title,
                    schoolKey: k,
                    schoolLabel: linkLabels[k].text,
                    schoolIcon: linkLabels[k].icon
                });
            }
        });
    });

    if (pendingItems.length === 0) {
        panel.style.display = 'block';
        panel.classList.add('panel-completed');
        const capMonth = month.charAt(0).toUpperCase() + month.slice(1);
        heading.innerHTML = `✨ <strong>Mês 100% Preenchido!</strong> Todos os links de ${capMonth} estão configurados.`;
        list.innerHTML = `<div class="pending-empty-state">🎉 Excelente trabalho! Todos os cardápios de ${capMonth} estão prontos para publicação.</div>`;
        return;
    }

    panel.style.display = 'block';
    panel.classList.remove('panel-completed');
    const capMonth = month.charAt(0).toUpperCase() + month.slice(1);
    heading.innerHTML = `⚡ <strong>Central de Pendências</strong> (${pendingItems.length} link${pendingItems.length > 1 ? 's' : ''} aguardando em ${capMonth})`;

    list.innerHTML = '';
    pendingItems.forEach(item => {
        const row = document.createElement('div');
        row.className = 'pending-item-row';
        row.setAttribute('role', 'button');
        row.setAttribute('tabindex', '0');
        row.title = `Clique para ir direto ao campo de ${item.schoolLabel} (${item.weekTitle})`;
        row.innerHTML = `
            <div class="pending-item-info">
                <span class="pending-week-tag">${item.weekTitle.split(' - ')[0]}</span>
                <span class="pending-school-name" title="${item.schoolLabel}">${item.schoolIcon} ${item.schoolLabel}</span>
            </div>
            <button type="button" class="btn-small pending-jump-btn" title="Ir diretamente para este campo">
                Preencher ➔
            </button>
        `;

        const doJump = (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            jumpToSpecificField(month, item.weekIndex, item.schoolKey);
        };

        row.onclick = doJump;
        row.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                doJump(e);
            }
        };

        const btn = row.querySelector('.pending-jump-btn');
        if (btn) {
            btn.onclick = doJump;
        }

        list.appendChild(row);
    });
}

/**
 * Posiciona o campo exatamente no centro da tela de forma imediata (sem rolagem suave)
 */
function scrollElementToVisualCenter(element) {
    if (!element) return;
    element.scrollIntoView({ behavior: 'instant', block: 'center' });
}

/**
 * Salta diretamente para um campo específico com expansão automática e pulso de foco
 */
function jumpToSpecificField(month, weekIndex, schoolKey) {
    const curMonth = month || monthSelect.value;

    // Se o mês for diferente do atualmente carregado, troca o mês
    if (month && monthSelect.value !== month) {
        monthSelect.value = month;
        monthSelect.dispatchEvent(new Event('change'));
    } else if (weekSelect.value !== 'all' && weekSelect.value.toString() !== weekIndex.toString()) {
        // Se a semana estiver filtrada em outra semana, reexibe todas as semanas
        weekSelect.value = 'all';
        renderMonth(curMonth, null);
        renderWeekChips(curMonth);
    }

    const executeFocus = () => {
        // Busca o campo sem depender da formatação da string do mês, garantindo correspondência 100% precisa
        const input = editor.querySelector(`.link-input[data-index="${weekIndex}"][data-key="${schoolKey}"]`) ||
                      editor.querySelector(`.link-input[data-key="${schoolKey}"]`);

        if (!input) {
            console.warn(`Campo não encontrado para semana ${weekIndex} e chave ${schoolKey}`);
            return;
        }

        // 1. Expande a categoria se estiver recolhida
        const categorySection = input.closest('.admin-category-section');
        if (categorySection) {
            categorySection.classList.remove('collapsed');
            const toggleBtn = categorySection.querySelector('.action-toggle-category');
            if (toggleBtn) toggleBtn.textContent = '🔽';
            void categorySection.offsetHeight; // Força recálculo de layout
        }

        // 2. Garante que o input group esteja visível (caso filtro de pendentes esteja ativo)
        const inputGroup = input.closest('.school-input-group');
        if (inputGroup) {
            inputGroup.style.display = '';
            void inputGroup.offsetHeight;
        }

        // 3. Centraliza exatamente no campo de forma imediata (sem rolagem suave)
        scrollElementToVisualCenter(input);

        // 4. Move o foco e seleciona o conteúdo (ex: "#") para substituição direta por Ctrl+V
        input.focus({ preventScroll: true });
        try {
            input.setSelectionRange(0, input.value.length);
        } catch (e) {
            input.select();
        }

        // 5. Reafirma a centralização exata no campo evitando qualquer deslocamento do navegador
        scrollElementToVisualCenter(input);

        // 6. Aciona o efeito visual pulsante para guiar o olhar do usuário
        input.classList.remove('focus-pulse');
        void input.offsetWidth;
        input.classList.add('focus-pulse');

        const schoolName = (linkLabels && linkLabels[schoolKey]) ? linkLabels[schoolKey].text : schoolKey;
        const weekNum = (parseInt(weekIndex) + 1) || 1;
        showToast(`🎯 Direcionado para: ${schoolName} (${weekNum}ª Semana)`, 'info', 2000);
    };

    requestAnimationFrame(() => {
        setTimeout(executeFocus, 30);
    });
}

/**
 * Calcula o total de alterações não salvas comparando com originalMenuData
 */
function calculateUnsavedChangesCount() {
    if (!originalMenuData[year] || !fullMenuData[year]) return 0;
    let count = 0;
    const months = Object.keys(fullMenuData[year]);

    months.forEach(m => {
        const fullWeeks = fullMenuData[year][m] || [];
        const origWeeks = (originalMenuData[year] && originalMenuData[year][m]) || [];
        
        fullWeeks.forEach((fw, idx) => {
            const ow = origWeeks[idx];
            if (!ow) {
                count++;
                return;
            }
            if (fw.active !== ow.active) count++;
            if (fw.title !== ow.title) count++;

            const keys = Object.keys(linkLabels);
            keys.forEach(k => {
                const fVal = (fw.links && fw.links[k]) || '#';
                const oVal = (ow.links && ow.links[k]) || '#';
                if (fVal !== oVal) count++;
            });
        });
    });
    return count;
}

/**
 * Atualiza o badge e texto do botão de salvar com o número de alterações pendentes
 */
function updateUnsavedChangesUI() {
    const count = calculateUnsavedChangesCount();
    hasUnsavedChanges = count > 0;
    
    const badge = document.getElementById('unsaved-count-badge');
    const textEl = document.getElementById('save-btn-text');
    const saveBtn = document.getElementById('save-btn');

    if (badge) {
        if (count > 0) {
            badge.style.display = 'inline-block';
            badge.textContent = count;
        } else {
            badge.style.display = 'none';
        }
    }

    if (textEl) {
        if (count > 0) {
            textEl.textContent = `Salvar (${count} ${count === 1 ? 'alteração' : 'alterações'})`;
        } else {
            textEl.textContent = 'Salvar Alterações';
        }
    }

    if (saveBtn) {
        saveBtn.classList.toggle('btn-dirty', count > 0);
    }
}

/**
 * Atualiza os Cards de KPIs no topo com animações e dados em tempo real
 */
function updateKpiCards() {
    const kpiContainer = document.getElementById('kpi-cards-container');
    const month = monthSelect.value;

    if (!month || !fullMenuData[year] || !fullMenuData[year][month]) {
        if (kpiContainer) kpiContainer.style.display = 'none';
        return;
    }

    if (kpiContainer) kpiContainer.style.display = 'grid';
    const weeks = fullMenuData[year][month];
    const schoolKeys = Object.keys(linkLabels);

    const totalLinks = weeks.length * schoolKeys.length;
    let filledLinks = 0;
    let activeWeeks = 0;

    weeks.forEach(week => {
        if (week.active) activeWeeks++;
        schoolKeys.forEach(k => {
            const url = week.links ? week.links[k] : '';
            if (url && url !== '#' && url.trim() !== '') filledLinks++;
        });
    });

    const percentage = totalLinks > 0 ? Math.round((filledLinks / totalLinks) * 100) : 0;
    const missingCount = totalLinks - filledLinks;

    // Card 1: Status Geral (Com Gráfico Circular SVG)
    const percentVal = document.getElementById('kpi-percent-val');
    const circleFill = document.getElementById('kpi-circle-fill');
    const progressFill = document.getElementById('kpi-progress-fill');
    const statusBadge = document.getElementById('kpi-status-badge');
    const filledRatio = document.getElementById('kpi-filled-ratio');

    if (percentVal) percentVal.textContent = `${percentage}%`;
    if (progressFill) progressFill.style.width = `${percentage}%`;
    if (circleFill) {
        const circumference = 175.93; // 2 * PI * 28
        const offset = circumference - (percentage / 100) * circumference;
        circleFill.style.strokeDashoffset = offset;
        if (percentage === 100) {
            circleFill.style.stroke = '#10b981';
        } else if (percentage > 0) {
            circleFill.style.stroke = 'var(--primary-color)';
        } else {
            circleFill.style.stroke = 'var(--medium-gray)';
        }
    }
    if (statusBadge) {
        statusBadge.textContent = percentage === 100 ? '100% Completo' : 'Incompleto';
        statusBadge.classList.toggle('complete', percentage === 100);
    }
    if (filledRatio) filledRatio.textContent = `${filledLinks} de ${totalLinks} links preenchidos`;

    // Card 2: Links Pendentes
    const pendingVal = document.getElementById('kpi-pending-val');
    const pendingSub = document.getElementById('kpi-pending-sub');
    if (pendingVal) pendingVal.textContent = missingCount;
    if (pendingSub) {
        pendingSub.textContent = missingCount === 0 ? 'Todos os links preenchidos ✨' : 'Aguardando inserção de link';
    }

    // Card 3: Semanas Ativas
    const weeksVal = document.getElementById('kpi-weeks-val');
    const weeksBadge = document.getElementById('kpi-weeks-badge');
    const weeksSub = document.getElementById('kpi-weeks-sub');
    if (weeksVal) weeksVal.textContent = `${activeWeeks} / ${weeks.length}`;
    if (weeksBadge) {
        weeksBadge.textContent = activeWeeks === weeks.length ? 'Todas Visíveis' : `${activeWeeks} Ativas`;
    }
    if (weeksSub) {
        weeksSub.textContent = `${activeWeeks} de ${weeks.length} visíveis para os alunos`;
    }
}

/**
 * Busca informações do último commit do GitHub para o KPI de sincronização
 */
async function fetchGitCommitInfo() {
    const timeEl = document.getElementById('kpi-sync-time');
    const authorEl = document.getElementById('kpi-sync-author');
    if (!timeEl || !authorEl) return;

    try {
        const apiUrl = (['5501', '5502', '3000'].includes(window.location.port)) ? 'http://localhost:5500/api' : '/api';
        const res = await fetch(`${apiUrl}/github-commit`);
        if (res.ok) {
            const data = await res.json();
            if (data.date) {
                const d = new Date(data.date);
                const timeStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                timeEl.textContent = timeStr;
                authorEl.textContent = `Por ${data.author || 'admin'} (${data.hash || 'recém'})`;
                authorEl.title = data.message || '';
                return;
            }
        }
    } catch (e) {}
    timeEl.textContent = 'Recente';
    authorEl.textContent = 'Sincronizado com GitHub';
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
    const dashboardContainer = document.getElementById('admin-dashboard');
    const statPercent = document.getElementById('stat-percent');
    const statAlerts = document.getElementById('stat-alerts');
    const missingCountEl = document.getElementById('missing-count');
    
    statPercent.textContent = `${percentage}%`;
    statPercent.style.color = percentage === 100 ? 'var(--btn-creche-m-verde)' : 'var(--primary-color)';
    
    const missingCount = totalLinks - filledLinks;
    if (statAlerts && missingCountEl) {
        statAlerts.style.display = missingCount > 0 ? 'flex' : 'none';
        missingCountEl.textContent = missingCount;
    }

    // Melhora o tooltip com contagem detalhada
    dashboardContainer.title = `Progresso: ${filledLinks}/${totalLinks} preenchidos. Faltam ${missingCount} links. ${hasUnsavedChanges ? '(Alterações pendentes)' : ''}`;
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
    const rawVal = input.value.trim();
    const cleaned = cleanGoogleUrl(rawVal);
    if (input.value !== cleaned) input.value = cleaned;

    const isValid = isValidUrl(cleaned);
    const isPending = !cleaned || cleaned === '#' || cleaned === '';
    const isDriveLink = isValid && !isPending && (cleaned.includes('drive.google.com') || cleaned.includes('docs.google.com'));

    input.classList.toggle('invalid-link', !isValid && !isPending);
    input.classList.toggle('valid-link', isValid && !isPending);
    input.classList.toggle('valid-drive-link', isDriveLink);
    input.classList.toggle('is-pending-input', isPending);

    const container = input.closest('.school-input-group');
    if (container) {
        const statusEl = container.querySelector('.accessibility-status');
        if (statusEl) {
            if (isPending) {
                statusEl.textContent = '';
                statusEl.title = 'Link pendente (#)';
            } else if (!isValid) {
                statusEl.textContent = '❌';
                statusEl.title = 'Link inválido - Verifique a URL';
            } else if (isDriveLink) {
                statusEl.textContent = '✅';
                statusEl.title = 'Link verificado do Google Drive / Docs';
            } else {
                statusEl.textContent = '🔗';
                statusEl.title = 'Link válido';
            }
        }
    }
}

async function init(force = false) {
    const token = sessionStorage.getItem('admin_token');
    const email = sessionStorage.getItem('admin_email');
    if ((!token || !email) && !force) {
        document.getElementById('login-overlay').style.display = 'flex';
        return;
    }
    
    const apiUrl = (['5501', '5502', '3000'].includes(window.location.port)) ? 'http://localhost:5500/api' : '/api';

    try {
        setEditorMessage('⏳ Carregando dados do cardápio...');
        const res = await fetch(`${apiUrl}/menu`);
        if (res.ok) {
            fullMenuData = await res.json();
            originalMenuData = JSON.parse(JSON.stringify(fullMenuData));
            monthSelect.disabled = false; // Habilita o seletor de mês
            document.getElementById('login-overlay').style.display = 'none';

            // Coloca o mês atual (ou rascunho salvo) automaticamente em primeiro plano
            const draftStr = localStorage.getItem(DRAFT_KEY);
            let draftMonth = null;
            if (draftStr) {
                try {
                    const parsed = JSON.parse(draftStr);
                    if (parsed && parsed.month) draftMonth = parsed.month;
                } catch(e) {}
            }

            const monthToLoad = draftMonth || getCurrentMonthName();
            if (monthToLoad && fullMenuData[year] && fullMenuData[year][monthToLoad]) {
                monthSelect.value = monthToLoad;
                monthSelect.dispatchEvent(new Event('change'));
            } else {
                setEditorMessage('✅ Dados carregados. Selecione um mês para começar.', 'success');
                renderMonthChips();
            }

            checkDraftBanner();
            updateUnsavedChangesUI();
            fetchGitCommitInfo();

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
        updateKpiCards();
        renderMonthChips();
        renderWeekChips(month);
        updatePendingPanel(month);
    } else if (month && (!fullMenuData[year] || !fullMenuData[year][month])) {
        setEditorMessage(`⚠️ O mês de <strong>${month}</strong> ainda não existe no arquivo JSON.`, 'warning');
        updateDashboard();
        updateKpiCards();
        renderMonthChips();
        renderWeekChips(null);
        updatePendingPanel(null);
    } else {
        setEditorMessage('Selecione um mês para editar as semanas.');
        updateDashboard();
        updateKpiCards();
        renderMonthChips();
        renderWeekChips(null);
        updatePendingPanel(null);
    }
});

weekSelect.addEventListener('change', (e) => {
    const month = monthSelect.value;
    const val = e.target.value;
    if (month) {
        renderMonth(month, (val === 'all' || val === '') ? null : val);
        renderWeekChips(month);
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

    // Cache simples para evitar re-checar a mesma URL na mesma sessão
    if (accessibilityCache.has(url)) {
        statusEl.textContent = accessibilityCache.get(url) ? '✅' : '❌';
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
        accessibilityCache.set(url, data.reachable);
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
    globalActions.style = "margin-bottom: 1rem; display: flex; gap: 10px; flex-wrap: wrap;";
    globalActions.innerHTML = `
        <button class="btn-small" onclick="toggleAllCategories(true)">📂 Expandir Todas Categorias</button>
        <button class="btn-small" onclick="toggleAllCategories(false)">📁 Recolher Todas</button>
        <button class="btn-small ${showOnlyPending ? 'btn-filter-active' : ''}" id="toggle-pending-filter">🎯 ${showOnlyPending ? 'Mostrando Apenas Pendentes (#)' : 'Filtrar Links Pendentes (#)'}</button>
    `;
    editor.appendChild(globalActions);

    const pendingBtn = globalActions.querySelector('#toggle-pending-filter');
    if (pendingBtn) {
        pendingBtn.onclick = (e) => {
            e.preventDefault();
            showOnlyPending = !showOnlyPending;
            renderMonth(month, specificIndex);
            showToast(showOnlyPending ? "🎯 Exibindo apenas campos pendentes (#)" : "👁️ Exibindo todos os campos", "info");
        };
    }

    checkDraftBanner();

    const categories = [
        { title: "🏠 Infantil / Creches", keys: ['creche-m-verde', 'creches'] },
        { title: "🏫 Ensino Fundamental", keys: ['fundamental-braga', 'fundamental-anna', 'fundamental-aaugusto', 'fundamental-esther', 'fundamental-gtl'] },
        { title: "🔬 Ensino Médio", keys: ['etec'] }
    ];

    const schoolKeys = Object.keys(linkLabels);

    const todayIso = new Date().toISOString().split('T')[0];

    allWeeks.forEach((week, index) => {
        // Se uma semana específica foi selecionada no filtro, ignora as outras
        if (specificIndex !== null && index.toString() !== specificIndex.toString()) return;

        const isCurrentWeek = week.startDate && week.endDate && (todayIso >= week.startDate && todayIso <= week.endDate);

        // Progresso por semana
        const totalWeekKeys = schoolKeys.length;
        const filledWeekKeys = schoolKeys.filter(k => {
            const url = week.links[k];
            return isValidUrl(url) && url !== '#' && url && url.trim() !== '';
        }).length;

        const isWeekDone = filledWeekKeys === totalWeekKeys;
        const badgeClass = isWeekDone ? 'badge-success' : (filledWeekKeys > 0 ? 'badge-warning' : 'badge-danger');
        const badgeIcon = isWeekDone ? '✅' : (filledWeekKeys > 0 ? '⚠️' : '❌');
        const badgeText = `${badgeIcon} ${filledWeekKeys}/${totalWeekKeys} Concluído`;

        const weekDiv = document.createElement('div');
        weekDiv.className = `week-edit-card ${isCurrentWeek ? 'current-week-card' : ''}`;
        
        let categoriesHtml = '';
        categories.forEach(cat => {
            let inputsHtml = '';

            // Calcula pendências nesta categoria
            const pendingInCategory = cat.keys.filter(key => {
                const linkVal = week.links ? week.links[key] : '';
                return !linkVal || linkVal === '#' || linkVal.trim() === '';
            }).length;

            // Se for a semana atual OU houver links pendentes, a categoria se expande automaticamente!
            const isCollapsed = !isCurrentWeek && pendingInCategory === 0;
            const toggleIcon = isCollapsed ? '▶️' : '🔽';

            const categoryBadge = pendingInCategory > 0 
                ? `<span class="category-pending-pill">⚠️ Faltam ${pendingInCategory}</span>`
                : `<span class="category-done-pill">✅ Completa</span>`;

            cat.keys.forEach(key => {
                const label = linkLabels[key];
                const linkVal = week.links ? week.links[key] : '';
                const isPending = !linkVal || linkVal === '#' || linkVal.trim() === '';
                const displayStyle = (showOnlyPending && !isPending) ? 'display: none;' : '';

                const isRealValid = isValidUrl(linkVal) && !isPending;
                const isDrive = isRealValid && (linkVal.includes('drive.google.com') || linkVal.includes('docs.google.com'));
                const statusIcon = isPending ? '' : (isDrive ? '✅' : (isRealValid ? '🔗' : '❌'));
                const statusTitle = isPending ? 'Link pendente (#)' : (isDrive ? 'Link verificado do Google Drive / Docs' : (isRealValid ? 'Link válido' : 'Link inválido'));

                inputsHtml += `
                    <div class="input-group admin-input-group school-input-group" data-school-type="${key}" style="${displayStyle}">
                        <label class="compact-label"><span class="school-icon" style="cursor: pointer;" title="Clique para testar este link">${label.icon}</span> ${label.text}:</label>
                        <div class="compact-input-wrapper">
                            <input type="text" value="${linkVal || '#'}" 
                                placeholder="${isPending ? '⚠️ Link pendente (#) - Cole a URL aqui...' : 'https://...'}"
                                data-month="${month}" data-index="${index}" data-key="${key}" class="link-input ${isPending ? 'is-pending-input' : ''} ${isRealValid ? 'valid-link' : ''} ${isDrive ? 'valid-drive-link' : ''}">
                            <span class="accessibility-status" style="font-size: 0.9rem; min-width: 20px;" title="${statusTitle}">${statusIcon}</span>
                            <button class="btn-small action-preview-pdf" title="Pré-visualizar PDF">👁️</button>
                        </div>
                    </div>
                `;
            });

            categoriesHtml += `
                <div class="admin-category-section ${isCollapsed ? 'collapsed' : ''}">
                    <div class="admin-category-header">
                        <h4 class="admin-category-title">${cat.title} ${categoryBadge}</h4>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn-small action-toggle-category" title="Ocultar/Expandir Categoria">${toggleIcon}</button>
                            <button class="btn-small action-bulk-paste" data-keys="${cat.keys.join(',')}" data-index="${index}" title="Colar mesmo link para toda esta categoria">📋 Colar p/ todos</button>
                        </div>
                    </div>
                    <div class="admin-inputs-grid">${inputsHtml}</div>
                </div>
            `;
        });

        weekDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; border-bottom: 1px solid var(--medium-gray); padding-bottom: 3px; flex-wrap: wrap; gap: 8px;">
                <div>
                    <h3 style="margin:0; font-size: 1rem; display: inline-flex; align-items: center; flex-wrap: wrap; gap: 6px;">
                        ${week.title}
                        ${isCurrentWeek ? '<span class="week-current-badge">📍 SEMANA ATUAL</span>' : ''}
                        <span class="week-progress-badge ${badgeClass}">${badgeText}</span>
                    </h3>
                    <div class="week-toolbar" style="margin-top: 3px; display: flex; gap: 4px; flex-wrap: wrap;">
                        <button class="btn-small action-clear" data-index="${index}" title="Limpar todos os links desta semana">🗑️ Limpar</button>
                        ${index > 0 ? `<button class="btn-small action-copy" data-index="${index}" title="Copiar links da semana anterior">📋 Copiar da Anterior</button>` : ''}
                        <button class="btn-small action-undo-week" data-index="${index}" title="Restaurar os links salvos no servidor para esta semana">↩️ Desfazer</button>
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
                hasUnsavedChanges = true;
                saveDraftToStorage();
                renderMonth(month, specificIndex);
            }
        };
    });

    // Listener para desfazer alterações de uma semana
    editor.querySelectorAll('.action-undo-week').forEach(btn => {
        btn.onclick = (e) => {
            const idx = parseInt(e.currentTarget.dataset.index);
            if (originalMenuData[year] && originalMenuData[year][month] && originalMenuData[year][month][idx]) {
                fullMenuData[year][month][idx].links = JSON.parse(JSON.stringify(originalMenuData[year][month][idx].links));
                fullMenuData[year][month][idx].active = originalMenuData[year][month][idx].active;
                renderMonth(month, specificIndex);
                hasUnsavedChanges = true;
                saveDraftToStorage();
                showToast("↩️ Semana restaurada para a versão salva no servidor!", "info");
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
                saveDraftToStorage();
                renderMonth(month, specificIndex);
                showToast("Links atualizados na categoria!", "info");
            }
        };
    });

    editor.querySelectorAll('.action-copy').forEach(btn => {
        btn.onclick = (e) => {
            const idx = parseInt(e.target.dataset.index);
            fullMenuData[year][month][idx].links = { ...fullMenuData[year][month][idx - 1].links };
            hasUnsavedChanges = true;
            saveDraftToStorage();
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

    // Listeners para salvar alterações em tempo real no objeto local e no rascunho
    editor.querySelectorAll('.link-input').forEach(input => {
        validateInput(input); // Validação inicial ao carregar o mês

        // Dispara atualização automática instantânea em digitação, colagem e alteração
        input.addEventListener('input', () => handleLinkChange(input));
        input.addEventListener('change', () => handleLinkChange(input));
        input.addEventListener('paste', () => {
            setTimeout(() => handleLinkChange(input), 15);
        });
        input.addEventListener('keyup', (e) => {
            if (e.key === 'Backspace' || e.key === 'Delete') {
                handleLinkChange(input);
            }
        });

        // Atalho de teclado rápido: Apertar Enter pula automaticamente para o próximo campo vazio!
        input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleLinkChange(input);
                goToNextEmptyLink();
            }
        };

        // Verifica acessibilidade ao perder o foco (blur) ou ao carregar
        input.onblur = () => {
            handleLinkChange(input);
            checkAccessibility(input);
        };
        checkAccessibility(input);
    });

    // Feedback visual: Seletor de mês destaca se há mudanças
    monthSelect.style.borderLeft = hasUnsavedChanges ? '4px solid #fd7e14' : '';

    editor.querySelectorAll('.active-checkbox').forEach(cb => {
        cb.onchange = (e) => {
            const { month, index } = e.target.dataset;
            fullMenuData[year][month][index].active = e.target.checked;
            saveDraftToStorage();
            updateUnsavedChangesUI();
            updateKpiCards();
            renderWeekChips(month);
        };
    });

    updateDashboard(); // Garante que o dashboard atualize após ações de massa (limpar, copiar, etc)
    updateKpiCards();
    updateUnsavedChangesUI();
    renderMonthChips();
    renderWeekChips(month);
    updatePendingPanel(month);
}

async function saveData(notify = false) {
    const token = sessionStorage.getItem('admin_token');
    if (!token) {
        showToast("⚠️ Sua sessão expirou. Por favor, digite a senha novamente para salvar.", 'warning');
        document.getElementById('login-overlay').style.display = 'flex';
        const pwdInput = document.getElementById('admin-pwd');
        if (pwdInput) pwdInput.focus();
        return;
    }

    // Bloqueia o salvamento se houver URLs inválidas
    const invalidInputs = editor.querySelectorAll('.link-input.invalid-link');
    if (invalidInputs.length > 0) {
        showToast("⚠️ Existem URLs inválidas. Corrija os campos destacados em vermelho antes de salvar.", 'error');
        invalidInputs[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        invalidInputs[0].focus();
        return;
    }

    const btn = notify ? document.getElementById('notify-btn') : document.getElementById('save-btn');
    btn.innerHTML = '<span class="btn-spinner"></span> Salvando...';
    btn.disabled = true;

    try {
        const res = await fetch('/api/menu', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(fullMenuData)
        });

        if (res.ok) {
            const data = await res.json();
            if (notify) {
                const month = monthSelect.value;
                await fetch('/api/notify-update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mes: month.charAt(0).toUpperCase() + month.slice(1) })
                });
                showToast("✅ Alterações salvas no arquivo, publicadas no GitHub e notificações enviadas!", 'success', 4000);
            } else {
                showToast("✅ Salvo fisicamente em menu-links.json e publicado no GitHub! 🚀", 'success', 4000);
            }
            hasUnsavedChanges = false;
            clearDraftFromStorage();
            originalMenuData = JSON.parse(JSON.stringify(fullMenuData));
            updateUnsavedChangesUI();
            updateKpiCards();
            renderMonthChips();
            renderWeekChips(monthSelect.value);
            updatePendingPanel(monthSelect.value);
            fetchGitCommitInfo();
        } else {
            showToast("❌ Erro ao salvar dados no servidor.", 'error');
        }
    } catch (err) {
        showToast("❌ Falha na conexão com o servidor.", 'error');
    } finally {
        if (notify) {
            btn.innerHTML = '<span class="notify-icon">🔔</span> <span>Salvar e Notificar</span>';
        } else {
            btn.innerHTML = `<span class="save-icon">💾</span> <span id="save-btn-text">Salvar Alterações</span> <span id="unsaved-count-badge" class="unsaved-badge" style="display: none;">0</span>`;
            updateUnsavedChangesUI();
        }
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
    const themeToggleButtons = document.querySelectorAll('#theme-toggle, .theme-toggle-btn');
    const docElement = document.documentElement;

    const applyTheme = (theme) => {
        if (theme === 'dark') {
            docElement.classList.add('dark-mode');
            themeToggleButtons.forEach(btn => btn.textContent = '☀️');
        } else {
            docElement.classList.remove('dark-mode');
            themeToggleButtons.forEach(btn => btn.textContent = '🌙');
        }
    };

    const toggleTheme = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        const currentTheme = docElement.classList.contains('dark-mode') ? 'light' : 'dark';
        localStorage.setItem('theme', currentTheme);
        applyTheme(currentTheme);
    };

    const savedTheme = localStorage.getItem('theme');
    const themeToApply = savedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(themeToApply);

    themeToggleButtons.forEach(btn => {
        btn.removeEventListener('click', toggleTheme);
        btn.addEventListener('click', toggleTheme);
    });
}

/**
 * Busca e exibe o histórico de alterações no modal
 */
async function showAuditLog() {
    const modal = document.getElementById('audit-modal');
    const list = document.getElementById('audit-log-list');
    const apiUrl = (['5501', '5502', '3000'].includes(window.location.port)) ? 'http://localhost:5500/api' : '/api';

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
 * Abre o modal de pré-visualização de PDF / Google Docs
 */
function openPdfPreview(url) {
    let previewUrl = url;
    
    // Converte links do Google Drive ou Google Docs para o formato de visualização incorporada (preview)
    if (url.includes('drive.google.com') || url.includes('docs.google.com')) {
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
    iframe.src = ''; // Limpa o iframe para economizar recursos
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

/**
 * Localiza o próximo campo de link vazio, expande sua categoria se necessário, 
 * e move o foco para ele.
 */
function goToNextEmptyLink() {
    const inputs = Array.from(editor.querySelectorAll('.link-input'));
    const nextEmpty = inputs.find(input => !input.value || input.value === '#' || input.value.trim() === '');
    
    if (nextEmpty) {
        const categorySection = nextEmpty.closest('.admin-category-section');
        if (categorySection && categorySection.classList.contains('collapsed')) {
            categorySection.classList.remove('collapsed');
            const toggleBtn = categorySection.querySelector('.action-toggle-category');
            if (toggleBtn) toggleBtn.textContent = '🔽';
            void categorySection.offsetHeight;
        }

        const inputGroup = nextEmpty.closest('.school-input-group');
        if (inputGroup) {
            inputGroup.style.display = '';
            void inputGroup.offsetHeight;
        }

        nextEmpty.focus({ preventScroll: true });
        try {
            nextEmpty.setSelectionRange(0, nextEmpty.value.length);
        } catch (e) {
            nextEmpty.select();
        }

        nextEmpty.classList.remove('focus-pulse');
        void nextEmpty.offsetWidth;
        nextEmpty.classList.add('focus-pulse');

        scrollElementToVisualCenter(nextEmpty);
        requestAnimationFrame(() => {
            scrollElementToVisualCenter(nextEmpty);
        });

        showToast("🎯 Foco no próximo link pendente. Cole com Ctrl+V e aperte Enter!", "info", 2000);
    } else {
        showToast("✨ Excelente! Todos os links visíveis deste mês foram preenchidos.", "success");
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initTheme(); // Carrega o tema imediatamente
    initBackToTop();

    // Toggle da Central de Pendências
    const pendingToggle = document.getElementById('pending-panel-toggle');
    const pendingPanel = document.getElementById('pending-links-panel');
    if (pendingToggle && pendingPanel) {
        pendingToggle.onclick = (e) => {
            if (e.target.closest('#btn-next-pending-auto')) return;
            pendingPanel.classList.toggle('collapsed');
        };
    }

    const nextPendingAutoBtn = document.getElementById('btn-next-pending-auto');
    if (nextPendingAutoBtn) {
        nextPendingAutoBtn.onclick = (e) => {
            e.stopPropagation();
            goToNextEmptyLink();
        };
    }
    
    const nextBtn = document.getElementById('next-empty-btn');
    if (nextBtn) nextBtn.onclick = goToNextEmptyLink;

    const kpiPendingCard = document.getElementById('kpi-pending-card');
    if (kpiPendingCard) {
        kpiPendingCard.onclick = goToNextEmptyLink;
        kpiPendingCard.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                goToNextEmptyLink();
            }
        };
    }

    const jumpCurrentBtn = document.getElementById('btn-jump-current-month');
    if (jumpCurrentBtn) {
        jumpCurrentBtn.onclick = () => {
            const cur = getCurrentMonthName();
            if (cur) {
                if (monthSelect.value !== cur) {
                    monthSelect.value = cur;
                    monthSelect.dispatchEvent(new Event('change'));
                }
                showToast(`📅 Mês de ${cur.charAt(0).toUpperCase() + cur.slice(1)} em primeiro plano!`, 'info');
                
                const container = document.getElementById('month-chips-container');
                if (container) {
                    const activeChip = container.querySelector('.month-chip.active') || container.querySelector('.month-chip.is-current-month');
                    if (activeChip) activeChip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }
            }
        };
    }

    // Atalhos globais de teclado
    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveData(false);
        }
        if (e.key === 'Escape') {
            const auditModal = document.getElementById('audit-modal');
            const pdfModal = document.getElementById('pdf-preview-modal');
            if (auditModal && auditModal.classList.contains('show')) {
                auditModal.classList.remove('show');
                auditModal.setAttribute('aria-hidden', 'true');
            }
            if (pdfModal && pdfModal.classList.contains('show')) {
                pdfModal.classList.remove('show');
                pdfModal.setAttribute('aria-hidden', 'true');
                const iframe = document.getElementById('pdf-preview-iframe');
                if (iframe) iframe.src = '';
            }
        }
    });

    init();
});