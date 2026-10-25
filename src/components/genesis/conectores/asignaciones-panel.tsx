"use client";

import { useEffect, useState, type DragEvent } from "react";
import { RotateCcw, Save, Vote } from "lucide-react";
import type { OpcionCatalogo, Papel } from "@/lib/genesis/conectores/catalogo-opciones";

/** AsignacionesPanel (Ola 1019G · architecture/genesis-conectores-abiertos.md §6): una fila por papel o por
 * director con su cadena (arrastrar para ordenar, añadir del catálogo, quitar), etiqueta del peldaño y motivo,
 * «Restaurar sugeridas»; en modo democrático guardar crea una propuesta en vez de aplicar. PURO: sin red. */

export type ClaseFila = "papel" | "director"; export type EtiquetaPeldaño = "local" | "malla" | "contenedor" | "gratis" | "pago";

export interface FilaPanel {
  clave: string;
  clase: ClaseFila;
  cadena: string[];
}

/** Peldaño de una opción: contenedor y malla ganan al «local» del catálogo; sin límite gratis = pago. */
export function etiquetaPeldaño(o: OpcionCatalogo | null, enMalla: ReadonlySet<string>): EtiquetaPeldaño {
  if (!o) return "pago";
  if (o.tipo === "contenedor") return "contenedor";
  if (enMalla.has(o.id)) return "malla"; else if (o.privacidad === "local") return "local";
  return o.gratis === null ? "pago" : "gratis";
}

export function motivoPeldaño(nombre: string, etiqueta: EtiquetaPeldaño): string {
  const causa: Record<EtiquetaPeldaño, string> = {
    local: "corre en tus neuronas o en los servidores de tu cerebro: lo privado no sale de la cuenta.", malla: "llega por vecinos de la malla con capacidad pública y confianza; nunca para lo privado.",
    contenedor: "corre los procesos de los agentes en un contenedor del ámbito.", gratis: "se usa en su límite gratis del catálogo: no se inventa, lo marca el vigía.",
    pago: "cobra por uso: solo con el permiso y el tope del ámbito.",
  };
  return `${nombre} ${causa[etiqueta]}`;
}

/** Aptas para una fila: las del papel (todas para un director) que falten en la cadena; si el
 * papel no tiene ninguna, cualquier opción del catálogo que falte. */
export function opcionesParaFila(f: FilaPanel, catalogo: OpcionCatalogo[]): OpcionCatalogo[] {
  const restantes = catalogo.filter((o) => !f.cadena.includes(o.id));
  if (f.clase === "director") return restantes;
  const delPapel = restantes.filter((o) => o.papeles.includes(f.clave as Papel));
  return delPapel.length ? delPapel : restantes;
}

export function nombreDe(id: string, catalogo: OpcionCatalogo[]): string {
  return catalogo.find((o) => o.id === id)?.nombre ?? id;
}

/** Mueve un candidato de «desde» a «hasta»; fuera de rango devuelve la cadena tal cual. */
export function mover(cadena: string[], desde: number, hasta: number): string[] {
  if (desde === hasta || desde < 0 || hasta < 0 || desde >= cadena.length || hasta >= cadena.length) return cadena;
  const nueva = [...cadena]; const [x] = nueva.splice(desde, 1);
  nueva.splice(hasta, 0, x); return nueva;
}

const BOTON = "cursor-pointer text-white/70 transition-colors duration-150 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300";

const CLASE_ETIQUETA: Record<EtiquetaPeldaño, string> = {
  local: "border-emerald-300/30 text-emerald-200", malla: "border-sky-300/30 text-sky-200",
  contenedor: "border-amber-300/30 text-amber-200", gratis: "border-violet-300/30 text-violet-200", pago: "border-rose-300/30 text-rose-200",
};

export function AsignacionesPanel({
  filas, catalogo, enMalla, sugeridasPorClave, modo, ocupado = false, onGuardar,
}: {
  filas: FilaPanel[]; catalogo: OpcionCatalogo[]; ocupado?: boolean;
  /** Ids servidos por vecinos de la malla con confianza (nunca para lo privado). */
  enMalla?: ReadonlySet<string>;
  /** Cadena sugerida por clave, del sugeridor del ámbito; la usa «Restaurar sugeridas». */
  sugeridasPorClave: Record<string, string[]>;
  modo: "aplicar" | "proponer"; onGuardar: (filas: FilaPanel[]) => void;
}) {
  const [borrador, setBorrador] = useState<FilaPanel[]>(filas);
  const [origen, setOrigen] = useState<{ clave: string; index: number } | null>(null);
  useEffect(() => setBorrador(filas), [filas]);
  const editar = (clave: string, cadena: string[]) =>
    setBorrador((fils) => fils.map((f) => (f.clave === clave ? { ...f, cadena } : f)));  const drop = (f: FilaPanel, hasta: number) => (e: DragEvent) => {
    e.preventDefault();
    if (origen && origen.clave === f.clave && origen.index !== hasta) editar(f.clave, mover(f.cadena, origen.index, hasta));
    setOrigen(null);
  };
  const restaurar = () => setBorrador((fils) => fils.map((f) => ({ ...f, cadena: sugeridasPorClave[f.clave] ?? f.cadena })));
  return (
    <section className="rounded-2xl border border-white/10 bg-black/20 p-4" aria-label="Asignaciones por papel y por director">
      <h3 className="mb-1 text-sm font-semibold text-white/85">Asignaciones por papel y por director</h3>
      {modo === "proponer" ? <p className="mb-2 text-xs text-amber-100/80">Modo democrático: guardar crea una propuesta para votar, no cambia nada todavía.</p> : null}
      <ul className="divide-y divide-white/5" data-testid="asignaciones-filas">
        {borrador.map((f) => (
          <li key={f.clase + ":" + f.clave} className="py-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-white/45">{f.clase === "director" ? "Director · " : ""}{f.clave}</p>
            <ul className="flex flex-wrap items-center gap-1.5">
              {f.cadena.map((id, i) => {
                const nombre = nombreDe(id, catalogo); const e = etiquetaPeldaño(catalogo.find((o) => o.id === id) ?? null, enMalla ?? new Set());
                return (
                  <li key={id} draggable title={motivoPeldaño(nombre, e)} className="cursor-grab flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.04] px-2 py-0.5 text-xs" onDragStart={() => setOrigen({ clave: f.clave, index: i })} onDragOver={(ev) => ev.preventDefault()} onDrop={drop(f, i)}>
                    <button type="button" className={BOTON} aria-label={`Subir ${nombre}`} disabled={i === 0} onClick={() => editar(f.clave, mover(f.cadena, i, i - 1))}>↑</button>
                    <span className="text-white/85">{nombre}</span>
                    <span className={`rounded-full border px-1.5 text-[10px] ${CLASE_ETIQUETA[e]}`}>{e}</span>
                    <button type="button" className={BOTON} aria-label={`Bajar ${nombre}`} disabled={i === f.cadena.length - 1} onClick={() => editar(f.clave, mover(f.cadena, i, i + 1))}>↓</button>
                    <button type="button" className={BOTON} aria-label={`Quitar ${nombre} de esta cadena`} onClick={() => editar(f.clave, f.cadena.filter((c) => c !== id))}>×</button>
                  </li>
                );
              })}
            </ul>
            <select className="mt-1.5 cursor-pointer rounded-lg border border-white/15 bg-black/30 px-2 py-1 text-xs text-white/85" aria-label={`Añadir del catálogo a ${f.clave}`}
              value="" onChange={(ev) => { const id = ev.target.value; if (id) editar(f.clave, [...f.cadena, id]); }}>
              <option value="">Añadir del catálogo…</option>
              {opcionesParaFila(f, catalogo).map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={restaurar} className={`${BOTON} flex items-center gap-1 rounded-full border border-white/15 px-2.5 py-1 text-xs`}><RotateCcw className="size-3.5" aria-hidden /> Restaurar sugeridas</button>
        <button type="button" disabled={ocupado} onClick={() => onGuardar(borrador)} className="cursor-pointer flex items-center gap-1 rounded-full border border-emerald-300/40 bg-emerald-500/15 px-3 py-1 text-xs text-emerald-100 hover:bg-emerald-500/25 disabled:cursor-not-allowed">
          {modo === "proponer" ? <><Vote className="size-3.5" aria-hidden /> Proponer a votación</> : <><Save className="size-3.5" aria-hidden /> Guardar asignaciones</>}</button>
      </div>
    </section>
  );
}
