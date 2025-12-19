
export enum SpeakerType {
  YOU = 'You',
  PERSON_1 = 'Person 1',
  PERSON_2 = 'Person 2',
  UNKNOWN = 'Unknown'
}

export interface ConversationSegment {
  id: string;
  startTime: string; // Absolute HH:mm:ss
  offsetInAudio: number; // Seconds from start of the audio chunk
  duration: number; // Duration of this specific segment
  speaker: string;
  text: string;
  confidence: number;
  audioId?: string;
  isCompressed?: boolean;
}

export interface DailyLog {
  date: string; // ISO format YYYY-MM-DD
  transcripts: ConversationSegment[];
  summary?: DailySummary;
  recordingDurationMinutes: number;
}

export interface DailySummary {
  overview: string;
  keyEvents: string[];
  actionItems: string[];
  mood: string;
  topics: string[];
}

export interface ModelStatus {
  id: string;
  name: string;
  size: string;
  status: 'none' | 'downloading' | 'ready';
  progress: number;
  error?: string;
}

export type ViewType = 'timeline' | 'calendar' | 'summary' | 'search' | 'settings';
