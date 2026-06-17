import { useForm } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Button } from "@overly-chat/ui/components/button";
import { Input } from "@overly-chat/ui/components/input";
import { Separator } from "@overly-chat/ui/components/separator";
import { isElectron } from "../../env";

export const Route = createFileRoute("/_layout/settings")({
  component: SettingsComponent,
});

const required =
  (label: string) =>
  ({ value }: { value: string }) =>
    !value.trim() ? `${label} is required` : undefined;

type Section = "app" | "chat";

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
      className={`w-full text-left px-2.5 py-1.5 rounded text-sm transition-colors ${
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
        <span className="text-sm font-medium leading-none">{label}</span>
        {description && (
          <span className="text-xs text-muted-foreground leading-snug">{description}</span>
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

  const form = useForm({
    defaultValues: {
      apiKey: "",
      model: "nex-agi/nex-n2-pro:free",
      instructions: "",
      alwaysOnTop: true,
    },
    onSubmit: async ({ value }) => {
      await window.nativeApi?.saveConfig(value);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  useEffect(() => {
    window.nativeApi?.getConfig().then((config) => {
      form.setFieldValue("apiKey", config.apiKey);
      form.setFieldValue("model", config.model);
      form.setFieldValue("instructions", config.instructions);
      form.setFieldValue("alwaysOnTop", config.alwaysOnTop);
      setLoading(false);
    });
  }, []);

  if (loading) return null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="flex flex-1 min-h-0 [-webkit-app-region:no-drag]"
    >
      {/* Sidebar */}
      <nav className="flex flex-col gap-0.5 w-27.5 shrink-0 border-r bg-muted/20 p-2 overflow-y-auto">
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
          label="General"
          active={activeSection === "chat"}
          onClick={() => setActiveSection("chat")}
        />
      </nav>

      {/* Content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-y-auto p-5 gap-1">
        {activeSection === "app" && (
          <>
            <h2 className="text-base font-semibold mb-1">Window</h2>
            <Separator />

            <form.Field name="alwaysOnTop">
              {(field) => (
                <SettingRow
                  label="Always on Top"
                  description="Keep the overlay above all other windows."
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
          </>
        )}

        {activeSection === "chat" && (
          <>
            <h2 className="text-base font-semibold mb-1">General</h2>
            <Separator />

            <form.Field name="apiKey" validators={{ onSubmit: required("API key") }}>
              {(field) => (
                <>
                  <SettingRow
                    label="OpenRouter API Key"
                    description="Used to authenticate with OpenRouter."
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

            <form.Field name="model" validators={{ onSubmit: required("Model") }}>
              {(field) => (
                <>
                  <SettingRow
                    label="Model"
                    description="The language model to use."
                    control={
                      <Input
                        placeholder="openai/gpt-4o"
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

            <div className="flex flex-col gap-1.5 py-3">
              <span className="text-sm font-medium">Agent Instructions</span>
              <span className="text-xs text-muted-foreground">
                Custom system prompt for the agent.
              </span>
              <form.Field name="instructions">
                {(field) => (
                  <textarea
                    rows={5}
                    placeholder="You are a helpful assistant..."
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none mt-1"
                  />
                )}
              </form.Field>
            </div>

            <Separator />
          </>
        )}

        <div className="pt-3">
          <Button type="submit" size="sm">
            {saved ? "Saved!" : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}
