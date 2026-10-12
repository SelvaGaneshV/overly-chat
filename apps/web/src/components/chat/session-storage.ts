import type { UIMessage } from "ai";

export interface ChatSession {
  id: string;
  title: string;
  timestamp: number;
  messages: UIMessage[];
  model?: string;
  persona?: string;
}

const STORAGE_KEY = "overly_chat_sessions_v1";

export const getStoredSessions = (): ChatSession[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ChatSession[];
  } catch {
    return [];
  }
};

export const sanitizeMessagesForStorage = (messages: UIMessage[]): UIMessage[] => {
  return messages.map((msg) => ({
    ...msg,
    parts: msg.parts.map((part) => {
      // Strip huge data URLs (screenshots, window snips) from persistent localStorage
      // to avoid freezing the main UI thread during JSON.stringify and exceeding the 5MB browser quota.
      if (
        part.type === "file" &&
        typeof (part as { url?: string }).url === "string" &&
        (part as { url: string }).url.startsWith("data:")
      ) {
        return {
          ...part,
          url: "", // Strip heavy data URL from storage
        };
      }
      return part;
    }),
  }));
};

export const saveStoredSessions = (sessions: ChatSession[]) => {
  try {
    const sanitized = sessions.slice(0, 30).map((s) => ({
      ...s,
      messages: sanitizeMessagesForStorage(s.messages),
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  } catch (err) {
    console.error("Failed to save sessions to localStorage:", err);
  }
};
