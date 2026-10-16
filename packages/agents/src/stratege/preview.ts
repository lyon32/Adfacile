// Aperçu progressif d'une proposition : quels champs, et avec quelles valeurs, ont le droit d'être MONTRÉS avant la validation
// complète. L'aperçu n'est jamais enregistré ni cru ; mais l'écran ne doit pas montrer, même un instant, une valeur absurde ou
// inventée : un texte avec un nombre ou une adresse hors sources (R3) ou du HTML, un nombre hors bornes (budget, rayon), une
// date passée ou inexistante, une valeur hors des listes fermées.
import { previewSafe, type CopyContext } from './copy-rules';
import type { FieldEvent } from './field-stream';
import { ANGLES, CTAS, DESTINATIONS, OBJECTIVES } from './schema';

type Rule = (value: FieldEvent['value'], ctx: { today: string; context: CopyContext }) => boolean;

const isText: Rule = (value, { context }) =>
  typeof value === 'string' && previewSafe(value, context);
const oneOf =
  (list: readonly string[]): Rule =>
  (value) =>
    typeof value === 'string' && list.includes(value);
const intBetween =
  (min: number, max: number): Rule =>
  (value) =>
    typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
const realDay: Rule = (value, { today }) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value && value >= today
  );
};

const RULES: readonly (readonly [RegExp, Rule])[] = [
  [/^objective$/, oneOf(OBJECTIVES)],
  [/^objective_reason$/, isText],
  [/^destination$/, oneOf(DESTINATIONS)],
  [/^geo\.countries\.\d+$/, (value) => typeof value === 'string' && /^[A-Z]{2}$/.test(value)],
  [/^geo\.cities\.\d+\.name$/, isText],
  [/^geo\.cities\.\d+\.radius_km$/, intBetween(1, 80)],
  [/^geo\.reason$/, isText],
  [/^budget\.daily_usd_cents$/, intBetween(100, 1_000_000)],
  [/^budget\.reason$/, isText],
  [/^schedule\.(start_date|end_date)$/, realDay],
  [/^schedule\.reason$/, isText],
  [/^copy\.(primary_text|headline|description)$/, isText],
  [/^copy\.cta$/, oneOf(CTAS)],
  [/^copy\.angle$/, oneOf(ANGLES)],
];

export function previewAllowed(event: FieldEvent, today: string, context: CopyContext): boolean {
  const rule = RULES.find(([path]) => path.test(event.path));
  return rule?.[1](event.value, { today, context }) === true;
}
