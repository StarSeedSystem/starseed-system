"use client";

/**
 * FichaNeurona — UNA sola ficha de neurona (NEU1126B), la misma en Cerebros › Neuronas, Cuenta › Neuronas y
 * Señales. Secciones plegables y buscables. Aquí van Identidad y Aparatos; Permisos, Papel en la red y Salud
 * entran por `extras` (otras partes de la misma tarea) sin cambiar este archivo.
 */

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import type { Neuron } from "@/lib/neurons/neurons";
import { SeccionIdentidad } from "./seccion-identidad";
import { SeccionAparatos } from "./seccion-aparatos";

export interface SeccionFicha {
  id: string;
  titulo: string;
  /** Palabras extra que la búsqueda también reconoce (sinónimos, nombres de opciones). */
  palabras?: string;
  contenido: ReactNode;
}

/** ¿La sección coincide con la búsqueda? Sin acentos ni mayúsculas; vacía = todas. Pura. */
export function coincideBusqueda(s: Pick<SeccionFicha, "titulo" | "palabras">, busqueda: string): boolean {
  const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = norm(busqueda).trim();
  if (!q) return true;
  const base = norm(`${s.titulo} ${s.palabras ?? ""}`);
  return q.split(/\s+/).every((p) => base.includes(p));
}

interface Props {
  neurona: Neuron;
  /** Secciones añadidas tras Identidad y Aparatos (Permisos, Papel en la red, Salud…). */
  extras?: SeccionFicha[];
  /** Modo compacto (Señales): empieza todo plegado. */
  compacto?: boolean;
  alCambiar?: () => void;
}

export function FichaNeurona({ neurona, extras, compacto = false, alCambiar }: Props) {
  const [busqueda, setBusqueda] = useState("");
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({});

  const secciones: SeccionFicha[] = useMemo(
    () => [
      { id: "identidad", titulo: "Identidad", palabras: "nombre aparato tipo icono color foto", contenido: <SeccionIdentidad neurona={neurona} alCambiar={alCambiar} /> },
      { id: "aparatos", titulo: "Aparatos", palabras: "separar unir vincular renombrar sistema medio", contenido: <SeccionAparatos neurona={neurona} /> },
      ...(extras ?? []),
    ],
    [neurona, extras, alCambiar],
  );
  const visibles = secciones.filter((s) => coincideBusqueda(s, busqueda));
  const buscando = busqueda.trim().length > 0;

  return (
    <div className="min-w-0 space-y-2" data-testid="ficha-neurona">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" aria-hidden />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar un ajuste de esta neurona"
          aria-label="Buscar un ajuste de esta neurona"
          className="h-8 pl-8"
        />
      </div>
      {visibles.length === 0 && <p role="status" className="text-xs text-muted-foreground">Ninguna sección coincide con «{busqueda}».</p>}
      {visibles.map((s, i) => {
        const abierta = buscando || (abiertas[s.id] ?? (!compacto && i === 0));
        return (
          <Collapsible key={s.id} open={abierta} onOpenChange={(v) => setAbiertas((p) => ({ ...p, [s.id]: v }))} className="rounded-lg border border-border/40">
            <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium">
              <span className="min-w-0 break-words">{s.titulo}</span>
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${abierta ? "rotate-180" : ""}`} aria-hidden />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-3">{s.contenido}</CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
