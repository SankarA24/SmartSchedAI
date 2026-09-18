import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY
});

try {
  const response = await ai.models.list();

  for await (const model of response) {
    console.log(model.name);
  }
} catch (error) {
  console.error(error);
}