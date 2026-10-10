import { useState } from "react";
import { Button } from "@overly-chat/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@overly-chat/ui/components/dialog";
import { Spinner } from "@overly-chat/ui/components/spinner";
import { AppWindow, RotateCw } from "lucide-react";
import { toast } from "sonner";
import type { OpenWindowInfo } from "@/env";

interface WindowPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAttach?: (file: File) => void;
}

export function WindowPickerDialog({ open, onOpenChange, onAttach }: WindowPickerDialogProps) {
  const [windows, setWindows] = useState<OpenWindowInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [capturingId, setCapturingId] = useState<string | null>(null);

  const fetchWindows = async () => {
    if (!window.nativeApi?.getOpenWindows) {
      toast.info("Window capture is available in the desktop app");
      return;
    }
    try {
      setLoading(true);
      const list = await window.nativeApi.getOpenWindows();
      setWindows(list);
    } catch (err) {
      console.error("Failed to list windows:", err);
      toast.error("Failed to list open windows");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (nextOpen) {
      fetchWindows();
    }
  };

  const handleSelectWindow = async (win: OpenWindowInfo) => {
    if (!window.nativeApi?.captureWindow) return;
    try {
      setCapturingId(win.id);
      const dataUrl = await window.nativeApi.captureWindow(win.id);
      if (dataUrl) {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const safeName = win.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);
        const file = new File([blob], `window-${safeName}-${Date.now()}.png`, {
          type: "image/png",
        });
        onAttach?.(file);
        toast.success(`Attached "${win.name.slice(0, 40)}" to message`);
        onOpenChange(false);
      } else {
        toast.error("Could not capture window");
      }
    } catch (err) {
      console.error("Failed to capture window:", err);
      toast.error("Failed to capture window");
    } finally {
      setCapturingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg rounded-xl border border-border/80 bg-background/95 backdrop-blur-xl p-4 shadow-2xl">
        <DialogHeader className="mb-2">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
              <AppWindow className="size-4 text-primary" />
              Access Open Windows
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={fetchWindows}
              disabled={loading}
              title="Refresh windows list"
              className="size-6"
            >
              <RotateCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Select an open application window to capture and share directly with the AI model.
          </DialogDescription>
        </DialogHeader>

        {loading && windows.length === 0 ? (
          <div className="flex h-44 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Spinner className="size-5" />
            <span className="text-xs">Scanning open windows…</span>
          </div>
        ) : windows.length === 0 ? (
          <div className="flex h-36 flex-col items-center justify-center gap-1.5 text-center text-muted-foreground">
            <AppWindow className="size-8 opacity-40" />
            <span className="text-xs font-medium">No open application windows detected</span>
            <span className="text-[11px] opacity-75">
              Make sure apps are running and not minimized to tray.
            </span>
          </div>
        ) : (
          <div className="grid max-h-[360px] grid-cols-2 gap-2.5 overflow-y-auto pr-1">
            {windows.map((win) => {
              const isCapturing = capturingId === win.id;
              return (
                <button
                  key={win.id}
                  type="button"
                  onClick={() => handleSelectWindow(win)}
                  disabled={isCapturing}
                  className="group relative flex flex-col overflow-hidden rounded-lg border border-border/60 bg-muted/30 text-left transition-all hover:border-primary/80 hover:bg-muted/60 hover:shadow-md active:scale-98"
                >
                  {/* Thumbnail container */}
                  <div className="relative aspect-video w-full overflow-hidden bg-black/20">
                    {win.thumbnail ? (
                      <img
                        src={win.thumbnail}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <AppWindow className="size-6 text-muted-foreground/50" />
                      </div>
                    )}
                    {isCapturing && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-xs">
                        <Spinner className="size-4" />
                      </div>
                    )}
                  </div>

                  {/* Window title and icon */}
                  <div className="flex items-center gap-2 p-2">
                    {win.appIcon ? (
                      <img src={win.appIcon} alt="" className="size-4 shrink-0 rounded-xs" />
                    ) : (
                      <AppWindow className="size-4 shrink-0 text-muted-foreground/70" />
                    )}
                    <span
                      className="truncate text-[11px] font-medium text-foreground tracking-tight"
                      title={win.name}
                    >
                      {win.name}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
