import { GoogleGenAI } from '@google/genai';

let ai: GoogleGenAI | null = null;

function getAI() {
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return ai;
}

export async function extractAddressFromImage(base64Image: string, mimeType: string): Promise<string | null> {
  try {
    const response = await getAI().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image,
              mimeType: mimeType,
            },
          },
          {
            text: 'Extract the street address from this image. Return ONLY the address as a string, with no other text, markdown, or explanation. If no address is found, return an empty string.',
          },
        ],
      },
    });
    
    let text = response.text?.trim() || '';
    text = text.replace(/^["']|["']$/g, '');
    return text ? text : null;
  } catch (error) {
    console.error('Error extracting address from image:', error);
    return null;
  }
}

export async function guessCorrectAddress(inputAddress: string): Promise<string | null> {
  try {
    const response = await getAI().models.generateContent({
      model: 'gemini-2.5-flash',
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
