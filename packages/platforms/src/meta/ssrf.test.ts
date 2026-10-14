import { describe, expect, it } from 'vitest';
import { AppError } from '@pubeka/contracts';
import { MetaValidationError } from './errors';
import { assertDownloadableMediaUrl, assertMediaHostsConfigured, isPrivateIpLiteral } from './ssrf';

const MSG = 'refusé';
const HOSTS = ['storage.pubeka.test'];
const verifierAvec = (url: string, hosts: readonly string[] | undefined): void => {
  assertDownloadableMediaUrl(url, MSG, hosts);
};
const verifier = (url: string, hosts: readonly string[] = HOSTS): void => {
  verifierAvec(url, hosts);
};

describe('assertDownloadableMediaUrl — anti-SSRF', () => {
  it('accepte un média d’un hôte autorisé, sans tenir compte de la casse', () => {
    expect(() => {
      verifier('https://storage.pubeka.test/ad/a.png?token=1');
    }).not.toThrow();
    expect(() => {
      verifier('HTTPS://Storage.Pubeka.TEST/a.png');
    }).not.toThrow();
  });

  it.each([undefined, []])(
    'exige une liste d’hôtes : %j → erreur de configuration explicite',
    (hosts) => {
      let erreur: unknown = null;
      try {
        verifierAvec('https://storage.pubeka.test/a.png', hosts);
      } catch (error) {
        erreur = error;
      }
      expect(erreur).toBeInstanceOf(AppError);
      expect(erreur).toMatchObject({ code: 'internal_error' });
      expect(String((erreur as AppError).cause)).toMatch(/allowedMediaHosts/);
    },
  );

  it.each([
    'https://exemple.com/a.png',
    'https://storage.pubeka.test.evil.com/a.png',
    'https://evil.com/storage.pubeka.test/a.png',
    'ftp://storage.pubeka.test/a.png',
    'file:///etc/passwd',
    'blob:http://localhost:5173/abc',
    'javascript:alert(1)',
    'http://[bad',
    'https://user:motdepasse@storage.pubeka.test/a.png',
    'https://user@storage.pubeka.test/a.png',
  ])('refuse %s', (url) => {
    expect(() => {
      verifier(url);
    }).toThrow(MetaValidationError);
  });

  it.each([
    'http://169.254.169.254/latest/meta-data',
    'http://127.0.0.1/a.png',
    'http://127.1/a.png',
    'http://2130706433/a.png',
    'http://0x7f.0.0.1/a.png',
    'http://10.0.0.5/a.png',
    'http://172.16.0.1/a.png',
    'http://172.31.255.255/a.png',
    'http://192.168.1.10/a.png',
    'http://100.64.0.1/a.png',
    'http://0.0.0.0/a.png',
    'http://[::1]/a.png',
    'http://[::]/a.png',
    'http://[fe80::1]/a.png',
    'http://[fd12:3456::1]/a.png',
    'http://[::ffff:127.0.0.1]/a.png',
    'http://[::ffff:169.254.169.254]/a.png',
  ])('refuse l’IP littérale non publique %s même si elle est dans la liste', (url) => {
    const host = new URL(url).hostname;
    expect(() => {
      verifier(url, [host, host.replace(/^\[|\]$/g, '')]);
    }).toThrow(MetaValidationError);
  });

  it('autorise une IP publique littérale uniquement si elle est dans la liste', () => {
    expect(() => {
      verifier('https://93.184.216.34/a.png', ['93.184.216.34']);
    }).not.toThrow();
    expect(() => {
      verifier('https://93.184.216.34/a.png');
    }).toThrow(MetaValidationError);
  });
});

describe('isPrivateIpLiteral', () => {
  it('reconnaît les frontières des plages privées et laisse passer les adresses publiques', () => {
    for (const ip of [
      '172.15.0.1',
      '172.32.0.1',
      '100.63.255.255',
      '100.128.0.1',
      '169.253.0.1',
      '8.8.8.8',
      '1.1.1.1',
    ]) {
      expect(isPrivateIpLiteral(ip)).toBe(false);
    }
    for (const ip of [
      '172.16.0.0',
      '172.31.0.1',
      '100.64.0.0',
      '100.127.255.255',
      '198.18.0.1',
      '224.0.0.1',
      '255.255.255.255',
    ]) {
      expect(isPrivateIpLiteral(ip)).toBe(true);
    }
    expect(isPrivateIpLiteral('2606:4700::1111')).toBe(false);
    expect(isPrivateIpLiteral('[ff02::1]')).toBe(true);
    expect(isPrivateIpLiteral('::ffff:8.8.8.8')).toBe(false);
  });

  it('un nom de domaine n’est jamais une IP littérale', () => {
    expect(isPrivateIpLiteral('localhost')).toBe(false);
    expect(isPrivateIpLiteral('storage.pubeka.test')).toBe(false);
  });
});

describe('assertMediaHostsConfigured', () => {
  it('échoue si la liste est absente, vide ou contient une entrée vide', () => {
    expect(() => {
      assertMediaHostsConfigured(undefined);
    }).toThrow(AppError);
    expect(() => {
      assertMediaHostsConfigured([]);
    }).toThrow(AppError);
    expect(() => {
      assertMediaHostsConfigured(['a.test', ' ']);
    }).toThrow(AppError);
    expect(() => {
      assertMediaHostsConfigured(['a.test']);
    }).not.toThrow();
  });
});
