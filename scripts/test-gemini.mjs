// Standalone Gemini connectivity test — bypasses NestJS, RAG, Qdrant, DB.
// Reads GEMINI_API_KEY and GEMINI_CHAT_MODEL from .env exactly as the app does.
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY ?? '';
const rawModel = process.env.GEMINI_CHAT_MODEL ?? '';
const model = rawModel.trim() || 'gemini-2.5-flash';

console.log('--- Gemini direct test ---');
console.log('apiKey loaded   :', apiKey ? `yes (${apiKey.slice(0, 10)}...)` : 'NO');
console.log('GEMINI_CHAT_MODEL raw  :', JSON.stringify(rawModel));
console.log('model used (trimmed)   :', JSON.stringify(model));
console.log('---');

if (!apiKey) {
  console.error('GEMINI_API_KEY is missing.');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

try {
  const response = await ai.models.generateContent({
    model,
    contents: 'Say "pong" in one word.',
    config: { temperature: 0, maxOutputTokens: 10 },
  });
  console.log('SUCCESS — Gemini replied:', JSON.stringify(response.text));
} catch (e) {
  console.error('FAILURE — Gemini error message:');
  console.error(e?.message ?? e);
  process.exit(2);
}
