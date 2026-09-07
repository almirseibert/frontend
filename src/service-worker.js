/* eslint-disable no-restricted-globals */
// =============================================================================
// Service Worker — Evidências de Campo, Fase 1 (§3.2)
// =============================================================================
// Estilo InjectManifest: o react-scripts 5 só compila este arquivo (via
// workbox-webpack-plugin, que ele já traz) quando ele existe em src/. O
// `self.__WB_MANIFEST` é substituído no build pela lista de TODOS os assets do
// bundle — JS/CSS/index.html/fontes/favicon E os chunks lazy, inclusive o do
// operador. Sem precachear o chunk lazy, o reload offline cairia num spinner
// eterno.
//
// Princípios travados no plano:
//  - NUNCA cachear /api/auth/** nem qualquer não-GET (login cacheado = falha de
//    segurança). Conseguimos isso NÃO registrando rota de cache para eles: sem
//    rota, o fetch vai direto à rede.
//  - skipWaiting só por MENSAGEM, nunca automático — trocar o bundle sob um
//    formulário de captura pela metade perde a foto.
// =============================================================================

import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

// ---- Precache de todo o build (inclui os chunks lazy) -----------------------
precacheAndRoute(self.__WB_MANIFEST || []);

// ---- Navegação (SPA): serve o index.html do precache -------------------------
// Espelha o try_files do nginx. Fica de fora tudo que começa com /api e os
// arquivos com extensão (deixa o precache/rede cuidar deles).
const handlerIndex = createHandlerBoundToURL(process.env.PUBLIC_URL + '/index.html');
const navRoute = new NavigationRoute(handlerIndex, {
    denylist: [
        /^\/api\//,          // chamadas de API nunca caem no index.html
        /\/[^/?]+\.[^/]+$/,  // arquivos com extensão (foo.js, foo.png…)
    ],
});
registerRoute(navRoute);

// ---- Pacote de escopo do operador: NetworkFirst (3s, 24h) -------------------
// Endpoint só passa a existir na Fase 2; registrar a rota agora é inócuo.
registerRoute(
    ({ url, request }) => request.method === 'GET' && url.pathname.endsWith('/api/evidencias/meu-escopo'),
    new NetworkFirst({
        cacheName: 'evid-escopo',
        networkTimeoutSeconds: 3,
        plugins: [
            new CacheableResponsePlugin({ statuses: [0, 200] }),
            new ExpirationPlugin({ maxEntries: 8, maxAgeSeconds: 24 * 60 * 60 }),
        ],
    })
);

// ---- Imagens públicas assinadas das evidências: CacheFirst (300, 30d) --------
registerRoute(
    ({ url, request }) => request.method === 'GET' && url.pathname.includes('/api/public/evidencias/'),
    new CacheFirst({
        cacheName: 'evid-imagens',
        plugins: [
            new CacheableResponsePlugin({ statuses: [0, 200] }),
            new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 30 * 24 * 60 * 60 }),
        ],
    })
);

// ---- Estáticos de /public que o InjectManifest NÃO precacheia ----------------
// Arquivos da pasta public/ (fora do bundle webpack) não entram no
// self.__WB_MANIFEST. O mapa de municípios é necessário para nomear o ponto sem
// internet (§5.4); garantimos que fique em cache após a primeira carga online.
registerRoute(
    ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/data/'),
    new StaleWhileRevalidate({
        cacheName: 'app-dados-estaticos',
        plugins: [
            new CacheableResponsePlugin({ statuses: [0, 200] }),
            new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 30 * 24 * 60 * 60 }),
        ],
    })
);

// ---- Atualização controlada --------------------------------------------------
// Ativa a nova versão SÓ quando o app mandar a mensagem (após o usuário aceitar).
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

clientsClaim();
