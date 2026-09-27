import { config } from '../config/env.js';

let openaiClient = null;

async function getOpenAiClient() {
  if (openaiClient) return openaiClient;
  if (!config.openai.apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const { OpenAI } = await import('openai');
  openaiClient = new OpenAI({ apiKey: config.openai.apiKey });
  return openaiClient;
}

export async function generateLlmResponse(userMessage, context = {}) {
  const client = await getOpenAiClient();

  const systemMessage = `You are a conversational assistant for a retail Voice of Customer dashboard. Answer questions about feedback counts, theme summaries, action recommendations, clusters, and spikes using concise, business-friendly language. If you do not have enough information, be honest and ask the user for clarification.`;

  const messages = [
    { role: 'system', content: systemMessage },
    { role: 'user', content: `User question: ${userMessage}` },
    {
      role: 'assistant',
      content: `Context: ${JSON.stringify(context, null, 2)}`,
    },
  ];

  const response = await client.chat.completions.create({
    model: config.openai.model,
    messages,
    max_tokens: config.openai.maxTokens,
    temperature: config.openai.temperature,
    top_p: 1,
    n: 1,
  });

  return response.choices?.[0]?.message?.content?.trim() || 'I could not generate a response from the AI service.';
}
