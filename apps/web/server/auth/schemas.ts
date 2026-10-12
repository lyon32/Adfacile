// Corps des actions de connexion (Zod strict : un champ inconnu est refusé, CONVENTIONS §6.10).
import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;

const email = z.email().max(254);
const captchaToken = z.string().min(1).max(4096);

export const SignInBodySchema = z.strictObject({
  email,
  password: z.string().min(1).max(128),
  captcha_token: captchaToken,
});

export const SignUpBodySchema = z.strictObject({
  email,
  password: z.string().min(PASSWORD_MIN_LENGTH).max(128),
  captcha_token: captchaToken,
  // APPFLOW §4.1 : case obligatoire.
  accept_terms: z.literal(true),
  locale: z.enum(['fr', 'en']),
});

export const EmailOnlyBodySchema = z.strictObject({ email, captcha_token: captchaToken });

export const NewPasswordBodySchema = z.strictObject({
  password: z.string().min(PASSWORD_MIN_LENGTH).max(128),
});

export const EmptyBodySchema = z.strictObject({});
