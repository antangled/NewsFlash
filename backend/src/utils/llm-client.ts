import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';

let genAI: GoogleGenerativeAI | null = null;

/**
 * Returns true if a real Gemini API key is configured.
 * Placeholder values and empty strings are treated as unconfigured.
 */
export function isLlmAvailable(): boolean {
  const key = config.geminiApiKey;
  return !!key && !key.startsWith('placeholder') && key.length > 10;
}

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    if (!isLlmAvailable()) {
      throw new Error('Gemini API key is not configured. Set GEMINI_API_KEY in .env');
    }
    genAI = new GoogleGenerativeAI(config.geminiApiKey);
  }
  return genAI;
}

export async function generateJson(prompt: string): Promise<unknown> {
  const model = getGenAI().getGenerativeModel({ model: 'gemini-2.0-flash' });
  const result = await model.generateContent(prompt);
  const text = result.response.text();

  // Extract JSON from the response (handle markdown code blocks)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
  const jsonStr = (jsonMatch[1] || text).trim();

  try {
    return JSON.parse(jsonStr);
  } catch {
    console.error('[LLM] Failed to parse JSON response:', jsonStr.slice(0, 200));
    throw new Error('LLM returned invalid JSON');
  }
}

export async function generateText(prompt: string): Promise<string> {
  const model = getGenAI().getGenerativeModel({ model: 'gemini-2.0-flash' });
  const result = await model.generateContent(prompt);
  return result.response.text();
}
