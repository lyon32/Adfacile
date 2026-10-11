// Appels aux fournisseurs de modèles texte. Chaque fonction renvoie { text, inTokens, outTokens }.
const env = process.env;

async function post(url, headers, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

async function gemini(model, system, user) {
  const j = await post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {},
    { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' } });
  return { text: j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ?? '',
    inTokens: j.usageMetadata?.promptTokenCount ?? 0, outTokens: j.usageMetadata?.candidatesTokenCount ?? 0 };
}

async function anthropic(model, system, user) {
  const j = await post('https://api.anthropic.com/v1/messages',
    { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    { model, max_tokens: 4096, temperature: 0.2, system, messages: [{ role: 'user', content: user }] });
  return { text: j.content?.map(c => c.text ?? '').join('') ?? '', inTokens: j.usage?.input_tokens ?? 0, outTokens: j.usage?.output_tokens ?? 0 };
}

// OpenAI et fournisseurs compatibles (Mistral, Kimi/Moonshot)
function openaiCompatible(baseUrl, keyName) {
  return async (model, system, user) => {
    const j = await post(`${baseUrl}/chat/completions`, { authorization: `Bearer ${env[keyName]}` },
      { model, temperature: 0.2, response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }] });
    return { text: j.choices?.[0]?.message?.content ?? '', inTokens: j.usage?.prompt_tokens ?? 0, outTokens: j.usage?.completion_tokens ?? 0 };
  };
}

export const providers = {
  gemini: { call: gemini, key: 'GEMINI_API_KEY' },
  anthropic: { call: anthropic, key: 'ANTHROPIC_API_KEY' },
  openai: { call: openaiCompatible('https://api.openai.com/v1', 'OPENAI_API_KEY'), key: 'OPENAI_API_KEY' },
  mistral: { call: openaiCompatible('https://api.mistral.ai/v1', 'MISTRAL_API_KEY'), key: 'MISTRAL_API_KEY' },
  kimi: { call: openaiCompatible('https://api.moonshot.ai/v1', 'MOONSHOT_API_KEY'), key: 'MOONSHOT_API_KEY' },
  // Offres gratuites
  groq: { call: openaiCompatible('https://api.groq.com/openai/v1', 'GROQ_API_KEY'), key: 'GROQ_API_KEY' },
  openrouter: { call: openaiCompatible('https://openrouter.ai/api/v1', 'OPENROUTER_API_KEY'), key: 'OPENROUTER_API_KEY' },
  cerebras: { call: openaiCompatible('https://api.cerebras.ai/v1', 'CEREBRAS_API_KEY'), key: 'CEREBRAS_API_KEY' },
  github: { call: openaiCompatible('https://models.github.ai/inference', 'GITHUB_MODELS_TOKEN'), key: 'GITHUB_MODELS_TOKEN' },
};
