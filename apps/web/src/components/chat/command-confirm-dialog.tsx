import { Button } from "@overly-chat/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@overly-chat/ui/components/dialog";
import { Terminal, TriangleAlert } from "lucide-react";

interface CommandConfirmDialogProps {
  open: boolean;
  command: string;
  description?: string;
  cwd?: string;
  onAllow: () => void;
  onDeny: () => void;
}

export function CommandConfirmDialog({
  open,
  command,
  description,
  cwd,
  onAllow,
  onDeny,
}: CommandConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onDeny()}>
      <DialogContent className="max-w-md rounded-xl border border-border/80 bg-background/95 backdrop-blur-xl p-5 shadow-2xl">
        <DialogHeader className="mb-3">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <Terminal className="size-4 text-amber-500" />
            Run Command?
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {description || "The AI assistant wants to execute the following shell command."}
          </DialogDescription>
        </DialogHeader>

        {/* Command block */}
        <div className="rounded-md bg-black/80 border border-border/40 p-3 font-mono text-xs">
          <div className="text-amber-400/70 text-[10px] mb-1 select-none">$ command</div>
          <pre className="whitespace-pre-wrap break-all text-green-300">{command}</pre>
          {cwd && (
            <div className="mt-2 text-[10px] text-muted-foreground">
              <span className="text-blue-400/70">in: </span>
              {cwd}
            </div>
          )}
        </div>

        {/* Warning */}
        <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400">
          <TriangleAlert className="size-3.5 mt-0.5 shrink-0" />
          <span>This command runs with your user permissions. Review before allowing.</span>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-1">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onDeny}>
            Deny
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
            onClick={onAllow}
          >
            Allow
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
