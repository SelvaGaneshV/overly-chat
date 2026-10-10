import { useState } from "react";
import { Button } from "@overly-chat/ui/components/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@overly-chat/ui/components/hover-card";
import { Square, Maximize2, RotateCcw } from "lucide-react";
import type { WindowSnapPosition } from "@/env";

export function WindowSnapLayouts() {
  const [open, setOpen] = useState(false);

  const snap = (position: WindowSnapPosition) => {
    window.nativeApi?.snapWindow?.(position);
    setOpen(false);
  };

  return (
    <HoverCard open={open} onOpenChange={setOpen}>
      <HoverCardTrigger
        delay={150}
        closeDelay={150}
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground hover:text-foreground"
            title="Snap Layouts (hover for options · click to toggle maximize)"
            onClick={() => snap("maximize")}
          >
            <Square className="size-3" />
          </Button>
        }
      />
      <HoverCardContent
        side="bottom"
        align="end"
        sideOffset={6}
        className="w-[290px] rounded-xl border border-border/80 bg-popover/95 p-3 shadow-2xl backdrop-blur-xl"
      >
        <div className="mb-2.5 flex items-center justify-between border-b border-border/50 pb-2">
          <span className="text-[11px] font-semibold text-foreground tracking-tight">
            Snap Layouts
          </span>
          <span className="text-[10px] text-muted-foreground">Select a shape</span>
        </div>

        {/* 2x2 Layout Grid modeled after Windows 11 Snap Layouts */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Layout 1: Split 50 / 50 */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-muted-foreground">Halves (50/50)</span>
            <div className="flex h-[52px] gap-1 rounded-md border border-border/70 bg-muted/40 p-1">
              <button
                type="button"
                onClick={() => snap("left-half")}
                title="Snap to Left Half (50%)"
                className="flex-1 rounded-xs border border-border/60 bg-background/80 transition-all hover:border-primary hover:bg-primary/35 hover:shadow-xs active:scale-95"
              />
              <button
                type="button"
                onClick={() => snap("right-half")}
                title="Snap to Right Half (50%)"
                className="flex-1 rounded-xs border border-border/60 bg-background/80 transition-all hover:border-primary hover:bg-primary/35 hover:shadow-xs active:scale-95"
              />
            </div>
          </div>

          {/* Layout 2: Assistant Sidebar */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-muted-foreground">Sidebars</span>
            <div className="flex h-[52px] gap-1 rounded-md border border-border/70 bg-muted/40 p-1">
              <button
                type="button"
                onClick={() => snap("left-sidebar")}
                title="Dock as Left Sidebar"
                className="w-[34%] rounded-xs border border-border/60 bg-background/80 transition-all hover:border-primary hover:bg-primary/35 hover:shadow-xs active:scale-95"
              />
              <button
                type="button"
                onClick={() => snap("right-sidebar")}
                title="Dock as Right Sidebar (Assistant)"
                className="flex-1 rounded-xs border border-border/60 bg-background/80 transition-all hover:border-primary hover:bg-primary/35 hover:shadow-xs active:scale-95"
              />
            </div>
          </div>

          {/* Layout 3: Four Quarters */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-muted-foreground">Quarters (2×2)</span>
            <div className="grid h-[52px] grid-cols-2 grid-rows-2 gap-1 rounded-md border border-border/70 bg-muted/40 p-1">
              <button
                type="button"
                onClick={() => snap("top-left")}
                title="Snap to Top-Left Corner"
                className="rounded-xs border border-border/60 bg-background/80 transition-all hover:border-primary hover:bg-primary/35 hover:shadow-xs active:scale-95"
              />
              <button
                type="button"
                onClick={() => snap("top-right")}
                title="Snap to Top-Right Corner"
                className="rounded-xs border border-border/60 bg-background/80 transition-all hover:border-primary hover:bg-primary/35 hover:shadow-xs active:scale-95"
              />
              <button
                type="button"
                onClick={() => snap("bottom-left")}
                title="Snap to Bottom-Left Corner"
                className="rounded-xs border border-border/60 bg-background/80 transition-all hover:border-primary hover:bg-primary/35 hover:shadow-xs active:scale-95"
              />
              <button
                type="button"
                onClick={() => snap("bottom-right")}
                title="Snap to Bottom-Right Corner"
                className="rounded-xs border border-border/60 bg-background/80 transition-all hover:border-primary hover:bg-primary/35 hover:shadow-xs active:scale-95"
              />
            </div>
          </div>

          {/* Layout 4: Center Float & Full */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-muted-foreground">Float & Full</span>
            <div className="relative flex h-[52px] items-center justify-center gap-1 rounded-md border border-border/70 bg-muted/40 p-1">
              <button
                type="button"
                onClick={() => snap("center")}
                title="Center Floating Overlay (420×720)"
                className="h-[80%] w-[55%] rounded-xs border border-border/60 bg-background/80 text-[9px] font-medium text-muted-foreground transition-all hover:border-primary hover:bg-primary/35 hover:text-primary hover:shadow-xs active:scale-95"
              >
                Center
              </button>
              <button
                type="button"
                onClick={() => snap("maximize")}
                title="Maximize to Full Screen"
                className="flex h-[80%] w-[35%] items-center justify-center rounded-xs border border-border/60 bg-background/80 text-muted-foreground transition-all hover:border-primary hover:bg-primary/35 hover:text-primary hover:shadow-xs active:scale-95"
              >
                <Maximize2 className="size-2.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="mt-2.5 flex items-center justify-between border-t border-border/50 pt-2">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => snap("restore")}
            className="h-6 gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-2.5" />
            Restore Default Size
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => snap("maximize")}
            className="h-6 text-[10px] text-muted-foreground hover:text-foreground"
          >
            Maximize
          </Button>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
