"use client";

/**
 * ConnectionsMenu — menú de CONEXIONES de la barra superior del escritorio
 * (Adenda 98). Botón compacto estilo barra de sistema: estado vivo de la red
 * externa + la malla P2P de un vistazo; clic → popover con el Centro de
 * Conexiones completo (modo dual, transporte del radio, Bluetooth, antenas y
 * enlace al Centro Red Mesh con el mapa 3D).
 */

import { useEffect, useRef, useState } from "react";
import { RadioTower, Wifi, WifiOff } from "lucide-react";
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
        title={`Conexiones — red externa ${extOnline ? "activa" : "caída"} · malla ${meshOn ? `activa (${online} nodos)` : "apagada"}`}
        aria-label="Administrar conexiones de la neurona"
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

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+8px)] z-[70] w-[360px] max-w-[92vw] rounded-2xl border border-white/12 bg-black/85 p-3 shadow-2xl backdrop-blur-2xl"
          role="menu"
        >
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/50">
            Conexiones de esta neurona
          </p>
          <div className="max-h-[70vh] overflow-y-auto pr-0.5">
            <ConnectionsCenter compact />
          </div>
        </div>
      )}
    </div>
  );
}

export default ConnectionsMenu;
