/**
 * Cria o HTML para um único card de semana.
 * @param {object} weekData - O objeto de dados para uma semana.
 * @returns {HTMLElement} O elemento <section> do card da semana.
 */
function createWeekCard(weekData) {
    const section = document.createElement('section');
    section.className = 'button-column';
    section.id = weekData.weekId;

    const startDateDisplay = weekData.title.match(/\d{2}\/\d{2}/g)[0];
    const endDateDisplay = weekData.title.match(/\d{2}\/\d{2}/g)[1];

    section.innerHTML = `
        <h2 class="column-title">${weekData.title.replace(startDateDisplay, `<time datetime="${weekData.startDate}">${startDateDisplay}</time>`).replace(endDateDisplay, `<time datetime="${weekData.endDate}">${endDateDisplay}</time>`)}</h2>
        <a href="#" target="_blank" rel="noopener noreferrer" class="button creche-m-verde" aria-label="Cardápio da Creche Municipal Verde" title="Ver cardápio da Creche Municipal Verde">CRECHE M.VERDE</a>
        <a href="#" target="_blank" rel="noopener noreferrer" class="button creches" aria-label="Cardápio das demais Creches" title="Ver cardápio das demais Creches">CRECHES</a>
        <a href="#" target="_blank" rel="noopener noreferrer" class="button fundamental-braga" title="Ver cardápio das escolas: Braga, Caic, Célia, Alzira, Padre" aria-label="Cardápio das escolas Braga, Caic, Célia, Alzira, Padre">BRAGA, CAIC, CÉLIA, ALZIRA, PADRE</a>
        <a href="#" target="_blank" rel="noopener noreferrer" class="button fundamental-anna" title="Ver cardápio das escolas: Anna, Anselmo, Maria Aparecida, Faggioni, Braguetto" aria-label="Cardápio das escolas Anna, Anselmo, M. Ap., Faggioni, Braguetto">ANNA, ANSELMO, M.AP., FAGGIONI, BRAGUETTO</a>
        <a href="#" target="_blank" rel="noopener noreferrer" class="button fundamental-aaugusto" title="Ver cardápio das escolas: A. Augusto, Portinari, Maria Virgínia" aria-label="Cardápio das escolas A. Augusto, Portinari, M. Virgínia">A.AUGUSTO, PORTINARI, M.VIRGÍNIA</a>
        <a href="#" target="_blank" rel="noopener noreferrer" class="button fundamental-esther" title="Ver cardápio da Escola Fundamental Esther Vianna" aria-label="Cardápio da Escola Fundamental Esther Vianna">ESTHER VIANNA</a>
        <a href="#" target="_blank" rel="noopener noreferrer" class="button fundamental-gtl" title="Ver cardápio das escolas: GTL, EESA, Castelo, Washington" aria-label="Cardápio das escolas GTL, EESA, Castelo, Washington">GTL, EESA, CASTELO, WASHINGTON</a>
        <a href="#" target="_blank" rel="noopener noreferrer" class="button etec" aria-label="Cardápio da ETEC" title="Ver cardápio da ETEC">ETEC</a>
    `;

    const buttons = section.querySelectorAll('.button');
    buttons.forEach(button => {
        const buttonTypeClass = Array.from(button.classList).find(cls => weekData.links[cls] !== undefined);
        const link = buttonTypeClass ? weekData.links[buttonTypeClass] : '';

        if (link && link !== '#') {
            button.href = link;
        } else {
            button.classList.add('disabled');
        }
    });

    return section;
}

/**
 * Constrói a visualização anual do menu a partir dos dados.
 * @param {object} menuData - Os dados completos do menu do arquivo JSON.
 */
function buildAnnualMenu(menuData) {
    const mainContainer = document.querySelector('.main-container .columns-container');
    if (!mainContainer) return;

    mainContainer.innerHTML = ''; // Limpa o conteúdo estático

    const today = new Date(new Date().setUTCHours(0, 0, 0, 0));
    const currentYear = today.getFullYear().toString();
    const yearData = menuData[currentYear];
    const currentMonthIndex = today.getUTCMonth();

    // Mapeamento para ordenar e filtrar os meses (0 = Janeiro, 11 = Dezembro)
    const monthOrder = {
        "janeiro": 0, "fevereiro": 1, "março": 2, "abril": 3, "maio": 4, "junho": 5,
        "julho": 6, "agosto": 7, "setembro": 8, "outubro": 9, "novembro": 10, "dezembro": 11
    };

    let totalActiveWeeks = 0;

    if (yearData) {
        // Ordena os meses cronologicamente antes de iterar
        const sortedMonths = Object.keys(yearData).sort((a, b) => {
            return (monthOrder[a.toLowerCase()] || 0) - (monthOrder[b.toLowerCase()] || 0);
        });

        for (const monthName of sortedMonths) {
            const monthIndex = monthOrder[monthName.toLowerCase()];

            // Filtra: Começa em Fevereiro (1) E esconde meses que já passaram
            // Se estivermos em Março (2), esconde Fev (1). Se estivermos em Jan (0), esconde Jan mas mostra Fev.
            if (monthIndex < 1 || monthIndex < currentMonthIndex) continue;

            const monthData = yearData[monthName];
            const monthWrapper = document.createElement('div');
            monthWrapper.className = 'month-wrapper';

            const monthTitle = document.createElement('h2');
            monthTitle.className = 'month-title';
            monthTitle.textContent = monthName;
            monthWrapper.appendChild(monthTitle);

            const weeksContainer = document.createElement('div');
            weeksContainer.className = 'columns-container';

            let weeksInMonth = 0;
            monthData.forEach(weekData => {
                if (weekData.active === false) return;

                weeksInMonth++;
                totalActiveWeeks++;

                const weekCard = createWeekCard(weekData);
                const startDate = new Date(`${weekData.startDate}T00:00:00Z`);
                const endDate = new Date(`${weekData.endDate}T23:59:59Z`);

                if (today >= startDate && today <= endDate) {
                    weekCard.classList.add('current-week');
                    weekCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else if (today > endDate) {
                    weekCard.classList.add('past-week');
                }
                weeksContainer.appendChild(weekCard);
            });

            if (weeksInMonth > 0) {
                monthWrapper.appendChild(weeksContainer);
                mainContainer.appendChild(monthWrapper);
            }
        }
    }

    if (totalActiveWeeks === 0) {
        const messageBox = document.getElementById('no-weeks-message');
        if (messageBox) messageBox.style.display = 'block';
    }

    // Inicializa animações para os cards recém-adicionados
    const observerOptions = { root: null, rootMargin: '0px', threshold: 0.1 };
    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
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
            if (document.body.scrollTop > 200 || document.documentElement.scrollTop > 200) {
                backToTopButton.classList.add("show");
            } else {
                backToTopButton.classList.remove("show");
            }
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
}

/**
 * Carrega os links dos cardápios do arquivo JSON e inicializa a aplicação.
 */
async function loadMenuData() {
    initializeStaticFeatures();
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
    }
}

document.addEventListener('DOMContentLoaded', loadMenuData);
