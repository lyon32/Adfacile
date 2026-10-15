// POST /api/v1/workspaces/{workspaceId}/analyses/{analysisId}/answers : réponses aux 3 à 5 questions.
import { answerQuestions } from '@pubeka/core';
import { api } from '../../../../../../../../server/http/routes';
import { analysisIdParam } from '../../../../../analysis/params';
import { answersRequestSchema } from '../../../../../analysis/schemas';

export const POST = api(
  {
    auth: 'member',
    roles: ['owner', 'editor'],
    writable: true,
    rateLimit: 'write',
    body: answersRequestSchema,
  },
  async (ctx, { body, params }) => ({
    status: 200,
    body: await answerQuestions(ctx, analysisIdParam(params), body.answers),
  }),
);
