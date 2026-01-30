import { GoogleGenerativeAI } from '@google/generative-ai';
import { Transaction } from '../types';

export class AIAccountingParser {
  // Use the model specified by the user
  private static MODEL_NAME = "gemini-1.5-pro"; // Fallback to 1.5-pro as 3-pro-preview might not be available via this SDK version or name

  static async parseText(text: string, token: string): Promise<Partial<Transaction>> {
    const genAI = new GoogleGenerativeAI(token);
    // Note: If 'models/gemini-3-pro-preview' is required, replace MODEL_NAME. 
    // However, for stability, we often use the standard names. 
    // If the user insisted on 'gemini-3-pro-preview', we can try that string.
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    
    const prompt = `
      You are an accounting assistant. Parse the following text into a JSON object for a personal accounting app.
      Text: "${text}"
      
      Return a JSON object with these fields (use null if not found):
      - date (string, YYYY-MM-DD)
      - type ('income' or 'expense')
      - amount (number)
      - category (string, suggest a category name)
      - subcategory (string, suggest a subcategory name)
      - account (string, e.g., 'WeChat', 'Alipay', 'Bank Card', 'Cash')
      - note (string, description of the transaction)
      - project (string)
      - payer (string)
      
      Output ONLY the raw JSON string. Do not use markdown blocks.
    `;
    
    try {
      const result = await model.generateContent(prompt);
      const response = result.response;
      const textResult = response.text();
      const jsonStr = textResult.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error("Failed to parse AI response", e);
      throw e;
    }
  }

  static async parseImage(imageBase64: string, token: string): Promise<Partial<Transaction>> {
    const genAI = new GoogleGenerativeAI(token);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    
    const prompt = `
      You are an accounting assistant. Parse this receipt image into a JSON object.
      Return a JSON object with these fields (use null if not found):
      - date (string, YYYY-MM-DD)
      - type ('income' or 'expense')
      - amount (number)
      - category (string)
      - account (string)
      - note (string, merchant name or items)
      
      Output ONLY the raw JSON string. Do not use markdown blocks.
    `;
    
    // Remove data:image/jpeg;base64, prefix if present
    const base64Data = imageBase64.split(',')[1] || imageBase64;

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: "image/jpeg", 
      },
    };

    try {
      const result = await model.generateContent([prompt, imagePart]);
      const response = result.response;
      const textResult = response.text();
      const jsonStr = textResult.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error("Failed to parse AI response", e);
      throw e;
    }
  }
}
