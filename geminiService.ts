
import { GoogleGenAI, Type } from "@google/genai";
import { ConversationSegment, DailySummary } from "./types";

const MOCK_SENTENCES = [
  "I was thinking about the project we discussed this morning.",
  "The weather is quite pleasant today, isn't it?",
  "Remember to buy some groceries on the way back home.",
  "That meeting was quite productive, we cleared a lot of doubts.",
  "I really need to start working out from next Monday.",
  "Captured a beautiful sunset near the lake today."
];

export const transcribeAudioChunk = async (audioBase64: string, offlineMode: boolean = false): Promise<ConversationSegment[]> => {
  const apiKey = process.env.API_KEY;
  
  if (!apiKey || offlineMode) {
    console.warn("API_KEY missing or offline mode active. Using mock data.");
    const now = new Date();
    const randomSentence = MOCK_SENTENCES[Math.floor(Math.random() * MOCK_SENTENCES.length)];
    return [{
      id: Math.random().toString(36).substring(2, 11),
      startTime: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      offsetInAudio: 0,
      duration: 30,
      speaker: "You",
      text: offlineMode ? `[Offline] ${randomSentence}` : `[Demo] ${randomSentence}`,
      confidence: 0.98
    }];
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { inlineData: { mimeType: "audio/webm", data: audioBase64 } },
          { text: "Transcribe this audio precisely. Return a JSON array of segments. Identify different speakers if present." }
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

    const jsonStr = response.text?.trim();
    return JSON.parse(jsonStr || "[]");
  } catch (error) {
    console.error("Transcription API error:", error);
    return [];
  }
};

export const generateDailySummary = async (transcripts: ConversationSegment[]): Promise<DailySummary> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return { 
      overview: "No API Key configured. Please add API_KEY to your environment variables.", 
      keyEvents: ["Demo Event 1", "Demo Event 2"], 
      actionItems: ["Configure API Key"], 
      mood: "Neutral", 
      topics: ["System"] 
    };
  }

  const ai = new GoogleGenAI({ apiKey });
  const fullText = transcripts.map(t => `[${t.startTime}] ${t.speaker}: ${t.text}`).join("\n");
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: `Provide a structured summary of this day log:\n\n${fullText}`,
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

    const jsonStr = response.text?.trim();
    return JSON.parse(jsonStr || "{}");
  } catch (error) {
    console.error("Summary API error:", error);
    return { overview: "Summary generation failed.", keyEvents: [], actionItems: [], mood: "N/A", topics: [] };
  }
};
