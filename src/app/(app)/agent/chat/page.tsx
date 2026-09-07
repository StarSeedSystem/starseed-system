"use client";

// Chat de Astraura a PANTALLA COMPLETA (Adenda 76 · G1).
// Reutiliza el cuerpo compartido `ChatSurface` (mismo pipeline y almacén
// unificado que el tab «Chats» de /agent, el orbe y el Exocórtex) con una barra
// lateral colapsable de navegación (Espacios + Folders + Chats). Deep-link
// opcional `?id=<convId>` para abrir una conversación concreta.

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChatSurface } from "@/components/agent/chat-surface";

function AgentChatInner() {
  const params = useSearchParams();
  const id = params?.get("id") ?? null;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Altura útil REAL del viewport (Ola 278 · CH1): en /agent/chat no hay dock que
  // reserve espacio; la reserva fija de 7–11 rem dejaba una banda vacía de ~250 px
  // abajo y «encogía» el compositor. Medimos con ResizeObserver la altura desde el
  // borde superior del contenedor hasta el pie de la ventana: así el compositor
  // queda pegado al borde inferior (16 px) con independencia de que el dock o la
  // barra superior aparezcan o no (dependen de la configuración del usuario).
  const [availH, setAvailH] = useState<number | null>(null);

  useEffect(() => {
    const measure = () => {
      const el = wrapRef.current;
      if (!el) return;
      setAvailH(Math.max(0, Math.round(window.innerHeight - el.getBoundingClientRect().top)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (document.body) ro.observe(document.body);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    // box-border: el alto incluye el padding, así el margen inferior resultante es
    // el padding-bottom (pb-4 = 16 px) y no hay banda vacía bajo el compositor.
    <div
      ref={wrapRef}
      style={availH != null ? { height: availH } : undefined}
      className="flex flex-col overflow-hidden w-full max-w-[1600px] mx-auto box-border pt-3 pb-4 sm:pt-4 sm:pb-4 md:pt-6 md:pb-4 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]"
    >
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
