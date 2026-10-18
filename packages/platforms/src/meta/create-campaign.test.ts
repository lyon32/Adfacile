import { describe, expect, it } from 'vitest';
import type { MetaPageContext, PublishSpec } from '../types';
import { deleteCampaignOnMeta, patchCampaign, updateCampaignStatus } from './campaign-actions';
import { createFullCampaign, getAdAccountTimezone, normalizeObjective } from './create-campaign';
import { MetaGraphError, MetaValidationError, toAppError } from './errors';
import {
  failure,
  FakeGraph,
  file,
  type GraphHandler,
  type RecordedCall,
} from './fake-graph.test-helper';

// Tests portés de backend/src/services/createFullCampaign.test.js et campaignStatus.test.js (TR-PLA-02).
// `jest.mock('axios')` et le faux Supabase sont remplacés par une fausse Graph API ; l'enregistrement en base
// n'est plus du ressort du connecteur.
const PAGE: MetaPageContext = {
  id: '799671609906273',
  name: 'Lyon Deals',
  instagramAccountId: null,
  instagramConnected: false,
  whatsappConnected: true,
  whatsappNumber: '+237650198196',
  whatsappPhoneNumberId: null,
};

const NOW = () => new Date('2026-10-01T00:00:00Z');
// Les hôtes de médias sont obligatoires (médias sur cdn.test) ; la monnaie du compte est portée par chaque demande.
const DEPS = { now: NOW, upload: { allowedMediaHosts: ['cdn.test'] } };

interface Setup {
  graph: FakeGraph;
  /** Corps des POST, indexés par la fin du chemin (campaigns, adsets, adcreatives, ads, advideos…). */
  appels: Record<string, Record<string, unknown>[]>;
}

/** Simule Graph. Chaque POST renvoie `<fin du chemin>-id` et un hash d'image. */
function preparer(reponsesGet: Record<string, unknown> = {}, surMesure?: GraphHandler): Setup {
  const appels: Setup['appels'] = {};
  const graph = new FakeGraph((call: RecordedCall) => {
    const custom = surMesure?.(call);
    if (custom) return custom;
    if (call.path.startsWith('https://cdn.test')) return file('image/jpeg');
    if (call.method === 'DELETE') return { success: true };
    if (call.method === 'POST') {
      const cle = call.path.split('/').pop() ?? '';
      (appels[cle] ??= []).push((call.body ?? {}) as Record<string, unknown>);
      return { id: `${cle}-id`, images: { x: { hash: 'HASH' } } };
    }
    for (const [motif, data] of Object.entries(reponsesGet)) {
      if (call.path.includes(motif)) return data as Record<string, unknown>;
    }
    return { timezone_name: 'Africa/Douala' };
  });
  return { graph, appels };
}

type Defaut = 'destinationType' | 'optimizationGoal';

/** `omit` retire une valeur par défaut (destination, objectif de performance) pour tester le repli. */
function donnees({
  omit = [],
  ...extra
}: Partial<PublishSpec> & { omit?: Defaut[] } = {}): PublishSpec {
  return {
    campaignName: 'PROD-TEST',
    objective: 'OUTCOME_TRAFFIC',
    adAccountId: '123',
    account: { code: 'USD' },
    page: PAGE,
    ...(omit.includes('destinationType') ? {} : { destinationType: 'WEBSITE' }),
    ...(omit.includes('optimizationGoal') ? {} : { optimizationGoal: 'LINK_CLICKS' }),
    dailyBudgetUsdCents: 164, // 1,64 $
    startDate: '2026-10-10',
    targeting: { locations: [{ key: 'CM', type: 'country' }] },
    websiteUrl: 'https://exemple.cm',
    creative: { mediaType: 'none', message: 'Bonjour', headline: 'Titre' },
    ...extra,
  };
}

const patcher = (
  graph: Parameters<typeof patchCampaign>[0],
  token: string,
  refs: Parameters<typeof patchCampaign>[2],
  patch: Parameters<typeof patchCampaign>[3],
) => patchCampaign(graph, token, refs, { account: { code: 'USD' }, ...patch });

const lancer = (setup: Setup, spec: PublishSpec) =>
  createFullCampaign({ graph: setup.graph.client(), ...DEPS }, 'TOKEN', spec);

describe('createFullCampaign — budget', () => {
  it("place le budget quotidien sur l'ensemble de publicités", async () => {
    const s = preparer();
    await lancer(s, donnees());
    expect(s.appels.adsets?.[0]?.daily_budget).toBe(164);
  });

  it('ne met aucun budget sur la campagne', async () => {
    // Comportement voulu : budget au niveau de l'ensemble, pas d'Advantage Campaign Budget. Ce test le verrouille.
    const s = preparer();
    await lancer(s, donnees());
    const campagne = s.appels.campaigns?.[0];
    expect(campagne?.daily_budget).toBeUndefined();
    expect(campagne?.lifetime_budget).toBeUndefined();
    expect(campagne?.is_adset_budget_sharing_enabled).toBe(false);
    expect(campagne).toMatchObject({ status: 'PAUSED', special_ad_categories: [] });
  });

  it('refuse un budget sous 1 $ avant tout appel à Meta (TR-PLA-10)', async () => {
    const s = preparer();
    await expect(lancer(s, donnees({ dailyBudgetUsdCents: 99 }))).rejects.toMatchObject({
      code: 'budget_too_low',
      status: 422,
    });
    expect(s.graph.calls).toHaveLength(0);
  });

  it('accepte exactement 1 $ et refuse un budget non entier', async () => {
    await expect(lancer(preparer(), donnees({ dailyBudgetUsdCents: 100 }))).resolves.toBeDefined();
    await expect(lancer(preparer(), donnees({ dailyBudgetUsdCents: 100.5 }))).rejects.toMatchObject(
      { code: 'budget_too_low' },
    );
  });

  it('remplace le budget quotidien par le budget total quand une date de fin est donnée', async () => {
    const s = preparer();
    await lancer(
      s,
      donnees({ budgetType: 'lifetime', lifetimeBudgetUsdCents: 1500, endDate: '2026-10-20' }),
    );
    const ensemble = s.appels.adsets?.[0];
    expect(ensemble?.daily_budget).toBeUndefined();
    expect(ensemble?.lifetime_budget).toBe(1500);
    expect(ensemble?.end_time).toBe('2026-10-20T23:59:59+0100');
  });

  it('refuse un budget total sous le minimum de Meta', async () => {
    const s = preparer();
    await expect(
      lancer(
        s,
        donnees({ budgetType: 'lifetime', lifetimeBudgetUsdCents: 50, endDate: '2026-10-20' }),
      ),
    ).rejects.toMatchObject({ code: 'budget_too_low' });
    expect(s.graph.calls).toHaveLength(0);
  });

  it('bascule en coût maîtrisé quand un coût par résultat est visé', async () => {
    const s = preparer();
    await lancer(s, donnees({ costPerResultUsdCents: 30 }));
    expect(s.appels.adsets?.[0]).toMatchObject({ bid_strategy: 'COST_CAP', bid_amount: 30 });
  });
});

describe('createFullCampaign — configuration obligatoire', () => {
  it('refuse sans liste d’hôtes de médias, avant tout appel à Meta (anti-SSRF)', async () => {
    const s = preparer();
    for (const allowedMediaHosts of [[], ['']]) {
      await expect(
        createFullCampaign(
          { graph: s.graph.client(), now: NOW, upload: { allowedMediaHosts } },
          'T',
          donnees(),
        ),
      ).rejects.toMatchObject({ code: 'internal_error' });
    }
    expect(s.graph.calls).toHaveLength(0);
  });

  it('EC-META-11 : un compte hors dollar sans taux valide est refusé avant tout appel, sans taux par défaut', async () => {
    const s = preparer();
    for (const perUsd of [undefined, 0, -1, Number.NaN]) {
      const account = perUsd === undefined ? { code: 'NGN' } : { code: 'NGN', perUsd };
      await expect(lancer(s, donnees({ account }))).rejects.toThrow(MetaValidationError);
    }
    expect(s.graph.calls).toHaveLength(0);
  });

  it('EC-META-11 : une monnaie que Meta ne connaît pas (franc CFA) est refusée avant tout appel', async () => {
    const s = preparer();
    await expect(lancer(s, donnees({ account: { code: 'XAF', perUsd: 600 } }))).rejects.toThrow(
      /prise en charge/,
    );
    expect(s.graph.calls).toHaveLength(0);
  });

  it('EC-META-11 : redonne le minimum dans la monnaie du compte quand le budget est trop bas', async () => {
    const s = preparer();
    const erreur = await lancer(
      s,
      donnees({ dailyBudgetUsdCents: 10, account: { code: 'NGN', perUsd: 1500 } }),
    ).catch((e: unknown) => e);
    expect(erreur).toMatchObject({
      code: 'budget_too_low',
      opts: { meta: { minUsdCents: 100, currency: 'NGN', minAccountMinor: 150_000 } },
    });
    expect(s.graph.calls).toHaveLength(0);
  });

  it('un média hors des hôtes autorisés est refusé et la campagne déjà créée est annulée', async () => {
    const s = preparer();
    await expect(
      lancer(
        s,
        donnees({
          creative: { mediaType: 'image', mediaUrl: 'https://autre.test/a.jpg', message: 'x' },
        }),
      ),
    ).rejects.toThrow(/téléversé/);
    expect(s.graph.calls.filter((c) => c.method === 'DELETE').map((c) => c.path)).toEqual([
      'adsets-id',
      'campaigns-id',
    ]);
  });
});

describe('createFullCampaign — dates dans le fuseau du compte', () => {
  it('démarre au début du jour choisi dans le fuseau du compte', async () => {
    const s = preparer();
    await lancer(s, donnees());
    expect(s.appels.adsets?.[0]?.start_time).toBe('2026-10-10T00:00:00+0100');
  });

  it('retombe sur America/Los_Angeles si Meta ne renvoie pas le fuseau', async () => {
    const graph = new FakeGraph(() => ({}));
    expect(await getAdAccountTimezone(graph.client(), 'act_1', 't')).toBe('America/Los_Angeles');
    const panne = new FakeGraph(() => failure({ message: 'x' }, 500));
    expect(await getAdAccountTimezone(panne.client(), 'act_1', 't')).toBe('America/Los_Angeles');
  });
});

describe('createFullCampaign — résultat et enchaînement', () => {
  it('renvoie les identifiants des quatre niveaux et crée dans l’ordre campagne, ensemble, création, publicité', async () => {
    const s = preparer();
    const etapes: string[] = [];
    const refs = await createFullCampaign(
      { graph: s.graph.client(), ...DEPS, onStep: (n) => etapes.push(n) },
      'TOKEN',
      donnees(),
    );
    expect(refs).toEqual({
      campaignId: 'campaigns-id',
      adsetId: 'adsets-id',
      adId: 'ads-id',
      creativeId: 'adcreatives-id',
      adAccountId: 'act_123',
    });
    const posts = s.graph.calls.filter((c) => c.method === 'POST').map((c) => c.path);
    expect(posts).toEqual([
      'act_123/campaigns',
      'act_123/adsets',
      'act_123/adcreatives',
      'act_123/ads',
    ]);
    expect(etapes).toEqual(['campagne', 'ensemble', 'publicite']);
    expect(s.appels.ads?.[0]).toMatchObject({
      adset_id: 'adsets-id',
      creative: { creative_id: 'adcreatives-id' },
      status: 'PAUSED',
    });
  });

  it("un échec de la fonction d'avancement ne fait pas échouer la création", async () => {
    const s = preparer();
    await expect(
      createFullCampaign(
        {
          graph: s.graph.client(),
          ...DEPS,
          onStep: () => {
            throw new Error('écran fermé');
          },
        },
        'T',
        donnees(),
      ),
    ).resolves.toBeDefined();
  });

  it('normalise les anciens objectifs', () => {
    expect(normalizeObjective('LINK_CLICKS')).toBe('OUTCOME_TRAFFIC');
    expect(normalizeObjective('CONVERSIONS')).toBe('OUTCOME_SALES');
    expect(normalizeObjective('OUTCOME_LEADS')).toBe('OUTCOME_LEADS');
  });

  it('protège le jeton : il part en paramètre, jamais dans le corps ni dans une erreur', async () => {
    const s = preparer();
    await lancer(s, donnees());
    for (const c of s.graph.calls.filter((x) => x.method === 'POST')) {
      expect(JSON.stringify(c.body)).not.toContain('TOKEN');
      expect(c.params.access_token).toBe('TOKEN');
    }
  });

  it('renseigne le bénéficiaire DSA avec le nom de la Page, à défaut avec celui de la campagne', async () => {
    const s = preparer();
    await lancer(s, donnees());
    expect(s.appels.adsets?.[0]).toMatchObject({
      dsa_beneficiary: 'Lyon Deals',
      dsa_payor: 'Lyon Deals',
    });
    const t = preparer();
    await lancer(t, donnees({ page: { ...PAGE, name: null } }));
    expect(t.appels.adsets?.[0]).toMatchObject({ dsa_beneficiary: 'PROD-TEST' });
  });

  it('exige une localisation, avant tout appel à Meta', async () => {
    const s = preparer();
    await expect(lancer(s, donnees({ targeting: { locations: [] } }))).rejects.toThrow(
      /localisation/,
    );
    expect(s.graph.calls).toHaveLength(0);
  });

  it('refuse une vidéo sans fichier au lieu de publier une publicité sans visuel', async () => {
    // La vidéo était téléversée puis ignorée : link_data partait sans image_hash ni video_id.
    const s = preparer();
    await expect(
      lancer(s, donnees({ creative: { mediaType: 'video', message: 'x' } })),
    ).rejects.toThrow(/Ajoutez une vidéo/);
    expect(s.graph.calls).toHaveLength(0);
  });

  it('transmet lien d’affichage, paramètres UTM et refus des publicités multi-annonceurs', async () => {
    const s = preparer();
    await lancer(
      s,
      donnees({
        multiAdvertiserAds: false,
        creative: {
          mediaType: 'none',
          message: 'M',
          headline: 'T',
          displayLink: 'exemple.cm',
          urlTags: 'utm_source=pubeka',
        },
      }),
    );
    const creation = s.appels.adcreatives?.[0];
    expect(creation).toMatchObject({
      url_tags: 'utm_source=pubeka',
      contextual_multi_ads: { enroll_status: 'OPT_OUT' },
    });
    expect(
      (creation?.object_story_spec as { link_data: { caption: string } }).link_data.caption,
    ).toBe('exemple.cm');
    const t = preparer();
    await lancer(t, donnees());
    expect(t.appels.adcreatives?.[0]?.contextual_multi_ads).toEqual({ enroll_status: 'OPT_IN' });
  });
});

describe('createFullCampaign — annulation en cas d’échec', () => {
  it("supprime la campagne déjà créée quand l'ensemble de publicités est refusé, et remonte l'erreur de Meta", async () => {
    const s = preparer({}, (call) =>
      call.path.endsWith('/adsets')
        ? failure({ code: 100, error_subcode: 1815675, message: 'Non-Messenger ad' })
        : undefined,
    );
    const erreur = await lancer(s, donnees()).catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(MetaGraphError);
    expect(toAppError(erreur).code).toBe('meta_error');
    expect(s.graph.calls.filter((c) => c.method === 'DELETE').map((c) => c.path)).toEqual([
      'campaigns-id',
    ]);
  });

  it('supprime ensemble et campagne quand la publicité échoue, et signale un jeton expiré', async () => {
    const s = preparer({}, (call) =>
      call.path.endsWith('/ads') ? failure({ code: 190, message: 'x' }, 401) : undefined,
    );
    const erreur = await lancer(s, donnees()).catch((e: unknown) => e);
    expect(toAppError(erreur).code).toBe('meta_token_expired');
    expect(s.graph.calls.filter((c) => c.method === 'DELETE').map((c) => c.path)).toEqual([
      'adcreatives-id',
      'adsets-id',
      'campaigns-id',
    ]);
  });

  it('ne relance jamais une création : un seul POST de campagne même après un échec', async () => {
    const s = preparer({}, (call) =>
      call.path.endsWith('/adsets') ? failure({ message: 'x' }, 500) : undefined,
    );
    await lancer(s, donnees()).catch(() => undefined);
    expect(
      s.graph.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/campaigns')),
    ).toHaveLength(1);
  });

  it('signale une réponse sans identifiant', async () => {
    const s = preparer({}, (call) => (call.path.endsWith('/campaigns') ? {} : undefined));
    await expect(lancer(s, donnees())).rejects.toThrow(/identifiant pour la campagne/);
  });
});

/** Réponses Graph d'une vidéo traitée, avec sa miniature préférée. */
const reponsesVideo = (): Record<string, unknown> => ({
  '/thumbnails': {
    data: [
      { uri: 'https://x/autre.jpg', is_preferred: false },
      { uri: 'https://x/pref.jpg', is_preferred: true },
    ],
  },
  'advideos-id': { status: { video_status: 'ready' } },
});

/** Les réponses GET sont cherchées par fragment de chemin ; « /thumbnails » contient un slash initial. */
function avecVideo(extra: Record<string, unknown> = {}): Setup {
  const reponses = { ...reponsesVideo(), ...extra };
  return preparer({}, (call) => {
    if (call.method !== 'GET' || call.path.startsWith('https://')) return undefined;
    for (const [motif, data] of Object.entries(reponses)) {
      if (call.path.includes(motif.replace(/^\//, ''))) return data as Record<string, unknown>;
    }
    return undefined;
  });
}

describe('createFullCampaign — vidéo seule', () => {
  it('crée une publicité video_data avec la vidéo et sa miniature', async () => {
    const s = avecVideo();
    await lancer(
      s,
      donnees({
        creative: {
          mediaType: 'video',
          mediaUrl: 'https://cdn.test/v.mp4',
          message: 'Bonjour',
          headline: 'Titre',
          description: 'Desc',
        },
      }),
    );
    expect(s.appels.advideos).toHaveLength(1);
    const spec = s.appels.adcreatives?.[0]?.object_story_spec as {
      link_data?: unknown;
      video_data?: unknown;
    };
    expect(spec.link_data).toBeUndefined();
    expect(spec.video_data).toMatchObject({
      video_id: 'advideos-id',
      image_url: 'https://x/pref.jpg',
      message: 'Bonjour',
      title: 'Titre',
      link_description: 'Desc',
      call_to_action: { type: 'LEARN_MORE', value: { link: 'https://exemple.cm' } },
    });
  });
});

describe('createFullCampaign — carrousel', () => {
  const cartes = [
    {
      url: 'https://cdn.test/1.jpg',
      type: 'image' as const,
      name: 'Carte 1',
      description: 'D1',
      link: 'https://exemple.cm/1',
    },
    { url: 'https://cdn.test/2.jpg', type: 'image' as const, name: 'Carte 2' },
    { url: 'https://cdn.test/3.mp4', type: 'video' as const, name: 'Carte 3' },
  ];
  const linkData = (
    s: Setup,
  ): { child_attachments: Record<string, unknown>[]; multi_share_optimized: boolean } =>
    (s.appels.adcreatives?.[0]?.object_story_spec as { link_data: never }).link_data;

  it('envoie une carte par média dans child_attachments', async () => {
    const s = avecVideo();
    await lancer(
      s,
      donnees({ creative: { mediaType: 'carousel', mediaItems: cartes, message: 'Bonjour' } }),
    );
    const ld = linkData(s);
    expect(ld.multi_share_optimized).toBe(true);
    expect(ld.child_attachments).toHaveLength(3);
    expect(ld.child_attachments[0]).toMatchObject({
      name: 'Carte 1',
      description: 'D1',
      link: 'https://exemple.cm/1',
      image_hash: 'HASH',
    });
    // Lien principal par défaut quand la carte n'en a pas.
    expect(ld.child_attachments[1]?.link).toBe('https://exemple.cm');
    // Une carte vidéo exige aussi une image : la miniature.
    expect(ld.child_attachments[2]).toMatchObject({
      video_id: 'advideos-id',
      picture: 'https://x/pref.jpg',
    });
  });

  it('met le bouton Appeler sur chaque carte pour une destination Appels', async () => {
    const s = avecVideo();
    await lancer(
      s,
      donnees({
        destinationType: 'PHONE_CALL',
        optimizationGoal: 'QUALITY_CALL',
        phoneNumber: '+237650198196',
        creative: { mediaType: 'carousel', mediaItems: cartes.slice(0, 2) },
      }),
    );
    for (const carte of linkData(s).child_attachments) {
      expect((carte.call_to_action as { type: string }).type).toBe('CALL_NOW');
    }
  });
});

const MEDIAS_FLEXIBLES = [
  { url: 'https://cdn.test/1.jpg', type: 'image' as const },
  { url: 'https://cdn.test/2.jpg', type: 'image' as const },
  { url: 'https://cdn.test/3.jpg', type: 'image' as const },
  { url: 'https://cdn.test/4.mp4', type: 'video' as const },
];

const CREATIVE_FLEXIBLE: PublishSpec['creative'] = {
  mediaType: 'flexible',
  mediaItems: MEDIAS_FLEXIBLES,
  message: 'Texte 1',
  bodies: ['Texte 2'],
  headline: 'Titre 1',
  titles: ['Titre 2'],
  description: 'Desc',
};

describe('createFullCampaign — plusieurs visuels : contenu dynamique (Trafic, etc.)', () => {
  it("crée l'ensemble en mode dynamique", async () => {
    // Meta refuse sinon : « les publicités à contenu dynamique ne peuvent être créées que dans des
    // ensembles à contenu dynamique ».
    const s = avecVideo();
    await lancer(s, donnees({ creative: CREATIVE_FLEXIBLE }));
    expect(s.appels.adsets?.[0]?.is_dynamic_creative).toBe(true);
  });

  it('décrit les médias dans asset_feed_spec avec AUTOMATIC_FORMAT', async () => {
    const s = avecVideo();
    await lancer(s, donnees({ creative: CREATIVE_FLEXIBLE }));
    const creation = s.appels.adcreatives?.[0] as {
      object_story_spec: { link_data?: unknown; page_id: string };
      asset_feed_spec: Record<string, unknown>;
    };
    expect(creation.object_story_spec.link_data).toBeUndefined();
    expect(creation.object_story_spec.page_id).toBe(PAGE.id);
    const feed = creation.asset_feed_spec;
    expect(feed.ad_formats).toEqual(['AUTOMATIC_FORMAT']);
    expect(feed.images).toHaveLength(3);
    expect(feed.videos).toEqual([{ video_id: 'advideos-id', thumbnail_url: 'https://x/pref.jpg' }]);
    expect(feed.bodies).toEqual([{ text: 'Texte 1' }, { text: 'Texte 2' }]);
    expect(feed.titles).toEqual([{ text: 'Titre 1' }, { text: 'Titre 2' }]);
    expect(feed.link_urls).toEqual([{ website_url: 'https://exemple.cm' }]);
    expect(feed.call_to_action_types).toEqual(['LEARN_MORE']);
  });

  it("ne rend pas dynamique un ensemble qui n'a pas ce format", async () => {
    const s = avecVideo();
    await lancer(s, donnees());
    expect(s.appels.adsets?.[0]?.is_dynamic_creative).toBeUndefined();
  });
});

describe('createFullCampaign — plusieurs visuels : vrai format flexible (Ventes)', () => {
  const ventes = (): PublishSpec =>
    donnees({
      objective: 'OUTCOME_SALES',
      omit: ['optimizationGoal'],
      pixelId: '1234567890',
      creative: CREATIVE_FLEXIBLE,
    });

  it('envoie creative_asset_groups_spec avec la publicité, pas asset_feed_spec', async () => {
    const s = avecVideo();
    await lancer(s, ventes());

    expect(s.appels.adsets?.[0]?.is_dynamic_creative).toBeUndefined();
    const pub = s.appels.ads?.[0] as {
      creative: {
        asset_feed_spec?: unknown;
        object_story_spec: { page_id: string; link_data?: unknown };
      };
      creative_asset_groups_spec: { groups: Record<string, unknown>[] };
    };
    const [groupe] = pub.creative_asset_groups_spec.groups;
    expect(groupe?.images).toHaveLength(3);
    expect(groupe?.videos).toEqual([{ video_id: 'advideos-id' }]);
    expect(groupe?.texts).toEqual(
      expect.arrayContaining([
        { text: 'Texte 1', text_type: 'primary_text' },
        { text: 'Texte 2', text_type: 'primary_text' },
        { text: 'Titre 1', text_type: 'headline' },
        { text: 'Titre 2', text_type: 'headline' },
      ]),
    );
    expect(groupe?.call_to_action).toEqual({
      type: 'LEARN_MORE',
      value: { link: 'https://exemple.cm' },
    });
    // La création est passée en ligne, avec la seule Page.
    expect(pub.creative.asset_feed_spec).toBeUndefined();
    expect(pub.creative.object_story_spec.page_id).toBe(PAGE.id);
    // Meta refuse sinon : « Le champ link est requis » (relevé en réel). Le premier média du groupe doit
    // aussi être celui de la création.
    expect(pub.creative.object_story_spec.link_data).toMatchObject({
      link: 'https://exemple.cm',
      image_hash: 'HASH',
    });
    expect(s.appels.adcreatives).toBeUndefined();
  });

  it('met dans video_data de la création la vidéo quand elle est le premier média', async () => {
    const s = avecVideo();
    await lancer(
      s,
      donnees({
        objective: 'OUTCOME_SALES',
        omit: ['optimizationGoal'],
        pixelId: '1234567890',
        creative: {
          ...CREATIVE_FLEXIBLE,
          mediaItems: [
            { url: 'https://cdn.test/4.mp4', type: 'video' },
            { url: 'https://cdn.test/1.jpg', type: 'image' },
          ],
        },
      }),
    );
    const spec = (
      s.appels.ads?.[0] as {
        creative: { object_story_spec: { link_data?: unknown; video_data?: unknown } };
      }
    ).creative.object_story_spec;
    expect(spec.link_data).toBeUndefined();
    expect(spec.video_data).toMatchObject({
      video_id: 'advideos-id',
      image_url: 'https://x/pref.jpg',
    });
  });
});

describe("createFullCampaign — numéro WhatsApp dans l'identité", () => {
  const creationsExistantes = {
    adcreatives: {
      data: [
        {
          object_story_spec: { page_id: PAGE.id },
          wamo_whatsapp_identity_spec: { wamo_whatsapp_identity_id: 'WA-1' },
        },
        {
          object_story_spec: { page_id: PAGE.id },
          wamo_whatsapp_identity_spec: { wamo_whatsapp_identity_id: 'WA-1' },
        },
        {
          object_story_spec: { page_id: 'AUTRE-PAGE' },
          wamo_whatsapp_identity_spec: { wamo_whatsapp_identity_id: 'WA-AUTRE' },
        },
        { object_story_spec: { page_id: PAGE.id } },
      ],
    },
  };

  it.each([
    ['site web', {}],
    [
      'appels',
      {
        destinationType: 'PHONE_CALL',
        optimizationGoal: 'QUALITY_CALL',
        phoneNumber: '+237650198196',
      },
    ],
    [
      'messagerie',
      {
        objective: 'OUTCOME_ENGAGEMENT',
        destinationType: 'WHATSAPP',
        optimizationGoal: 'CONVERSATIONS',
      },
    ],
  ] as [string, Partial<PublishSpec>][])(
    "reprend l'identité WhatsApp de la Page sur une publicité %s",
    async (_nom, extra) => {
      const s = preparer(creationsExistantes);
      await lancer(s, donnees(extra));
      const creation =
        s.appels.adcreatives?.[0] ?? (s.appels.ads?.[0]?.creative as Record<string, unknown>);
      expect(creation.wamo_whatsapp_identity_spec).toEqual({ wamo_whatsapp_identity_id: 'WA-1' });
    },
  );

  it("n'ajoute rien quand la Page n'a pas d'identité WhatsApp connue", async () => {
    const s = preparer({ adcreatives: { data: [] } });
    await lancer(s, donnees());
    expect(s.appels.adcreatives?.[0]?.wamo_whatsapp_identity_spec).toBeUndefined();
  });

  it('ne bloque pas la création si la lecture échoue', async () => {
    const s = preparer({}, (call) =>
      call.method === 'GET' && call.path.endsWith('/adcreatives')
        ? failure({ message: 'réseau' }, 500)
        : undefined,
    );
    await lancer(s, donnees());
    expect(s.appels.ads).toHaveLength(1);
  });
});

describe('createFullCampaign — messagerie et bandeau de messagerie', () => {
  it("passe la création en ligne avec le bandeau de messagerie d'une publicité web", async () => {
    const s = preparer();
    await lancer(s, donnees({ websiteMessageApps: ['whatsapp', 'messenger'] }));
    expect(s.appels.adcreatives).toBeUndefined();
    const pub = s.appels.ads?.[0] as { creative: { asset_feed_spec: unknown } };
    expect(pub.creative.asset_feed_spec).toEqual({
      message_extensions: [{ type: 'messenger' }, { type: 'whatsapp' }],
    });
  });

  it("n'ajoute pas ce bandeau à une campagne Ventes", async () => {
    const s = preparer();
    await lancer(
      s,
      donnees({
        objective: 'OUTCOME_SALES',
        omit: ['optimizationGoal'],
        pixelId: '1',
        websiteMessageApps: ['whatsapp'],
      }),
    );
    expect(s.appels.adcreatives).toHaveLength(1);
  });

  it("crée un ensemble de messagerie avec bouton, lien, numéro WhatsApp et message d'accueil", async () => {
    const s = preparer();
    await lancer(
      s,
      donnees({
        objective: 'OUTCOME_ENGAGEMENT',
        omit: ['destinationType', 'optimizationGoal'],
        messagingDestinations: ['messenger', 'whatsapp'],
        whatsappPhoneNumberId: '344188022113673',
        creative: { mediaType: 'none', message: 'Bonjour', welcomeMessage: 'Salut !' },
      }),
    );
    expect(s.appels.adsets?.[0]).toMatchObject({
      destination_type: 'MESSAGING_MESSENGER_WHATSAPP',
      optimization_goal: 'CONVERSATIONS',
      promoted_object: { page_id: PAGE.id, whats_app_business_phone_number_id: '344188022113673' },
    });
    const creation = s.appels.adcreatives?.[0] as {
      object_story_spec: {
        link_data: { link: string; page_welcome_message: string; call_to_action: { type: string } };
      };
      asset_feed_spec: { optimization_type: string };
    };
    expect(creation.object_story_spec.link_data).toMatchObject({
      link: 'https://fb.com/messenger_doc/',
      page_welcome_message: 'Salut !',
      call_to_action: { type: 'MESSAGE_PAGE' },
    });
    expect(creation.asset_feed_spec.optimization_type).toBe('DOF_MESSAGING_DESTINATION');
  });

  it('déclare le compte Instagram sur une publicité Instagram ou Facebook', async () => {
    const s = preparer();
    await lancer(
      s,
      donnees({
        destinationType: 'INSTAGRAM_PROFILE',
        page: { ...PAGE, instagramAccountId: '17841' },
      }),
    );
    const spec = s.appels.adcreatives?.[0]?.object_story_spec as { instagram_user_id: string };
    expect(spec.instagram_user_id).toBe('17841');
  });

  it('refuse une publicité Instagram sans compte relié avant tout appel', async () => {
    const s = preparer();
    await expect(lancer(s, donnees({ destinationType: 'INSTAGRAM_PROFILE' }))).rejects.toThrow(
      /compte Instagram/,
    );
    expect(s.graph.calls).toHaveLength(0);
  });
});

describe('updateCampaignStatus', () => {
  const CAMPAGNE = { campaignId: 'C1', adsetId: 'A1', adId: 'AD1', creativeId: null };

  it('propage le statut aux trois niveaux, pas seulement à la campagne', async () => {
    // Activer la seule campagne ne diffuse rien : l'ensemble de publicités et la publicité restent en pause
    // depuis leur création.
    const graph = new FakeGraph(() => ({ success: true }));
    const r = await updateCampaignStatus(graph.client(), 'token', CAMPAGNE, 'active');
    expect(r).toEqual({ status: 'ACTIVE', levels: 3 });
    expect(graph.calls.map((c) => c.path)).toEqual(['C1', 'A1', 'AD1']);
    expect(graph.calls.every((c) => (c.body as { status: string }).status === 'ACTIVE')).toBe(true);
  });

  it('met en pause du plus fin au plus large', async () => {
    const graph = new FakeGraph(() => ({ success: true }));
    await updateCampaignStatus(graph.client(), 'token', CAMPAGNE, 'paused');
    expect(graph.calls.map((c) => c.path)).toEqual(['AD1', 'A1', 'C1']);
    expect(graph.calls.every((c) => (c.body as { status: string }).status === 'PAUSED')).toBe(true);
  });

  it('ignore les niveaux absents des campagnes anciennes', async () => {
    const graph = new FakeGraph(() => ({ success: true }));
    await updateCampaignStatus(
      graph.client(),
      'token',
      { campaignId: 'C1', adsetId: null, adId: null, creativeId: null },
      'active',
    );
    expect(graph.calls).toHaveLength(1);
  });

  it("remonte l'échec plutôt que de laisser croire au succès", async () => {
    const graph = new FakeGraph(() => failure({ message: 'Meta refuse' }));
    await expect(updateCampaignStatus(graph.client(), 'token', CAMPAGNE, 'active')).rejects.toThrow(
      'Meta refuse',
    );
  });
});

describe('deleteCampaignOnMeta — création publicitaire', () => {
  // Relevé réel (8 oct. 2026) : supprimer la campagne laissait la création publicitaire chez Meta (status
  // ACTIVE) — elle s'accumulait dans la bibliothèque du compte.
  it('supprime aussi la création publicitaire enregistrée', async () => {
    const graph = new FakeGraph(() => ({ success: true }));
    expect(
      await deleteCampaignOnMeta(graph.client(), 'jeton', {
        campaignId: 'C1',
        adsetId: null,
        adId: null,
        creativeId: 'CR1',
      }),
    ).toBe(true);
    const chemins = graph.calls.map((c) => c.path);
    expect(chemins).toContain('C1');
    expect(chemins).toContain('CR1');
  });

  it('un échec sur la création ne fait pas échouer la suppression de la campagne', async () => {
    const graph = new FakeGraph((call) =>
      call.path === 'CR1' ? failure({ message: 'création déjà supprimée' }) : { success: true },
    );
    await expect(
      deleteCampaignOnMeta(graph.client(), 'jeton', {
        campaignId: 'C1',
        adsetId: null,
        adId: null,
        creativeId: 'CR1',
      }),
    ).resolves.toBe(true);
  });

  it("renvoie faux sans appeler Meta quand il n'y a aucun identifiant", async () => {
    const graph = new FakeGraph(() => ({}));
    expect(
      await deleteCampaignOnMeta(graph.client(), 'jeton', {
        campaignId: '',
        adsetId: null,
        adId: null,
        creativeId: null,
      }),
    ).toBe(false);
    expect(graph.calls).toHaveLength(0);
  });

  it('remonte le refus de Meta : la trace locale ne doit pas être effacée', async () => {
    const graph = new FakeGraph(() => failure({ message: 'Meta refuse' }));
    await expect(
      deleteCampaignOnMeta(graph.client(), 'jeton', {
        campaignId: 'C1',
        adsetId: null,
        adId: null,
        creativeId: null,
      }),
    ).rejects.toBeInstanceOf(MetaGraphError);
  });
});

describe('patchCampaign', () => {
  it('exige le taux de change : un taux invalide lève une erreur', async () => {
    const graph = new FakeGraph(() => ({}));
    await expect(
      patchCampaign(
        graph.client(),
        'j',
        { campaignId: 'C1', adsetId: 'A1', adId: null, creativeId: null },
        { dailyBudgetUsdCents: 500 },
      ),
    ).rejects.toThrow(/monnaie du compte/);
  });

  const REFS = {
    campaignId: 'C1',
    adsetId: 'A1',
    adId: 'AD1',
    creativeId: null,
    adAccountId: 'act_1',
  };

  it('modifie le nom sur la campagne, le budget et la date de fin sur l’ensemble, dans le fuseau du compte', async () => {
    const graph = new FakeGraph((call) =>
      call.method === 'GET' ? { timezone_name: 'Africa/Douala' } : { success: true },
    );
    await patcher(graph.client(), 'jeton', REFS, {
      name: 'Nouveau',
      dailyBudgetUsdCents: 300,
      endDate: '2026-11-01',
    });
    const posts = graph.calls.filter((c) => c.method === 'POST');
    expect(posts[0]).toMatchObject({ path: 'C1', body: { name: 'Nouveau' } });
    expect(posts[1]).toMatchObject({
      path: 'A1',
      body: { daily_budget: 300, end_time: '2026-11-01T23:59:59+0100' },
    });
  });

  it('refuse un budget sous 1 $, une date illisible, et un ensemble introuvable', async () => {
    const graph = new FakeGraph(() => ({ timezone_name: 'UTC' }));
    await expect(
      patcher(graph.client(), 'j', REFS, { dailyBudgetUsdCents: 50 }),
    ).rejects.toMatchObject({ code: 'budget_too_low' });
    await expect(patcher(graph.client(), 'j', REFS, { endDate: 'demain' })).rejects.toThrow(
      /illisible/,
    );
    await expect(
      patcher(
        graph.client(),
        'j',
        { campaignId: 'C1', adsetId: 'A1', adId: 'AD1', creativeId: null },
        { endDate: '2026-11-01' },
      ),
    ).rejects.toThrow(/compte publicitaire/);
    await expect(
      patcher(graph.client(), 'j', { ...REFS, adsetId: null }, { dailyBudgetUsdCents: 200 }),
    ).rejects.toThrow(/ensemble de publicités/);
    expect(graph.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it("n'appelle rien quand il n'y a rien à modifier", async () => {
    const graph = new FakeGraph(() => ({}));
    await patcher(graph.client(), 'j', REFS, {});
    expect(graph.calls).toHaveLength(0);
  });
});
