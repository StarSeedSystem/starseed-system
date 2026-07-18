"use client";

import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatConfigMenu, type PersonalityOptionContext } from "@/components/aurora/chat-config-menu";

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

  return (
    <div className="relative flex items-center gap-2">
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
      {optsOpen && pos && typeof document !== "undefined" && createPortal(
        <div
          className="fixed z-[9999]"
          style={{ top: pos.top, left: pos.left }}
          onMouseLeave={() => setOptsOpen(false)}
        >
          <ChatConfigMenu convId={convId} context={context} onClose={() => setOptsOpen(false)} />
        </div>,
        document.body,
      )}
    </div>
  );
}
