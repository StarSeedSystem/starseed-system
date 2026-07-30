"use client";

/**
 * ConnectionsMenu — menú de CONEXIONES de la barra superior del escritorio
 * (Adenda 98). Botón compacto estilo barra de sistema: estado vivo de la red
 * externa + la malla P2P de un vistazo; clic → popover con el Centro de
 * Conexiones completo (modo dual, transporte del radio, Bluetooth, antenas y
 * enlace al Centro Red Mesh con el mapa 3D).
 */

import { useEffect, useRef, useState } from "react";
import { RadioTower, Wifi, WifiOff, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConnectionsCenter } from "@/components/connectivity/connections-center";
import {
  externalLink,
  startMeshSubsystem,
  subscribeConnectivity,
  useMeshState,
} from "@/ai/astraura/mesh";

export function ConnectionsMenu() {
  const [open, setOpen] = useState(false);
  const [extOnline, setExtOnline] = useState(true);
  const mesh = useMeshState();
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    startMeshSubsystem();
    const refresh = () => setExtOnline(externalLink().availability === "active");
    refresh();
    return subscribeConnectivity(refresh);
  }, []);

  // Cerrar al hacer clic fuera o con Escape (patrón de los menús de la barra).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const meshOn = mesh.status === "ready" || mesh.status === "degraded";
  const online = mesh.nodes.filter((n) => !n.isSelf && n.presence === "online").length;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={`Hub Social — red externa ${extOnline ? "activa" : "caída"} · malla ${meshOn ? `activa (${online} nodos)` : "apagada"}`}
        aria-label="Abrir el Hub Social"
        className={cn(
          "flex items-center gap-1 rounded-full border px-2 py-1 transition-colors cursor-pointer",
          open
            ? "border-emerald-300/50 bg-emerald-400/10"
            : "border-white/12 bg-white/[0.04] hover:bg-white/[0.09]",
        )}
      >
        {extOnline ? (
          <Wifi className="size-3.5 text-sky-200/90" />
        ) : (
          <WifiOff className="size-3.5 text-rose-300" />
        )}
        <span className="relative">
          <RadioTower className={cn("size-3.5", meshOn ? "text-emerald-300" : "text-white/35")} />
          {meshOn && (
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
          )}
        </span>
        {meshOn && online > 0 && (
          <span className="text-[10px] font-bold text-emerald-200 max-sm:hidden">{online}</span>
        )}
      </button>

      {/* Ventana CENTRADA y amplia (Adenda 103): no se sale de pantalla ni al
          desplegar la pestaña Red Mesh; scroll contenido dentro del modal. */}
      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="flex max-h-[100dvh] w-full max-w-[880px] flex-col overflow-hidden rounded-t-2xl border border-white/12 bg-[#0d1220]/96 shadow-2xl backdrop-blur-2xl sm:max-h-[90dvh] sm:rounded-2xl">
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
              <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-white/70">
                <RadioTower className="h-4 w-4 text-emerald-300" /> Hub Social · Señales
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="cursor-pointer rounded-lg p-1.5 text-white/40 transition-colors duration-200 hover:bg-white/5 hover:text-white/85"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
              <ConnectionsCenter compact />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ConnectionsMenu;
