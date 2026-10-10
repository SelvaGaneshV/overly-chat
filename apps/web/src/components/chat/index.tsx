import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  AlertTriangleIcon,
  AppWindow,
  Camera,
  CheckIcon,
  ClipboardPaste,
  CopyIcon,
  DownloadIcon,
  GlobeIcon,
  History,
  PenLineIcon,
  RefreshCcwIcon,
  SparklesIcon,
  SquarePenIcon,
  XIcon,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { WindowPickerDialog } from "./window-picker-dialog";
import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "../ai-elements/attachments";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  messagesToMarkdown,
} from "../ai-elements/conversation";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "../ai-elements/message";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionAddScreenshot,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from "../ai-elements/prompt-input";
import {
  type ChatSession,
  getStoredSessions,
  HistoryDrawer,
  saveStoredSessions,
} from "./history-drawer";

const SUGGESTIONS = [
  {
    title: "Explain screen",
    prompt: "Look at what's currently on my screen and explain it in clear, simple terms.",
  },
  {
    title: "Fix code error",
    prompt:
      "I have a compilation error. Here is the context — diagnose the root cause and provide the diff.",
  },
  {
    title: "Meeting summary",
    prompt: "Summarize the key points and next actions from this conversation in bullet points.",
  },
  {
    title: "Draft response",
    prompt: "Help me write a concise, professional reply to this message.",
  },
];

interface AvailableModel {
  id: string;
  name: string;
  context_length?: number;
  description?: string;
}

const PERSONAS = [
  { id: "general", name: "General Copilot" },
  { id: "coder", name: "Coding Copilot" },
  { id: "meeting", name: "Meeting Whisperer" },
  { id: "portfolio", name: "Portfolio Mode" },
];

const getMessageText = (message: { parts: Array<{ type: string; text?: string }> }) =>
  message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("\n");

const PromptInputAttachmentsDisplay = () => {
  const attachments = usePromptInputAttachments();

  if (attachments.files.length === 0) {
    return null;
  }

  return (
    <Attachments variant="inline">
      {attachments.files.map((attachment) => (
        <Attachment
          data={attachment}
          key={attachment.id}
          onRemove={() => attachments.remove(attachment.id)}
        >
          <AttachmentPreview />
          <AttachmentRemove />
        </Attachment>
      ))}
    </Attachments>
  );
};

const ScreenSnipAction = () => {
  const attachments = usePromptInputAttachments();
  const [capturing, setCapturing] = useState(false);

  const handleCapture = async () => {
    if (window.nativeApi?.captureScreen) {
      try {
        setCapturing(true);
        const dataUrl = await window.nativeApi.captureScreen();
        if (dataUrl) {
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          const file = new File([blob], `screen-${Date.now()}.png`, { type: "image/png" });
          attachments.add([file]);
          toast.success("Desktop screenshot captured");
          return;
        }
      } catch (err) {
        console.error("Screen capture failed:", err);
      } finally {
        setCapturing(false);
      }
    }
    toast.info("Native screen capture available in Electron app");
  };

  return (
    <PromptInputButton
      onClick={handleCapture}
      tooltip={{ content: "Capture Screen", shortcut: "Snip desktop" }}
      variant="ghost"
      disabled={capturing}
    >
      <Camera size={15} />
      <span className="hidden sm:inline text-xs">Snip</span>
    </PromptInputButton>
  );
};

const WindowSnipAction = () => {
  const [open, setOpen] = useState(false);
  const attachments = usePromptInputAttachments();

  return (
    <>
      <PromptInputButton
        onClick={() => setOpen(true)}
        tooltip={{ content: "Access Windows", shortcut: "Share app window" }}
        variant="ghost"
      >
        <AppWindow size={15} />
        <span className="hidden sm:inline text-xs">Window</span>
      </PromptInputButton>
      <WindowPickerDialog
        open={open}
        onOpenChange={setOpen}
        onAttach={(file) => attachments.add([file])}
      />
    </>
  );
};

export const Chat = () => {
  const [text, setText] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [useWebSearch, setUseWebSearch] = useState<boolean>(false);
  const [model, setModel] = useState<string>("openrouter/free");
  const [persona, setPersona] = useState<string>("general");
  const [modelsList, setModelsList] = useState<AvailableModel[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const openWindowsRef = useRef<Array<{ id: string; name: string }>>([]);

  // Periodically refresh open windows list so model is continuously aware
  useEffect(() => {
    const refreshWindows = () => {
      window.nativeApi
        ?.getOpenWindows?.()
        .then((wins) => {
          openWindowsRef.current = wins.map((w) => ({ id: w.id, name: w.name }));
        })
        .catch(() => {});
    };
    refreshWindows();
    const interval = setInterval(refreshWindows, 10000);
    return () => clearInterval(interval);
  }, []);

  // Initialize config, models, and saved sessions
  useEffect(() => {
    setSessions(getStoredSessions());

    const loadModels = () => {
      fetch(`${import.meta.env.VITE_SERVER_URL}/models`)
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data?.models) && data.models.length > 0) {
            setModelsList(data.models);
            setModel((prev) => {
              if (!prev || !data.models.some((m: { id: string }) => m.id === prev)) {
                return data.models[0].id;
              }
              return prev;
            });
          }
        })
        .catch(() => {});
    };

    window.nativeApi?.getConfig().then((cfg) => {
      if (cfg.model) setModel(cfg.model);
      if (cfg.persona) setPersona(cfg.persona);
      loadModels();
    });

    loadModels();
  }, []);

  const modelRef = useRef(model);
  modelRef.current = model;
  const personaRef = useRef(persona);
  personaRef.current = persona;
  const webSearchRef = useRef(useWebSearch);
  webSearchRef.current = useWebSearch;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${import.meta.env.VITE_SERVER_URL}/chat`,
        body: () => ({
          model: modelRef.current,
          persona: personaRef.current,
          webSearch: webSearchRef.current,
          openWindows: openWindowsRef.current,
        }),
      }),
    [],
  );

  const { messages, status, sendMessage, stop, regenerate, setMessages, clearError, error } =
    useChat({
      transport,
      onError: (err) => {
        toast.error("Response error", {
          description: err.message || "Failed to get a response. Check API key in Settings.",
        });
      },
    });

  const isGenerating = status === "submitted" || status === "streaming";
  const isEmpty = messages.length === 0;

  // Persist session when stream finishes
  useEffect(() => {
    if (messages.length > 0 && status === "ready") {
      const firstUserMsg = messages.find((m) => m.role === "user");
      const title = firstUserMsg ? getMessageText(firstUserMsg).slice(0, 45) : "New Conversation";
      const sessionId = currentSessionId || `session_${Date.now()}`;
      if (!currentSessionId) setCurrentSessionId(sessionId);

      setSessions((prev) => {
        const existingIdx = prev.findIndex((s) => s.id === sessionId);
        const updatedSession: ChatSession = {
          id: sessionId,
          title,
          timestamp: Date.now(),
          messages: [...messages],
          model,
          persona,
        };

        let nextSessions: ChatSession[];
        if (existingIdx >= 0) {
          nextSessions = [...prev];
          nextSessions[existingIdx] = updatedSession;
        } else {
          nextSessions = [updatedSession, ...prev];
        }
        saveStoredSessions(nextSessions);
        return nextSessions;
      });
    }
  }, [messages, status, currentSessionId, model, persona]);

  const handleSubmit = (message: PromptInputMessage) => {
    const hasText = Boolean(message.text?.trim());
    const hasAttachments = Boolean(message.files?.length);

    if (!(hasText || hasAttachments)) {
      return;
    }

    sendMessage(
      {
        text: message.text || "Sent with attachments",
        files: message.files,
      },
      {
        body: {
          webSearch: useWebSearch,
          model,
          persona,
        },
      },
    );
    setText("");
  };

  const handleSuggestion = (prompt: string) => {
    sendMessage(
      { text: prompt },
      {
        body: {
          webSearch: useWebSearch,
          model,
          persona,
        },
      },
    );
  };

  const handlePasteClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) {
        setText((prev) => (prev ? `${prev}\n\n> ${clip}\n` : `> ${clip}\n`));
        toast.success("Clipboard inserted");
      } else {
        toast.info("Clipboard is empty");
      }
    } catch {
      toast.error("Clipboard blocked");
    }
  };

  const handleCopy = useCallback(async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      toast.success("Copied to clipboard");
      setTimeout(() => {
        setCopiedId((current) => (current === id ? null : current));
      }, 1500);
    } catch {
      toast.error("Copy failed");
    }
  }, []);

  const handleNewChat = useCallback(() => {
    if (isGenerating) {
      stop();
    }
    setMessages([]);
    setCurrentSessionId(null);
    setText("");
    clearError();
  }, [isGenerating, stop, setMessages, clearError]);

  const handleSelectSession = useCallback(
    (session: ChatSession) => {
      if (isGenerating) stop();
      setCurrentSessionId(session.id);
      setMessages(session.messages);
      if (session.model) setModel(session.model);
      if (session.persona) setPersona(session.persona);
      clearError();
    },
    [isGenerating, stop, setMessages, clearError],
  );

  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== sessionId);
        saveStoredSessions(next);
        return next;
      });
      if (currentSessionId === sessionId) {
        handleNewChat();
      }
      toast.success("Chat deleted");
    },
    [currentSessionId, handleNewChat],
  );

  const handleDownload = useCallback(() => {
    if (messages.length === 0) return;
    const markdown = messagesToMarkdown(messages);
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `overly-chat-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success("Conversation downloaded");
  }, [messages]);

  // ⌘K / Ctrl+K toggles web search, Esc stops generation.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setUseWebSearch((v) => !v);
      }
      if (e.key === "Escape" && isGenerating) {
        stop();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isGenerating, stop]);

  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return i;
    }
    return -1;
  }, [messages]);

  return (
    <div className="relative flex flex-col flex-1 p-3 min-h-0">
      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onNewChat={handleNewChat}
      />

      {/* Top bar with model/persona selectors and actions */}
      <div className="flex items-center justify-between pb-2 border-b border-border/40 text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          <select
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            title="Active Persona"
            className="h-6 rounded border border-border/60 bg-muted/30 px-1.5 text-[11px] font-medium text-foreground focus:outline-none"
          >
            {PERSONAS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            title="Language Model"
            className="h-6 max-w-[130px] truncate rounded border border-border/60 bg-muted/30 px-1.5 text-[11px] text-muted-foreground focus:outline-none"
          >
            {modelsList.length === 0 ? (
              <option value={model}>{model || "Loading free models..."}</option>
            ) : (
              modelsList.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.id}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <MessageAction
            label="Chat History"
            onClick={() => setIsHistoryOpen(true)}
            tooltip="Chat History"
          >
            <History className="size-3.5" />
          </MessageAction>
          <MessageAction
            label="Download conversation"
            onClick={handleDownload}
            tooltip="Download (.md)"
          >
            <DownloadIcon className="size-3.5" />
          </MessageAction>
          <MessageAction label="New chat" onClick={handleNewChat} tooltip="New chat">
            <SquarePenIcon className="size-3.5" />
          </MessageAction>
        </div>
      </div>

      {(status === "error" || error) && (
        <div
          role="alert"
          className="mt-2 mb-1 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs"
        >
          <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-destructive">Response failed</p>
            <p className="text-muted-foreground truncate">
              {error?.message || "Check your API key in Settings."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => regenerate()}
            className="shrink-0 rounded px-1.5 py-0.5 font-medium text-destructive hover:bg-destructive/10"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => clearError()}
            aria-label="Dismiss error"
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      )}

      <Conversation>
        <ConversationContent>
          {isEmpty ? (
            <ConversationEmptyState
              title="Overly Copilot"
              description="Your stealth desktop assistant. Invisible to screen share."
              icon={<SparklesIcon className="size-6 text-primary" />}
            >
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-full bg-primary/10 p-3 text-primary">
                  <SparklesIcon className="size-6" />
                </div>
                <div className="space-y-1 text-center">
                  <h3 className="font-semibold text-sm">How can Overly help?</h3>
                  <p className="text-muted-foreground text-xs">
                    Always on top · Invisible to screen sharing · Snip or Ask
                  </p>
                </div>
                <div className="grid w-full max-w-sm grid-cols-2 gap-2 mt-1">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.title}
                      type="button"
                      onClick={() => handleSuggestion(s.prompt)}
                      className="rounded-lg border border-border/50 bg-card/60 p-2.5 text-left text-xs transition-colors hover:bg-accent/60"
                    >
                      <span className="flex items-center gap-1 font-medium text-foreground">
                        <PenLineIcon className="size-3 text-primary" />
                        {s.title}
                      </span>
                      <span className="mt-1 line-clamp-2 block text-[11px] text-muted-foreground leading-snug">
                        {s.prompt}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Snip your screen, press <kbd className="rounded border px-1 font-sans">⌘K</kbd>{" "}
                  for web search, or press{" "}
                  <kbd className="rounded border px-1 font-sans">Ctrl+Shift+P</kbd> for Ghost mode.
                </p>
              </div>
            </ConversationEmptyState>
          ) : (
            messages.map((message, messageIndex) => {
              const messageText = getMessageText(message);
              const isLastAssistant =
                message.role === "assistant" && messageIndex === lastAssistantIndex;
              const copyKey = `${message.id}-copy`;
              const hasContent = message.parts.some(
                (p) =>
                  p.type === "text" ||
                  p.type === "file" ||
                  p.type === "source-url" ||
                  p.type === "source-document" ||
                  p.type === "reasoning",
              );

              return (
                <Fragment key={message.id}>
                  <Message from={message.role}>
                    <MessageContent>
                      {message.parts.map((part, i) => {
                        const key = `${message.id}-${i}`;
                        switch (part.type) {
                          case "text":
                            return (
                              <MessageResponse key={key}>
                                {(part as { text: string }).text}
                              </MessageResponse>
                            );
                          case "file": {
                            const file = part as {
                              url: string;
                              mediaType?: string;
                              filename?: string;
                            };
                            const isImage = file.mediaType?.startsWith("image/");
                            if (isImage) {
                              return (
                                <img
                                  key={key}
                                  src={file.url}
                                  alt={file.filename || "Attachment"}
                                  className="max-h-48 max-w-full rounded-lg border object-contain"
                                />
                              );
                            }
                            return (
                              <span key={key} className="text-xs text-muted-foreground">
                                📎 {file.filename || file.mediaType || "Attachment"}
                              </span>
                            );
                          }
                          case "source-url": {
                            const source = part as {
                              url: string;
                              title?: string;
                            };
                            return (
                              <a
                                key={key}
                                href={source.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-primary underline underline-offset-2"
                              >
                                {source.title || source.url}
                              </a>
                            );
                          }
                          case "source-document": {
                            const doc = part as {
                              title: string;
                              filename?: string;
                            };
                            return (
                              <span key={key} className="text-xs text-muted-foreground">
                                📄 {doc.title || doc.filename || "Source"}
                              </span>
                            );
                          }
                          case "reasoning": {
                            const reasoning = part as { text: string };
                            if (!reasoning.text) return null;
                            return (
                              <details
                                key={key}
                                className="rounded-md bg-muted/50 px-2 py-1 text-xs text-muted-foreground"
                              >
                                <summary className="cursor-pointer font-medium">Reasoning</summary>
                                <p className="mt-1 whitespace-pre-wrap">{reasoning.text}</p>
                              </details>
                            );
                          }
                          default:
                            return null;
                        }
                      })}
                      {!hasContent && (
                        <span className="text-xs text-muted-foreground italic">
                          {status === "submitted" && messageIndex === messages.length - 1
                            ? "Thinking…"
                            : "Empty response"}
                        </span>
                      )}
                    </MessageContent>
                  </Message>
                  {messageText && (
                    <MessageActions>
                      <MessageAction
                        onClick={() => handleCopy(copyKey, messageText)}
                        label="Copy"
                        tooltip="Copy"
                      >
                        {copiedId === copyKey ? (
                          <CheckIcon className="size-3 text-green-500" />
                        ) : (
                          <CopyIcon className="size-3" />
                        )}
                      </MessageAction>
                      {isLastAssistant && status !== "streaming" && status !== "submitted" && (
                        <MessageAction
                          onClick={() => regenerate()}
                          label="Retry"
                          tooltip="Regenerate response"
                        >
                          <RefreshCcwIcon className="size-3" />
                        </MessageAction>
                      )}
                    </MessageActions>
                  )}
                </Fragment>
              );
            })
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <PromptInput onSubmit={handleSubmit} className="mt-2" globalDrop multiple>
        <PromptInputHeader>
          <PromptInputAttachmentsDisplay />
        </PromptInputHeader>
        <PromptInputBody>
          <PromptInputTextarea
            onChange={(e) => setText(e.target.value)}
            value={text}
            placeholder={
              useWebSearch
                ? "Ask anything with live web search…"
                : `Ask ${PERSONAS.find((p) => p.id === persona)?.name ?? "Overly"}…`
            }
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger />
              <PromptInputActionMenuContent>
                <PromptInputActionAddAttachments />
                <PromptInputActionAddScreenshot />
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>
            <ScreenSnipAction />
            <WindowSnipAction />
            <PromptInputButton
              onClick={handlePasteClipboard}
              tooltip={{ content: "Paste clipboard", shortcut: "Insert quote" }}
              variant="ghost"
            >
              <ClipboardPaste size={15} />
            </PromptInputButton>
            <PromptInputButton
              onClick={() => setUseWebSearch(!useWebSearch)}
              tooltip={{ content: "Search the web", shortcut: "⌘K" }}
              variant={useWebSearch ? "default" : "ghost"}
              aria-pressed={useWebSearch}
            >
              <GlobeIcon size={15} />
              <span className="hidden sm:inline text-xs">Search</span>
            </PromptInputButton>
          </PromptInputTools>
          <div className="flex items-center gap-2">
            <span className="hidden text-[10px] text-muted-foreground sm:block">Enter to send</span>
            <PromptInputSubmit status={status} onStop={stop} />
          </div>
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
};
