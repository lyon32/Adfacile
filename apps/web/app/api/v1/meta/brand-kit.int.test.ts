// Kit de marque (F2) contre la pile Supabase locale : les 5 cas de chaque route (API_SPEC §15).
import { randomUUID } from 'node:crypto';
import {
  describeRoute,
  na,
  seedWorkspace,
  testServiceClient,
  type SeededWorkspace,
} from '@pubeka/testing';
import { beforeAll, expect } from 'vitest';
import {
  GET as getBrandKit,
  PUT as putBrandKit,
} from '../workspaces/[workspaceId]/pages/[pageId]/brand-kit/route';
import { call, connectWorkspace, json } from './int-support';

let seeded: SeededWorkspace;

beforeAll(async () => {
  seeded = await seedWorkspace();
});

const pageParams = (workspaceId: string, pageId: string) => ({
  params: Promise.resolve({ workspaceId, pageId }),
});

async function connectedPage() {
  const s = await seedWorkspace();
  await connectWorkspace(s);
  const { data } = await testServiceClient()
    .from('pages')
    .select('id')
    .eq('workspace_id', s.workspace.id)
    .single();
  if (data === null) throw new Error('Page attendue');
  return { s, pageId: data.id };
}

const get = (s: SeededWorkspace, user: SeededWorkspace['owner'], pageId: string) =>
  getBrandKit(
    call('GET', `/workspaces/${s.workspace.id}/pages/${pageId}/brand-kit`, user.headers),
    pageParams(s.workspace.id, pageId),
  );
const put = (s: SeededWorkspace, user: SeededWorkspace['owner'], pageId: string, body: unknown) =>
  putBrandKit(
    call('PUT', `/workspaces/${s.workspace.id}/pages/${pageId}/brand-kit`, user.headers, body),
    pageParams(s.workspace.id, pageId),
  );

const FULL = (workspaceId: string) => ({
  logo_path: `${workspaceId}/logo.png`,
  colors: { primary: '#1A2B3C', secondary: '#ffffff', accent: '#FF8800' },
  font: 'Sora',
  phone: '+237677000000',
  whatsapp: '+237677000001',
  tagline: 'Le goût du quartier',
  tone: 'friendly',
  show_number_on_visuals: false,
});

describeRoute('getBrandKit', {
  success: async () => {
    const { s, pageId } = await connectedPage();
    // Jamais enregistré : valeurs par défaut, pour tout membre.
    for (const user of [s.owner, s.editor, s.viewer]) {
      const res = await get(s, user, pageId);
      expect(res.status).toBe(200);
      expect(await json(res)).toEqual({
        logo_path: null,
        colors: {},
        font: null,
        phone: null,
        whatsapp: null,
        tagline: null,
        tone: null,
        show_number_on_visuals: true,
      });
    }
  },
  unauthenticated: async () => {
    const id = seeded.workspace.id;
    const pageId = randomUUID();
    const res = await getBrandKit(
      call('GET', `/workspaces/${id}/pages/${pageId}/brand-kit`, {}),
      pageParams(id, pageId),
    );
    expect(res.status).toBe(401);
  },
  otherWorkspace: async () => {
    const { s, pageId } = await connectedPage();
    // Page d'un autre espace : 404 dans son espace comme dans le mien.
    expect((await get(s, s.stranger, pageId)).status).toBe(404);
    const res = await getBrandKit(
      call(
        'GET',
        `/workspaces/${s.strangerWorkspace.id}/pages/${pageId}/brand-kit`,
        s.stranger.headers,
      ),
      pageParams(s.strangerWorkspace.id, pageId),
    );
    expect(res.status).toBe(404);
  },
  forbiddenRole: na('tout membre lit le kit de marque (SECURITY_NOTES §2.3)'),
  invalidBody: na('GET sans corps'),
});

describeRoute('putBrandKit', {
  success: async () => {
    const { s, pageId } = await connectedPage();
    const res = await put(s, s.editor, pageId, FULL(s.workspace.id));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(FULL(s.workspace.id));
    // Relu ensuite par n'importe quel membre ; le propriétaire peut le remplacer (champs absents → vides).
    expect(await json(await get(s, s.viewer, pageId))).toEqual(FULL(s.workspace.id));
    const replaced = await put(s, s.owner, pageId, { tagline: 'Nouveau slogan' });
    expect(await json(replaced)).toMatchObject({
      tagline: 'Nouveau slogan',
      logo_path: null,
      colors: {},
      tone: null,
      show_number_on_visuals: true,
    });
  },
  unauthenticated: async () => {
    const id = seeded.workspace.id;
    const pageId = randomUUID();
    const res = await putBrandKit(
      call('PUT', `/workspaces/${id}/pages/${pageId}/brand-kit`, {}, {}),
      pageParams(id, pageId),
    );
    expect(res.status).toBe(401);
  },
  otherWorkspace: async () => {
    const { s, pageId } = await connectedPage();
    const res = await put(s, s.stranger, pageId, { tagline: 'Piraté' });
    expect(res.status).toBe(404);
    const other = await putBrandKit(
      call(
        'PUT',
        `/workspaces/${s.strangerWorkspace.id}/pages/${pageId}/brand-kit`,
        s.stranger.headers,
        {
          tagline: 'Piraté',
        },
      ),
      pageParams(s.strangerWorkspace.id, pageId),
    );
    expect(other.status).toBe(404);
    const rows = await testServiceClient()
      .from('brand_kits')
      .select('page_id')
      .eq('page_id', pageId);
    expect(rows.data).toEqual([]);
  },
  forbiddenRole: async () => {
    const { s, pageId } = await connectedPage();
    const res = await put(s, s.viewer, pageId, { tagline: 'Non' });
    expect(res.status).toBe(403);
    expect((await json(res)).code).toBe('role_insufficient');
  },
  invalidBody: async () => {
    const { s, pageId } = await connectedPage();
    const bad: unknown[] = [
      { colors: { primary: 'rouge' } },
      { colors: { primary: '#12345' } },
      { colors: { fond: '#123456' } },
      { phone: '0677000000' },
      { whatsapp: '+0123' },
      { tagline: 'x'.repeat(121) },
      { font: 'x'.repeat(61) },
      { tone: 'agressif' },
      { show_number_on_visuals: 'oui' },
      { inconnu: true },
      // Le logo doit être un fichier de CET espace (jamais celui d'un autre, jamais ../).
      { logo_path: `${randomUUID()}/logo.png` },
      { logo_path: `${s.workspace.id}/../autre/logo.png` },
      { logo_path: 'logo.png' },
      { logo_path: `${s.workspace.id}/` },
    ];
    for (const body of bad) expect((await put(s, s.owner, pageId, body)).status).toBe(400);
    const none = await testServiceClient()
      .from('brand_kits')
      .select('page_id')
      .eq('page_id', pageId);
    expect(none.data).toEqual([]);
  },
  extra: {
    'un espace en lecture seule refuse l’enregistrement (403 workspace_read_only)': async () => {
      const { s, pageId } = await connectedPage();
      await testServiceClient()
        .from('workspaces')
        .update({ status: 'read_only' })
        .eq('id', s.workspace.id);
      const res = await put(s, s.owner, pageId, { tagline: 'Non' });
      expect(res.status).toBe(403);
      expect((await json(res)).code).toBe('workspace_read_only');
    },
  },
});
