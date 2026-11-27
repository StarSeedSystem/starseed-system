"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Neuron } from "@/lib/neurons/neurons";
import { SeccionIdentidad } from "./seccion-identidad";
import { SeccionAparatos } from "./seccion-aparatos";

export interface FichaNeuronaProps {
  neurona: Neuron;
  compacta?: boolean;
  alCambiar?: () => void;
}

type SeccionId = "identidad" | "aparatos";

interface DefSeccion {
  id: SeccionId;
  titulo: string;
  palabras: string;
  render: (props: FichaNeuronaProps) => React.ReactNode;
}

const SECCIONES: DefSeccion[] = [
  { id: "identidad", titulo: "Identidad", palabras: "nombre aparato tipo icono color foto", render: (p) => <SeccionIdentidad neurona={p.neurona} alCambiar={p.alCambiar} /> },
  { id: "aparatos", titulo: "Aparatos", palabras: "aparato dispositivo sistema medio ultima vez renombrar separar unir", render: (p) => <SeccionAparatos neurona={p.neurona} alCambiar={p.alCambiar} /> },
];

export function FichaNeurona(props: FichaNeuronaProps) {
  const { neurona, compacta } = props;
  const [busqueda, setBusqueda] = useState("");
  const [abiertas, setAbiertas] = useState<Record<SeccionId, boolean>>({ identidad: true, aparatos: !compacta });

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return SECCIONES;
    return SECCIONES.filter((s) => s.titulo.toLowerCase().includes(q) || s.palabras.includes(q));
  }, [busqueda]);

  const toggle = (id: SeccionId) => setAbiertas((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <section aria-label={`Ficha de ${neurona.name}`} className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-white/90 min-w-0 break-words flex-1">{neurona.name}</h3>
        {neurona.isThisDevice && <span className="text-[10px] rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-200">Esta neurona</span>}
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/35" aria-hidden />
        <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar en la ficha…" aria-label="Buscar en la ficha"
          className="h-9 pl-8 bg-black/20 border-white/10 text-sm" />
      </div>

      <div className="space-y-2">
        {visibles.map((s) => {
          const abierta = !!abiertas[s.id] || busqueda.trim().length > 0;
          return (
            <div key={s.id} className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
              <button type="button" onClick={() => toggle(s.id)}
                aria-expanded={abierta}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left cursor-pointer hover:bg-white/[0.03]">
                <span className="text-sm font-medium text-white/85">{s.titulo}</span>
                <ChevronDown className={cn("h-4 w-4 text-white/45 transition-transform", abierta && "rotate-180")} aria-hidden />
              </button>
              {abierta && <div className="px-3 pb-3 pt-1 border-t border-white/5">{s.render(props)}</div>}
            </div>
          );
        })}
        {visibles.length === 0 && <p className="text-xs text-white/45 px-1">Ninguna sección coincide con la búsqueda.</p>}
      </div>
    </section>
  );
}
