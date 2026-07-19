"use client";

// Chat de Astraura a PANTALLA COMPLETA (Adenda 76 · G1).
// Reutiliza el cuerpo compartido `ChatSurface` (mismo pipeline y almacén
// unificado que el tab «Chats» de /agent, el orbe y el Exocórtex) con una barra
// lateral colapsable de navegación (Espacios + Folders + Chats). Deep-link
// opcional `?id=<convId>` para abrir una conversación concreta.

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ChatSurface } from "@/components/agent/chat-surface";

function AgentChatInner() {
  const params = useSearchParams();
  const id = params?.get("id") ?? null;
  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col p-3 sm:p-4 md:p-6 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] max-w-[1600px] mx-auto w-full box-border overflow-hidden">
      <ChatSurface variant="fullscreen" initialConvId={id} className="flex-1" />
    </div>
  );
}

export default function AgentChatPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Cargando chat…</div>}>
      <AgentChatInner />
    </Suspense>
  );
}
