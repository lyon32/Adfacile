// Corps de PUT /notifications/preferences, strict : type connu, sans doublon (openapi.yaml).
import { NOTIFICATION_TYPES } from '@pubeka/core';
import { z } from 'zod';

export const PutPreferencesSchema = z.strictObject({
  data: z
    .array(
      z.strictObject({
        type: z.enum(NOTIFICATION_TYPES),
        in_app: z.boolean(),
        email: z.boolean(),
      }),
    )
    .max(NOTIFICATION_TYPES.length)
    .refine((list) => new Set(list.map((p) => p.type)).size === list.length, {
      message: 'Un type ne peut apparaître qu’une fois.',
    }),
});
