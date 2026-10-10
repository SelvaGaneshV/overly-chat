import { useForm } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Button } from "@overly-chat/ui/components/button";
import { Input } from "@overly-chat/ui/components/input";
import { Separator } from "@overly-chat/ui/components/separator";
import { Skeleton } from "@overly-chat/ui/components/skeleton";
import { isElectron } from "../../env";

export const Route = createFileRoute("/_layout/settings")({
  component: SettingsComponent,
});

const required =
  (label: string) =>
  ({ value }: { value: string }) =>
    !value.trim() ? `${label} is required` : undefined;

type Section = "app" | "chat" | "shortcuts";

interface AvailableModel {
  id: string;
  name: string;
  context_length?: number;
  description?: string;
}

const PERSONAS = [
  {
    id: "general",
    name: "General Copilot",
    description: "Concise, desktop-aware general assistant",
  },
  {
    id: "coder",
    name: "Coding Copilot",
    description: "Senior engineer focusing on diffs and error fixes",
  },
  {
    id: "meeting",
    name: "Meeting & Interview Whisperer",
    description: "Ultra-brief bullets and talking points",
  },
  { id: "portfolio", name: "Portfolio Mode", description: "Original interactive portfolio resume" },
];

function NavItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors ${
        active
          ? "bg-accent text-accent-foreground font-medium"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function SettingRow({
  label,
  description,
  control,
}: {
  label: string;
  description?: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs font-medium leading-none">{label}</span>
        {description && (
          <span className="text-[11px] text-muted-foreground leading-snug">{description}</span>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function SettingsComponent() {
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const defaultSection: Section = isElectron ? "app" : "chat";
  const [activeSection, setActiveSection] = useState<Section>(defaultSection);
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [isCustomModel, setIsCustomModel] = useState(false);

  const form = useForm({
    defaultValues: {
      apiKey: "",
      model: "openrouter/free",
      instructions: "",
      persona: "general",
      alwaysOnTop: true,
      opacity: 0.96,
    },
    onSubmit: async ({ value }) => {
      await window.nativeApi?.saveConfig(value);
      setSaved(true);
      fetch(`${import.meta.env.VITE_SERVER_URL}/models`)
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data?.models) && data.models.length > 0) {
            setModels(data.models);
          }
        })
        .catch(() => {});
      setTimeout(() => setSaved(false), 2000);
    },
  });

  useEffect(() => {
    const loadModels = () => {
      fetch(`${import.meta.env.VITE_SERVER_URL}/models`)
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data?.models) && data.models.length > 0) {
            setModels(data.models);
            const currentModel = form.getFieldValue("model");
            if (currentModel && !data.models.some((m: { id: string }) => m.id === currentModel)) {
              setIsCustomModel(true);
            }
          }
        })
        .catch(() => {});
    };

    window.nativeApi?.getConfig().then((config) => {
      form.setFieldValue("apiKey", config.apiKey);
      form.setFieldValue("model", config.model || "openrouter/free");
      form.setFieldValue("instructions", config.instructions);
      form.setFieldValue("persona", config.persona || "general");
      form.setFieldValue("alwaysOnTop", config.alwaysOnTop);
      form.setFieldValue("opacity", config.opacity ?? 0.96);
      setLoading(false);
      loadModels();
    });

    loadModels();
  }, []);

  if (loading)
    return (
      <div className="flex flex-1 min-h-0">
        <div className="w-28 shrink-0 border-r bg-muted/20 p-2 space-y-2">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
        </div>
        <div className="flex-1 space-y-3 p-5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="flex flex-1 min-h-0 [-webkit-app-region:no-drag]"
    >
      {/* Sidebar */}
      <nav className="flex flex-col gap-0.5 w-28 shrink-0 border-r bg-muted/20 p-2 overflow-y-auto">
        {isElectron && (
          <>
            <span className="px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground select-none">
              App
            </span>
            <NavItem
              label="Window"
              active={activeSection === "app"}
              onClick={() => setActiveSection("app")}
            />
          </>
        )}
        <span className="px-2.5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground select-none">
          Chat
        </span>
        <NavItem
          label="AI & Models"
          active={activeSection === "chat"}
          onClick={() => setActiveSection("chat")}
        />
        <NavItem
          label="Shortcuts"
          active={activeSection === "shortcuts"}
          onClick={() => setActiveSection("shortcuts")}
        />
      </nav>

      {/* Content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-y-auto p-4 gap-1">
        {activeSection === "app" && (
          <>
            <h2 className="text-sm font-semibold mb-1">Window & Overlay</h2>
            <Separator />

            <form.Field name="alwaysOnTop">
              {(field) => (
                <SettingRow
                  label="Always on Top"
                  description="Keep the overlay visible above other desktop windows."
                  control={
                    <input
                      type="checkbox"
                      checked={field.state.value}
                      onChange={(e) => field.handleChange(e.target.checked)}
                      className="h-4 w-4 accent-primary cursor-pointer"
                    />
                  }
                />
              )}
            </form.Field>

            <Separator />

            <form.Field name="opacity">
              {(field) => (
                <SettingRow
                  label="Window Opacity"
                  description={`Overlay transparency: ${Math.round(field.state.value * 100)}%`}
                  control={
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="0.4"
                        max="1.0"
                        step="0.05"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(Number.parseFloat(e.target.value))}
                        className="w-28 accent-primary cursor-pointer"
                      />
                      <span className="text-xs font-mono text-muted-foreground w-8 text-right">
                        {Math.round(field.state.value * 100)}%
                      </span>
                    </div>
                  }
                />
              )}
            </form.Field>

            <Separator />
          </>
        )}

        {activeSection === "chat" && (
          <>
            <h2 className="text-sm font-semibold mb-1">AI Assistant & Persona</h2>
            <Separator />

            <form.Field name="apiKey" validators={{ onSubmit: required("API key") }}>
              {(field) => (
                <>
                  <SettingRow
                    label="OpenRouter Key"
                    description="Authentication for OpenRouter models."
                    control={
                      <Input
                        type="password"
                        placeholder="sk-or-v1-..."
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                        className="w-44 h-7 text-xs"
                      />
                    }
                  />
                  {field.state.meta.errors[0] && (
                    <p className="text-xs text-destructive -mt-1 pb-1">
                      {field.state.meta.errors[0]}
                    </p>
                  )}
                </>
              )}
            </form.Field>

            <Separator />

            <form.Field name="persona">
              {(field) => (
                <SettingRow
                  label="Active Persona"
                  description="Choose assistant specialization style."
                  control={
                    <select
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      className="rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      {PERSONAS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  }
                />
              )}
            </form.Field>

            <Separator />

            <form.Field name="model" validators={{ onSubmit: required("Model") }}>
              {(field) => (
                <div className="py-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-medium">Model Selection</span>
                      <p className="text-[11px] text-muted-foreground">Select or enter model ID.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsCustomModel(!isCustomModel)}
                      className="text-[11px] text-primary underline"
                    >
                      {isCustomModel ? "Pick from list" : "Enter custom"}
                    </button>
                  </div>
                  {isCustomModel ? (
                    <Input
                      placeholder="e.g. openai/gpt-4o"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      className="w-full h-8 text-xs"
                    />
                  ) : (
                    <select
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      {models.length === 0 ? (
                        <option value={field.state.value}>
                          {field.state.value || "Loading free models..."}
                        </option>
                      ) : (
                        models.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name || m.id}
                          </option>
                        ))
                      )}
                    </select>
                  )}
                </div>
              )}
            </form.Field>

            <Separator />

            <div className="flex flex-col gap-1.5 py-2">
              <span className="text-xs font-medium">Custom Instructions (Optional)</span>
              <span className="text-[11px] text-muted-foreground">
                Overrides default persona instructions if provided.
              </span>
              <form.Field name="instructions">
                {(field) => (
                  <textarea
                    rows={4}
                    placeholder="Custom instructions..."
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none mt-1"
                  />
                )}
              </form.Field>
            </div>

            <Separator />
          </>
        )}

        {activeSection === "shortcuts" && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold mb-1">Keyboard Shortcuts</h2>
            <Separator />
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-border/40">
                <span className="text-muted-foreground">Summon / Toggle Overly</span>
                <kbd className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">
                  Ctrl+Shift+Space
                </kbd>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-border/40">
                <span className="text-muted-foreground">Toggle Ghost (Click-Through)</span>
                <kbd className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">
                  Ctrl+Shift+P
                </kbd>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-border/40">
                <span className="text-muted-foreground">Toggle Web Search</span>
                <kbd className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">
                  Ctrl+K / ⌘K
                </kbd>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-border/40">
                <span className="text-muted-foreground">Stop Generation / Dismiss</span>
                <kbd className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">
                  Escape
                </kbd>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-border/40">
                <span className="text-muted-foreground">Quit Overly</span>
                <kbd className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">
                  Ctrl+Q / ⌘Q
                </kbd>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-muted-foreground">Developer Tools</span>
                <kbd className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">
                  Ctrl+Shift+I
                </kbd>
              </div>
            </div>
          </div>
        )}

        <div className="pt-2">
          <Button type="submit" size="sm" className="h-7 text-xs">
            {saved ? "Saved!" : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}
