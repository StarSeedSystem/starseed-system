"use client";

/* Panel de asignaciones por papel y por director (Ola 1019G · N): una fila por papel o director
 * con su cadena (arrastrar para ordenar, añadir del catálogo, quitar, «Restaurar sugeridas»),
 * el peldaño de cada candidato (local, malla, contenedor, gratis, pago) y su motivo. En
 * PoliGenesis democrático, guardar crea una propuesta. La lógica pura de abajo se prueba sin red. */

import { useState } from "react";
import { ArrowDown, ArrowUp, RotateCcw, Save, Trash2 } from "lucide-react";
import type { Asignacion, Director } from "@/lib/genesis/conectores/asignaciones";
import type { OpcionCatalogo, Papel } from "@/lib/genesis/conectores/catalogo-opciones";
export const PAPELES: readonly Papel[] = ["escritor", "revisor", "chat", "visión", "voz", "imagen", "código"];
export const DIRECTORES: readonly Director[] = ["chat", "optimizador", "diseno", "produccion", "nube", "medidores", "aprendizaje"];
export type ClaveAsignacion = Papel | Director;
export type Peldano = "local" | "malla" | "contenedor" | "gratis" | "pago";
export const PELDANOS: Record<Peldano, { etiqueta: string; motivo: string }> = {
  local: { etiqueta: "local", motivo: "Corre en las neuronas de la cuenta: lo privado no sale." },
  malla: { etiqueta: "malla", motivo: "Capacidad pública de la malla; nunca para lo privado." },
  contenedor: { etiqueta: "contenedor", motivo: "Contenedor gratuito para los procesos de los agentes." },
  gratis: { etiqueta: "gratis", motivo: "Cuenta gratuita ya vinculada a este ámbito." },
  pago: { etiqueta: "pago", motivo: "De pago: solo con permiso y tope del ámbito." },
};
const ORDEN: Record<Peldano, number> = { local: 1, malla: 3, contenedor: 4, gratis: 5, pago: 6 };
const CLAVES_PAPEL = new Set<string>(PAPELES);
export interface ContextoPeldano { ofertas?: ReadonlySet<string>; vinculadas?: ReadonlySet<string>; }
/** Peldaño de una opción: local más potente primero y de pago al final. */
export function peldanoDe(opcion: OpcionCatalogo, contexto: ContextoPeldano = {}): Peldano {
  if (opcion.tipo === "contenedor") return "contenedor";
  if (opcion.gratis === null) return "pago";
  if (contexto.ofertas?.has(opcion.id) || opcion.privacidad === "local") return "local";
  return contexto.vinculadas?.has(opcion.id) ? "gratis" : "malla";
}

/** Cadena sugerida: lo local primero y luego lo gratis; el pago nunca se sugiere solo. */
export function cadenaSugerida(clave: ClaveAsignacion, catalogo: readonly OpcionCatalogo[], contexto: ContextoPeldano = {}): string[] {
  const sirven = CLAVES_PAPEL.has(clave) ? catalogo.filter((o) => o.papeles.includes(clave as Papel)) : [...catalogo];
  return sirven.map((o) => ({ o, p: peldanoDe(o, contexto) })).filter(({ p }) => p !== "pago")
    .sort((a, b) => ORDEN[a.p] - ORDEN[b.p] || a.o.id.localeCompare(b.o.id)).map(({ o }) => o.id);
}
/** Reordena la cadena; un destino fuera de rango deja una copia intacta. */
export function moverEnCadena(cadena: readonly string[], desde: number, hasta: number): string[] {
  const copia = [...cadena];
  if (desde === hasta || desde < 0 || hasta < 0 || desde >= copia.length || hasta >= copia.length) return copia;
  const [movido] = copia.splice(desde, 1); copia.splice(hasta, 0, movido); return copia;
}
/** En PoliGenesis democrático se propone; en el resto se aplica. */
export function modoDeGuardado(democratico: boolean): "aplicar" | "propuesta" {
  return democratico ? "propuesta" : "aplicar";
}
export interface AsignacionesPanelProps {
  ambito: string; catalogo: readonly OpcionCatalogo[];
  asignaciones?: readonly Asignacion<ClaveAsignacion>[];
  ofertas?: readonly string[]; vinculadas?: readonly string[];
  democratico?: boolean;
  onGuardar?: (clave: ClaveAsignacion, cadena: string[], modo: "aplicar" | "propuesta") => Promise<{ ok: boolean; motivo?: string }>;
}

export function AsignacionesPanel({ ambito, catalogo, asignaciones = [], ofertas = [], vinculadas = [], democratico = false, onGuardar }: AsignacionesPanelProps) {
  const contexto: ContextoPeldano = { ofertas: new Set(ofertas), vinculadas: new Set(vinculadas) };
  const [cadenas, setCadenas] = useState<Record<string, string[]>>(
    () => Object.fromEntries(asignaciones.map((a) => [a.clave, [...a.cadena]])),
  );
  const [aviso, setAviso] = useState<string | null>(null);
  const modo = modoDeGuardado(democratico);
  const porId = new Map(catalogo.map((o) => [o.id, o]));
  const cambiar = (clave: ClaveAsignacion, cadena: string[]) => setCadenas((prev) => ({ ...prev, [clave]: cadena }));

  async function guardar() {
    if (!onGuardar) return setAviso("Sin destino para guardar en este ámbito.");
    for (const clave of [...PAPELES, ...DIRECTORES]) {
      const r = await onGuardar(clave, cadenas[clave] ?? [], modo);
      if (!r.ok) return setAviso(r.motivo ?? `No se pudo guardar «${clave}».`);
    }
    setAviso(modo === "propuesta" ? "Propuesta enviada a votación del grupo." : "Asignaciones guardadas.");
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/50 p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">Asignaciones por papel y director</h2>
        <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{ambito}</span>
        {modo === "propuesta" && <span className="text-xs text-muted-foreground">Guardar crea una propuesta para votar.</span>}
      </header>
      {[...PAPELES, ...DIRECTORES].map((clave) => {
        const cadena = cadenas[clave] ?? [];
        const sirven = CLAVES_PAPEL.has(clave) ? catalogo.filter((o) => o.papeles.includes(clave as Papel)) : [...catalogo];
        const disponibles = sirven.filter((o) => !cadena.includes(o.id));
        return (
          <section key={clave} className="flex flex-col gap-1 rounded-lg border border-border/40 p-2">
            <h3 className="text-sm font-semibold capitalize">{clave}</h3>
            <ol className="flex flex-col gap-1">
              {cadena.map((id, i) => {
                const op = porId.get(id);
                const p = op ? peldanoDe(op, contexto) : null;
                return (
                  <li key={id} draggable onDragStart={(e) => e.dataTransfer.setData("indice", String(i))} onDragOver={(e) => e.preventDefault()} onDrop={(e) => cambiar(clave, moverEnCadena(cadena, Number(e.dataTransfer.getData("indice")), i))} className="flex cursor-grab items-center gap-2 rounded-lg border border-border/40 bg-background/50 px-2 py-1 text-sm">
                    <span className="flex-1 truncate">{op?.nombre ?? id}</span>
                    {p && <><span title={PELDANOS[p].motivo} className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{PELDANOS[p].etiqueta}</span><span className="hidden max-w-56 truncate text-xs text-muted-foreground lg:inline">{PELDANOS[p].motivo}</span></>}
                    <button type="button" aria-label={`Subir ${op?.nombre ?? id}`} disabled={i === 0} onClick={() => cambiar(clave, moverEnCadena(cadena, i, i - 1))} className="cursor-pointer rounded p-1 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"><ArrowUp aria-hidden className="size-3" /></button>
                    <button type="button" aria-label={`Bajar ${op?.nombre ?? id}`} disabled={i === cadena.length - 1} onClick={() => cambiar(clave, moverEnCadena(cadena, i, i + 1))} className="cursor-pointer rounded p-1 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"><ArrowDown aria-hidden className="size-3" /></button>
                    <button type="button" aria-label={`Quitar ${op?.nombre ?? id}`} onClick={() => cambiar(clave, cadena.filter((x) => x !== id))} className="cursor-pointer rounded p-1 hover:bg-muted"><Trash2 aria-hidden className="size-3" /></button>
                  </li>
                );
              })}
            </ol>
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label={`Añadir a ${clave}`} value="" onChange={(e) => { const id = e.target.value; if (id && !cadena.includes(id)) cambiar(clave, [...cadena, id]); }} className="cursor-pointer rounded-lg border bg-background/60 p-1.5 text-xs">
                <option value="">Añadir del catálogo…</option>
                {disponibles.map((o) => <option key={o.id} value={o.id}>{o.nombre} · {PELDANOS[peldanoDe(o, contexto)].etiqueta}</option>)}
              </select>
              <button type="button" aria-label={`Restaurar sugeridas de ${clave}`} onClick={() => cambiar(clave, cadenaSugerida(clave, catalogo, contexto))} className="flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium hover:bg-muted"><RotateCcw aria-hidden className="size-3" /> Restaurar sugeridas</button>
            </div>
          </section>
        );
      })}
      <button type="button" onClick={guardar} className="flex w-fit cursor-pointer items-center gap-1 rounded-lg border bg-background/60 px-3 py-1.5 text-sm font-medium hover:bg-muted"><Save aria-hidden className="size-4" /> {modo === "propuesta" ? "Proponer asignaciones" : "Guardar asignaciones"}</button>
      {aviso && <p role="status" className="text-xs text-muted-foreground">{aviso}</p>}
    </div>
  );
}
