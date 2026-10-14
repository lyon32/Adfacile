// Destinations de messagerie — Messenger, Instagram Direct, WhatsApp.
// Porté de backend/src/services/messagingDestinations.js (comportement inchangé).
//
// Meta traite « une publicité qui ouvre une conversation » comme un produit à part entière :
// l'ensemble de publicités, l'objectif d'optimisation et le bouton d'appel à l'action doivent être
// cohérents entre eux, sinon la publicité est refusée à la relecture avec l'erreur #1815675
// (« Publicité non-Messenger dans un ensemble de publicités Messenger »).
//
// Ce module est la source unique de cette cohérence : il traduit les cases cochées par l'utilisateur
// en le triplet exigé par Meta, et refuse en amont les combinaisons que Meta rejetterait.
//
// Référence : Marketing API › Messaging Ads › Click to Multidestination.

/** Applications de messagerie proposées, dans l'ordre d'affichage. */
export const MESSAGING_APPS = ['messenger', 'instagram', 'whatsapp'] as const;
export type MessagingApp = (typeof MESSAGING_APPS)[number];

/** destination_type attendu par Meta ; la clé est la liste des applications triée alphabétiquement. */
export const DESTINATION_TYPE_BY_COMBO: Readonly<Record<string, string>> = {
  messenger: 'MESSENGER',
  whatsapp: 'WHATSAPP',
  instagram: 'INSTAGRAM_DIRECT',
  'instagram+messenger': 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER',
  'messenger+whatsapp': 'MESSAGING_MESSENGER_WHATSAPP',
  'instagram+whatsapp': 'MESSAGING_INSTAGRAM_DIRECT_WHATSAPP',
  'instagram+messenger+whatsapp': 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP',
};

interface CallToActionSpec {
  type: string;
  app_destination: string;
  link: string;
}

/**
 * Bouton d'appel à l'action et lien associés à chaque application. Le lien n'est pas une
 * destination réelle : Meta l'exige pour la forme et redirige en fait vers la conversation
 * indiquée par app_destination.
 */
export const CALL_TO_ACTION_BY_APP: Readonly<Record<MessagingApp, CallToActionSpec>> = {
  messenger: {
    type: 'MESSAGE_PAGE',
    app_destination: 'MESSENGER',
    link: 'https://fb.com/messenger_doc/',
  },
  whatsapp: {
    type: 'WHATSAPP_MESSAGE',
    app_destination: 'WHATSAPP',
    link: 'https://api.whatsapp.com/send',
  },
  instagram: {
    type: 'INSTAGRAM_MESSAGE',
    app_destination: 'INSTAGRAM_DIRECT',
    link: 'https://www.instagram.com',
  },
};

/**
 * Quand plusieurs applications sont cochées, une seule peut porter le bouton. Messenger d'abord :
 * c'est la seule destination toujours disponible dès qu'une Page existe, donc celle qui ne dépend
 * d'aucun rattachement supplémentaire.
 */
const CALL_TO_ACTION_PRIORITY: readonly MessagingApp[] = ['messenger', 'whatsapp', 'instagram'];

/** Ce qu'il faut avoir relié à la Page pour chaque application. */
export const CONNECTION_REQUIREMENT = {
  instagram: {
    field: 'instagramConnected',
    message: "Aucun compte Instagram professionnel n'est relié à votre Page Facebook.",
  },
  whatsapp: {
    field: 'whatsappConnected',
    message: "Aucun numéro WhatsApp Business n'est relié à votre Page Facebook.",
  },
} as const;

/** Tous les destination_type qui désignent une conversation. */
const MESSAGING_DESTINATION_TYPES = new Set(Object.values(DESTINATION_TYPE_BY_COMBO));

/**
 * Réduit un numéro WhatsApp à ses chiffres, indicatif pays compris.
 *
 * Meta stocke le numéro sans « + » ni séparateurs : « +237 6 50 19 81 96 » devient
 * « 237650198196 ». Normaliser ici évite qu'un même numéro saisi avec des espaces soit refusé.
 */
export function normalizeWhatsAppNumber(numero: string | null | undefined): string | null {
  if (!numero) return null;
  const chiffres = numero.replace(/\D/g, '');
  return chiffres.length >= 8 ? chiffres : null;
}

/** Indique si un destination_type envoie l'utilisateur dans une conversation. */
export function isMessagingDestination(destinationType: string | null | undefined): boolean {
  return (
    destinationType !== null &&
    destinationType !== undefined &&
    MESSAGING_DESTINATION_TYPES.has(destinationType)
  );
}

const ALIASES: Readonly<Record<string, MessagingApp>> = {
  messenger: 'messenger',
  MESSENGER: 'messenger',
  instagram: 'instagram',
  instagram_direct: 'instagram',
  INSTAGRAM_DIRECT: 'instagram',
  // INSTAGRAM_PROFILE est volontairement absent : il désigne une visite de profil, pas une
  // conversation en message privé.
  whatsapp: 'whatsapp',
  WHATSAPP: 'whatsapp',
};

function aliasOf(app: unknown): MessagingApp | undefined {
  if (typeof app !== 'string') return undefined;
  if (Object.hasOwn(ALIASES, app)) return ALIASES[app];
  const lower = app.toLowerCase();
  return Object.hasOwn(ALIASES, lower) ? ALIASES[lower] : undefined;
}

/** Normalise la liste d'applications : minuscules, dédoublonnée, triée ; accepte les alias. */
export function normalizeApps(apps: readonly unknown[] | null | undefined): MessagingApp[] {
  const normalized = (apps ?? [])
    .map(aliasOf)
    .filter((app): app is MessagingApp => app !== undefined);
  return [...new Set(normalized)].sort();
}

/** Ce que la validation lit du compte Meta rattaché (voir `MetaPageContext`). */
export interface MessagingAccount {
  pageId?: string | null | undefined;
  instagramConnected?: boolean | null | undefined;
  whatsappConnected?: boolean | null | undefined;
  whatsappNumber?: string | null | undefined;
  whatsappPhoneNumberId?: string | null | undefined;
}

export interface MessagingOptions {
  whatsappPhoneNumber?: string | null | undefined;
  whatsappPhoneNumberId?: string | null | undefined;
}

/** Vérifie que chaque application cochée est réellement utilisable. */
export function validateMessagingApps(
  apps: readonly unknown[] | null | undefined,
  account: MessagingAccount = {},
  options: MessagingOptions = {},
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const selected = normalizeApps(apps);

  if (selected.length === 0) {
    errors.push('Choisissez au moins une application de messagerie.');
    return { valid: false, errors };
  }

  if (!account.pageId) {
    errors.push('Une Page Facebook est requise pour les publicités qui ouvrent une conversation.');
  }

  for (const app of selected) {
    if (app === 'messenger') continue;
    const requirement = CONNECTION_REQUIREMENT[app];
    if (!account[requirement.field]) errors.push(requirement.message);
  }

  // Le numéro doit accompagner la destination WhatsApp. Sans lui, Meta crée bien l'ensemble de
  // publicités mais la publicité reste sans numéro à promouvoir : le sélecteur du gestionnaire de
  // publicités s'affiche vide et la publicité ne peut pas être diffusée.
  if (selected.includes('whatsapp')) {
    const numero = normalizeWhatsAppNumber(options.whatsappPhoneNumber ?? account.whatsappNumber);
    // L'identifiant suffit : Meta en déduit le numéro.
    const identifiant = (
      options.whatsappPhoneNumberId ??
      account.whatsappPhoneNumberId ??
      ''
    ).trim();
    if (!numero && !/^\d+$/.test(identifiant)) {
      errors.push("Indiquez l'identifiant du numéro WhatsApp Business à promouvoir.");
    }
  }

  return { valid: errors.length === 0, errors };
}

export interface MessagingDestination {
  apps: MessagingApp[];
  destination_type: string;
  isMultiDestination: boolean;
  asset_feed_spec: {
    optimization_type: 'DOF_MESSAGING_DESTINATION';
    call_to_actions: { type: string; value: { app_destination: string; link: string } }[];
  } | null;
  /** Meta n'accepte que CONVERSATIONS pour ces ensembles de publicités. */
  optimization_goal: 'CONVERSATIONS';
  link: string;
  call_to_action: { type: string; value: { app_destination: string } };
}

/**
 * Traduit les cases cochées en configuration Meta cohérente : le triplet que Meta impose de garder
 * aligné (destination_type de l'ensemble, optimisation CONVERSATIONS, bouton de messagerie).
 *
 * @throws Error si la combinaison n'existe pas chez Meta
 */
export function buildMessagingDestination(
  apps: readonly unknown[] | null | undefined,
): MessagingDestination {
  const selected = normalizeApps(apps);

  if (selected.length === 0) {
    throw new Error('Choisissez au moins une application de messagerie.');
  }

  const comboKey = selected.join('+');
  const destinationType = Object.hasOwn(DESTINATION_TYPE_BY_COMBO, comboKey)
    ? DESTINATION_TYPE_BY_COMBO[comboKey]
    : undefined;
  if (!destinationType) {
    throw new Error(
      `Combinaison de destinations non prise en charge par Facebook : ${selected.join(', ')}.`,
    );
  }

  const primary = CALL_TO_ACTION_PRIORITY.find((app) => selected.includes(app)) ?? 'messenger';
  const cta = CALL_TO_ACTION_BY_APP[primary];

  // Au-delà d'une application, Meta doit pouvoir choisir la destination pour chaque personne :
  // c'est le rôle de asset_feed_spec, qui liste un bouton par application. Sans lui, la publicité
  // est refusée (sous-code 2446493, « le contenu publicitaire doit inclure la spécification
  // degrees_of_freedom pour les publicités multi-destination » — DOF y désigne ce champ, pas
  // degrees_of_freedom_spec, qui ne résout rien ici).
  const isMultiDestination = selected.length > 1;

  return {
    apps: selected,
    destination_type: destinationType,
    isMultiDestination,
    asset_feed_spec: isMultiDestination
      ? {
          optimization_type: 'DOF_MESSAGING_DESTINATION',
          call_to_actions: CALL_TO_ACTION_PRIORITY.filter((app) => selected.includes(app)).map(
            (app) => {
              const c = CALL_TO_ACTION_BY_APP[app];
              return { type: c.type, value: { app_destination: c.app_destination, link: c.link } };
            },
          ),
        }
      : null,
    optimization_goal: 'CONVERSATIONS',
    link: cta.link,
    call_to_action: { type: cta.type, value: { app_destination: cta.app_destination } },
  };
}

const MESSAGE_EXTENSION_TYPES: Readonly<Record<MessagingApp, string>> = {
  whatsapp: 'whatsapp',
  messenger: 'messenger',
  instagram: 'instagram_message',
};

/**
 * Bouton de messagerie ajouté à une publicité qui mène vers un site web.
 *
 * Produit différent des publicités de messagerie : ici la personne arrive bien sur le site, avec un
 * bandeau lui proposant d'écrire à l'entreprise. Meta l'appelle « publicité web qui redirige vers la
 * messagerie », et l'exprime par `asset_feed_spec.message_extensions` sur une destination WEBSITE.
 *
 * Deux contraintes vérifiées contre l'API :
 *   · la création doit être passée **en ligne** dans POST /ads — la déclarer séparément échoue avec
 *     « (#3) Application does not have the capability » ;
 *   · le bouton d'appel à l'action reste celui d'un site web (LEARN_MORE) ; un bouton de messagerie
 *     y est refusé.
 */
export function buildMessageExtensions(
  apps: readonly unknown[] | null | undefined,
): { message_extensions: { type: string }[] } | null {
  const selected = normalizeApps(apps);
  if (selected.length === 0) return null;

  return {
    message_extensions: CALL_TO_ACTION_PRIORITY.filter((app) => selected.includes(app)).map(
      (app) => ({
        type: MESSAGE_EXTENSION_TYPES[app],
      }),
    ),
  };
}
