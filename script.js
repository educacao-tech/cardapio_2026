/**
 * Função principal que inicializa todas as funcionalidades da página.
 * @param {object} menuLinks - O objeto contendo os links dos cardápios.
 */
function initializeApp(menuLinks) {
    // Cria a data de hoje em UTC para evitar problemas com fuso horário
    const today = new Date(new Date().setUTCHours(0, 0, 0, 0));
    today.setHours(0, 0, 0, 0);

    // Seleciona todas as seções de semana
    const weekSections = document.querySelectorAll('.button-column');
    const container = document.querySelector('.columns-container');

    let activeWeeksFound = false;

    weekSections.forEach(section => {
        const weekId = section.id;
        const weekData = menuLinks[weekId];

        // Se a semana não existir no JSON ou estiver marcada como inativa, remove a seção da página.
        // A verificação `weekData.active !== false` trata `undefined` (se a propriedade não existir) como ativo.
        if (!weekData || weekData.active === false) {
            section.remove();
            return; // Pula para a próxima iteração do loop.
        }

        activeWeeksFound = true;

        // Se a semana é válida, continua com a lógica para adicionar links e destacar a semana.
        const buttons = section.querySelectorAll('.button');
        buttons.forEach(button => {
            // Encontra a classe que corresponde à chave no objeto de links (ex: 'creche-m-verde')
            const buttonTypeClass = Array.from(button.classList).find(cls => weekData[cls] !== undefined);
            const link = buttonTypeClass ? weekData[buttonTypeClass] : '';

            if (link) {
                button.href = link;
            } else {
                button.classList.add('disabled');
            }
        });

        const timeTags = section.querySelectorAll('time');
        // Garante que temos as duas tags de data (início e fim)
        if (timeTags.length < 2) return;

        const startDateAttr = timeTags[0].getAttribute('datetime');
        const endDateAttr = timeTags[1].getAttribute('datetime');

        if (!startDateAttr || !endDateAttr) return;

        // Converte as strings de data (YYYY-MM-DD) para objetos Date em UTC
        const startDate = new Date(`${startDateAttr}T00:00:00Z`);
        const endDate = new Date(`${endDateAttr}T23:59:59Z`); // Considera o dia todo

        // Compara as datas e adiciona as classes CSS
        if (today >= startDate && today <= endDate) {
            section.classList.add('current-week');
            // Move a coluna da semana atual para ser a primeira
            if (container) {
                container.prepend(section);
            }
            // Faz a página rolar suavemente para a semana atual
            section.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        } else if (today > endDate) {
            section.classList.add('past-week');
        }
    });

    // Se, após o loop, nenhuma semana ativa foi encontrada, exibe a mensagem.
    if (!activeWeeksFound) {
        const messageBox = document.getElementById('no-weeks-message');
        if (messageBox) messageBox.style.display = 'block';
    }

    // --- Lógica para o botão "Voltar ao Topo" ---
    const backToTopButton = document.getElementById("back-to-top");

    if (backToTopButton) {
        // Mostra o botão quando o usuário rola 200px para baixo
        const scrollFunction = () => {
            if (document.body.scrollTop > 200 || document.documentElement.scrollTop > 200) {
                backToTopButton.classList.add("show");
            } else {
                backToTopButton.classList.remove("show");
            }
        };

        window.addEventListener("scroll", scrollFunction, { passive: true });

        // Rola para o topo quando o botão é clicado
        backToTopButton.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // --- Lógica para o Seletor de Tema ---
    const themeToggleButton = document.getElementById('theme-toggle');
    const docElement = document.documentElement; // O elemento <html>

    // Função para aplicar o tema e atualizar o ícone do botão
    const applyTheme = (theme) => {
        if (theme === 'dark') {
            docElement.classList.add('dark-mode');
            if (themeToggleButton) themeToggleButton.textContent = '☀️'; // Sol
        } else {
            docElement.classList.remove('dark-mode');
            if (themeToggleButton) themeToggleButton.textContent = '🌙'; // Lua
        }
    };

    // Função para alternar o tema quando o botão é clicado
    const toggleTheme = () => {
        const currentTheme = docElement.classList.contains('dark-mode') ? 'light' : 'dark';
        localStorage.setItem('theme', currentTheme); // Salva a preferência
        applyTheme(currentTheme);
    };

    // Lógica para carregar o tema na inicialização da página
    const loadTheme = () => {
        const savedTheme = localStorage.getItem('theme');
        // Define o tema a ser usado: o salvo, ou a preferência do sistema, ou 'light' como padrão.
        const themeToApply = savedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

        if (themeToApply) {
            applyTheme(themeToApply);
        }
    };

    // Adiciona o evento de clique ao botão
    if (themeToggleButton) {
        themeToggleButton.addEventListener('click', toggleTheme);
    }

    // Carrega o tema assim que o DOM estiver pronto
    loadTheme();

    // --- Lógica para Animação de Entrada das Colunas ---
    const observerOptions = {
        root: null, // Observa em relação ao viewport
        rootMargin: '0px',
        threshold: 0.1 // Ativa quando 10% do item estiver visível
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target); // Para a observação após a animação
            }
        });
    }, observerOptions);

    // Observa cada coluna de cardápio
    document.querySelectorAll('.button-column').forEach(column => observer.observe(column));
}

/**
 * Carrega os links dos cardápios do arquivo JSON e inicializa a aplicação.
 */
async function loadMenuData() {
    try {
        const response = await fetch('menu-links.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const menuLinks = await response.json();
        initializeApp(menuLinks);
    } catch (error) {
        console.error("Não foi possível carregar os links dos cardápios:", error);
    }
}

document.addEventListener('DOMContentLoaded', loadMenuData);
