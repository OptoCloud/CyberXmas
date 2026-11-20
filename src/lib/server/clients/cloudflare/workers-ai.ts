// Workers AI text generation constrained to a JSON schema.
import { isRecord } from '#lib/util/validate.ts';
import type { Ai } from '../../env.ts';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Run a chat model with a JSON-schema response format and return the parsed object. */
export async function runStructured(ai: Ai, model: string, options: {
  messages: ChatMessage[]; schema: Record<string, unknown>; maxTokens: number;
}): Promise<unknown> {
  const result = await ai.run(model, {
    messages: options.messages,
    max_tokens: options.maxTokens,
    response_format: { type: 'json_schema', json_schema: options.schema }
  });
  const response = isRecord(result) ? result.response : undefined;
  return typeof response === 'string' ? JSON.parse(response) : response;
}
