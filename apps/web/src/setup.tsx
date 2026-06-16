import "@overly-chat/ui/globals.css";
import { useForm } from "@tanstack/react-form";
import { Button } from "@overly-chat/ui/components/button";
import { Input } from "@overly-chat/ui/components/input";
import { useState } from "react";
import ReactDOM from "react-dom/client";

const STEPS = ["api", "model", "instructions"] as const;
type Step = (typeof STEPS)[number];

const required = (label: string) => ({ value }: { value: string }) =>
  !value.trim() ? `${label} is required` : undefined;

const Setup = () => {
  const [step, setStep] = useState<Step>("api");
  const [saved, setSaved] = useState({ apiKey: "", model: "nex-agi/nex-n2-pro:free" });

  const apiForm = useForm({
    defaultValues: { apiKey: "" },
    onSubmit: ({ value }) => {
      setSaved((s) => ({ ...s, apiKey: value.apiKey }));
      setStep("model");
    },
  });

  const modelForm = useForm({
    defaultValues: { model: "nex-agi/nex-n2-pro:free" },
    onSubmit: ({ value }) => {
      setSaved((s) => ({ ...s, model: value.model }));
      setStep("instructions");
    },
  });

  const instructionsForm = useForm({
    defaultValues: { instructions: "" },
    onSubmit: ({ value }) => {
      window.nativeApi?.saveApiKey(
        JSON.stringify({
          apiKey: saved.apiKey,
          model: saved.model,
          instructions: value.instructions,
        }),
      );
    },
  });

  return (
    <div className="dark flex h-screen flex-col items-center justify-center gap-6 bg-background px-8 text-foreground [-webkit-app-region:drag]">
      <div className="flex gap-1.5 mb-1">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`h-1 w-8 rounded-full transition-colors ${STEPS.indexOf(step) >= i ? "bg-primary" : "bg-muted"}`}
          />
        ))}
      </div>

      {step === "api" && (
        <>
          <div className="flex flex-col items-center gap-1">
            <h1 className="text-lg font-semibold">Welcome to Overly</h1>
            <p className="text-sm text-muted-foreground">Enter your OpenRouter API key to get started.</p>
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); apiForm.handleSubmit(); }}
            className="flex w-full max-w-sm flex-col gap-3 [-webkit-app-region:no-drag]"
          >
            <apiForm.Field name="apiKey" validators={{ onSubmit: required("API key") }}>
              {(field) => (
                <div className="flex flex-col gap-1">
                  <Input
                    autoFocus
                    type="password"
                    placeholder="sk-or-v1-..."
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                  {field.state.meta.errors[0] && (
                    <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                  )}
                </div>
              )}
            </apiForm.Field>
            <Button type="submit" className="w-full">Continue</Button>
          </form>
          <p className="text-xs text-muted-foreground">Your key is stored encrypted on this device.</p>
        </>
      )}

      {step === "model" && (
        <>
          <div className="flex flex-col items-center gap-1">
            <h1 className="text-lg font-semibold">Choose a Model</h1>
            <p className="text-sm text-muted-foreground">Enter the OpenRouter model ID to use.</p>
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); modelForm.handleSubmit(); }}
            className="flex w-full max-w-sm flex-col gap-3 [-webkit-app-region:no-drag]"
          >
            <modelForm.Field name="model" validators={{ onSubmit: required("Model") }}>
              {(field) => (
                <div className="flex flex-col gap-1">
                  <Input
                    autoFocus
                    placeholder="openai/gpt-4o"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                  {field.state.meta.errors[0] && (
                    <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                  )}
                </div>
              )}
            </modelForm.Field>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep("api")}>Back</Button>
              <Button type="submit" className="flex-1">Continue</Button>
            </div>
          </form>
        </>
      )}

      {step === "instructions" && (
        <>
          <div className="flex flex-col items-center gap-1">
            <h1 className="text-lg font-semibold">Agent Instructions</h1>
            <p className="text-sm text-muted-foreground">Give your agent a custom system prompt. (optional)</p>
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); instructionsForm.handleSubmit(); }}
            className="flex w-full max-w-sm flex-col gap-3 [-webkit-app-region:no-drag]"
          >
            <instructionsForm.Field name="instructions">
              {(field) => (
                <textarea
                  autoFocus
                  rows={5}
                  placeholder="You are a helpful assistant..."
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              )}
            </instructionsForm.Field>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep("model")}>Back</Button>
              <Button type="submit" className="flex-1">Finish</Button>
            </div>
          </form>
        </>
      )}
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("setup")!).render(<Setup />);
