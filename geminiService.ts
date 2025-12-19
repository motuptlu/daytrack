
import { GoogleGenAI, Type } from "@google/genai";
import { ConversationSegment, DailySummary } from "./types";

// Safe access to environment variables in browser
const getApiKey = () => {
  try {
    return process.env.API_KEY || "";
  } catch (e) {
    console.error("Could not access process.env.API_KEY. Ensure your build tool is injecting it or it's set in Netlify.");
    return "";
  }
};

const apiKey = getApiKey();
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const transcribeAudioChunk = async (audioBase64: string, offlineMode: boolean = false): Promise<ConversationSegment[]> => {
  if (!ai && !offlineMode) {
    console.error("Gemini AI is not initialized. Please check your API Key.");
    return [];
  }

  if (offlineMode) {
    const now = new Date();
    const timestamp = now.toLocaleTimeString('en-GB');
    return [{
      id: Math.random().toString(36).substr(2, 9),
      startTime: timestamp,
      offsetInAudio: 0,
      duration: 30,
      speaker: "You",
      text: "Offline mode capture: " + timestamp,
      confidence: 1.0
    }];
  }

  try {
    const response = await ai!.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { inlineData: { mimeType: "audio/mp3", data: audioBase64 } },
          { text: "Transcribe this 30-second audio precisely. Return ONLY valid JSON as per the requested schema." }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              startTime: { type: Type.STRING },
              offsetInAudio: { type: Type.NUMBER },
              duration: { type: Type.NUMBER },
              speaker: { type: Type.STRING },
              text: { type: Type.STRING },
              confidence: { type: Type.NUMBER }
            },
            required: ["id", "startTime", "offsetInAudio", "duration", "speaker", "text", "confidence"]
          }
        }
      }
    });

    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Transcription error:", error);
    return [];
  }
};

export const generateDailySummary = async (transcripts: ConversationSegment[]): Promise<DailySummary> => {
  if (!ai) {
    return { overview: "AI not available", keyEvents: [], actionItems: [], mood: "N/A", topics: [] };
  }

  const fullText = transcripts.map(t => `[${t.startTime}] ${t.speaker}: ${t.text}`).join("\n");
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: `Generate a daily summary for these life logs:\n\n${fullText}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overview: { type: Type.STRING },
            keyEvents: { type: Type.ARRAY, items: { type: Type.STRING } },
            actionItems: { type: Type.ARRAY, items: { type: Type.STRING } },
            mood: { type: Type.STRING },
            topics: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["overview", "keyEvents", "actionItems", "mood", "topics"]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Summary generation error:", error);
    return { overview: "Error generating summary", keyEvents: [], actionItems: [], mood: "N/A", topics: [] };
  }
};
