/**
 * Configurações e Constantes Globais
 */
const MONTH_ORDER = {
    "janeiro": 0, "fevereiro": 1, "março": 2, "abril": 3, "maio": 4, "junho": 5,
    "julho": 6, "agosto": 7, "setembro": 8, "outubro": 9, "novembro": 10, "dezembro": 11
};

/**
 * Versão da Aplicação (SemVer)
 */
const APP_VERSION = '1.0.2';

let monthSelector;
let monthScrollLeftBtn;
let monthScrollRightBtn;

const ERROR_LOG_KEY = 'app_error_logs'; // Chave para armazenar logs no localStorage
/**
 * Envia logs de erro para um serviço externo para monitoramento em produção.
 * @param {Error} error - O objeto de erro.
 * @param {object} context - Informações adicionais sobre onde o erro ocorreu.
 */
async function reportError(error, context = {}) {
    const errorLog = {
        version: APP_VERSION,
        message: error.message,
        stack: error.stack,
        context: context,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
    };

    // Para desenvolvimento, mantemos o log no console
    console.error('[Error Monitor]:', errorLog);

    // Armazena o log no localStorage
    const existingLogs = JSON.parse(localStorage.getItem(ERROR_LOG_KEY) || '[]');
    existingLogs.push(errorLog);
    // Limita o número de logs para não sobrecarregar o localStorage (ex: últimos 50 erros)
    localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(existingLogs.slice(-50)));

    // Exemplo de integração com serviço externo:
    // await fetch('https://sua-api-de-logs.com/v1/report', { method: 'POST', body: JSON.stringify(errorLog) });
}

/**
 * Valida se uma string é uma URL bem-formada.
 * @param {string} string - A string a ser validada.
 * @returns {boolean} - True se a URL for válida, false caso contrário.
 */
function isValidUrl(string) {
    if (!string || string === '#') return false;
    try {
        new URL(string);
        return true;
    } catch (_) {
        console.warn(`URL inválida detectada e ignorada: ${string}`);
        return false;
    }
}

/**
 * Cria o HTML para um único card de semana.
 * @param {object} weekData - O objeto de dados para uma semana.
 * @param {boolean} isCurrent - Se esta é a semana atual.
 * @returns {HTMLElement} O elemento <section> do card da semana.
 */
function createWeekCard(weekData, isCurrent = false) {
    const template = document.getElementById('week-card-template');
    const section = template.content.cloneNode(true).firstElementChild;
    section.id = weekData.weekId;

    const titleElement = section.querySelector('.column-title');
    const datesMatch = weekData.title.match(/(\d{2}\/\d{2})\s*a\s*(\d{2}\/\d{2})/);

    if (datesMatch) {
        const startDateDisplay = datesMatch[1];
        const endDateDisplay = datesMatch[2];
        const weekName = weekData.title.split('-')[0].trim();

        titleElement.innerHTML = `
            <div class="week-title-wrapper">
                <span class="week-name">${weekName}</span>
                <span class="week-dates-badge">📅 <time datetime="${weekData.startDate}">${startDateDisplay}</time> a <time datetime="${weekData.endDate}">${endDateDisplay}</time></span>
            </div>
        `;
    } else {
        titleElement.textContent = weekData.title;
    }

    if (isCurrent) {
        const badge = document.createElement('div');
        badge.className = 'week-badge';
        badge.textContent = 'ATUAL';
        section.appendChild(badge);
    }

    const buttons = section.querySelectorAll('.button');
    buttons.forEach(button => {
        const linkKey = button.dataset.linkKey;
        const link = linkKey ? weekData.links[linkKey] : null;

        if (isValidUrl(link)) {
            button.href = link;
            button.addEventListener('click', (e) => {
                // Permite abrir em nova aba se Ctrl/Cmd for pressionado
                if (e.ctrlKey || e.metaKey || e.button === 1) return;
                e.preventDefault();
                openPublicDocumentReader(link, button.textContent.trim(), weekData.title);
            });
        } else {
            button.classList.add('disabled');
        }
    });

    const shareBtn = section.querySelector('.share-button');
    if (shareBtn) {
        shareBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const weekTitle = weekData.title;
            const shareUrl = `${window.location.origin}${window.location.pathname}#${weekData.weekId}`;
            const message = `Confira o cardápio da Secretaria da Educação de Batatais para a ${weekTitle}:\n\n${shareUrl}`;

            if (navigator.share) {
                navigator.share({
                    title: `Cardápio Batatais - ${weekTitle}`,
                    text: message,
                    url: shareUrl
                }).catch(() => {});
            } else {
                const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
                window.open(whatsappUrl, '_blank');
            }
        });
    }

    const waBtn = section.querySelector('.whatsapp-button');
    if (waBtn) {
        waBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const weekTitle = weekData.title;
            const shareUrl = `${window.location.origin}${window.location.pathname}#${weekData.weekId}`;
            const message = `🍴 *Cardápio Escolar 2026 - Batatais (SP)*\n\n🗓️ *${weekTitle}*\nConfira a alimentação escolar preparada para esta semana:\n🔗 ${shareUrl}`;
            const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
            window.open(whatsappUrl, '_blank');
        });
    }

    const speechBtn = section.querySelector('.speech-button');
    if (speechBtn) {
        speechBtn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleSpeechForCard(section, weekData.title, speechBtn);
        });
    }

    return section;
}

let activeSpeechBtn = null;

/**
 * Lê o conteúdo do card de semana em voz alta usando a Web Speech API.
 */
function toggleSpeechForCard(cardSection, weekTitle, btn) {
    if (!('speechSynthesis' in window)) {
        alert('Leitura de voz não é suportada por este navegador.');
        return;
    }

    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        if (activeSpeechBtn) {
            activeSpeechBtn.textContent = '🔊';
            activeSpeechBtn.title = 'Ouvir cardápio em voz alta';
        }
        if (activeSpeechBtn === btn) {
            activeSpeechBtn = null;
            return;
        }
    }

    // Extrai o texto formatado das escolas da semana
    const groups = Array.from(cardSection.querySelectorAll('.button-group'));
    let speechText = `Cardápio para a ${weekTitle}. `;
    groups.forEach(group => {
        const label = group.querySelector('.group-label')?.textContent || '';
        const buttons = Array.from(group.querySelectorAll('.button:not(.disabled)'));
        if (buttons.length > 0) {
            const schoolNames = buttons.map(b => b.textContent.trim()).join(', ');
            speechText += `${label}: ${schoolNames}. `;
        }
    });

    const etecBtn = cardSection.querySelector('.button.etec:not(.disabled)');
    if (etecBtn) {
        speechText += `Ensino Médio e ETEC: ${etecBtn.textContent.trim()}.`;
    }

    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.lang = 'pt-BR';
    utterance.rate = 0.95;

    utterance.onstart = () => {
        btn.textContent = '⏹️';
        btn.title = 'Parar leitura de voz';
        activeSpeechBtn = btn;
    };

    utterance.onend = utterance.onerror = () => {
        btn.textContent = '🔊';
        btn.title = 'Ouvir cardápio em voz alta';
        activeSpeechBtn = null;
    };

    window.speechSynthesis.speak(utterance);
}

/**
 * Abre o leitor público de documentos (PDF / Google Docs / Drive) em um modal incorporado.
 */
function openPublicDocumentReader(url, schoolName, weekTitle) {
    let previewUrl = url;
    if (url.includes('drive.google.com') || url.includes('docs.google.com')) {
        previewUrl = url.replace(/\/view.*/, '/preview').replace(/\/edit.*/, '/preview');
    }

    const modal = document.getElementById('public-pdf-modal');
    const titleEl = document.getElementById('public-pdf-title');
    const subtitleEl = document.getElementById('public-pdf-subtitle');
    const externalLink = document.getElementById('public-pdf-external');
    const shareBtn = document.getElementById('public-pdf-share');
    const iframe = document.getElementById('public-pdf-iframe');

    if (modal && iframe) {
        if (titleEl) titleEl.textContent = schoolName;
        if (subtitleEl) subtitleEl.textContent = weekTitle;
        if (externalLink) externalLink.href = url;
        iframe.src = previewUrl;
        modal.classList.add('show');
        modal.setAttribute('aria-hidden', 'false');

        if (shareBtn) {
            shareBtn.onclick = (e) => {
                e.preventDefault();
                const shareText = `Confira o cardápio da ${schoolName} (${weekTitle}):\n\n${url}`;
                if (navigator.share) {
                    navigator.share({ title: `Cardápio ${schoolName}`, text: shareText, url: url }).catch(() => {});
                } else {
                    const waUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
                    window.open(waUrl, '_blank');
                }
            };
        }
    }
}

/**
 * Updates the visibility of month scroll indicators based on scroll position.
 */
function updateMonthScrollIndicators() {
    if (!monthSelector || !monthScrollLeftBtn || !monthScrollRightBtn) return;

    const { scrollWidth, clientWidth, scrollLeft } = monthSelector;
    const isScrollable = scrollWidth > clientWidth;

    monthScrollLeftBtn.style.display = (isScrollable && scrollLeft > 0) ? 'flex' : 'none';
    monthScrollRightBtn.style.display = (isScrollable && scrollLeft + clientWidth < scrollWidth) ? 'flex' : 'none';
}

/**
 * Scrolls the month selector horizontally.
 * @param {number} direction - -1 for left, 1 for right.
 */
function scrollMonthSelector(direction) {
    if (!monthSelector) return;
    const scrollAmount = monthSelector.clientWidth / 2; // Scroll half the visible width
    monthSelector.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
}

/**
 * Alterna a visibilidade para mostrar apenas o mês selecionado.
 * @param {string} monthName - Nome do mês a ser exibido.
 */
async function showMonth(monthName) {
    const monthId = `month-${monthName.toLowerCase()}`;
    const targetWrapper = document.getElementById(monthId);
    const currentWrapper = document.querySelector('.month-wrapper:not(.is-hidden)');

    if (currentWrapper === targetWrapper) return;

    document.querySelectorAll('.month-nav-btn').forEach(btn => {
        const isActive = btn.textContent.toLowerCase() === monthName.toLowerCase();
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-current', isActive ? 'page' : 'false');

        // Centraliza o botão do mês no seletor horizontal caso ele esteja fora da área visível
        if (isActive) {
            btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            updateMonthScrollIndicators(); // Atualiza os indicadores após o scroll
        }
    });

    // Fase 1: Fade out do mês atual (se houver um)
    if (currentWrapper) {
        currentWrapper.style.opacity = '0';
        currentWrapper.style.transform = 'translateY(-10px)';
        
        // Aguarda a transição de 0.4s definida no CSS
        await new Promise(resolve => setTimeout(resolve, 400));
        currentWrapper.classList.add('is-hidden');
        
        // Limpa estilos inline para não interferir no CSS base
        currentWrapper.style.opacity = '';
        currentWrapper.style.transform = '';
    }

    // Fase 2: Fade in do novo mês
    if (targetWrapper) {
        targetWrapper.style.opacity = '0';
        targetWrapper.style.transform = 'translateY(10px)';
        targetWrapper.classList.remove('is-hidden');

        // Força reflow para o navegador aplicar a transição após remover display:none
        targetWrapper.offsetHeight;

        targetWrapper.style.opacity = '1';
        targetWrapper.style.transform = 'translateY(0)';

        // Limpa estilos inline após a animação terminar
        setTimeout(() => {
            targetWrapper.style.opacity = '';
            targetWrapper.style.transform = '';
        }, 400);
    }
}

/**
 * Renderiza o seletor de meses no topo da página.
 * @param {object[]} months - Lista de objetos com nome e status { name, isSoon }.
 */
function renderMonthSelector(months) {
    const selector = document.getElementById('month-selector');
    if (!selector || months.length === 0) return;

    selector.innerHTML = '';
    months.forEach(monthObj => {
        const btn = document.createElement('button');
        btn.className = 'month-nav-btn';
        btn.textContent = monthObj.name;

        if (monthObj.isSoon) {
            const badge = document.createElement('span');
            badge.className = 'soon-badge';
            badge.textContent = 'Em Breve';
            btn.appendChild(badge);
        }

        btn.onclick = () => showMonth(monthObj.name);
        selector.appendChild(btn);
        updateMonthScrollIndicators(); // Atualiza os indicadores após renderizar os botões
    });
}

/**
 * Constrói a visualização anual do menu a partir dos dados.
 * @param {object} menuData - Os dados completos do menu do arquivo JSON.
 */
function buildAnnualMenu(menuData) {
    const mainContainer = document.getElementById('week-cards-container'); // Alterado para o novo ID
    if (!mainContainer) return;

    mainContainer.innerHTML = ''; // Limpa o conteúdo estático
    const fragment = document.createDocumentFragment();

    const today = new Date(new Date().setUTCHours(0, 0, 0, 0));
    const currentYear = today.getFullYear().toString();
    const yearData = menuData[currentYear];
    const currentMonthIndex = today.getUTCMonth();    
    const activeMonthsData = [];

    let totalActiveWeeks = 0;

    let currentActiveWeekData = null;

    if (yearData) {
        // Ordena os meses cronologicamente antes de iterar
        const sortedMonths = Object.keys(yearData).sort((a, b) => (MONTH_ORDER[a.toLowerCase()] || 0) - (MONTH_ORDER[b.toLowerCase()] || 0));

        for (const monthName of sortedMonths) {
            const monthIndex = MONTH_ORDER[monthName.toLowerCase()];

            const monthData = yearData[monthName];
            const monthWrapper = document.createElement('div');
            monthWrapper.className = 'month-wrapper is-hidden';
            monthWrapper.id = `month-${monthName.toLowerCase()}`;

            const weeksContainer = document.createElement('div');
            weeksContainer.className = 'columns-container';

            let weeksInMonth = 0;
            let isMonthReady = false;
            monthData.forEach(weekData => {
                if (weekData.active === false) return;

                weeksInMonth++;
                totalActiveWeeks++;

                const startDate = new Date(`${weekData.startDate}T00:00:00Z`);
                const endDate = new Date(`${weekData.endDate}T23:59:59Z`);
                const isCurrent = today >= startDate && today <= endDate;

                if (isCurrent) {
                    currentActiveWeekData = weekData;
                }

                // Verifica se esta semana possui ao menos um link real (diferente de #)
                const hasValidLink = Object.values(weekData.links).some(link => isValidUrl(link));
                if (hasValidLink) isMonthReady = true;

                const weekCard = createWeekCard(weekData, isCurrent);

                if (isCurrent) {
                    weekCard.classList.add('current-week');
                    weeksContainer.prepend(weekCard);
                } else {
                    if (today > endDate) {
                        weekCard.classList.add('past-week');
                    }
                    weeksContainer.appendChild(weekCard);
                }
            });

            if (weeksInMonth > 0) {
                // Aplica o efeito cascata baseado na ordem visual dos cards
                Array.from(weeksContainer.children).forEach((card, index) => {
                    card.style.setProperty('--stagger-delay', `${index * 0.1}s`);
                });

                monthWrapper.appendChild(weeksContainer);
                fragment.appendChild(monthWrapper);
                activeMonthsData.push({ name: monthName.toLowerCase(), isSoon: !isMonthReady });
            }
        }
    }

    // Configura o banner de destaque da semana atual
    const featuredBanner = document.getElementById('featured-week-banner');
    const featuredTitle = document.getElementById('featured-week-title');
    const featuredJumpBtn = document.getElementById('featured-jump-btn');

    if (currentActiveWeekData && featuredBanner && featuredTitle) {
        featuredBanner.style.display = 'flex';
        featuredTitle.textContent = currentActiveWeekData.title;

        if (featuredJumpBtn) {
            featuredJumpBtn.onclick = () => {
                const targetWeekCard = document.getElementById(currentActiveWeekData.weekId);
                if (targetWeekCard) {
                    targetWeekCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    targetWeekCard.classList.add('highlight-week');
                    setTimeout(() => targetWeekCard.classList.remove('highlight-week'), 1500);
                }
            };
        }
    } else if (featuredBanner) {
        featuredBanner.style.display = 'none';
    }

    renderMonthSelector(activeMonthsData);

    if (totalActiveWeeks === 0) {
        const messageBox = document.getElementById('no-weeks-message');
        if (messageBox) messageBox.style.display = 'block';
    }

    mainContainer.appendChild(fragment);

    // Adiciona uma pequena animação de entrada ao container principal
    mainContainer.style.opacity = '0';
    requestAnimationFrame(() => {
        mainContainer.style.transition = 'opacity 0.5s ease';
        mainContainer.style.opacity = '1';
    });

    // Define o mês inicial a ser exibido
    const currentMonthName = Object.keys(MONTH_ORDER).find(key => MONTH_ORDER[key] === currentMonthIndex);
    const hash = window.location.hash;
    let monthFromHash = null;

    // Se houver um hash, identifica a qual mês ele pertence
    if (hash) {
        const targetWeek = document.getElementById(hash.substring(1));
        if (targetWeek) {
            const parentMonth = targetWeek.closest('.month-wrapper');
            if (parentMonth) monthFromHash = parentMonth.id.replace('month-', '');
        }
    }
    
    // Prioridade: Mês do Hash > Mês Atual > Último Mês Ativo (Mês mais recente disponível)
    const activeMonthNames = activeMonthsData.map(m => m.name);
    const monthToShow = monthFromHash || (activeMonthNames.includes(currentMonthName) ? currentMonthName : activeMonthNames[activeMonthNames.length - 1]);

    if (monthToShow) {
        showMonth(monthToShow).then(() => {
            if (hash) {
                const targetWeek = document.getElementById(hash.substring(1));
                if (targetWeek) {
                    // Pequeno atraso para aguardar o fade-in do mês (0.4s) e do card
                    setTimeout(() => {
                        targetWeek.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 450);
                }
            }
        });
    }

    const searchInput = document.getElementById('school-search');
    const clearBtn = document.getElementById('clear-search');
    const noResultsMsg = document.getElementById('search-no-results');

    // Otimização para dispositivos móveis: Pré-cache de elementos e strings de busca
    const cards = Array.from(mainContainer.querySelectorAll('.button-column'));
    const searchCache = cards.map(card => ({
        card,
        groups: Array.from(card.querySelectorAll('.button-group')).map(group => ({
            group,
            buttons: Array.from(group.querySelectorAll('.button')).map(btn => ({
                btn,
                searchText: (btn.textContent + ' ' + (btn.getAttribute('aria-label') || '')).toLowerCase()
            }))
        }))
    }));

    let searchTimeout;
    if (searchInput) {
        const skeleton = document.getElementById('loading-skeleton');

        searchInput.addEventListener('input', (e) => {
            const start = searchInput.selectionStart;
            const end = searchInput.selectionEnd;
            searchInput.value = searchInput.value.toUpperCase();
            if (start !== null && end !== null) {
                searchInput.setSelectionRange(start, end);
            }

            clearTimeout(searchTimeout);
            const term = e.target.value.toLowerCase().trim();

            // Feedback visual imediato: exibe o skeleton e oculta os cards atuais enquanto processa
            if (skeleton && mainContainer) {
                skeleton.style.display = 'grid';
                mainContainer.style.display = 'none';
                if (noResultsMsg) noResultsMsg.style.display = 'none';
            }

            searchTimeout = setTimeout(() => {
                if (clearBtn) clearBtn.style.display = term ? 'block' : 'none';

                requestAnimationFrame(() => {
                    let globalMatch = false;
                    searchCache.forEach(data => {
                        let cardMatch = false;
                        data.groups.forEach(gData => {
                            let groupMatch = false;
                            gData.buttons.forEach(bData => {
                                const isMatch = !term || bData.searchText.includes(term);
                                bData.btn.classList.toggle('filtered-out', !isMatch);
                                if (isMatch) groupMatch = true;
                            });
                            gData.group.classList.toggle('empty-group', !groupMatch);
                            if (groupMatch) cardMatch = true;
                        });
                        data.card.style.display = cardMatch ? 'flex' : 'none';
                        if (cardMatch) globalMatch = true;
                    });

                    // Finaliza o feedback visual: oculta skeleton e restaura container (se houver resultados)
                    if (skeleton && mainContainer) {
                        skeleton.style.display = 'none';
                        mainContainer.style.display = (globalMatch || term === '') ? 'grid' : 'none';
                    }

                    if (noResultsMsg) noResultsMsg.style.display = (!globalMatch && term !== '') ? 'block' : 'none';
                });
            }, 300);
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                searchInput.value = '';
                searchInput.dispatchEvent(new Event('input'));
                searchInput.focus();
            });
        }
    }

    // Inicializa animações para os cards recém-adicionados
    const observerOptions = { root: null, rootMargin: '0px', threshold: 0.1 };
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            } else {
                // Remove a classe quando o elemento sai de vista (ou o mês é ocultado)
                // Isso permite que a animação ocorra novamente ao reexibir o mês.
                entry.target.classList.remove('visible');
            }
        });
    }, observerOptions);
    document.querySelectorAll('.button-column').forEach(column => observer.observe(column));
}

/**
 * Inicializa funcionalidades estáticas da página.
 */
function initializeStaticFeatures() {
    const backToTopButton = document.getElementById("back-to-top");
    if (backToTopButton) {
        const scrollFunction = () => {
            const shouldShow = document.body.scrollTop > 200 || document.documentElement.scrollTop > 200;
            backToTopButton.classList.toggle("show", shouldShow);
        };
        window.addEventListener("scroll", scrollFunction, { passive: true });
        backToTopButton.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

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
    const loadTheme = () => {
        const savedTheme = localStorage.getItem('theme');
        const themeToApply = savedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        applyTheme(themeToApply);
    };

    if (themeToggleButton) themeToggleButton.addEventListener('click', toggleTheme);
    loadTheme();

    // Atualiza o ano no rodapé
    const yearElement = document.getElementById('current-year');
    if (yearElement) yearElement.textContent = new Date().getFullYear();

    // Atualiza a versão no rodapé
    const versionElement = document.getElementById('app-version');
    if (versionElement) versionElement.textContent = APP_VERSION;

    // Lógica do Modal de Changelog

    // Inicializa os botões de scroll do mês e seus listeners
    monthSelector = document.getElementById('month-selector');
    monthScrollLeftBtn = document.getElementById('month-scroll-left');
    monthScrollRightBtn = document.getElementById('month-scroll-right');

    if (monthSelector) {
        monthSelector.addEventListener('scroll', updateMonthScrollIndicators);
    }
    if (monthScrollLeftBtn) {
        monthScrollLeftBtn.addEventListener('click', () => scrollMonthSelector(-1));
    }
    if (monthScrollRightBtn) {
        monthScrollRightBtn.addEventListener('click', () => scrollMonthSelector(1));
    }
    window.addEventListener('resize', updateMonthScrollIndicators);
    // Chamada inicial para definir o estado correto (será chamado novamente após o carregamento dos dados do menu)
    updateMonthScrollIndicators();
    const versionBtn = document.getElementById('version-link');
    const modal = document.getElementById('changelog-modal');
    const closeBtn = document.getElementById('close-modal');
    const newBadge = document.getElementById('new-version-badge');

    // Verifica se o usuário já viu esta versão
    const lastSeenVersion = localStorage.getItem('app_version_seen');
    if (newBadge && lastSeenVersion !== APP_VERSION) {
        newBadge.style.display = 'inline-block';
    }

    if (versionBtn && modal) {
        const toggleModal = (show) => {
            modal.classList.toggle('show', show);
            modal.setAttribute('aria-hidden', !show);
            document.body.classList.toggle('no-scroll', show);

            // Se abrir o modal, marca a versão como vista e esconde a etiqueta
            if (show) {
                localStorage.setItem('app_version_seen', APP_VERSION);
                if (newBadge) newBadge.style.display = 'none';
            }
        };

        versionBtn.addEventListener('click', () => toggleModal(true));
        if (closeBtn) closeBtn.addEventListener('click', () => toggleModal(false));
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) toggleModal(false);
        });

        // Fecha com a tecla Esc para melhor acessibilidade
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('show')) toggleModal(false);
        });
    }
}

/**
 * Carrega os links dos cardápios do arquivo JSON e inicializa a aplicação.
 */
async function loadMenuData() {
    initializeStaticFeatures();
    const skeleton = document.getElementById('loading-skeleton');
    const spinner = document.getElementById('loading-spinner');

    if (spinner) {
        spinner.style.display = 'flex';
        spinner.offsetHeight; // Força o reflow para garantir que o fade-in ocorra
        spinner.classList.remove('fade-out');
    }

    document.body.classList.add('no-scroll');
    try {
        const response = await fetch('menu-links.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const menuData = await response.json();
        buildAnnualMenu(menuData);

        // Transição do Spinner para o Checkmark
        const spinnerIcon = spinner.querySelector('.spinner');
        const checkmarkWrapper = spinner.querySelector('.checkmark-wrapper');
        
        if (spinnerIcon && checkmarkWrapper) {
            spinnerIcon.style.display = 'none';
            checkmarkWrapper.style.display = 'flex';
            
            // Toca o som sincronizado com o checkmark
            const successSound = new Audio('assets/success.mp3');
            successSound.volume = 0.3;
            successSound.play().catch(() => console.log("Áudio bloqueado pelo navegador."));

            // Aguarda a animação do checkmark terminar antes do fade-out
            await new Promise(resolve => setTimeout(resolve, 1200));
        }
    } catch (error) {
        reportError(error, { action: 'loadMenuData', file: 'menu-links.json' });
        console.error("Não foi possível carregar os links dos cardápios:", error);
        const messageBox = document.getElementById('no-weeks-message');
        if (messageBox) messageBox.style.display = 'block';
    } finally {
        if (skeleton) skeleton.style.display = 'none';
        if (spinner) {
            spinner.classList.add('fade-out');
            // Aguarda o tempo da transição (0.4s) antes de aplicar display: none
            await new Promise(resolve => setTimeout(resolve, 400));
            if (spinner.classList.contains('fade-out')) {
                spinner.style.display = 'none';
            }
        }
        document.body.classList.remove('no-scroll');
    }
}

// Lógica para o Botão de Instalação Customizado (PWA)
let deferredPrompt;
const installBtn = document.getElementById('install-button');

window.addEventListener('beforeinstallprompt', (e) => {
    // Previne o mini-infobar padrão do Chrome
    e.preventDefault();
    // Guarda o evento para ser disparado depois
    deferredPrompt = e;
    // Mostra o nosso botão customizado
    if (installBtn) installBtn.style.display = 'flex';
});

if (installBtn) {
    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        // Mostra o prompt de instalação nativo
        deferredPrompt.prompt();
        // Aguarda a resposta do usuário
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`Usuário respondeu à instalação: ${outcome}`);
        // Limpa o prompt, ele só pode ser usado uma vez
        deferredPrompt = null;
        // Esconde o botão após a interação
        installBtn.style.display = 'none';
    });
}

window.addEventListener('appinstalled', () => {
    // Esconde o botão se o app já foi instalado com sucesso
    if (installBtn) installBtn.style.display = 'none';
    console.log('PWA instalado com sucesso!');
});

/**
 * Converte a chave VAPID pública de base64 para Uint8Array
 */
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

/**
 * Configura as notificações Push
 */
async function setupPushNotifications(registration) {
    try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        // Esta chave deve ser a 'publicKey' gerada no seu servidor Node.js
        const vapidPublicKey = 'BPoKCZuBpJ-g5oLho2InYbeTD0zFCajVglfB0xVyvMVMGRsnHfWOx-EmkEqVpQuMn04F9CvDvICLD5Zn5YcbfzI'; // <--- Substitua esta linha
        const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedVapidKey
        });

        // Envia a inscrição para o seu servidor para que ele saiba para quem mandar mensagens
        await fetch('/api/subscribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ subscription })
        });

    } catch (err) {
        console.error('Erro ao inscrever para notificações push:', err);
    }
}

function initPublicPdfModalEvents() {
    const closeBtn = document.getElementById('close-public-pdf-modal');
    const modal = document.getElementById('public-pdf-modal');
    const iframe = document.getElementById('public-pdf-iframe');

    if (closeBtn && modal) {
        closeBtn.onclick = () => {
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
            if (iframe) iframe.src = '';
        };
    }

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && modal.classList.contains('show')) {
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
            if (iframe) iframe.src = '';
        }
    });
}

function initPushNotifyButton() {
    const pushBtn = document.getElementById('push-notify-btn');
    if (!pushBtn) return;

    if ('Notification' in window && Notification.permission === 'granted') {
        pushBtn.textContent = '🔔 Notificações Ativas';
        pushBtn.classList.add('subscribed');
    }

    pushBtn.onclick = async () => {
        if (!('Notification' in window)) {
            alert('Notificações não são suportadas pelo seu navegador.');
            return;
        }

        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                pushBtn.textContent = '🔔 Notificações Ativas';
                pushBtn.classList.add('subscribed');
                if ('serviceWorker' in navigator) {
                    const reg = await navigator.serviceWorker.ready;
                    setupPushNotifications(reg);
                }
            } else {
                alert('Permissão para notificações foi recusada ou bloqueada nas configurações do navegador.');
            }
        } catch (err) {
            console.error('Erro ao solicitar permissão de notificação:', err);
        }
    };
}

// Registro do Service Worker para PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => {
                console.log('Service Worker registrado com sucesso:', reg.scope);
                setupPushNotifications(reg); // Inicia configuração de Push
            })
            .catch(err => console.error('Falha ao registrar Service Worker:', err));
    });
}

/**
 * Busca e exibe as informações de última atualização (data, hora e commit hash) no rodapé.
 */
async function loadGitHubCommitInfo() {
    const updateContainer = document.getElementById('github-update-info');
    const dateEl = document.getElementById('github-commit-date');
    const hashEl = document.getElementById('github-commit-hash');
    const linkEl = document.getElementById('github-commit-link');

    if (!updateContainer || !dateEl || !hashEl || !linkEl) return;

    let commitData = null;

    // 1. Tenta obter dados da rota do backend local (/api/github-commit)
    try {
        const res = await fetch('/api/github-commit');
        if (res.ok) {
            commitData = await res.json();
        }
    } catch (_) {}

    // 2. Fallback: Se a rota do backend falhar ou estiver estática, busca diretamente da API pública do GitHub
    if (!commitData || !commitData.hash) {
        try {
            const githubRes = await fetch('https://api.github.com/repos/educacao-tech/cardapio_2026/commits/main');
            if (githubRes.ok) {
                const data = await githubRes.json();
                commitData = {
                    hash: data.sha ? data.sha.substring(0, 7) : '',
                    fullHash: data.sha || '',
                    date: data.commit?.committer?.date || data.commit?.author?.date,
                    url: data.html_url || 'https://github.com/educacao-tech/cardapio_2026'
                };
            }
        } catch (err) {
            console.warn('Erro ao carregar informações de commit do GitHub:', err);
        }
    }

    if (commitData && commitData.date) {
        try {
            const dateObj = new Date(commitData.date);
            const formattedDate = dateObj.toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
            const formattedTime = dateObj.toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit'
            });

            dateEl.textContent = `${formattedDate} às ${formattedTime}`;
            hashEl.textContent = commitData.hash || 'Ver commit';
            if (commitData.url) {
                linkEl.href = commitData.url;
            }
            updateContainer.style.display = 'flex';
        } catch (e) {
            console.error('Erro ao formatar data do commit:', e);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadMenuData();
    initPublicPdfModalEvents();
    initPushNotifyButton();
    loadGitHubCommitInfo();

    const printBtn = document.getElementById('print-page-btn');
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            window.print();
        });
    }
});
