// Adresses IP publiques (anti-SSRF, SECURITY_NOTES §3.2 « URL fournie par l'utilisateur », LLD §6.11).
// Liste d'autorisation pour l'IPv6 (seul 2000::/3, l'adresse globale, passe, moins les plages réservées) et liste
// d'exclusion pour l'IPv4 (toutes les plages privées, réservées ou de documentation). Une adresse IPv4 cachée dans
// une IPv6 (projetée, NAT64, 6to4) est jugée sur l'IPv4 qu'elle contient.
import { isIP } from 'node:net';

type Cidr4 = readonly [number, number, number, number, number];

const BLOCKED_V4: readonly Cidr4[] = [
  [0, 0, 0, 0, 8], // « ce réseau »
  [10, 0, 0, 0, 8], // privé
  [100, 64, 0, 0, 10], // partage d'adresses des opérateurs
  [127, 0, 0, 0, 8], // bouclage
  [168, 63, 129, 16, 32], // WireServer d'Azure (métadonnées des machines virtuelles)
  [169, 254, 0, 0, 16], // lien local, dont les métadonnées des clouds (169.254.169.254)
  [172, 16, 0, 0, 12], // privé
  [192, 0, 0, 0, 24], // protocoles IETF
  [192, 0, 2, 0, 24], // documentation
  [192, 88, 99, 0, 24], // 6to4 relais (obsolète)
  [192, 168, 0, 0, 16], // privé
  [198, 18, 0, 0, 15], // tests de performance
  [198, 51, 100, 0, 24], // documentation
  [203, 0, 113, 0, 24], // documentation
  [224, 0, 0, 0, 4], // multicast
  [240, 0, 0, 0, 4], // réservé, dont 255.255.255.255
];

function parseV4(address: string): number[] | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : Number.NaN));
  return octets.every((o) => o >= 0 && o <= 255) ? octets : null;
}

function inCidr(octets: readonly number[], [a, b, c, d, bits]: Cidr4): boolean {
  const value =
    (((octets[0] ?? 0) << 24) |
      ((octets[1] ?? 0) << 16) |
      ((octets[2] ?? 0) << 8) |
      (octets[3] ?? 0)) >>>
    0;
  const base = ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) === (base & mask);
}

function isPublicV4(address: string): boolean {
  const octets = parseV4(address);
  if (octets === null) return false;
  return !BLOCKED_V4.some((cidr) => inCidr(octets, cidr));
}

/** Huit groupes de 16 bits ; accepte `::` et une fin en IPv4 pointée. `null` si l'adresse est illisible. */
function groupsV6(address: string): number[] | null {
  let text = address.toLowerCase().split('%')[0] ?? '';
  const dotted = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (dotted?.[1] !== undefined) {
    const v4 = parseV4(dotted[1]);
    if (v4 === null) return null;
    const hi = (((v4[0] ?? 0) << 8) | (v4[1] ?? 0)).toString(16);
    const lo = (((v4[2] ?? 0) << 8) | (v4[3] ?? 0)).toString(16);
    text = `${text.slice(0, text.length - dotted[1].length)}${hi}:${lo}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string): number[] | null => {
    if (part === '') return [];
    const groups = part
      .split(':')
      .map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? Number.parseInt(g, 16) : Number.NaN));
    return groups.some(Number.isNaN) ? null : groups;
  };
  const left = parse(halves[0] ?? '');
  const right = halves.length === 2 ? parse(halves[1] ?? '') : [];
  if (left === null || right === null) return null;
  if (halves.length === 1) return left.length === 8 ? left : null;
  const missing = 8 - left.length - right.length;
  if (missing < 1) return null;
  return [...left, ...Array.from({ length: missing }, () => 0), ...right];
}

function v4FromGroups(hi: number, lo: number): string {
  return `${String(hi >> 8)}.${String(hi & 255)}.${String(lo >> 8)}.${String(lo & 255)}`;
}

function isPublicV6(address: string): boolean {
  const g = groupsV6(address);
  if (g === null) return false;
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = g;
  // ::ffff:a.b.c.d (IPv4 projetée) : on juge l'IPv4 contenue.
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    return isPublicV4(v4FromGroups(g6, g7));
  }
  // 64:ff9b::/96 (NAT64) : l'IPv4 contenue décide ; 64:ff9b:1::/48 (usage local) refusé.
  if (g0 === 0x64 && g1 === 0xff9b) {
    return g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0 && isPublicV4(v4FromGroups(g6, g7));
  }
  // 2002::/16 (6to4) : l'IPv4 est dans les groupes 1 et 2.
  if (g0 === 0x2002) return isPublicV4(v4FromGroups(g1, g2));
  // Liste d'autorisation : seulement l'adresse globale 2000::/3.
  if (g0 < 0x2000 || g0 > 0x3fff) return false;
  if (g0 === 0x2001 && g1 < 0x200) return false; // 2001::/23 : Teredo, tests, protocoles IETF
  if (g0 === 0x2001 && g1 === 0xdb8) return false; // documentation
  if (g0 === 0x3fff && g1 <= 0x0fff) return false; // 3fff::/20 documentation
  return true;
}

/** Vrai si `address` est une adresse IP littérale publique. Une chaîne qui n'est pas une IP renvoie faux. */
export function isPublicAddress(address: string): boolean {
  const bare = address.replace(/^\[|\]$/g, '');
  if (bare.includes('%')) return false; // identifiant de zone IPv6 : jamais accepté
  const version = isIP(bare);
  if (version === 4) return isPublicV4(bare);
  if (version === 6) return isPublicV6(bare);
  return false;
}
