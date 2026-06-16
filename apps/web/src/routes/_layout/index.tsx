import { Chat } from "@/components/chat";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_layout/")({
  component: HomeComponent,
  
});

function HomeComponent() {
  return <Chat />;
}
