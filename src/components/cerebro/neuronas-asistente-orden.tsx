"use client";

/**
 * Piezas de Cerebros › Neuronas (NEU1126D, parte 2): los controles de agrupar, ordenar y vista, y el
 * asistente «Duplicadas y olvidadas». Nunca borra: solo propone fusionar o archivar; cada propuesta
 * se pide a quien monta el asistente (`onFusionar`, `onArchivar`), que confirma antes de escribir.
 */

import { Button } from "@/components/ui/button";
import type { Neuron } from "@/lib/neurons/neurons";
import {
  DIAS_OLVIDADA,
  detectarDuplicadas,
  detectarOlvidadas,
  type AgruparPor,
  type OrdenNeuronas,
  type Vista,
} from "./neuronas-lista";

const selectCls = "h-9 cursor-pointer rounded-lg border border-white/15 bg-black/30 px-2 text-sm text-white";

export interface ControlesOrdenProps {
  grupo: AgruparPor;
  orden: OrdenNeuronas;
  vista: Vista;
  onGrupo: (g: AgruparPor) => void;
  onOrden: (o: OrdenNeuronas) => void;
  onVista: (v: Vista) => void;
}

/** Agrupar, ordenar y alternar rejilla/lista; en pantallas chicas se parte en varias líneas. */
export function ControlesOrden({ grupo, orden, vista, onGrupo, onOrden, onVista }: ControlesOrdenProps) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="controles-orden">
      <select aria-label="Agrupar" className={selectCls} value={grupo} onChange={(e) => onGrupo(e.target.value as AgruparPor)}>
        <option value="ninguno">Sin agrupar</option>
        <option value="tipo">Agrupar por tipo</option>
        <option value="estado">Agrupar por estado</option>
      </select>
      <select aria-label="Ordenar" className={selectCls} value={orden} onChange={(e) => onOrden(e.target.value as OrdenNeuronas)}>
        <option value="nombre">Orden: nombre</option>
        <option value="reciente">Orden: más reciente</option>
        <option value="tipo">Orden: tipo</option>
      </select>
      <Button variant="ghost" className="h-9 cursor-pointer" onClick={() => onVista(vista === "rejilla" ? "lista" : "rejilla")}>
        {vista === "rejilla" ? "Ver como lista" : "Ver como rejilla"}
      </Button>
    </div>
  );
}

export interface AsistenteProps {
  neuronas: readonly Neuron[];
  /** Epoch ms; se inyecta para poder probar. */
  ahora?: number;
  /** Propone fusionar estas neuronas (abre fusionar-dialog.tsx, que conserva las filas). */
  onFusionar: (ids: string[]) => void;
  /** Propone archivar (nunca borrar); quien lo recibe pide confirmación. */
  onArchivar: (ids: string[]) => void;
}

/** Cuántas propuestas tiene el asistente, para el rótulo del botón que lo abre. */
export function contarPropuestas(neuronas: readonly Neuron[], ahora: number): number {
  return detectarDuplicadas(neuronas).length + detectarOlvidadas(neuronas, ahora).length;
}

export function AsistenteDuplicadasOlvidadas({ neuronas, ahora, onFusionar, onArchivar }: AsistenteProps) {
  const duplicadas = detectarDuplicadas(neuronas);
  const olvidadas = detectarOlvidadas(neuronas, ahora ?? Date.now());
  const nombreDe = (id: string) => neuronas.find((n) => n.id === id)?.name ?? id;

  return (
    <section
      className="space-y-2 rounded-2xl border border-white/15 bg-white/5 p-3 text-sm text-white/80 backdrop-blur"
      data-testid="asistente-duplicadas"
      aria-label="Duplicadas y olvidadas"
    >
      {duplicadas.length === 0 && olvidadas.length === 0 && <p>No hay duplicadas ni olvidadas. Todo en orden.</p>}
      {duplicadas.map((d) => (
        <div key={`${d.motivo}-${d.ids.join("|")}`} className="flex flex-wrap items-center gap-2">
          <span className="min-w-[12rem] flex-1">
            {d.texto} ({d.ids.map(nombreDe).join(", ")})
          </span>
          <Button size="sm" className="cursor-pointer" onClick={() => onFusionar(d.ids)}>
            Proponer fusionar
          </Button>
          <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => onArchivar(d.ids.slice(1))}>
            Archivar las demás
          </Button>
        </div>
      ))}
      {olvidadas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-[12rem] flex-1">
            Sin latido hace más de {DIAS_OLVIDADA} días: {olvidadas.map((n) => n.name).join(", ")}.
          </span>
          <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => onArchivar(olvidadas.map((n) => n.id))}>
            Archivar olvidadas
          </Button>
        </div>
      )}
    </section>
  );
}
