"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SeccionIdentidad } from "./seccion-identidad";
import { SeccionAparatos } from "./seccion-aparatos";
import { SeccionPermisos } from "./seccion-permisos";
import { SeccionPapelRed } from "./seccion-papel-red";
import { SeccionSalud } from "./seccion-salud";
import { listNeurons, type Neuron } from "@/lib/neurons/neurons";

export interface FichaNeuronaProps {
  neuronaId: string;
  modoCompacto?: boolean;
  onCambio?: () => void;
}

const SECCIONES = [
  { id: "identidad", label: "Identidad", icon: "User" },
  { id: "aparatos", label: "Aparatos", icon: "Cpu" },
  { id: "permisos", label: "Permisos", icon: "Shield" },
  { id: "papel-red", label: "Papel en la red", icon: "Globe" },
  { id: "salud", label: "Salud", icon: "HeartPulse" },
] as const;

type SeccionId = (typeof SECCIONES)[number]["id"];

function SeccionTrigger({ seccion, abierta, onToggle }: { seccion: (typeof SECCIONES)[number]; abierta: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 text-left cursor-pointer rounded-xl transition-colors",
        "bg-black/20 border border-white/10 hover:bg-white/[0.03]",
        "focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
      )}
      aria-expanded={abierta}
    >
      <span className="w-5 h-5 text-emerald-300 flex-shrink-0" aria-hidden>
        {seccion.id === "identidad" && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
        {seccion.id === "aparatos" && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 4v16"/><path d="M15 4v16"/></svg>}
        {seccion.id === "permisos" && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
        {seccion.id === "papel-red" && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>}
        {seccion.id === "salud" && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><path d="M12 14v4"/><path d="M12 10h.01"/></svg>}
      </span>
      <span className="text-sm font-medium text-white/90 flex-1 min-w-0 truncate">{seccion.label}</span>
      <ChevronDown className={cn("w-4 h-4 text-white/40 transition-transform flex-shrink-0", abierta && "rotate-180")} aria-hidden />
    </button>
  );
}

function SeccionContenido({ id, children, abierta }: { id: SeccionId; children: React.ReactNode; abierta: boolean }) {
  if (!abierta) return null;
  return (
    <div id={id} className="px-2 pb-3 pt-1 space-y-3 animate-in fade-in-0 duration-150 ease-out" role="region" aria-labelledby={`${id}-trigger`}>
      {children}
    </div>
  );
}

export function FichaNeurona({ neuronaId, modoCompacto = false, onCambio }: FichaNeuronaProps) {
  const [neurona, setNeurona] = useState<Neuron | null>(null);
  const [loading, setLoading] = useState(true);
  const [abiertas, setAbiertas] = useState<Record<SeccionId, boolean>>(
    modoCompacto
      ? { identidad: true, aparatos: false, permisos: false, "papel-red": false, salud: false }
      : { identidad: true, aparatos: true, permisos: true, "papel-red": true, salud: true }
  );
  const [busqueda, setBusqueda] = useState("");
  const [nombreAparato, setNombreAparato] = useState("");

  const cargar = useCallback(async () => {
    try {
      const lista = await listNeurons({ fresco: true });
      const n = lista.find((x) => x.id === neuronaId);
      if (n) setNeurona(n);
    } catch { /* defensivo */ }
    setLoading(false);
  }, [neuronaId]);

  const toggleSeccion = useCallback((id: SeccionId) => {
    setAbiertas((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const seccionesVisibles = useMemo(() => {
    if (!busqueda) return SECCIONES;
    const q = busqueda.toLowerCase();
    return SECCIONES.filter((s) => s.label.toLowerCase().includes(q) || s.id.includes(q));
  }, [busqueda]);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
      {!modoCompacto && (
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-black/30">
          <Search className="w-4 h-4 text-white/30 flex-shrink-0" aria-hidden />
          <input
            type="search"
            placeholder="Buscar en la ficha…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="flex-1 bg-transparent border-none text-sm text-white/90 placeholder:text-white/40 focus:outline-none min-w-0"
            aria-label="Buscar en la ficha de la neurona"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda("")}
              className="cursor-pointer p-1 text-white/40 hover:text-white/70 flex-shrink-0"
              aria-label="Limpiar búsqueda"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      <div className={cn("space-y-1 p-3", modoCompacto && "px-2")}>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-xs text-white/50">
            <svg className="w-5 h-5 animate-spin text-emerald-400 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
            </svg>
            Cargando ficha…
          </div>
        ) : neurona ? (
          seccionesVisibles.map((s) => (
            <div key={s.id} className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
              <SeccionTrigger
                id={`${s.id}-trigger`}
                seccion={s}
                abierta={abiertas[s.id]}
                onToggle={() => toggleSeccion(s.id)}
              />
              <SeccionContenido id={s.id} abierta={abiertas[s.id] || !!busqueda}>
                {s.id === "identidad" && <SeccionIdentidad neurona={neurona} nombreAparato={nombreAparato} onNombreAparatoChange={setNombreAparato} esEsta={neurona.isThisDevice} />}
                {s.id === "aparatos" && <SeccionAparatos neurona={neurona} esEsta={neurona.isThisDevice} onCambio={onCambio} />}
                {s.id === "permisos" && <SeccionPermisos neurona={neurona} />}
                {s.id === "papel-red" && <SeccionPapelRed neurona={neurona} />}
                {s.id === "salud" && <SeccionSalud neurona={neurona} />}
              </SeccionContenido>
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-xs text-white/50">Neurona no encontrada</div>
        )}
      </div>
    </div>
  );
}

export default FichaNeurona;