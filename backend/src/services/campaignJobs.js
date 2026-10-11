/**
 * Suivi des créations de campagne longues.
 *
 * Créer une campagne avec des vidéos peut durer plusieurs minutes : Meta traite
 * chaque vidéo avant qu'on puisse la citer. Garder une seule requête HTTP
 * ouverte tout ce temps échoue sur l'hébergement (coupure des requêtes sans
 * octet) et faisait afficher « Erreur » alors que la campagne existait — puis un
 * nouvel essai la dupliquait.
 *
 * Le serveur répond donc tout de suite avec un identifiant ; l'écran interroge
 * l'avancement. La clé d'idempotence, générée par l'écran à chaque soumission,
 * empêche qu'un double clic, un « Réessayer » ou une reconnexion crée deux
 * campagnes.
 *
 * Stockage EN MÉMOIRE, volontairement : pas de migration, un seul serveur.
 * Limite assumée : si le serveur redémarre pendant une création, le suivi est
 * perdu — la campagne, si elle aboutit, reste visible dans la liste.
 */

const crypto = require('crypto');

const CONSERVATION_MS = 30 * 60 * 1000;

const jobs = new Map();

function create({ userId, key = null }) {
    const job = {
        id: crypto.randomUUID(),
        userId,
        key: key || null,
        status: 'running',
        step: null,
        result: null,
        error: null,
        createdAt: Date.now(),
        finishedAt: null
    };
    jobs.set(job.id, job);
    return job;
}

/** Le job n'est visible que par son propriétaire. */
function get(id, userId) {
    const job = jobs.get(id);
    return job && job.userId === userId ? job : null;
}

function findByKey(userId, key) {
    if (!key) return null;
    for (const job of jobs.values()) {
        if (job.userId === userId && job.key === key) return job;
    }
    return null;
}

function update(id, patch) {
    const job = jobs.get(id);
    if (!job) return null;
    Object.assign(job, patch);
    if (patch.status && patch.status !== 'running') job.finishedAt = Date.now();
    return job;
}

function countRunning(userId) {
    let n = 0;
    for (const job of jobs.values()) {
        if (job.userId === userId && job.status === 'running') n += 1;
    }
    return n;
}

/** Supprime les jobs terminés depuis plus de 30 min ; ne touche jamais aux jobs en cours. */
function purge(now = Date.now()) {
    for (const [id, job] of jobs) {
        if (job.finishedAt && now - job.finishedAt > CONSERVATION_MS) jobs.delete(id);
    }
}

function reset() {
    jobs.clear();
}

module.exports = { create, get, findByKey, update, countRunning, purge, reset };
