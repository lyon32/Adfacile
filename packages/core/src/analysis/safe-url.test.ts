// `assertPublicUrl` (LLD §6.11, EC-SRC-01) : forme, nom, adresse, résolution DNS (rebinding).
import { AppError } from '@pubeka/contracts';
import { describe, expect, it } from 'vitest';
import { assertPublicUrl, resolvePublicTarget, type DnsResolver } from './safe-url';

const PUBLIC = '93.184.216.34';
const dns =
  (...addresses: string[]): DnsResolver =>
  () =>
    Promise.resolve(addresses);

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    return error instanceof AppError ? error.code : 'autre';
  }
}

describe('assertPublicUrl : adresses acceptées', () => {
  it('rend l’URL d’un site dont toutes les adresses sont publiques (IPv4 et IPv6)', async () => {
    const url = await assertPublicUrl(
      'https://boutique.example.cm/produits?x=1',
      dns(PUBLIC, '2606:4700::1111'),
    );
    expect(url.hostname).toBe('boutique.example.cm');
  });

  it('accepte http et https, les ports 80 et 443 et une IP publique littérale', async () => {
    for (const raw of [
      'http://shop.example.com',
      'https://shop.example.com:443/',
      'http://shop.example.com:80/',
    ]) {
      expect(await codeOf(assertPublicUrl(raw, dns(PUBLIC)))).toBe('ok');
    }
    expect(await codeOf(assertPublicUrl('http://93.184.216.34/', dns()))).toBe('ok');
  });

  it('Un nom de domaine accentué (IDN) est converti en punycode puis résolu', async () => {
    const target = await resolvePublicTarget('https://boutique-été.example.com/', dns(PUBLIC));
    expect(target.url.hostname).toMatch(/^xn--[a-z0-9-]+.example.com$/);
  });
});

describe('assertPublicUrl : EC-SRC-01, refus (unsafe_url)', () => {
  it.each([
    'http://127.0.0.1/',
    'http://localhost/',
    'http://LOCALHOST./',
    'http://app.localhost/',
    'http://10.1.2.3/admin',
    'http://192.168.0.1/',
    'http://172.16.5.5/',
    'http://169.254.169.254/latest/meta-data/',
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://[::1]/',
    'http://[fd00:ec2::254]/',
    'http://[::ffff:127.0.0.1]/',
    'http://2130706433/', // 127.0.0.1 en décimal : normalisé par URL
    'http://0x7f000001/', // en hexadécimal
    'http://0177.0.0.1/', // en octal
    'http://127.1/', // forme abrégée
    'http://0.0.0.0/',
    'http://intranet/', // nom de machine sans point
    'http://printer.local/',
    'http://db.internal/',
    'http://router.lan/',
  ])('%s est refusée', async (raw) => {
    expect(await codeOf(assertPublicUrl(raw, dns(PUBLIC)))).toBe('unsafe_url');
  });

  it.each([
    'ftp://example.com/',
    'file:///etc/passwd',
    'gopher://example.com/',
    'javascript:alert(1)',
    'data:text/html,<script>',
    'ws://example.com/',
    'https://user:pass@example.com/',
    'https://user@example.com/',
    'https://example.com:22/',
    'https://example.com:8080/',
    'https://example.com:3306/',
    'pas une adresse',
    '',
  ])('%s est refusée (schéma, identifiants, port inhabituel ou illisible)', async (raw) => {
    expect(await codeOf(assertPublicUrl(raw, dns(PUBLIC)))).toBe('unsafe_url');
  });

  it('une adresse de plus de 2 048 caractères est refusée', async () => {
    expect(
      await codeOf(assertPublicUrl(`https://example.com/${'a'.repeat(2100)}`, dns(PUBLIC))),
    ).toBe('unsafe_url');
  });

  it('rebinding DNS : un nom qui se résout vers une adresse privée est refusé', async () => {
    expect(await codeOf(assertPublicUrl('https://evil.example.com/', dns('10.0.0.5')))).toBe(
      'unsafe_url',
    );
    expect(await codeOf(assertPublicUrl('https://evil.example.com/', dns('::1')))).toBe(
      'unsafe_url',
    );
  });

  it('rebinding DNS : une seule adresse privée parmi des adresses publiques suffit à refuser', async () => {
    expect(
      await codeOf(assertPublicUrl('https://evil.example.com/', dns(PUBLIC, '169.254.169.254'))),
    ).toBe('unsafe_url');
  });

  it('rebinding DNS : le serveur se connecte sur l’adresse validée, la résolution n’est faite qu’une fois', async () => {
    let calls = 0;
    const flipping: DnsResolver = () => {
      calls += 1;
      return Promise.resolve(calls === 1 ? [PUBLIC] : ['127.0.0.1']);
    };
    const target = await resolvePublicTarget('https://evil.example.com/', flipping);
    expect(target.addresses).toEqual([PUBLIC]);
    expect(calls).toBe(1);
  });
});

describe('assertPublicUrl : nom introuvable', () => {
  it('un nom qui n’existe pas n’est pas une attaque : source_unreadable', async () => {
    const failing: DnsResolver = () => Promise.reject(new Error('ENOTFOUND'));
    expect(await codeOf(assertPublicUrl('https://nexiste-pas.example.com/', failing))).toBe(
      'source_unreadable',
    );
    expect(await codeOf(assertPublicUrl('https://vide.example.com/', dns()))).toBe(
      'source_unreadable',
    );
  });

  it('le motif du refus est journalisé (meta.reason) sans être affiché', async () => {
    try {
      await assertPublicUrl('http://127.0.0.1/', dns());
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).opts.meta).toEqual({ reason: 'private_address' });
    }
  });
});
