"use client";

import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Settings, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatConfigMenu, providerLabel, type PersonalityOptionContext } from "@/components/aurora/chat-config-menu";
import { useAiConversations } from "@/lib/aurora/conversations";

/**
 * ChatHeaderOptions — único botón "Opciones" que abre el MENÚ UNIFICADO de
 * configuración de chat de Astraura (7 secciones: Memorias, Personalidad,
 * Sentidos, Motor de modelos, Capacidades, Habilidades, Conexiones).
 *
 * Todo lo que antes estaba en el dropdown "Ajustes de Aurora" (personalidad,
 * modelo, puente Hermione…) vive AHORA dentro de ese menú, por chat y
 * sincronizado. Por eso el botón "Ajustes de Aurora" se eliminó: no debe
 * haber dos entradas que hagan lo mismo.
 *
 * El menú se renderiza en PORTAL a document.body (position: fixed, z-[9999])
 * para aparecer SIEMPRE encima de todas las capas y dentro de la pantalla,
 * sin parpadeos por stacking/backdrop-blur anidados. (Adenda 71-bis)
 */
export function ChatHeaderOptions({ context = "astraura", convId }: { context?: PersonalityOptionContext; convId?: string | null }) {
  const [optsOpen, setOptsOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const openOpts = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const width = typeof window !== "undefined" && window.innerWidth >= 640 ? 384 : Math.min(window.innerWidth * 0.92, 352);
      let left = r.right - width;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      // Si no cabe abajo, anclar arriba del botón para que quede DENTRO de la pantalla.
      const estH = typeof window !== "undefined" ? Math.min(window.innerHeight * 0.7, 560) : 480;
      let top = r.bottom + 8;
      if (top + estH > window.innerHeight - 8) top = Math.max(8, r.top - estH - 8);
      setPos({ top, left });
    }
    setOptsOpen((v) => !v);
  };

  // Badge de modelo por chat (Adenda 71-bis fix-21): muestra el proveedor/
  // modelo fijado para ESTE chat, leído de meta.config.provider.
  const { conversations } = useAiConversations();
  const prov = (conversations.find((c) => c.id === convId)?.meta as any)?.config?.provider;
  const provLabel = providerLabel(prov);

  return (
    <div className="relative flex items-center gap-2">
      {provLabel && (
        <span
          className="hidden sm:inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-light tracking-wide text-white/70"
          title={`Modelo de este chat: ${provLabel}`}
        >
          <Cpu className="h-3 w-3 text-[#39FF14]" /> {provLabel}
        </span>
      )}
      <Button
        ref={btnRef}
        variant="outline"
        size="sm"
        onClick={openOpts}
        className="bg-card/60 backdrop-blur border-border/50 shadow-sm text-xs rounded-full hover:bg-cyan-500/10"
      >
        <Settings className="w-3.5 h-3.5 mr-2" />
        Opciones
      </Button>
      {/* Ventana CENTRADA (Adenda 103): amplia y contenida, no se sale de pantalla
          aunque se desplieguen sus secciones. Cierra al pulsar el fondo o Escape. */}
      {optsOpen && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOptsOpen(false);
          }}
        >
          <ChatConfigMenu convId={convId} context={context} onClose={() => setOptsOpen(false)} />
        </div>,
        document.body,
      )}
    </div>
  );
}
