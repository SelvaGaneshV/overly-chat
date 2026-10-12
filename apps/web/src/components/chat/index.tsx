import { useChat } from "@ai-sdk/react";
import { useQuery } from "@tanstack/react-query";
import { DefaultChatTransport, type UIMessage, type ChatStatus } from "ai";
import {
  AlertTriangleIcon,
  AppWindow,
  Camera,
  CheckIcon,
  ChevronDown,
  ClipboardPaste,
  CopyIcon,
  DownloadIcon,
  GlobeIcon,
  History,
  Loader2Icon,
  PenLineIcon,
  RefreshCcwIcon,
  SparklesIcon,
  SquarePenIcon,
  Terminal,
  XIcon,
} from "lucide-react";
import { Fragment, lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@overly-chat/ui/components/dropdown-menu";
import { fetchModels, serverFetch, type AvailableModel } from "../../lib/server-api";

const CommandConfirmDialog = lazy(() =>
  import("./command-confirm-dialog").then((m) => ({ default: m.CommandConfirmDialog })),
);
const WindowPickerDialog = lazy(() =>
  import("./window-picker-dialog").then((m) => ({ default: m.WindowPickerDialog })),
);
const HistoryDrawer = lazy(() =>
  import("./history-drawer").then((m) => ({ default: m.HistoryDrawer })),
);
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
  saveStoredSessions,
} from "./session-storage";

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
      <Suspense fallback={null}>
        {open && (
          <WindowPickerDialog
            open={open}
            onOpenChange={setOpen}
            onAttach={(file) => attachments.add([file])}
          />
        )}
      </Suspense>
    </>
  );
};

interface ChatMessageItemProps {
  message: UIMessage;
  isLastAssistant: boolean;
  status: ChatStatus;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  onRegenerate: () => void;
}

const ChatMessageItem = memo(
  function ChatMessageItem({
    message,
    isLastAssistant,
    status,
    copiedId,
    onCopy,
    onRegenerate,
  }: ChatMessageItemProps) {
    const messageText = getMessageText(message);
    const copyKey = `${message.id}-copy`;
    const hasContent = message.parts.some(
      (p) =>
        p.type === "text" ||
        p.type === "file" ||
        p.type === "source-url" ||
        p.type === "source-document" ||
        p.type === "reasoning" ||
        p.type === "dynamic-tool" ||
        p.type.startsWith("tool-"),
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
                default: {
                  if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
                    const p = part as unknown as {
                      toolName?: string;
                      toolCallId?: string;
                      state?: string;
                      input?: { command?: string; cwd?: string; description?: string };
                      output?: { stdout?: string; stderr?: string; exitCode?: number };
                      args?: { command?: string; cwd?: string; description?: string };
                      result?: { stdout?: string; stderr?: string; exitCode?: number };
                      errorText?: string;
                    };
                    const toolName =
                      p.toolName ??
                      (part.type === "dynamic-tool"
                        ? undefined
                        : part.type.replace(/^tool-/, ""));
                    if (toolName !== "run_command") return null;

                    const cmd = String(p.input?.command ?? p.args?.command ?? "");
                    const cwd =
                      (p.input?.cwd ?? p.args?.cwd)
                        ? String(p.input?.cwd ?? p.args?.cwd)
                        : undefined;
                    const res = p.output ?? p.result;
                    const isRunning =
                      p.state === "input-streaming" ||
                      p.state === "input-available" ||
                      p.state === "call" ||
                      p.state === "partial-call";

                    return (
                      <div
                        key={key}
                        className="my-1 rounded-md border border-border/50 bg-black/80 font-mono text-xs overflow-hidden"
                      >
                        {/* Header */}
                        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/30 bg-white/5">
                          <Terminal className="size-3 text-amber-400 shrink-0" />
                          <span className="text-amber-300/80 flex-1 truncate">{cmd}</span>
                          {isRunning && (
                            <Loader2Icon className="size-3 text-muted-foreground animate-spin shrink-0" />
                          )}
                          {!isRunning && res && (
                            <span
                              className={`text-[10px] shrink-0 ${
                                res.exitCode === 0 ? "text-green-500" : "text-red-400"
                              }`}
                            >
                              exit {res.exitCode}
                            </span>
                          )}
                        </div>
                        {/* CWD */}
                        {cwd && (
                          <div className="px-3 py-0.5 text-[10px] text-blue-400/60 border-b border-border/20">
                            in: {cwd}
                          </div>
                        )}
                        {/* Output */}
                        {isRunning && !res && (
                          <div className="px-3 py-2 text-muted-foreground/60 italic text-[11px]">
                            Running…
                          </div>
                        )}
                        {res?.stdout && (
                          <pre className="px-3 py-2 text-green-300 whitespace-pre-wrap break-all leading-relaxed max-h-64 overflow-y-auto">
                            {res.stdout}
                          </pre>
                        )}
                        {res?.stderr && (
                          <pre className="px-3 py-2 text-red-400 whitespace-pre-wrap break-all leading-relaxed border-t border-border/30 max-h-32 overflow-y-auto">
                            {res.stderr}
                          </pre>
                        )}
                        {p.errorText && (
                          <pre className="px-3 py-2 text-red-400 whitespace-pre-wrap break-all leading-relaxed border-t border-border/30 max-h-32 overflow-y-auto">
                            {p.errorText}
                          </pre>
                        )}
                      </div>
                    );
                  }
                  return null;
                }
              }
            })}
            {!hasContent && (
              <span className="text-xs text-muted-foreground italic">
                {status === "submitted" && isLastAssistant
                  ? "Thinking…"
                  : "Empty response"}
              </span>
            )}
          </MessageContent>
        </Message>
        {messageText && (
          <MessageActions>
            <MessageAction
              onClick={() => onCopy(copyKey, messageText)}
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
                onClick={onRegenerate}
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
  },
  (prev, next) => {
    if (
      prev.message === next.message &&
      prev.isLastAssistant === next.isLastAssistant &&
      prev.copiedId === next.copiedId &&
      (!prev.isLastAssistant || prev.status === next.status)
    ) {
      return true;
    }
    return false;
  },
);

export const Chat = () => {
  const [text, setText] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [useWebSearch, setUseWebSearch] = useState<boolean>(false);
  const [terminalAccess, setTerminalAccess] = useState<boolean>(false);
  const [model, setModel] = useState<string>("openrouter/free");
  const [persona, setPersona] = useState<string>("general");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  sessionIdRef.current = currentSessionId;
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const openWindowsRef = useRef<Array<{ id: string; name: string }>>([]);
  const shareWindowsRef = useRef<boolean>(false);
  const workingDirRef = useRef<string>("");

  // TanStack Query for models API: cached, deduped, and shared across components
  const { data: modelsList = [] } = useQuery({
    queryKey: ["models"],
    queryFn: fetchModels,
  });

  useEffect(() => {
    if (modelsList.length > 0) {
      setModel((prev) => {
        if (!prev || !modelsList.some((m) => m.id === prev)) {
          return modelsList[0].id;
        }
        return prev;
      });
    }
  }, [modelsList]);

  // Pending terminal command waiting for user confirmation
  const [pendingCommand, setPendingCommand] = useState<{
    command: string;
    description?: string;
    cwd?: string;
    resolve: (allowed: boolean) => void;
  } | null>(null);

  // Refresh open windows list only when enabled and window is visible
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    const refreshWindows = () => {
      if (!shareWindowsRef.current || document.hidden) {
        if (!shareWindowsRef.current) openWindowsRef.current = [];
        return;
      }
      window.nativeApi
        ?.getOpenWindows?.({ thumbnails: false })
        .then((wins) => {
          if (shareWindowsRef.current) {
            openWindowsRef.current = wins.map((w) => ({ id: w.id, name: w.name }));
          } else {
            openWindowsRef.current = [];
          }
        })
        .catch(() => {});
    };

    refreshWindows();

    const start = () => {
      if (interval) clearInterval(interval);
      interval = setInterval(refreshWindows, 30000);
    };

    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        refreshWindows();
        start();
      }
    };

    start();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  // Initialize config and saved sessions
  useEffect(() => {
    setSessions(getStoredSessions());

    window.nativeApi?.getConfig().then((cfg) => {
      if (cfg.model) setModel(cfg.model);
      if (cfg.persona) setPersona(cfg.persona);
      if (cfg.workingDir) {
        workingDirRef.current = cfg.workingDir;
      }
      if (cfg.shareWindows !== undefined) {
        shareWindowsRef.current = cfg.shareWindows;
      }
    });

    const unsubscribe = window.nativeApi?.onConfigChange?.((cfg) => {
      if (cfg.model) setModel(cfg.model);
      if (cfg.persona) setPersona(cfg.persona);
      if (cfg.workingDir) {
        workingDirRef.current = cfg.workingDir;
      }
      if (cfg.shareWindows !== undefined) {
        shareWindowsRef.current = cfg.shareWindows;
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  const modelRef = useRef(model);
  modelRef.current = model;
  const personaRef = useRef(persona);
  personaRef.current = persona;
  const webSearchRef = useRef(useWebSearch);
  webSearchRef.current = useWebSearch;
  const terminalAccessRef = useRef(terminalAccess);
  terminalAccessRef.current = terminalAccess;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/chat",
        fetch: serverFetch,
        body: () => ({
          model: modelRef.current,
          persona: personaRef.current,
          webSearch: webSearchRef.current,
          openWindows: openWindowsRef.current,
          terminalAccess: terminalAccessRef.current,
          workingDir: workingDirRef.current || undefined,
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

  // Persist session when stream finishes (using ref to avoid double-write cycle)
  useEffect(() => {
    if (messages.length > 0 && status === "ready") {
      const firstUserMsg = messages.find((m) => m.role === "user");
      const title = firstUserMsg ? getMessageText(firstUserMsg).slice(0, 45) : "New Conversation";
      const sessionId = sessionIdRef.current || `session_${Date.now()}`;
      if (!sessionIdRef.current) {
        sessionIdRef.current = sessionId;
        setCurrentSessionId(sessionId);
      }

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

        const nextSessions = existingIdx >= 0
          ? prev.map((s, idx) => (idx === existingIdx ? updatedSession : s))
          : [updatedSession, ...prev];

        saveStoredSessions(nextSessions);
        return nextSessions;
      });
    }
  }, [messages, status, model, persona]);

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
      <Suspense fallback={null}>
        {isHistoryOpen && (
          <HistoryDrawer
            isOpen={isHistoryOpen}
            onClose={() => setIsHistoryOpen(false)}
            sessions={sessions}
            currentSessionId={currentSessionId}
            onSelectSession={handleSelectSession}
            onDeleteSession={handleDeleteSession}
            onNewChat={handleNewChat}
          />
        )}
      </Suspense>

      {/* Command confirmation dialog for terminal access */}
      <Suspense fallback={null}>
        {pendingCommand && (
          <CommandConfirmDialog
            open={!!pendingCommand}
            command={pendingCommand.command}
            description={pendingCommand.description}
            cwd={pendingCommand.cwd}
            onAllow={() => {
              pendingCommand.resolve(true);
              setPendingCommand(null);
            }}
            onDeny={() => {
              pendingCommand.resolve(false);
              setPendingCommand(null);
            }}
          />
        )}
      </Suspense>

      {/* Top bar with model/persona selectors and actions */}
      <div className="flex items-center justify-between pb-2 border-b border-border/40 text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          <DropdownMenu>
            <DropdownMenuTrigger
              type="button"
              title="Active Persona"
              className="flex h-6 items-center gap-1 rounded border border-border/60 bg-muted/30 px-2 text-[11px] font-medium text-foreground hover:bg-muted/50 focus:outline-none cursor-pointer"
            >
              <span className="truncate">
                {PERSONAS.find((p) => p.id === persona)?.name ?? persona}
              </span>
              <ChevronDown className="size-3 shrink-0 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuRadioGroup
                value={persona}
                onValueChange={(val) => {
                  if (val) setPersona(val);
                }}
              >
                {PERSONAS.map((p) => (
                  <DropdownMenuRadioItem key={p.id} value={p.id} closeOnClick>
                    {p.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger
              type="button"
              title="Language Model"
              className="flex h-6 max-w-[140px] items-center gap-1 rounded border border-border/60 bg-muted/30 px-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/50 focus:outline-none cursor-pointer"
            >
              <span className="truncate">
                {modelsList.find((m) => m.id === model)?.name || model || "Loading..."}
              </span>
              <ChevronDown className="size-3 shrink-0 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 max-h-72 overflow-y-auto">
              <DropdownMenuRadioGroup
                value={model}
                onValueChange={(val) => {
                  if (val) setModel(val);
                }}
              >
                {modelsList.length === 0 ? (
                  <DropdownMenuRadioItem value={model || "default"} disabled>
                    {model || "Loading free models..."}
                  </DropdownMenuRadioItem>
                ) : (
                  modelsList.map((m) => (
                    <DropdownMenuRadioItem key={m.id} value={m.id} closeOnClick>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="font-medium truncate">{m.name || m.id}</span>
                        {m.description && (
                          <span className="text-[10px] text-muted-foreground line-clamp-1">
                            {m.description}
                          </span>
                        )}
                      </div>
                    </DropdownMenuRadioItem>
                  ))
                )}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
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
            messages.map((message, messageIndex) => (
              <ChatMessageItem
                key={message.id}
                message={message}
                isLastAssistant={message.role === "assistant" && messageIndex === lastAssistantIndex}
                status={status}
                copiedId={copiedId}
                onCopy={handleCopy}
                onRegenerate={regenerate}
              />
            ))
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
            {window.nativeApi?.supportsTerminal && (
              <PromptInputButton
                onClick={() => {
                  const next = !terminalAccess;
                  setTerminalAccess(next);
                  if (next) {
                    toast.warning(
                      "Terminal access enabled. The AI model can run shell commands on your machine with your user permissions.",
                    );
                  }
                }}
                tooltip={{
                  content: terminalAccess
                    ? "Terminal access ON — model can run commands"
                    : "Terminal access OFF — click to enable",
                  shortcut: "Allow model to run shell commands",
                }}
                variant={terminalAccess ? "default" : "ghost"}
                aria-pressed={terminalAccess}
              >
                <Terminal size={15} />
                <span className="hidden sm:inline text-xs">Terminal</span>
              </PromptInputButton>
            )}
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
