import 'server-only';
// Services des invitations d'équipe pour les routes : jeton (création, hachage) et e-mail
// d'invitation en texte simple, en attendant le module de notifications (S27).
// Envoi : faux fournisseur quand PUBEKA_FAKE_PROVIDERS contient `email` (tests, poste local :
// aucun vrai e-mail), sinon Resend (POST https://api.resend.com/emails, documentation
// resend.com/docs/api-reference/emails/send-email). Le jeton n'est jamais journalisé.
import { createHash, randomBytes } from 'node:crypto';
import type { InvitationEmail, InvitationTokens, InviteDeps } from '@pubeka/core';
import { createLogger, getEnv, type Env } from '@pubeka/shared';

const logger = createLogger({ base: { module: 'invitations' } });

export const invitationTokens: InvitationTokens = {
  // 32 octets aléatoires : 43 caractères base64url (contrat : 32 à 128).
  create: () => randomBytes(32).toString('base64url'),
  hash: (token) => createHash('sha256').update(token, 'utf8').digest('hex'),
};

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  /** Même invitation = même clé : Resend n'envoie pas deux fois en 24 h. */
  idempotencyKey: string;
}

export type MailTransport = (message: MailMessage) => Promise<void>;

const TEXTS = {
  fr: {
    subject: (v: InvitationEmail) => `${v.inviterName} t'invite sur Pubeka`,
    body: (v: InvitationEmail, expires: string) =>
      [
        'Bonjour,',
        '',
        `${v.inviterName} t'invite à rejoindre l'espace « ${v.workspaceName} » sur Pubeka.`,
        '',
        'Pour accepter, ouvre ce lien et connecte-toi avec cette adresse e-mail :',
        v.acceptUrl,
        '',
        `Le lien expire le ${expires}. Si tu ne connais pas cette personne, ignore cet e-mail.`,
        '',
        "L'équipe Pubeka",
      ].join('\n'),
    date: 'fr-FR',
  },
  en: {
    subject: (v: InvitationEmail) => `${v.inviterName} invited you to Pubeka`,
    body: (v: InvitationEmail, expires: string) =>
      [
        'Hello,',
        '',
        `${v.inviterName} invited you to join the “${v.workspaceName}” workspace on Pubeka.`,
        '',
        'To accept, open this link and sign in with this email address:',
        v.acceptUrl,
        '',
        `The link expires on ${expires}. If you don't know this person, ignore this email.`,
        '',
        'The Pubeka team',
      ].join('\n'),
    date: 'en-GB',
  },
} as const;

/** E-mail en texte simple, dans la langue de l'invitant (celle de l'invité est inconnue). */
export function invitationMessage(v: InvitationEmail): MailMessage {
  const t = TEXTS[v.locale];
  const expires = new Intl.DateTimeFormat(t.date, {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(v.expiresAt);
  return {
    to: v.to,
    subject: t.subject(v),
    text: t.body(v, expires),
    idempotencyKey: `invitation/${v.invitationId}`,
  };
}

/** Boîte d'envoi du faux fournisseur : lue par les tests, jamais envoyée. */
export const fakeOutbox: MailMessage[] = [];
const FAKE_OUTBOX_MAX = 100;

export const fakeTransport: MailTransport = (message) => {
  fakeOutbox.push(message);
  if (fakeOutbox.length > FAKE_OUTBOX_MAX) fakeOutbox.shift();
  return Promise.resolve();
};

export function resendTransport(
  args: { apiKey: string; from: string },
  fetchImpl: typeof fetch = fetch,
): MailTransport {
  return async (message) => {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${args.apiKey}`,
        'content-type': 'application/json',
        'idempotency-key': message.idempotencyKey,
      },
      body: JSON.stringify({
        from: args.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });
    // Le corps d'erreur du fournisseur n'est jamais renvoyé au client (API_SPEC §3.3).
    if (!res.ok) throw new Error(`Resend : statut ${String(res.status)}`);
  };
}

export function usesFakeEmail(env: Pick<Env, 'PUBEKA_FAKE_PROVIDERS'>): boolean {
  const list = env.PUBEKA_FAKE_PROVIDERS;
  if (list === undefined) return false;
  return list === 'all' || list.split(',').some((p) => p.trim() === 'email');
}

export function transportFor(
  env: Pick<Env, 'PUBEKA_FAKE_PROVIDERS' | 'RESEND_API_KEY' | 'EMAIL_FROM_NOTIFICATIONS'>,
): MailTransport {
  if (usesFakeEmail(env)) return fakeTransport;
  if (env.RESEND_API_KEY !== undefined && env.EMAIL_FROM_NOTIFICATIONS !== undefined) {
    return resendTransport({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM_NOTIFICATIONS });
  }
  return () => Promise.reject(new Error('Envoi d’e-mails non configuré (RESEND_API_KEY)'));
}

/** Dépendances de `inviteMember` pour la requête en cours. */
export function inviteDeps(): InviteDeps {
  const env = getEnv();
  const transport = transportFor(env);
  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '');
  return {
    tokens: invitationTokens,
    // Jeton dans le fragment (#) : jamais envoyé au serveur ni dans l'en-tête Referer.
    acceptUrl: (token) => `${appUrl}/invitation#${token}`,
    sendInvitationEmail: async (email) => {
      await transport(invitationMessage(email));
      logger.info('E-mail d’invitation envoyé', {
        invitationId: email.invitationId,
        fake: usesFakeEmail(env),
      });
    },
  };
}
