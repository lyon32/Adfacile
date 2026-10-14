// Sections de réglages disponibles (les autres arrivent avec leur session : abonnement S24,
// mes données S34).
export const SETTINGS_SECTIONS = [
  'profil',
  'kit-de-marque',
  'pages',
  'comptes-meta',
  'equipe',
  'notifications',
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export function parseSection(value: string): SettingsSection | null {
  return SETTINGS_SECTIONS.find((section) => section === value) ?? null;
}
