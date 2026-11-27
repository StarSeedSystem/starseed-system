"use client";

import { useState, useMemo } from "react";
import { Search, RotateCcw, X, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SeccionAjuste = "general" | "privacidad" | "sync" | "avanzado";

export interface PanelAjustesPilarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pilarId?: string;
  pilarNombre: string;
  seccionInicial?: SeccionAjuste;
  children?: React.ReactNode;
  onVolverRecomendado?: () => void;
}

export default function PanelAjustesPilar({
  open,
  onOpenChange,
  pilarNombre,
  seccionInicial = "general",
  children,
  onVolverRecomendado,
}: PanelAjustesPilarProps) {
  const [seccion, setSeccion] = useState<SeccionAjuste>(seccionInicial);
  const [busqueda, setBusqueda] = useState("");
  const [confirmarRecomendado, setConfirmarRecomendado] = useState(false);

  if (!open) return null;

  const secciones: { id: SeccionAjuste; label: string }[] = [
    { id: "general", label: "General" },
    { id: "privacidad", label: "Privacidad y permisos" },
    { id: "sync", label: "Sincronía" },
    { id: "avanzado", label: "Avanzado" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-lg h-full bg-black border-l border-white/10 flex flex-col shadow-2xl overflow-hidden">
        {/* Cabecera */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-semibold text-cyan-50">
              Ajustes · {pilarNombre}
            </h2>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-white/50 hover:text-white p-1 rounded-lg hover:bg-white/10 cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de búsqueda */}
        <div className="p-4 border-b border-white/10 bg-black/40">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-white/40" />
            <input
              type="text"
              placeholder="Buscar en ajustes…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-black/60 pl-9 pr-4 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
          </div>
        </div>

        {/* Pestañas de sección */}
        <div className="flex border-b border-white/10 overflow-x-auto bg-white/[0.01] px-2">
          {secciones.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setSeccion(s.id);
                if (typeof window !== "undefined") {
                  try {
                    const p = new URLSearchParams(window.location.search);
                    p.set("ajustes", s.id);
                    window.history.replaceState(null, "", `${window.location.pathname}?${p.toString()}`);
                  } catch {
                    /* noop */
                  }
                }
              }}
              className={cn(
                "px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer",
                seccion === s.id
                  ? "border-cyan-400 text-cyan-200 bg-cyan-500/10"
                  : "border-transparent text-white/60 hover:text-white hover:bg-white/5",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Contenido de la sección */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="space-y-4">
            {children ? (
              children
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/70">
                <p className="font-medium text-white mb-1">Sección: {secciones.find(s => s.id === seccion)?.label}</p>
                <p className="text-xs text-white/50">Opciones y configuración avanzada para {pilarNombre}.</p>
              </div>
            )}
          </div>
        </div>

        {/* Pie con Volver a lo recomendado por sección */}
        <div className="p-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between">
          {confirmarRecomendado ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-300">¿Volver a lo recomendado?</span>
              <Button
                size="sm"
                variant="destructive"
                className="h-auto text-xs py-1 px-2 cursor-pointer"
                onClick={() => {
                  onVolverRecomendado?.();
                  setConfirmarRecomendado(false);
                }}
              >
                Sí, restablecer
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-auto text-xs py-1 px-2 cursor-pointer"
                onClick={() => setConfirmarRecomendado(false)}
              >
                Cancelar
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs border-white/15 text-white/70 hover:text-white cursor-pointer"
              onClick={() => setConfirmarRecomendado(true)}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Volver a lo recomendado
            </Button>
          )}
          <Button
            size="sm"
            className="cursor-pointer"
            onClick={() => onOpenChange(false)}
          >
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
