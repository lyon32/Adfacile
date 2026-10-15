// Adresses publiques et non publiques (anti-SSRF : EC-SRC-01, TR-SEC-08 voisin, SECURITY_NOTES §3.2).
import { describe, expect, it } from 'vitest';
import { isPublicAddress } from './ip-guard';

describe('isPublicAddress', () => {
  it.each([
    '127.0.0.1',
    '127.255.255.254',
    '10.0.0.1',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254', // métadonnées AWS, GCP, Azure
    '100.64.0.1',
    '0.0.0.0',
    '192.0.0.8',
    '198.18.0.1',
    '224.0.0.1',
    '240.0.0.1',
    '255.255.255.255',
    '192.0.2.1',
    '203.0.113.5',
  ])('EC-SRC-01 : %s (IPv4 non publique) est refusée', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '172.15.255.255',
    '172.32.0.1',
    '41.202.207.1',
    '100.63.255.255',
    '169.253.1.1',
  ])('%s (IPv4 publique) est acceptée', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it.each([
    '::',
    '::1',
    'fe80::1',
    'fc00::1',
    'fd00:ec2::254', // métadonnées AWS en IPv6
    'ff02::1',
    'fec0::1',
    '::ffff:127.0.0.1', // IPv4 de bouclage projetée
    '::ffff:7f00:1',
    '::ffff:10.0.0.1',
    '::ffff:169.254.169.254',
    '64:ff9b::7f00:1', // NAT64 vers 127.0.0.1
    '64:ff9b::a9fe:a9fe', // NAT64 vers 169.254.169.254
    '2002:7f00:0001::1', // 6to4 vers 127.0.0.1
    '2002:0a00:0001::1', // 6to4 vers 10.0.0.1
    '2001:db8::1',
    '2001::1', // Teredo
    '100::1',
    '[::1]',
  ])('EC-SRC-01 : %s (IPv6 non publique ou cachant une IPv4 interne) est refusée', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([
    '2606:4700:4700::1111',
    '2a00:1450:4007:80b::200e',
    '::ffff:8.8.8.8',
    '64:ff9b::808:808',
    '2002:0808:0808::1',
  ])('%s (IPv6 publique) est acceptée', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it('une chaîne qui n’est pas une adresse IP est refusée (jamais « publique par défaut »)', () => {
    for (const value of [
      'example.com',
      '',
      '999.1.1.1',
      '1.2.3',
      '::g',
      '1.2.3.4.5',
      '0x7f.0.0.1',
    ]) {
      expect(isPublicAddress(value)).toBe(false);
    }
  });
});
