import { ModeToggle } from "@/components/mode-toggle";
import bubbleLogo from "@/assets/bubble-logo.png";
import { Button } from "@overly-chat/ui/components/button";
import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { ArrowLeftIcon, MinusIcon, Settings, XIcon } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useRef, useState } from "react";
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

// Collapsed bubble: outer ring is the native OS drag handle, inner logo is
// a real (no-drag) button. Clicks don't fire on drag regions — the OS
// claims the gesture — so the clickable element must opt out with
// no-drag-region, exactly like the header buttons do. No IPC is involved
// in dragging, so there's nothing here that can disturb the window size.
function BubbleButton({ onExpand }: { onExpand: () => void }) {
  return (
    <div
      title="Drag to move"
      className="drag-region flex size-16 touch-none items-center justify-center rounded-full border bg-background shadow-xl"
    >
      <button
        type="button"
        onClick={onExpand}
        aria-label="Expand chat"
        title="Expand chat"
        className="no-drag-region flex size-12 items-center justify-center rounded-full transition-transform duration-200 hover:scale-105 active:scale-95"
      >
        <img
          src={bubbleLogo}
          alt=""
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          className="pointer-events-none size-10 rounded-full select-none"
        />
      </button>
    </div>
  );
}

function RouteComponent() {
  const { pathname } = useLocation();
  const [isBubble, setIsBubble] = useState(false);

  const minimize = () => {
    setIsBubble(true);
    window.nativeApi?.minimizeToBubble();
  };

  const expand = () => {
    setIsBubble(false);
    window.nativeApi?.expandFromBubble();
  };

  if (isBubble) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-transparent">
        <BubbleButton onExpand={expand} />
      </div>
    );
  }

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden rounded-lg border bg-background">
      <div className="drag-region flex h-10 shrink-0 cursor-grab items-center justify-between rounded-t-lg border-b bg-muted/30 px-3 select-none active:cursor-grabbing">
        <div className="flex items-center gap-1">
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
          <span className="text-xs font-medium text-muted-foreground">
            {ROUTE_METADATA[pathname]?.title ?? "Overly"}
          </span>
        </div>
        <div className="no-drag-region flex items-center">
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
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
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
  );
}
