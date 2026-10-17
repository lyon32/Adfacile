// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NOTIFICATION_TYPES } from '@pubeka/core';
import { messagesFor, type Locale } from '@pubeka/i18n';
import { ApiError } from '../../lib/api';
import {
  NOTIFICATION_TYPE_IDS,
  NotificationsForm,
  toggled,
  type Preference,
} from './notifications-form';
import { ProfileForm, ProfileFormSchema, toPatch, type ProfileFormValues } from './profile-form';
import { parseSection } from './sections';
import { TeamPanel, errorKey, memberLabel } from './team-panel';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/reglages/profil',
}));

function wrap(node: React.ReactNode, locale: Locale = 'fr') {
  return render(
    <NextIntlClientProvider locale={locale} messages={messagesFor(locale)}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        {node}
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const profile: ProfileFormValues = {
  first_name: 'Awa',
  last_name: 'Ndiaye',
  phone: '',
  country_code: 'CM',
  city: 'Douala',
  currency_display: 'XAF',
  ui_language: 'fr',
  theme: 'light',
};

describe('profil', () => {
  it('même contrôle que PATCH /me : téléphone international, noms de 80 caractères au plus', () => {
    expect(ProfileFormSchema.safeParse(profile).success).toBe(true);
    expect(ProfileFormSchema.safeParse({ ...profile, phone: '+237612345678' }).success).toBe(true);
    const bad = ProfileFormSchema.safeParse({
      ...profile,
      phone: '0612',
      first_name: 'a'.repeat(81),
    });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues.map((i) => i.message).sort()).toEqual([
      'name_too_long',
      'phone_invalid',
    ]);
  });

  it('S15b : la monnaie d’affichage est un code ISO 4217 (NGN accepté), jamais une minuscule ni un code mal formé', () => {
    expect(ProfileFormSchema.safeParse({ ...profile, currency_display: 'NGN' }).success).toBe(true);
    expect(ProfileFormSchema.safeParse({ ...profile, currency_display: 'ngn' }).success).toBe(
      false,
    );
    expect(ProfileFormSchema.safeParse({ ...profile, currency_display: 'NGNN' }).success).toBe(
      false,
    );
  });

  it('S15b : pour le Nigeria, le formulaire propose le naira, pour le Cameroun les deux FCFA', () => {
    const countries = [
      { code: 'CM', name: 'Cameroun', currency: 'XAF' },
      { code: 'NG', name: 'Nigeria', currency: 'NGN' },
    ];
    wrap(
      <ProfileForm
        email="a@example.test"
        countries={countries}
        initial={{ ...profile, country_code: 'NG', currency_display: 'NGN' }}
      />,
    );
    const select = screen.getByLabelText<HTMLSelectElement>('Monnaie d’affichage');
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['NGN']);
    fireEvent.change(screen.getByLabelText('Pays'), { target: { value: 'CM' } });
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['XAF', 'XOF']);
    expect(select.value).toBe('XAF');
  });

  it('le corps envoyé omet un téléphone vide', () => {
    expect('phone' in toPatch(profile)).toBe(false);
    expect(toPatch({ ...profile, phone: '+237612345678' }).phone).toBe('+237612345678');
  });

  it('seules trois sections existent encore', () => {
    expect(parseSection('equipe')).toBe('equipe');
    expect(parseSection('abonnement')).toBeNull();
  });
});

describe('notifications (APPFLOW §14, §16)', () => {
  it('les 12 types du client sont ceux du serveur', () => {
    expect([...NOTIFICATION_TYPE_IDS]).toEqual([...NOTIFICATION_TYPES]);
  });

  const initial: Preference[] = NOTIFICATION_TYPE_IDS.map((type) => ({
    type,
    in_app: true,
    email: true,
  }));

  it('bascule un seul canal d’un seul type', () => {
    const next = toggled(initial, 'weekly_summary', 'email');
    expect(next.find((p) => p.type === 'weekly_summary')).toEqual({
      type: 'weekly_summary',
      in_app: true,
      email: false,
    });
    expect(next.filter((p) => !p.email)).toHaveLength(1);
  });

  it('un clic enregistre par PUT, un échec rétablit l’interrupteur et prévient', async () => {
    let sent = '';
    vi.stubGlobal('fetch', (_url: string, init?: RequestInit) => {
      sent = typeof init?.body === 'string' ? init.body : '';
      return Promise.resolve(new Response('x', { status: 503 }));
    });
    wrap(<NotificationsForm initial={initial} />);
    const toggle = screen.getByRole('switch', { name: 'Résumé du lundi : E-mail' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    await screen.findByRole('alert');
    expect((JSON.parse(sent) as { data: unknown[] }).data).toHaveLength(12);
    await waitFor(() => {
      expect(
        screen
          .getByRole('switch', { name: 'Résumé du lundi : E-mail' })
          .getAttribute('aria-checked'),
      ).toBe('true');
    });
  });
});

describe('équipe', () => {
  const members = {
    data: [
      { profile_id: 'p1', email: 'awa@example.test', name: 'Awa', role: 'owner' },
      { profile_id: 'p2', email: 'moussa@example.test', role: 'editor' },
    ],
  };

  it('libellé d’un membre : nom, sinon e-mail, sinon identifiant', () => {
    expect(memberLabel({ profile_id: 'p', name: 'Awa', email: 'a@b.c' })).toBe('Awa');
    expect(memberLabel({ profile_id: 'p', email: 'a@b.c' })).toBe('a@b.c');
    expect(memberLabel({ profile_id: 'p' })).toBe('p');
  });

  it('erreurs de l’API : codes connus, rôle insuffisant = forbidden, le reste = generic', () => {
    expect(errorKey(new ApiError(402, { code: 'member_limit_reached' } as never))).toBe(
      'member_limit_reached',
    );
    expect(errorKey(new ApiError(403, { code: 'role_insufficient' } as never))).toBe('forbidden');
    expect(errorKey(new Error('réseau'))).toBe('generic');
  });

  it('le propriétaire voit le compte, peut inviter et retirer', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json(members)));
    wrap(<TeamPanel workspaceId="w1" isOwner membersLimit={2} />);
    expect(await screen.findByText('2 sur 2 membres')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Inviter' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retirer moussa@example.test' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retirer Awa' })).toBeNull();
  });

  it('un invité n’a ni formulaire ni boutons de retrait', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json(members)));
    wrap(<TeamPanel workspaceId="w1" isOwner={false} membersLimit={2} />);
    await screen.findByText('2 sur 2 membres');
    expect(screen.queryByRole('button', { name: 'Inviter' })).toBeNull();
    expect(screen.getByText('Seul le propriétaire invite et retire des membres.')).toBeTruthy();
  });

  it('l’invitation part au serveur et le refus de limite s’affiche en clair', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (init?.method === 'POST') {
        return Promise.resolve(
          Response.json(
            { type: 'x', title: 'x', status: 402, code: 'member_limit_reached', request_id: 'r' },
            { status: 402 },
          ),
        );
      }
      return Promise.resolve(Response.json(members));
    });
    wrap(<TeamPanel workspaceId="w1" isOwner membersLimit={2} />);
    await screen.findByText('2 sur 2 membres');
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'nouveau@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Inviter' }));
    expect(
      await screen.findByText('Tu as atteint la limite de membres de ta formule.'),
    ).toBeTruthy();
    expect(calls).toContain('POST /api/v1/workspaces/w1/invitations');
  });

  it('TR-PLT-03 : en anglais, aucun texte français', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json(members)));
    wrap(<TeamPanel workspaceId="w1" isOwner membersLimit={2} />, 'en');
    await screen.findByText('2 of 2 members');
    expect(document.body.textContent).not.toMatch(/Propriétaire|Inviter|Retirer|membres/);
  });
});
