const CACHE_NAME = 'cardapio-batatais-v1.0.2';
const ASSETS = [
  '/',
  'index.html',
  'style.css',
  'script.js',
  'menu-links.json',
  'assets/success.mp3',
  'assets/no-results.svg',
  'assets/no-data.svg'
];

// Instalação: Salva os arquivos estáticos no cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Ativação: Limpa caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
});

// Estratégia: Tenta rede, se falhar ou estiver offline, usa o cache
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Estratégia Network First para o arquivo de dados (JSON)
  if (url.pathname.endsWith('menu-links.json')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch((error) => {
          console.warn('[SW] Falha na rede para o JSON, tentando cache...', error);
          return caches.match(event.request);
        })
    );
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request).then((response) => {
        if (response) return response;
        // Se for uma navegação e não tiver no cache, retorna a index
        if (event.request.mode === 'navigate') return caches.match('index.html');
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