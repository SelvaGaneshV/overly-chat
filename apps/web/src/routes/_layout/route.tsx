import { ModeToggle } from "@/components/mode-toggle";
import { WindowSnapLayouts } from "@/components/window-snap-layouts";
import bubbleLogo from "@/assets/bubble-logo.png";
import { Button } from "@overly-chat/ui/components/button";
import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { ArrowLeftIcon, Ghost, GripVertical, MinusIcon, Move, Settings, XIcon } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
const ROUTE_METADATA: Record<string, { title: string }> = {
  "/": {
    title: "Overly",
  },
  "/settings": {
    title: "Settings",
  },
};

export const Route = createFileRoute("/_layout")({
  component: RouteComponent,
});

// Custom resize handles. The BrowserWindow is resizable:false so the OS
// never shows resize cursors; dragging a handle sends the target size to
// main, which clamps, anchor-adjusts, and snaps it.
type ResizeAxis = "both" | "x" | "y";

// Shared resize-drag session, keyed off globalThis so it survives hot-reload
// remounts (module scope is re-executed on remount). Only the newest
// session may act; orphaned listeners from an interrupted drag self-remove
// on their next event instead of resizing.
type DragSessions = { resize: number };
const dragSessions: DragSessions = ((
  globalThis as unknown as Record<string, unknown>
).__overlyDragSessions ??= {
  resize: 0,
}) as DragSessions;

function useResizeDrag(axis: ResizeAxis) {
  // Guards against stacked drags (multitouch / remounts) accumulating
  // duplicate window listeners, which would resize on every mousemove.
  const active = useRef(false);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!window.nativeApi || active.current) return;
    active.current = true;
    dragSessions.resize += 1;
    const session = dragSessions.resize;
    const isLive = () => dragSessions.resize === session;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore — drag still works via window listeners
    }
    // NOTE: deltas use screenX/screenY (screen space), not clientX/clientY.
    // When docked, resizing moves the viewport origin itself, so viewport-
    // relative coords would feed back into the next step and run away.
    const startX = e.screenX;
    const startY = e.screenY;
    const startW = window.innerWidth;
    const startH = window.innerHeight;
    let raf = 0;

    const sendSize = (screenX: number, screenY: number) => {
      window.nativeApi?.resizeChatWindow({
        width: axis === "y" ? startW : Math.round(startW + (screenX - startX)),
        height: axis === "x" ? startH : Math.round(startH + (screenY - startY)),
      });
    };

    const onMove = (ev: PointerEvent) => {
      if (!isLive()) {
        cleanup();
        return;
      }
      // Defensive: ignore events with non-numeric coords (they poison
      // every downstream computation with NaN).
      if (!Number.isFinite(ev.screenX) || !Number.isFinite(ev.screenY)) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (isLive()) sendSize(ev.screenX, ev.screenY);
      });
    };

    const cleanup = () => {
      cancelAnimationFrame(raf);
      active.current = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };

    const onUp = (ev: PointerEvent) => {
      const live = isLive();
      try {
        if (live && Number.isFinite(ev.screenX) && Number.isFinite(ev.screenY)) {
          sendSize(ev.screenX, ev.screenY);
          window.nativeApi?.resizeChatWindowEnd();
        }
      } finally {
        cleanup();
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  return onPointerDown;
}

// Right edge: width only. Starts below the header so the title bar stays
// fully draggable. Always shows a faint pill so the handle is discoverable;
// hover brightens it since the cursor intentionally stays default.
function ResizeEdgeRight() {
  const onPointerDown = useResizeDrag("x");

  return (
    <div
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize width"
      title="Drag to resize width"
      className="group no-drag-region absolute top-11 right-0 bottom-6 z-40 flex w-2.5 touch-none items-center justify-center bg-transparent transition-colors hover:bg-primary/15"
    >
      <div className="h-16 w-1 rounded-full bg-border transition-colors group-hover:bg-primary/60" />
    </div>
  );
}

// Bottom edge: height only. Stops before the corner grip.
function ResizeEdgeBottom() {
  const onPointerDown = useResizeDrag("y");

  return (
    <div
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize height"
      title="Drag to resize height"
      className="group no-drag-region absolute right-6 bottom-0 left-2 z-40 flex h-2.5 touch-none items-center justify-center bg-transparent transition-colors hover:bg-primary/15"
    >
      <div className="h-1 w-16 rounded-full bg-border transition-colors group-hover:bg-primary/60" />
    </div>
  );
}

// Bottom-right corner: width + height.
function ResizeGrip() {
  const onPointerDown = useResizeDrag("both");

  return (
    <div
      onPointerDown={onPointerDown}
      role="separator"
      aria-label="Resize window"
      title="Drag to resize"
      className="no-drag-region absolute right-1 bottom-1 z-50 flex size-4 touch-none items-end justify-end text-muted-foreground/60 hover:text-muted-foreground"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M11 1v10H1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M11 5.5V11H5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

import { cn } from "@overly-chat/ui/lib/utils";

// Collapsed bubble: outer ring is the native OS drag handle, inner logo is
// a real (no-drag) button.
function BubbleButton({ onExpand }: { onExpand: () => void }) {
  return (
    <div
      title="Drag to reposition · Click logo to open"
      className="drag-region group relative flex size-16 touch-none items-center justify-center rounded-full border border-border/70 bg-background/95 backdrop-blur-md shadow-2xl transition-all duration-300 hover:ring-2 hover:ring-primary/40 hover:scale-105 active:scale-95"
    >
      {/* Visual drag handle indicator badge */}
      <div
        className="drag-region pointer-events-none absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full border border-border/80 bg-background/95 text-muted-foreground shadow-xs transition-transform duration-200 group-hover:scale-110"
        title="Drag handle"
      >
        <Move className="size-2.5 text-foreground/80 pointer-events-none" />
      </div>

      <button
        type="button"
        onClick={onExpand}
        aria-label="Expand chat"
        title="Click to expand chat"
        className="no-drag-region group/btn flex size-12 items-center justify-center rounded-full transition-transform duration-200"
      >
        <img
          src={bubbleLogo}
          alt=""
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          className="pointer-events-none size-10 rounded-full select-none transition-transform duration-200 group-hover/btn:scale-110 group-active/btn:scale-90"
        />
      </button>
    </div>
  );
}

function RouteComponent() {
  const { pathname } = useLocation();
  const [isBubble, setIsBubble] = useState(false);
  const [isMinimizing, setIsMinimizing] = useState(false);
  const [isGhostMode, setIsGhostMode] = useState(false);

  const minimize = () => {
    if (isMinimizing || isBubble) return;
    setIsMinimizing(true);
    setTimeout(() => {
      setIsBubble(true);
      setIsMinimizing(false);
      window.nativeApi?.minimizeToBubble();
    }, 180);
  };

  const expand = () => {
    window.nativeApi?.expandFromBubble();
    setIsBubble(false);
  };

  useEffect(() => {
    const unsubGhost = window.nativeApi?.onGhostModeChange?.((active) => {
      setIsGhostMode(active);
    });
    const unsubMin = window.nativeApi?.onRequestMinimize?.(() => {
      if (!isBubble && !isMinimizing) {
        minimize();
      }
    });
    const unsubExp = window.nativeApi?.onRequestExpand?.(() => {
      if (isBubble) {
        expand();
      }
    });
    return () => {
      unsubGhost?.();
      unsubMin?.();
      unsubExp?.();
    };
  }, [isBubble, isMinimizing]);

  const toggleGhost = () => {
    const next = !isGhostMode;
    setIsGhostMode(next);
    window.nativeApi?.setGhostMode(next);
  };

  return (
    <div className="relative flex h-screen w-screen overflow-hidden select-none bg-transparent">
      {/* Bubble view (when minimized) */}
      {isBubble && (
        <div className="flex h-full w-full items-center justify-center animate-in zoom-in-75 fade-in-0 duration-200">
          <BubbleButton onExpand={expand} />
        </div>
      )}

      {/* Main panel view - preserved in DOM to avoid state and scroll resets */}
      <div
        className={cn(
          "relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-border/50 bg-background/90 backdrop-blur-xl shadow-2xl transition-all duration-200 origin-top-right",
          isBubble && "hidden pointer-events-none",
          isMinimizing
            ? "scale-75 opacity-0 translate-x-2 -translate-y-2 duration-180 ease-in pointer-events-none"
            : !isBubble && "animate-in zoom-in-95 fade-in-0 duration-200 ease-out",
          isGhostMode ? "opacity-70 ring-2 ring-primary/50" : "",
        )}
      >
        {isGhostMode && (
          <div className="no-drag-region z-50 flex items-center justify-between bg-primary/90 px-3 py-1 text-[11px] font-medium text-primary-foreground shadow-sm">
            <span className="flex items-center gap-1.5">
              <Ghost className="size-3 animate-pulse" />
              Ghost Mode · Clicks pass through to background apps
            </span>
            <button
              type="button"
              onClick={() => toggleGhost()}
              className="rounded bg-primary-foreground/20 px-1.5 py-0.5 hover:bg-primary-foreground/30 font-semibold"
            >
              Resume (Ctrl+Shift+P)
            </button>
          </div>
        )}

        <div className="drag-region flex h-10 shrink-0 items-center justify-between rounded-t-xl border-b bg-muted/40 px-3 select-none">
          <div
            className="drag-region flex items-center gap-1.5 select-none"
            title="Drag to move window"
          >
            {pathname !== "/" && (
              <Button
                variant="ghost"
                size="icon"
                className="no-drag-region size-6 shrink-0"
                render={
                  <Link to="/">
                    <ArrowLeftIcon size={12} />
                  </Link>
                }
              />
            )}
            <GripVertical className="size-3.5 text-muted-foreground/70 shrink-0 pointer-events-none" />
            <span className="pointer-events-none text-xs font-semibold text-foreground/80 tracking-tight select-none">
              {ROUTE_METADATA[pathname]?.title ?? "Overly"}
            </span>
          </div>

          <div className="no-drag-region flex items-center gap-0.5">
            {pathname === "/" && (
              <Button
                variant={isGhostMode ? "default" : "ghost"}
                size="icon"
                className="size-6 text-muted-foreground hover:text-foreground"
                title="Toggle Ghost Mode (Ctrl+Shift+P) - click through overlay"
                onClick={toggleGhost}
              >
                <Ghost size={12} />
              </Button>
            )}
            {pathname === "/" && (
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                render={
                  <Link to="/settings">
                    <Settings size={12} />
                  </Link>
                }
              />
            )}
            <ModeToggle />
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              title="Minimize to bubble"
              onClick={minimize}
            >
              <MinusIcon size={12} />
            </Button>
            <WindowSnapLayouts />
            <Button
              variant="ghost"
              size="icon"
              className="size-6 hover:bg-destructive hover:text-destructive-foreground"
              title="Close window"
              onClick={() => window.nativeApi?.closeWindow()}
            >
              <XIcon size={12} />
            </Button>
          </div>
        </div>
        <div className="no-drag-region flex min-h-0 flex-1 flex-col">
          <Outlet />
        </div>
        <ResizeEdgeRight />
        <ResizeEdgeBottom />
        <ResizeGrip />
      </div>
    </div>
  );
}
