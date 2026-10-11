import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFile, checkVideo, checkMediaItems, carouselRatioWarning, mediaKind } from './mediaSpecs.js';

const img = { url: 'https://cdn/1.jpg', type: 'image' };

test('refuse un format autre que JPG, PNG, MP4, MOV', () => {
    assert.match(checkFile({ type: 'image/gif', size: 10 })[0], /Format non accepté/);
});

test('refuse une vidéo de plus de 50 Mo', () => {
    assert.match(checkFile({ type: 'video/mp4', size: 51 * 1024 * 1024 })[0], /50 Mo/);
});

test('refuse une vidéo de 0,5 s', () => {
    assert.match(checkVideo({ duration: 0.5, width: 1080, height: 1080 })[0], /1 seconde/);
});

test('refuse une vidéo de moins de 120 px', () => {
    assert.match(checkVideo({ duration: 10, width: 100, height: 200 })[0], /120/);
});

test('accepte une vidéo de 10 s en 1080×1920', () => {
    assert.deepEqual(checkVideo({ duration: 10, width: 1080, height: 1920 }), []);
});

test('refuse un carrousel d’une seule carte', () => {
    assert.match(checkMediaItems('carousel', [img])[0], /2 à 10/);
});

test('refuse un titre de carte trop long', () => {
    assert.match(checkMediaItems('carousel', [img, { ...img, name: 'x'.repeat(21) }])[0], /20/);
});

test('accepte un format flexible de 4 médias', () => {
    assert.deepEqual(checkMediaItems('flexible', [img, img, img, { ...img, type: 'video' }]), []);
});

test('avertit pour une carte non carrée, pas pour 1080×1080', () => {
    assert.ok(carouselRatioWarning({ width: 1080, height: 1350 }));
    assert.equal(carouselRatioWarning({ width: 1080, height: 1080 }), null);
});

test('reconnaît les types de fichiers', () => {
    assert.equal(mediaKind('video/quicktime'), 'video');
    assert.equal(mediaKind('image/png'), 'image');
});
