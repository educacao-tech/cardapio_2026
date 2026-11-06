const webpush = require('web-push');

/**
 * Envia notificações Web Push em lotes controlados para evitar esgotamento de sockets
 * e remove inscrições expiradas (410 Gone / 404 Not Found)
 * 
 * @param {Array} subscriptions - Lista de inscrições
 * @param {string} payload - Conteúdo serializado em JSON
 * @param {number} batchSize - Tamanho do lote de concorrência (padrão: 25)
 * @returns {Promise<{ sentCount: number, removedCount: number, activeSubscriptions: Array }>}
 */
async function sendPushNotificationsInBatches(subscriptions, payload, batchSize = 25) {
    if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
        return { sentCount: 0, removedCount: 0, activeSubscriptions: [] };
    }

    const deadEndpoints = new Set();
    let sentCount = 0;

    for (let i = 0; i < subscriptions.length; i += batchSize) {
        const batch = subscriptions.slice(i, i + batchSize);
        const results = await Promise.allSettled(
            batch.map(sub => 
                webpush.sendNotification(sub, payload).then(() => {
                    sentCount++;
                }).catch(err => {
                    // 410 (Gone) ou 404 (Not Found): Inscrição revogada pelo usuário ou navegador
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        deadEndpoints.add(sub.endpoint);
                    } else {
                        console.warn('⚠️ [PushService] Erro ao enviar notificação individual:', err.message);
                    }
                })
            )
        );
    }

    // Filtra e descarta as inscrições canceladas
    const activeSubscriptions = subscriptions.filter(s => !deadEndpoints.has(s.endpoint));
    const removedCount = deadEndpoints.size;

    if (removedCount > 0) {
        console.log(`🧹 [PushService] ${removedCount} inscrições expiradas foram removidas automaticamente.`);
    }

    return {
        sentCount,
        removedCount,
        activeSubscriptions
    };
}

module.exports = {
    sendPushNotificationsInBatches
};

