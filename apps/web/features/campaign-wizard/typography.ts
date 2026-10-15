// Typographie des textes écrits par l'Analyste : apostrophe typographique (’) dans les deux langues ; en français,
// espace insécable avant « ? ! : ; » et à l'intérieur des guillemets « », pour qu'un point d'interrogation ne tombe jamais
// seul au début d'une ligne.
const NBSP = '\u00a0';

export function typographic(text: string, locale: string): string {
  const apostrophes = text.replace(/(\p{L})'(\p{L})/gu, '$1’$2');
  if (locale !== 'fr') return apostrophes;
  return apostrophes.replace(/ +([?!:;»])/g, `${NBSP}$1`).replace(/(«) +/g, `$1${NBSP}`);
}
