import { GoogleGenAI } from '@google/genai';

// Override via VITE_GEMINI_MODEL at build time. Default to a stable Flash model
// rather than a preview tag that can disappear without notice.
const MODEL = (import.meta.env.VITE_GEMINI_MODEL as string | undefined) || 'gemini-2.5-flash';

let ai: GoogleGenAI | null = null;

function getAI() {
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return ai;
}

export async function guessCorrectAddress(inputAddress: string): Promise<string | null> {
  try {
    const response = await getAI().models.generateContent({
      model: MODEL,
      contents: `The user typed the following address, but it might be misspelled or incomplete: "${inputAddress}". Please guess the correct, fully formatted street address. Return ONLY the corrected address as a string, with no other text, markdown, or explanation. If you cannot guess it, return an empty string.`,
    });

    let text = response.text?.trim() || '';
    text = text.replace(/^["']|["']$/g, '');
    return text ? text : null;
  } catch (error) {
    console.error('Error guessing correct address:', error);
    return null;
  }
}
