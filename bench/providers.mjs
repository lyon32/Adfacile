// Appels aux fournisseurs de modèles texte. Chaque fonction renvoie
// { text, inTokens, outTokens, cost?, model? } : `cost` (dollars) et `model` (modèle qui a réellement répondu)
// ne sont donnés que par les passerelles qui les renvoient (OpenRouter).
// Aucune relance ici : le seul nouvel essai du banc est décidé par engine.mjs (docs/agents R2).
const env = process.env;

async function post(url, headers, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(`${res.status} ${JSON.stringify(json).slice(0, 300)}`);
    e.status = res.status;
    e.retryAfter = res.headers.get('retry-after');
    throw e;
  }
  return json;
}

async function gemini(model, system, user, { temperature = 0.2 } = {}) {
  const j = await post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {},
    { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature, responseMimeType: 'application/json' } });
  return { text: j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ?? '',
    inTokens: j.usageMetadata?.promptTokenCount ?? 0, outTokens: j.usageMetadata?.candidatesTokenCount ?? 0 };
}

async function anthropic(model, system, user, { temperature = 0.2 } = {}) {
  const j = await post('https://api.anthropic.com/v1/messages',
    { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    { model, max_tokens: 4096, temperature, system, messages: [{ role: 'user', content: user }] });
  return { text: j.content?.map(c => c.text ?? '').join('') ?? '', inTokens: j.usage?.input_tokens ?? 0, outTokens: j.usage?.output_tokens ?? 0 };
}

// OpenAI et fournisseurs compatibles (Mistral, Kimi/Moonshot)
function openaiCompatible(baseUrl, keyName) {
  return async (model, system, user, { temperature = 0.2 } = {}) => {
    const j = await post(`${baseUrl}/chat/completions`, { authorization: `Bearer ${env[keyName]}` },
      { model, temperature, response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }] });
    return { text: j.choices?.[0]?.message?.content ?? '', inTokens: j.usage?.prompt_tokens ?? 0, outTokens: j.usage?.completion_tokens ?? 0 };
  };
}

// OpenRouter (décision D-2) : n'importe quel identifiant de modèle de https://openrouter.ai/api/v1/models.
// Documentation : https://openrouter.ai/docs/api-reference/overview · le coût est toujours dans `usage.cost`
// (https://openrouter.ai/docs/guides/guides/usage-accounting) · une erreur du modèle peut arriver avec un statut 200
// (https://openrouter.ai/docs/api-reference/errors).
const OPENROUTER = 'https://openrouter.ai/api/v1';
async function openrouter(model, system, user, { temperature = 0.2 } = {}) {
  const j = await post(`${OPENROUTER}/chat/completions`,
    { authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'HTTP-Referer': 'https://pubeka.com', 'X-Title': 'Pubeka bench' },
    { model, temperature, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }] });
  const choice = j.choices?.[0];
  if (choice?.error) throw new Error(`200 ${String(choice.error.message ?? 'erreur du modèle').slice(0, 200)}`);
  return { text: choice?.message?.content ?? '', inTokens: j.usage?.prompt_tokens ?? 0, outTokens: j.usage?.completion_tokens ?? 0,
    cost: typeof j.usage?.cost === 'number' ? j.usage.cost : undefined, model: j.model };
}

/** Modèles de la passerelle (API publique, sans clé) : { id, context, priceIn, priceOut, structured, free, created }. */
export async function listOpenRouterModels() {
  const res = await fetch(`${OPENROUTER}/models`);
  if (!res.ok) throw new Error(`OpenRouter /models : ${res.status}`);
  const j = await res.json();
  return j.data.map(m => {
    const priceIn = Number(m.pricing?.prompt ?? NaN) * 1e6, priceOut = Number(m.pricing?.completion ?? NaN) * 1e6;
    const sp = m.supported_parameters ?? [];
    return { id: m.id, context: m.context_length, priceIn, priceOut, free: priceIn === 0 && priceOut === 0,
      structured: sp.includes('structured_outputs'), jsonMode: sp.includes('response_format'),
      textOnly: !(m.architecture?.output_modalities ?? ['text']).some(x => x !== 'text'),
      created: m.created ? new Date(m.created * 1000).toISOString().slice(0, 10) : '' };
  });
}

/** Requêtes gratuites restantes aujourd'hui (GET /key : n'est pas une requête de génération). */
export async function openRouterFreeQuota() {
  const res = await fetch(`${OPENROUTER}/key`, { headers: { authorization: `Bearer ${env.OPENROUTER_API_KEY}` } });
  if (!res.ok) return null;
  const q = (await res.json()).data?.free_model_daily_requests;
  return q && typeof q.remaining === 'number' ? { used: q.used, limit: q.limit, remaining: q.remaining } : null;
}

export const providers = {
  gemini: { call: gemini, key: 'GEMINI_API_KEY' },
  anthropic: { call: anthropic, key: 'ANTHROPIC_API_KEY' },
  openai: { call: openaiCompatible('https://api.openai.com/v1', 'OPENAI_API_KEY'), key: 'OPENAI_API_KEY' },
  mistral: { call: openaiCompatible('https://api.mistral.ai/v1', 'MISTRAL_API_KEY'), key: 'MISTRAL_API_KEY' },
  kimi: { call: openaiCompatible('https://api.moonshot.ai/v1', 'MOONSHOT_API_KEY'), key: 'MOONSHOT_API_KEY' },
  // Offres gratuites
  groq: { call: openaiCompatible('https://api.groq.com/openai/v1', 'GROQ_API_KEY'), key: 'GROQ_API_KEY' },
  openrouter: { call: openrouter, key: 'OPENROUTER_API_KEY' },
  cerebras: { call: openaiCompatible('https://api.cerebras.ai/v1', 'CEREBRAS_API_KEY'), key: 'CEREBRAS_API_KEY' },
  github: { call: openaiCompatible('https://models.github.ai/inference', 'GITHUB_MODELS_TOKEN'), key: 'GITHUB_MODELS_TOKEN' },
};
