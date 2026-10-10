import { Button } from "@overly-chat/ui/components/button";
import type { UIMessage } from "ai";
import { MessageSquare, Plus, Trash2, X } from "lucide-react";

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

export const saveStoredSessions = (sessions: ChatSession[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 30)));
  } catch (err) {
    console.error("Failed to save sessions to localStorage:", err);
  }
};

export function HistoryDrawer({
  isOpen,
  onClose,
  sessions,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
  onNewChat,
}: {
  isOpen: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (session: ChatSession) => void;
  onDeleteSession: (sessionId: string) => void;
  onNewChat: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md p-3 transition-all animate-in fade-in-0 duration-150">
      <div className="flex items-center justify-between pb-2 border-b border-border/50">
        <div className="flex items-center gap-1.5 font-medium text-xs">
          <MessageSquare className="size-3.5 text-primary" />
          <span>Chat History</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[11px] gap-1 px-2"
            onClick={() => {
              onNewChat();
              onClose();
            }}
          >
            <Plus className="size-3" />
            New
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-6 text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2 space-y-1">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-36 text-center text-xs text-muted-foreground p-4">
            <p>No previous chats saved yet.</p>
            <p className="text-[11px] mt-1 text-muted-foreground/75">
              Conversations are auto-saved locally.
            </p>
          </div>
        ) : (
          sessions.map((s) => {
            const isSelected = s.id === currentSessionId;
            const dateStr = new Date(s.timestamp).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <div
                key={s.id}
                className={`group flex items-center justify-between rounded-lg p-2 text-xs transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-accent text-accent-foreground font-medium"
                    : "hover:bg-accent/50 text-foreground"
                }`}
                onClick={() => {
                  onSelectSession(s);
                  onClose();
                }}
              >
                <div className="min-w-0 flex-1 pr-2">
                  <p className="truncate text-xs">{s.title || "Untitled Chat"}</p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                    <span>{dateStr}</span>
                    <span>·</span>
                    <span>{s.messages.length} msgs</span>
                  </div>
                </div>
                <button
                  type="button"
                  title="Delete chat"
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(s.id);
                  }}
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
