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
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image,
              mimeType: mimeType,
            },
          },
          {
            text: 'Please look at this image and extract any street address, building number, or location information you can find. Return ONLY the extracted address as a single string. Do not include any conversational text, markdown formatting, or explanations. If you absolutely cannot find any address or location text, return the exact word "NOT_FOUND".',
          },
        ],
      },
    });
    
    let text = response.text?.trim() || '';
    text = text.replace(/^["']|["']$/g, '');
    
    if (text === 'NOT_FOUND' || text === '') {
      return null;
    }
    
    return text;
  } catch (error) {
    console.error('Error extracting address from image:', error);
    return null;
  }
}

export async function guessCorrectAddress(inputAddress: string): Promise<string | null> {
  try {
    const response = await getAI().models.generateContent({
      model: 'gemini-3-flash-preview',
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
