// `assertPublicUrl` (LLD §6.11, SECURITY_NOTES §3.2, EC-SRC-01) : une adresse choisie par l'utilisateur n'est
// ouverte par le serveur que si elle est publique. Contrôles, dans l'ordre :
//   1. forme : ≤ 2 048 caractères, http ou https, aucun identifiant (`user:pass@`), port 80 ou 443 seulement ;
//   2. nom : ni `localhost`, ni domaine interne (`.local`, `.internal`, `.localdomain`, métadonnées) ;
//   3. adresse : une IP littérale doit être publique ; un nom est résolu et TOUTES ses adresses doivent l'être.
// Protection contre le rebinding DNS : la résolution est faite ICI, une seule fois, et la connexion se fait sur
// l'adresse validée (`PublicTarget.addresses`), jamais sur une seconde résolution du nom (`safe-fetch.ts`).
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { AppError } from '@pubeka/contracts';
import { isPublicAddress } from './ip-guard';

export const MAX_URL_LENGTH = 2048;

export type DnsResolver = (hostname: string) => Promise<string[]>;

/** Toutes les adresses (IPv4 et IPv6) d'un nom, telles que le système les rend. */
export const systemResolver: DnsResolver = async (hostname) => {
  const found = await lookup(hostname, { all: true, verbatim: true });
  return found.map((entry) => entry.address);
};

export interface PublicTarget {
  url: URL;
  /** Adresses publiques validées : la connexion se fait sur l'une d'elles. */
  addresses: string[];
}

const INTERNAL_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.localdomain',
  '.lan',
  '.home.arpa',
];
const INTERNAL_NAMES = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'instance-data',
]);

function unsafe(reason: string): AppError {
  // Le motif part dans `meta` (journal) ; l'écran ne dit pas pourquoi (« Ce lien ne peut pas être lu »).
  return new AppError('unsafe_url', { meta: { reason } });
}

function parse(raw: string | URL): URL {
  if (typeof raw !== 'string') return raw;
  if (raw.length > MAX_URL_LENGTH) throw unsafe('too_long');
  try {
    return new URL(raw);
  } catch {
    throw unsafe('invalid_url');
  }
}

/** Vérifie la forme et le nom, sans réseau. Renvoie le nom d'hôte sans crochets. */
function checkShape(url: URL): string {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw unsafe('scheme');
  if (url.username !== '' || url.password !== '') throw unsafe('credentials');
  if (url.port !== '' && url.port !== '80' && url.port !== '443') throw unsafe('port');
  const host = url.hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();
  if (host === '') throw unsafe('empty_host');
  if (INTERNAL_NAMES.has(host) || INTERNAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw unsafe('internal_name');
  }
  // Un nom sans point n'est pas un domaine public (nom de machine du réseau interne).
  if (isIP(host) === 0 && !host.includes('.')) throw unsafe('single_label_host');
  return host;
}

/**
 * Valide une adresse et rend les adresses IP publiques sur lesquelles se connecter.
 * @throws AppError `unsafe_url` (adresse refusée) ou `source_unreadable` (nom introuvable)
 */
export async function resolvePublicTarget(
  raw: string | URL,
  resolve: DnsResolver = systemResolver,
): Promise<PublicTarget> {
  const url = parse(raw);
  const host = checkShape(url);

  if (isIP(host) !== 0) {
    if (!isPublicAddress(host)) throw unsafe('private_address');
    return { url, addresses: [host] };
  }

  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch {
    // Nom qui n'existe pas : ce n'est pas une attaque, la source est simplement illisible.
    throw new AppError('source_unreadable', { meta: { reason: 'dns_failure' } });
  }
  if (addresses.length === 0)
    throw new AppError('source_unreadable', { meta: { reason: 'dns_empty' } });
  // Une seule adresse privée parmi les réponses suffit à refuser : l'attaquant choisit laquelle sera utilisée.
  if (!addresses.every((address) => isPublicAddress(address))) throw unsafe('private_address');
  return { url, addresses };
}

/** Signature de LLD §6.11 : l'adresse est publique, sinon `unsafe_url`. */
export async function assertPublicUrl(
  raw: string,
  resolve: DnsResolver = systemResolver,
): Promise<URL> {
  return (await resolvePublicTarget(raw, resolve)).url;
}
