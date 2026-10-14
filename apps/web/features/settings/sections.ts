// Sections de réglages disponibles (les autres arrivent avec leur session : kit de marque et
// Pages S11, abonnement S24, mes données S34).
export const SETTINGS_SECTIONS = ['profil', 'comptes-meta', 'equipe', 'notifications'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export function parseSection(value: string): SettingsSection | null {
  return SETTINGS_SECTIONS.find((section) => section === value) ?? null;
}
