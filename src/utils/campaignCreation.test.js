import { test } from 'node:test';
import assert from 'node:assert/strict';
import { libelleEtape, suivreCreation, CreationEchouee, detailsUtiles } from './campaignCreation.js';

const sansPause = () => Promise.resolve();

/** Renvoie, à chaque appel, la réponse suivante de la liste (la dernière se répète). */
const sequence = (reponses) => {
    let i = 0;
    return async () => {
        const r = reponses[Math.min(i, reponses.length - 1)];
        i += 1;
        if (r instanceof Error) throw r;
        return r;
    };
};

test("libellé de l'étape : vidéo en traitement avec le rang", () => {
    assert.equal(libelleEtape({ name: 'video', current: 1, total: 2 }), 'Traitement de la vidéo par Facebook (1 sur 2)…');
    assert.equal(libelleEtape({ name: 'medias', current: 2, total: 3 }), 'Envoi des visuels (2 sur 3)…');
    assert.equal(libelleEtape({ name: 'campagne' }), 'Création de la campagne…');
    assert.equal(libelleEtape(null), 'Création en cours…');
});

test('attend la fin puis renvoie le résultat', async () => {
    const etapes = [];
    const resultat = await suivreCreation({
        lireJob: sequence([
            { status: 'running', step: { name: 'campagne' } },
            { status: 'running', step: { name: 'video', current: 1, total: 1 } },
            { status: 'done', result: { campaign_id: 'c1' } }
        ]),
        onStep: (e) => etapes.push(e.name),
        pause: sansPause
    });
    assert.deepEqual(resultat, { campaign_id: 'c1' });
    assert.deepEqual(etapes, ['campagne', 'video']);
});

test('lève CreationEchouee avec le message du serveur quand la création échoue', async () => {
    await assert.rejects(
        suivreCreation({
            lireJob: sequence([{ status: 'failed', error: { message: 'Vidéo refusée', details: ['a'], error: 'validation_error' }, http_status: 400 }]),
            pause: sansPause
        }),
        (err) => err instanceof CreationEchouee && err.message === 'Vidéo refusée' && err.details[0] === 'a'
    );
});

test('tolère quelques erreurs réseau passagères', async () => {
    const resultat = await suivreCreation({
        lireJob: sequence([new Error('réseau'), new Error('réseau'), { status: 'done', result: { campaign_id: 'c2' } }]),
        pause: sansPause
    });
    assert.equal(resultat.campaign_id, 'c2');
});

test("abandonne après trop d'erreurs réseau consécutives", async () => {
    await assert.rejects(
        suivreCreation({ lireJob: sequence([new Error('réseau')]), pause: sansPause, maxErreursReseau: 3 }),
        /connexion/i
    );
});

test('une création introuvable (404) invite à vérifier la liste', async () => {
    const e404 = Object.assign(new Error('x'), { response: { status: 404 } });
    await assert.rejects(
        suivreCreation({ lireJob: sequence([e404]), pause: sansPause }),
        /liste de vos campagnes/i
    );
});

test('abandonne au-delà de la durée maximale', async () => {
    await assert.rejects(
        suivreCreation({
            lireJob: sequence([{ status: 'running' }]),
            pause: sansPause, intervalleMs: 1000, dureeMaxMs: 3000
        }),
        /trop de temps/i
    );
});

test('ne répète pas le message dans les détails', () => {
    assert.equal(detailsUtiles('Pixel manquant', ['Pixel manquant']), null);
    assert.deepEqual(detailsUtiles('Données invalides', ['Le titre est requis', 'Le budget est trop bas']),
        ['Le titre est requis', 'Le budget est trop bas']);
    assert.equal(detailsUtiles('Erreur', undefined), null);
});
