
import { GoogleGenAI, Type } from "@google/genai";
import { ConversationSegment, DailySummary } from "./types";

const getApiKey = () => {
  // Check both window.process and standard process
  const key = (window as any).process?.env?.API_KEY || (typeof process !== 'undefined' ? process.env?.API_KEY : "");
  return key || "";
};

const initAI = () => {
  const key = getApiKey();
  if (!key) return null;
  try {
    return new GoogleGenAI({ apiKey: key });
  } catch (e) {
    console.error("Failed to initialize GoogleGenAI", e);
    return null;
  }
};

export const transcribeAudioChunk = async (audioBase64: string, offlineMode: boolean = false): Promise<ConversationSegment[]> => {
  const ai = initAI();
  
  if (!ai && !offlineMode) {
    console.warn("API_KEY is missing. Falling back to offline display or empty response.");
    return [];
  }

  if (offlineMode) {
    const now = new Date();
    return [{
      id: Math.random().toString(36).substr(2, 9),
      startTime: now.toLocaleTimeString('en-GB'),
      offsetInAudio: 0,
      duration: 30,
      speaker: "You",
      text: "Local Capture (Offline Mode Active)",
      confidence: 1.0
    }];
  }

  try {
    const response = await ai!.models.generateContent({
      model: "gemini-2.0-flash-exp", // Using a stable model name for better compatibility
      contents: {
        parts: [
          { inlineData: { mimeType: "audio/mp3", data: audioBase64 } },
          { text: "Transcribe this audio precisely. Return JSON only." }
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
  const ai = initAI();
  if (!ai) return { overview: "AI Configuration missing", keyEvents: [], actionItems: [], mood: "N/A", topics: [] };

  const fullText = transcripts.map(t => `[${t.startTime}] ${t.speaker}: ${t.text}`).join("\n");
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: `Summarize this log:\n\n${fullText}`,
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
    return { overview: "Summary failed", keyEvents: [], actionItems: [], mood: "N/A", topics: [] };
  }
};
