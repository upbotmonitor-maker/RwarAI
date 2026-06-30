import { Chat, ChatState } from "./types";

// Format date to YYYY-MM-DD
export function getFormattedDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Format time to HH:MM
export function getFormattedTime(date: Date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

// Group chats by date relative to 2026-06-29 (current system time)
export function groupChatsByDate(chats: Record<string, Chat>): {
  today: [string, Chat][];
  yesterday: [string, Chat][];
  previousWeek: [string, Chat][];
  older: [string, Chat][];
} {
  const todayList: [string, Chat][] = [];
  const yesterdayList: [string, Chat][] = [];
  const previousWeekList: [string, Chat][] = [];
  const olderList: [string, Chat][] = [];

  // Parse current local date (2026-06-29) or system date
  const now = new Date("2026-06-29T22:17:42"); // Use the system provided date as reference anchor
  const todayStr = getFormattedDate(now);
  
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = getFormattedDate(yesterday);

  const oneWeekAgo = new Date(now);
  oneWeekAgo.setDate(now.getDate() - 7);

  // Sort chats chronologically descending based on their date and time
  const sortedChats = Object.entries(chats).sort((a, b) => {
    const dateTimeA = `${a[1].date}T${a[1].time}`;
    const dateTimeB = `${b[1].date}T${b[1].time}`;
    return dateTimeB.localeCompare(dateTimeA);
  });

  for (const [id, chat] of sortedChats) {
    if (chat.date === todayStr) {
      todayList.push([id, chat]);
    } else if (chat.date === yesterdayStr) {
      yesterdayList.push([id, chat]);
    } else {
      const chatDate = new Date(`${chat.date}T00:00:00`);
      if (chatDate >= oneWeekAgo) {
        previousWeekList.push([id, chat]);
      } else {
        olderList.push([id, chat]);
      }
    }
  }

  return {
    today: todayList,
    yesterday: yesterdayList,
    previousWeek: previousWeekList,
    older: olderList,
  };
}

// Get initial state with sample data matching the exact schema and layout request
export function getInitialState(): ChatState {
  const LOCAL_STORAGE_KEY = "rwar_chat_state";
  const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
  
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === "object" && parsed.chats) {
        return parsed as ChatState;
      }
    } catch (e) {
      console.error("Failed to parse stored chat state", e);
    }
  }

  // Generate mock initial dates based on system anchor 2026-06-29
  const now = new Date("2026-06-29T22:17:42");
  const todayStr = getFormattedDate(now);
  
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = getFormattedDate(yesterday);

  const weekAgo1 = new Date(now);
  weekAgo1.setDate(now.getDate() - 4);
  const weekAgo1Str = getFormattedDate(weekAgo1);

  const weekAgo2 = new Date(now);
  weekAgo2.setDate(now.getDate() - 6);
  const weekAgo2Str = getFormattedDate(weekAgo2);

  const initialChats: Record<string, Chat> = {};

  return {
    chats: initialChats,
    currentChatId: null,
    apiKey: ""
  };
}

export function saveStateToLocalStorage(state: ChatState): void {
  const LOCAL_STORAGE_KEY = "rwar_chat_state";
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("LocalStorage quota exceeded or save error, trying to save pruned state...", error);
    try {
      // Create a pruned copy without the large base64 image data to keep local history but free space
      const prunedState = { ...state };
      if (prunedState.chats) {
        // Deep copy chats to avoid mutating active React state directly
        prunedState.chats = JSON.parse(JSON.stringify(prunedState.chats));
        for (const chatId in prunedState.chats) {
          const chat = prunedState.chats[chatId];
          if (chat && chat.messages) {
            chat.messages = chat.messages.map((msg: any) => {
              if (msg.image && msg.image.data) {
                return {
                  ...msg,
                  image: {
                    ...msg.image,
                    data: "" // Clear base64 data to save space, keeping the container metadata
                  }
                };
              }
              return msg;
            });
          }
        }
      }
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(prunedState));
    } catch (innerError) {
      console.error("Failed to save even pruned state to localStorage:", innerError);
    }
  }
}
