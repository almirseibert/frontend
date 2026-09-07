// =============================================================================
// Registro do Service Worker — Evidências de Campo, Fase 1 (§3.2)
// =============================================================================
// Adaptado do template PWA do Create React App, com UMA diferença central: a
// nova versão NÃO é ativada automaticamente. Quando há update, disparamos o
// evento 'sw:update-available' com a referência do worker em espera; a UI mostra
// "Nova versão — atualizar" e só então chamamos SKIP_WAITING. Trocar o bundle sob
// um formulário de captura pela metade perderia a foto (§3.2).

const isLocalhost = Boolean(
    window.location.hostname === 'localhost' ||
    window.location.hostname === '[::1]' ||
    window.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d?\d)){3}$/)
);

let waitingWorker = null;

// Chamada pela UI quando o usuário aceita atualizar.
export function applyUpdate() {
    if (waitingWorker) {
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
        // Quando o novo SW assume o controle, recarrega uma vez para pegar o bundle.
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            window.location.reload();
        });
    }
}

export function register(config) {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;

    // O SW só funciona se estiver na mesma origem (PUBLIC_URL pode ser um CDN).
    const publicUrl = new URL(process.env.PUBLIC_URL, window.location.href);
    if (publicUrl.origin !== window.location.origin) return;

    window.addEventListener('load', () => {
        const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;

        if (isLocalhost) {
            checkValidServiceWorker(swUrl, config);
            navigator.serviceWorker.ready.then(() => {
                // eslint-disable-next-line no-console
                console.log('[SW] rodando em localhost via cache-first.');
            });
        } else {
            registerValidSW(swUrl, config);
        }
    });
}

function anunciarUpdate(worker) {
    waitingWorker = worker;
    window.dispatchEvent(new CustomEvent('sw:update-available'));
}

function registerValidSW(swUrl, config) {
    navigator.serviceWorker
        .register(swUrl)
        .then((registration) => {
            // Já há um worker em espera (aba anterior instalou): anuncia.
            if (registration.waiting) anunciarUpdate(registration.waiting);

            registration.onupdatefound = () => {
                const installingWorker = registration.installing;
                if (installingWorker == null) return;
                installingWorker.onstatechange = () => {
                    if (installingWorker.state === 'installed') {
                        if (navigator.serviceWorker.controller) {
                            // Update disponível (já havia SW controlando antes).
                            anunciarUpdate(installingWorker);
                            if (config && config.onUpdate) config.onUpdate(registration);
                        } else {
                            // Primeira instalação: conteúdo pronto para uso offline.
                            // eslint-disable-next-line no-console
                            console.log('[SW] conteúdo em cache para uso offline.');
                            if (config && config.onSuccess) config.onSuccess(registration);
                        }
                    }
                };
            };
        })
        .catch((error) => {
            // eslint-disable-next-line no-console
            console.error('[SW] falha ao registrar:', error);
        });
}

function checkValidServiceWorker(swUrl, config) {
    fetch(swUrl, { headers: { 'Service-Worker': 'script' } })
        .then((response) => {
            const contentType = response.headers.get('content-type');
            if (
                response.status === 404 ||
                (contentType != null && contentType.indexOf('javascript') === -1)
            ) {
                navigator.serviceWorker.ready.then((registration) => {
                    registration.unregister().then(() => window.location.reload());
                });
            } else {
                registerValidSW(swUrl, config);
            }
        })
        .catch(() => {
            // eslint-disable-next-line no-console
            console.log('[SW] sem conexão. App rodando em modo offline.');
        });
}

export function unregister() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
            .then((registration) => registration.unregister())
            .catch((error) => console.error(error.message));
    }
}
