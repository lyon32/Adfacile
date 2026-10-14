import { describe, expect, it, vi } from 'vitest';

// `server-only` refuse d'être chargé hors de React Server : module vide pour ce test.
vi.mock('server-only', () => ({}));

const {
  fakeOutbox,
  fakeTransport,
  invitationMessage,
  invitationTokens,
  resendTransport,
  transportFor,
  usesFakeEmail,
} = await import('./invitation-services');

const email = {
  invitationId: '55555555-5555-4555-8555-555555555555',
  to: 'bob@example.com',
  locale: 'fr' as const,
  workspaceName: 'Boutique Awa',
  inviterName: 'Awa Diop',
  acceptUrl: 'http://app.localhost:5173/invitation#jeton',
  expiresAt: new Date('2026-10-19T09:00:00Z'),
};

describe('jeton d’invitation', () => {
  it('32 octets aléatoires en base64url (43 caractères), hachage SHA-256 stable', () => {
    const a = invitationTokens.create();
    const b = invitationTokens.create();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    expect(invitationTokens.hash('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('invitationMessage', () => {
  it('texte simple en français avec le lien, l’espace et la date d’expiration', () => {
    const m = invitationMessage(email);
    expect(m.to).toBe('bob@example.com');
    expect(m.subject).toBe("Awa Diop t'invite sur Pubeka");
    expect(m.text).toContain('« Boutique Awa »');
    expect(m.text).toContain('http://app.localhost:5173/invitation#jeton');
    expect(m.text).toContain('19 octobre 2026');
    expect(m.idempotencyKey).toBe(`invitation/${email.invitationId}`);
  });

  it('en anglais quand l’invitant utilise l’anglais', () => {
    const m = invitationMessage({ ...email, locale: 'en' });
    expect(m.subject).toBe('Awa Diop invited you to Pubeka');
    expect(m.text).toContain('19 October 2026');
  });
});

describe('transport des e-mails', () => {
  it('Resend : POST /emails avec clé, clé d’idempotence et texte simple', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('{"id":"x"}', { status: 200 })),
    );
    await resendTransport(
      { apiKey: 're_test', from: 'Pubeka <equipe@pubeka.com>' },
      fetchImpl,
    )(invitationMessage(email));
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      authorization: 'Bearer re_test',
      'idempotency-key': `invitation/${email.invitationId}`,
    });
    expect(JSON.parse(typeof init?.body === 'string' ? init.body : '')).toMatchObject({
      from: 'Pubeka <equipe@pubeka.com>',
      to: ['bob@example.com'],
      subject: "Awa Diop t'invite sur Pubeka",
    });
  });

  it('Resend en erreur : exception sans le corps du fournisseur', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('{"message":"secret"}', { status: 422 })),
    );
    await expect(
      resendTransport({ apiKey: 're_x', from: 'a@b.c' }, fetchImpl)(invitationMessage(email)),
    ).rejects.toThrow('Resend : statut 422');
  });

  it('faux fournisseur : `all` ou une liste contenant `email`', () => {
    expect(usesFakeEmail({ PUBEKA_FAKE_PROVIDERS: 'all' })).toBe(true);
    expect(usesFakeEmail({ PUBEKA_FAKE_PROVIDERS: 'meta, email' })).toBe(true);
    expect(usesFakeEmail({ PUBEKA_FAKE_PROVIDERS: 'meta' })).toBe(false);
    expect(usesFakeEmail({})).toBe(false);
  });

  it('choix du transport : faux, Resend, ou refus si rien n’est configuré', async () => {
    expect(transportFor({ PUBEKA_FAKE_PROVIDERS: 'email' })).toBe(fakeTransport);
    expect(transportFor({ RESEND_API_KEY: 're_x', EMAIL_FROM_NOTIFICATIONS: 'a@b.c' })).not.toBe(
      fakeTransport,
    );
    await expect(transportFor({})(invitationMessage(email))).rejects.toThrow('non configuré');
  });

  it('faux fournisseur : garde les 100 derniers messages, sans rien envoyer', async () => {
    fakeOutbox.length = 0;
    for (let i = 0; i < 105; i++)
      await fakeTransport({ ...invitationMessage(email), to: `n${String(i)}@x.io` });
    expect(fakeOutbox).toHaveLength(100);
    expect(fakeOutbox[0]?.to).toBe('n5@x.io');
  });
});
