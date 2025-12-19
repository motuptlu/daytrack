
import { GoogleGenAI, Type } from "@google/genai";
import { ConversationSegment, DailySummary } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const transcribeAudioChunk = async (audioBase64: string, offlineMode: boolean = false): Promise<ConversationSegment[]> => {
  if (offlineMode) {
    const now = new Date();
    const timestamp = now.toLocaleTimeString('en-GB'); // HH:mm:ss
    
    return [
      {
        id: Math.random().toString(36).substr(2, 9),
        startTime: timestamp,
        offsetInAudio: 0,
        duration: 30,
        speaker: "You",
        text: "Offline capture: " + timestamp,
        confidence: 0.92
      }
    ];
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "audio/mp3",
              data: audioBase64
            }
          },
          {
            text: `Transcribe this 30-second audio precisely. 
            For EACH sentence or phrase, you MUST provide:
            1. 'startTime': The current absolute wall-clock time (HH:mm:ss).
            2. 'offsetInAudio': Seconds from the START of this chunk when the sentence begins.
            3. 'duration': How many seconds this sentence lasts.
            4. 'speaker': 'You' or 'Other'.
            5. 'text': The transcription.
            
            Return ONLY valid JSON. 
            Format: [{"id": "uuid", "startTime": "HH:MM:SS", "offsetInAudio": 5.2, "duration": 3.1, "speaker": "Name", "text": "transcription...", "confidence": 0.98}]`
          }
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
  const fullText = transcripts.map(t => `[${t.startTime}] ${t.speaker}: ${t.text}`).join("\n");
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: `Generate a daily summary for these life logs. Analyze mood and key events precisely:\n\n${fullText}`,
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
    return {
      overview: "Could not generate summary.",
      keyEvents: [],
      actionItems: [],
      mood: "Unknown",
      topics: []
    };
  }
};
