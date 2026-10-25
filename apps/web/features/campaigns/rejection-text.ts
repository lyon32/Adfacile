// Surlignage de l'élément en cause (APPFLOW §12.2) : retrouve l'extrait cité par le Modérateur dans le texte de la pub.
// La recherche ignore la casse, les espaces multiples et les apostrophes typographiques (le serveur compare de la même façon).

const APOSTROPHES = /['‘’ʼ]/;
const QUOTES = /["“”«»]/;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface TextParts {
  before: string;
  match: string;
  after: string;
}

/** Coupe `text` autour de `excerpt` ; `null` si l'extrait n'y figure pas (rien n'est surligné, jamais deviné). */
export function splitAtExcerpt(text: string, excerpt: string | null): TextParts | null {
  if (excerpt === null || excerpt.trim() === '') return null;
  const pattern = Array.from(excerpt.trim())
    .map((char) => {
      if (/\s/.test(char)) return '\\s+';
      if (APOSTROPHES.test(char)) return "['‘’ʼ]";
      if (QUOTES.test(char)) return '["“”«»]';
      return escapeRegExp(char);
    })
    // Des espaces consécutifs dans l'extrait ne doivent produire qu'une seule exigence.
    .join('')
    .replace(/(\\s\+)+/g, '\\s+');
  const found = new RegExp(pattern, 'iu').exec(text);
  if (found === null) return null;
  return {
    before: text.slice(0, found.index),
    match: found[0],
    after: text.slice(found.index + found[0].length),
  };
}
