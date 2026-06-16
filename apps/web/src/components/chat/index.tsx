import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { CopyIcon, GlobeIcon, RefreshCcwIcon } from "lucide-react";
import { Fragment, useState } from "react";
import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "../ai-elements/attachments";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
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

export const Chat = () => {
  const [text, setText] = useState<string>("");

  const [useWebSearch, setUseWebSearch] = useState<boolean>(false);

  const { messages, status, sendMessage, stop, regenerate } = useChat({
    transport: new DefaultChatTransport({
      api: `${import.meta.env.VITE_SERVER_URL}/chat`,
    }),
  });

  const handleSubmit = (message: PromptInputMessage) => {
    const hasText = Boolean(message.text);
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
        },
      },
    );
    setText("");
  };

  return (
    <div className="flex flex-col flex-1 p-4 min-h-0">
      <Conversation>
        <ConversationContent>
          {messages.map((message, messageIndex) => (
            <Fragment key={message.id}>
              {message.parts.map((part, i) => {
                switch (part.type) {
                  case "text":
                    const isLastMessage = messageIndex === messages.length - 1;
                    return (
                      <Fragment key={`${message.id}-${i}`}>
                        <Message from={message.role}>
                          <MessageContent>
                            <MessageResponse>{part.text}</MessageResponse>
                          </MessageContent>
                        </Message>
                        {message.role === "assistant" && isLastMessage && (
                          <MessageActions>
                            <MessageAction onClick={() => regenerate()} label="Retry">
                              <RefreshCcwIcon className="size-3" />
                            </MessageAction>
                            <MessageAction
                              onClick={() => navigator.clipboard.writeText(part.text)}
                              label="Copy"
                            >
                              <CopyIcon className="size-3" />
                            </MessageAction>
                          </MessageActions>
                        )}
                      </Fragment>
                    );
                  default:
                    return null;
                }
              })}
            </Fragment>
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <PromptInput onSubmit={handleSubmit} className="mt-4" globalDrop multiple>
        <PromptInputHeader>
          <PromptInputAttachmentsDisplay />
        </PromptInputHeader>
        <PromptInputBody>
          <PromptInputTextarea onChange={(e) => setText(e.target.value)} value={text} />
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
            <PromptInputButton
              onClick={() => setUseWebSearch(!useWebSearch)}
              tooltip={{ content: "Search the web", shortcut: "⌘K" }}
              variant={useWebSearch ? "default" : "ghost"}
            >
              <GlobeIcon size={16} />
              <span>Search</span>
            </PromptInputButton>
          </PromptInputTools>
          <PromptInputSubmit disabled={!text && !status} status={status} onStop={stop} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
};
