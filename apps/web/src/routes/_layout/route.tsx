import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@overly-chat/ui/components/button";
import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { ArrowLeftIcon, Settings, XIcon } from "lucide-react";
import { Rnd } from "react-rnd";

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

function RouteComponent() {
  const { pathname } = useLocation();
  return (
    <Rnd
      default={{ x: 1000, y: 100, width: 400, height: 700 }}
      minWidth={320}
      minHeight={200}
      dragHandleClassName="drag-handle"
      bounds="window"
      className="rounded-lg border opacity-85 hover:opacity-100 transition-opacity duration-300 bg-background overflow-hidden"
      onMouseEnter={() => window.nativeApi?.setInteractive(true)}
      onMouseLeave={() => window.nativeApi?.setInteractive(false)}
    >
      <div className="flex flex-col h-full">
        <div className="drag-handle flex items-center justify-between px-3 h-10 shrink-0 cursor-grab active:cursor-grabbing border-b bg-muted/30 rounded-t-lg select-none">
          <span className="text-xs font-medium text-muted-foreground">
            {ROUTE_METADATA[pathname]?.title ?? "Overly"}
          </span>
          <div className="flex items-center">
            {pathname === "/" ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                render={
                  <Link onMouseDown={(e) => e.stopPropagation()} to="/settings">
                    <Settings size={12} />
                  </Link>
                }
              />
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                render={
                  <Link onMouseDown={(e) => e.stopPropagation()} to="/">
                    <ArrowLeftIcon size={12} />
                  </Link>
                }
              />
            )}
            <ModeToggle />
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => window.nativeApi?.closeWindow()}
            >
              <XIcon size={12} />
            </Button>
          </div>
        </div>
        <Outlet />
      </div>
    </Rnd>
  );
}
