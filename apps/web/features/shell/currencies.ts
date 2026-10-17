// Monnaie d'affichage (profil, première configuration). Pur, sans accès serveur.
// Zone franc CFA (XAF, XOF) : le choix entre les deux FCFA est conservé (PRD §5). Tout autre pays : la monnaie de son pays.
import type { Locale } from '@pubeka/i18n';

const CFA = ['XAF', 'XOF'] as const;

export function currencyLabel(code: string, locale: Locale): string {
  if (code === 'XAF' || code === 'XOF') return `FCFA (${code})`;
  const name = new Intl.DisplayNames([locale], { type: 'currency' }).of(code);
  return `${name === undefined || name === code ? code : name} (${code})`;
}

export function currencyOptions(
  countryCurrency: string,
  locale: Locale,
): { value: string; label: string }[] {
  const codes = (CFA as readonly string[]).includes(countryCurrency)
    ? [countryCurrency, ...CFA.filter((c) => c !== countryCurrency)]
    : [countryCurrency];
  return codes.map((value) => ({ value, label: currencyLabel(value, locale) }));
}
