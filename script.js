/**
 * Configurações e Constantes Globais
 */
const MONTH_ORDER = {
    "janeiro": 0, "fevereiro": 1, "março": 2, "abril": 3, "maio": 4, "junho": 5,
    "julho": 6, "agosto": 7, "setembro": 8, "outubro": 9, "novembro": 10, "dezembro": 11
};

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
    const startDateDisplay = weekData.title.match(/\d{2}\/\d{2}/g)[0];
    const endDateDisplay = weekData.title.match(/\d{2}\/\d{2}/g)[1];

    titleElement.innerHTML = weekData.title
        .replace(startDateDisplay, `<time datetime="${weekData.startDate}">${startDateDisplay}</time>`)
        .replace(endDateDisplay, `<time datetime="${weekData.endDate}">${endDateDisplay}</time>`);

    if (isCurrent) {
        const badge = document.createElement('div');
        badge.className = 'week-badge';
        badge.textContent = 'ATUAL';
        section.appendChild(badge);
    }

    const buttons = section.querySelectorAll('.button');
    buttons.forEach(button => {
        const linkKey = button.dataset.linkKey; // linkKey pode ser undefined se o atributo não existir
        const link = linkKey ? weekData.links[linkKey] : null;

        if (isValidUrl(link)) {
            button.href = link;
        } else {
            button.classList.add('disabled');
        }
    });

    return section;
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
 * @param {string[]} months - Lista de nomes de meses ativos.
 */
function renderMonthSelector(months) {
    const selector = document.getElementById('month-selector');
    if (!selector || months.length === 0) return;

    selector.innerHTML = '';
    months.forEach(month => {
        const btn = document.createElement('button');
        btn.className = 'month-nav-btn';
        btn.textContent = month;
        btn.onclick = () => showMonth(month);
        selector.appendChild(btn);
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
    const activeMonthNames = [];

    let totalActiveWeeks = 0;

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
            monthData.forEach(weekData => {
                if (weekData.active === false) return;

                weeksInMonth++;
                totalActiveWeeks++;

                const startDate = new Date(`${weekData.startDate}T00:00:00Z`);
                const endDate = new Date(`${weekData.endDate}T23:59:59Z`);
                const isCurrent = today >= startDate && today <= endDate;

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
                activeMonthNames.push(monthName.toLowerCase());
            }
        }
    }

    renderMonthSelector(activeMonthNames);

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
    
    // Se o mês atual tiver dados, mostra ele; caso contrário, mostra o primeiro mês disponível
    let monthToShow = null;
    if (activeMonthNames.length > 0) {
        monthToShow = activeMonthNames.includes(currentMonthName) 
            ? currentMonthName 
            : activeMonthNames[0];
    }

    if (monthToShow) showMonth(monthToShow);

    // Implementação da Busca/Filtro
    const searchInput = document.getElementById('school-search');
    const clearBtn = document.getElementById('clear-search');
    const noResultsMsg = document.getElementById('search-no-results');

    let searchTimeout;
    const debounceDelay = 300; // ms

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                const term = e.target.value.toLowerCase();
                const allButtons = document.querySelectorAll('.button-column .button');
                let hasVisibleCards = false;

                if (clearBtn) clearBtn.style.display = term ? 'block' : 'none';
                
                allButtons.forEach(btn => {
                    const text = btn.textContent.toLowerCase();
                    const label = btn.getAttribute('aria-label')?.toLowerCase() || '';
                    const isMatch = text.includes(term) || label.includes(term);
                    btn.classList.toggle('filtered-out', !isMatch);
                });

                // Esconde grupos vazios
                document.querySelectorAll('.button-group').forEach(group => {
                    const hasVisibleButtons = Array.from(group.querySelectorAll('.button'))
                        .some(btn => !btn.classList.contains('filtered-out'));
                    group.classList.toggle('empty-group', !hasVisibleButtons);
                });

                // Garante que o card seja visível apenas se tiver algum botão correspondente
                document.querySelectorAll('.button-column').forEach(card => {
                    const isVisible = card.querySelectorAll('.button:not(.filtered-out)').length > 0;
                    card.style.display = isVisible ? 'flex' : 'none';
                    if (isVisible) hasVisibleCards = true;
                });

                if (noResultsMsg) noResultsMsg.style.display = (!hasVisibleCards && term !== '') ? 'block' : 'none';
            }, debounceDelay);
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
    } catch (error) {
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

document.addEventListener('DOMContentLoaded', loadMenuData);
