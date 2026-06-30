export interface GroundingSource {
  title?: string;
  uri?: string;
}

export interface GroundingChunk {
  web?: GroundingSource;
}

export interface GroundingMetadata {
  groundingChunks?: GroundingChunk[];
  webSearchQueries?: string[];
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  time: string; // e.g., "08:06"
  searchMode?: boolean; // indicates if this message was generated using search grounding
  groundingMetadata?: GroundingMetadata; // optional web search sources
  image?: {
    mimeType: string;
    data: string; // Base64 data string (excluding the prefix like "data:image/jpeg;base64,")
  };
  fileName?: string; // Optional name of the attached file/image
}

export interface Chat {
  title: string;
  date: string; // e.g., "2026-06-30"
  time: string; // e.g., "08:06"
  messages: Message[];
}

export interface ChatState {
  chats: Record<string, Chat>;
  currentChatId: string | null;
  apiKey: string;
}
