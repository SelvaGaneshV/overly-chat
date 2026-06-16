import { useForm } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Button } from "@overly-chat/ui/components/button";
import { Input } from "@overly-chat/ui/components/input";

export const Route = createFileRoute("/_layout/settings")({
  component: SettingsComponent,
});

const required =
  (label: string) =>
  ({ value }: { value: string }) =>
    !value.trim() ? `${label} is required` : undefined;

function SettingsComponent() {
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  const form = useForm({
    defaultValues: { apiKey: "", model: "nex-agi/nex-n2-pro:free", instructions: "" },
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
      setLoading(false);
    });
  }, []);

  if (loading) return null;

  return (
    <div className="flex flex-col flex-1 p-4 min-h-0">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="flex flex-col gap-5 p-6 max-w-lg [-webkit-app-region:no-drag]"
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">OpenRouter API Key</label>
          <form.Field name="apiKey" validators={{ onSubmit: required("API key") }}>
            {(field) => (
              <>
                <Input
                  type="password"
                  placeholder="sk-or-v1-..."
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
                {field.state.meta.errors[0] && (
                  <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                )}
              </>
            )}
          </form.Field>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Model</label>
          <form.Field name="model" validators={{ onSubmit: required("Model") }}>
            {(field) => (
              <>
                <Input
                  placeholder="openai/gpt-4o"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
                {field.state.meta.errors[0] && (
                  <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                )}
              </>
            )}
          </form.Field>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Agent Instructions</label>
          <p className="text-xs text-muted-foreground">Custom system prompt for the agent.</p>
          <form.Field name="instructions">
            {(field) => (
              <textarea
                rows={6}
                placeholder="You are a helpful assistant..."
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            )}
          </form.Field>
        </div>

        <Button type="submit" className="w-fit">
          {saved ? "Saved!" : "Save changes"}
        </Button>
      </form>
    </div>
  );
}
