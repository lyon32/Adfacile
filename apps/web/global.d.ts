// Types des textes : `t('domaine.ecran.element')` est vérifié à la compilation (next-intl).
import type { Messages } from '@pubeka/i18n';

declare module 'next-intl' {
  interface AppConfig {
    Messages: Messages;
  }
}
