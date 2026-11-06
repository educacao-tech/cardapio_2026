const CACHE_NAME = 'cardapio-batatais-v1.1.0';

// Apenas arquivos públicos essenciais existentes no repositório
const ESSENTIAL_ASSETS = [
  './',
  'index.html',
  'style.css',
  'script.js',
  'manifest.json',
  'menu-links.json'
];

// Instalação resiliente: Salva os arquivos estáticos no cache sem quebrar por 404
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of ESSENTIAL_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn(`[SW] Aviso: Asset não encontrado durante cache: ${asset}`, err.message);
        }
      }
    })
  );
});

// Ativação: Limpa caches antigos e assume controle imediato
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Estratégia de Fetch: Tenta rede, se falhar ou estiver offline, usa o cache
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Não intercepta requisições de API interna nem páginas administrativas
  if (url.pathname.startsWith('/api/') || url.pathname.includes('admin')) {
    return;
  }

  // 2. Estratégia Network First para o arquivo de dados (JSON) do cardápio
  if (url.pathname.includes('menu-links.json')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch((error) => {
          console.warn('[SW] Falha na rede para o JSON, servindo cache offline...', error);
          return caches.match(event.request);
        })
    );
    return;
  }

  // 3. Estratégia Stale-While-Revalidate / Cache com fallback para os demais assets públicos
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request).then((response) => {
        if (response) return response;
        if (event.request.mode === 'navigate') {
          return caches.match('index.html');
        }
      });
    })
  );
});

// Ouvinte para mensagens Push
self.addEventListener('push', (event) => {
  let data = { title: 'Novo Cardápio!', body: 'O cardápio do novo mês já está disponível.' };

  if (event.data) {
    data = event.data.json();
  }

  const options = {
    body: data.body,
    icon: '/assets/icon-192.png',
    badge: '/assets/icon-192.png',
    data: { url: '/' } // URL para abrir ao clicar
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Lógica ao clicar na notificação
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});