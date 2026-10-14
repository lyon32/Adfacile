// Garde anti-SSRF pour les médias que le serveur télécharge avant de les envoyer à Meta (SECURITY_NOTES : un
// serveur ne doit jamais aller chercher une adresse choisie par l'utilisateur).
// Trois verrous : (1) liste d'hôtes autorisés OBLIGATOIRE (le stockage de Pubeka) ; (2) schéma http(s) sans
// identifiants dans l'adresse ; (3) aucune adresse IP littérale privée, de bouclage, de lien local ou réservée,
// même si elle figure dans la liste. Les redirections sont refusées par `GraphClient.download`.
// Limite connue : une résolution DNS qui pointerait un nom autorisé vers une adresse interne n'est pas vue ici ;
// la liste doit donc ne contenir que des domaines que Pubeka contrôle.
import { isIP } from 'node:net';
import { AppError } from '@pubeka/contracts';
import { MetaValidationError } from './errors';

function ipv4Octets(address: string): number[] {
  return address.split('.').map(Number);
}

function isPrivateIpv4(address: string): boolean {
  const [a = 0, b = 0, c = 0] = ipv4Octets(address);
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10.0.0.0/8
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 (partage d'adresses des opérateurs)
    a === 127 || // bouclage
    (a === 169 && b === 254) || // lien local, dont les métadonnées des clouds (169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 0 && c === 0) || // 192.0.0.0/24
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15
    a >= 224 // multicast et réservé
  );
}

/** Développe une adresse IPv6 (déjà normalisée par `URL`) en huit groupes. */
function ipv6Groups(address: string): number[] {
  const [head = '', tail] = address.split('::');
  const parse = (part: string): number[] =>
    part === '' ? [] : part.split(':').map((g) => Number.parseInt(g, 16));
  const left = parse(head);
  if (tail === undefined) return left;
  const right = parse(tail);
  return [...left, ...Array.from({ length: 8 - left.length - right.length }, () => 0), ...right];
}

function isPrivateIpv6(address: string): boolean {
  const g = ipv6Groups(address);
  const first = g[0] ?? 0;
  const allZeroUntil = (n: number): boolean => g.slice(0, n).every((x) => x === 0);
  if (allZeroUntil(7) && (g[7] === 0 || g[7] === 1)) return true; // :: et ::1
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 (adresses locales uniques)
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 (lien local)
  if ((first & 0xff00) === 0xff00) return true; // multicast
  // ::ffff:a.b.c.d (IPv4 projetée) : on juge l'IPv4 qu'elle contient.
  if (allZeroUntil(5) && g[5] === 0xffff) {
    return isPrivateIpv4(
      `${String((g[6] ?? 0) >> 8)}.${String((g[6] ?? 0) & 255)}.${String((g[7] ?? 0) >> 8)}.${String((g[7] ?? 0) & 255)}`,
    );
  }
  return false;
}

/** Vrai pour une adresse IP littérale non publique. Un nom de domaine renvoie faux. */
export function isPrivateIpLiteral(hostname: string): boolean {
  const bare = hostname.replace(/^\[|\]$/g, '');
  const version = isIP(bare);
  if (version === 4) return isPrivateIpv4(bare);
  if (version === 6) return isPrivateIpv6(bare.toLowerCase());
  return false;
}

/**
 * Vérifie qu'un média peut être téléchargé.
 * @throws AppError `internal_error` si la liste d'hôtes est absente ou vide (erreur de configuration de l'appelant)
 * @throws MetaValidationError si l'adresse est refusée (le message est affichable, il ne dit pas pourquoi)
 */
export function assertDownloadableMediaUrl(
  mediaUrl: string,
  message: string,
  allowedHosts: readonly string[] | undefined,
): void {
  if (!allowedHosts || allowedHosts.length === 0) {
    throw new AppError('internal_error', {
      cause: new Error(
        'allowedMediaHosts est obligatoire : aucun média ne peut être téléchargé sans liste d’hôtes',
      ),
    });
  }
  // Notamment les URL blob: laissées par un aperçu local du navigateur, que Meta ne peut évidemment pas atteindre.
  if (!/^https?:\/\//i.test(mediaUrl) || !URL.canParse(mediaUrl))
    throw new MetaValidationError(message);
  const url = new URL(mediaUrl);
  if (url.username !== '' || url.password !== '') throw new MetaValidationError(message);
  if (isPrivateIpLiteral(url.hostname)) throw new MetaValidationError(message);
  const hosts = allowedHosts.map((h) => h.toLowerCase());
  if (!hosts.includes(url.hostname.toLowerCase().replace(/^\[|\]$/g, '')))
    throw new MetaValidationError(message);
}

/** Valide la liste d'hôtes d'une configuration (échec explicite si elle est absente ou vide). */
export function assertMediaHostsConfigured(allowedHosts: readonly string[] | undefined): void {
  if (!allowedHosts || allowedHosts.length === 0 || allowedHosts.some((h) => h.trim() === '')) {
    throw new AppError('internal_error', {
      cause: new Error(
        'allowedMediaHosts est obligatoire : fournir les hôtes du stockage de médias de Pubeka',
      ),
    });
  }
}
