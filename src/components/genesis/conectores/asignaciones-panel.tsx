"use client";

/*
 * AsignacionesPanel (Ola 1019G · architecture/genesis-conectores-abiertos.md §6).
 * Una fila por papel o director con su cadena: arrastrar o usar las flechas para
 * ordenar, añadir desde el catálogo, quitar y ver el peldaño con su motivo.
 * «Restaurar sugeridas» vuelve a la propuesta del ámbito. En PoliGenesis democrático
 * guardar PROPONE (se vota); nunca aplica. Geometría de semilla en aria-hidden.
 */

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, GripVertical, RotateCcw, Save, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OpcionCatalogo, Papel } from "@/lib/genesis/conectores/catalogo-opciones";
import type { Asignacion, Director } from "@/lib/genesis/conectores/asignaciones";
import type { GrupoSugerencias } from "@/lib/genesis/conectores/sugerir";

export type ClaveAsignacion = Papel | Director;
export type Peldano = 1 | 2 | 3 | 4 | 5 | 6;
export type ModoGuardado = "aplicar" | "proponer";

export const PAPELES: readonly Papel[] = ["escritor", "revisor", "chat", "visión", "voz", "imagen", "código"];
export const DIRECTORES: readonly Director[] = ["chat", "optimizador", "diseno", "produccion", "nube", "medidores", "aprendizaje"];
export const CLAVES: readonly ClaveAsignacion[] = [...PAPELES, ...DIRECTORES];

const ETIQUETAS: Record<Peldano, string> = { 1: "Local", 2: "Local", 3: "Malla", 4: "Contenedor", 5: "Gratis", 6: "Pago" };
const COLORES: Record<Peldano, string> = {
  1: "border-cyan-300/40 bg-cyan-400/10 text-cyan-100", 2: "border-cyan-300/40 bg-cyan-400/10 text-cyan-100",
  3: "border-violet-300/40 bg-violet-400/10 text-violet-100", 4: "border-emerald-300/40 bg-emerald-400/10 text-emerald-100",
  5: "border-amber-300/40 bg-amber-400/10 text-amber-100", 6: "border-rose-300/40 bg-rose-400/10 text-rose-100",
};
const NOMBRES: Record<ClaveAsignacion, string> = {
  escritor: "Escritor", revisor: "Revisor", chat: "Chat", visión: "Visión", voz: "Voz", imagen: "Imagen", código: "Código",
  optimizador: "Optimizador", diseno: "Diseño", produccion: "Producción", nube: "Nube", medidores: "Medidores", aprendizaje: "Aprendizaje",
};

export function etiquetaPeldano(peldano: Peldano): string {
  return ETIQUETAS[peldano];
}

export function peldanoDeOpcion(opcion: OpcionCatalogo): Peldano {
  if (opcion.tipo === "contenedor") return 4;
  if (opcion.privacidad === "local") return 1;
  if (opcion.gratis === null) return 6;
  return opcion.requiereCuenta ? 5 : 3;
}

export function motivoDeOpcion(opcion: OpcionCatalogo, peldano: Peldano = peldanoDeOpcion(opcion)): string {
  if (peldano === 1) return "Local primero: la neurona o el servidor del cerebro del ámbito.";
  if (peldano === 3) return "Gratis sin cuenta: capacidad de la malla o instalable en la neurona.";
  if (peldano === 4) return "Contenedor gratuito para los procesos del agente.";
  if (peldano === 5) return "Gratis con cuenta: vincúlala desde el catálogo del ámbito.";
  return "De pago: solo con el permiso y el tope del ámbito.";
}

export function moverCadena(cadena: readonly string[], desde: number, hasta: number): string[] {
  if (desde === hasta || desde < 0 || hasta < 0 || desde >= cadena.length || hasta >= cadena.length) return [...cadena];
  const copia = [...cadena];
  copia.splice(hasta, 0, ...copia.splice(desde, 1));
  return copia;
}

export function anadirACadena(cadena: readonly string[], id: string): string[] {
  return !id || cadena.includes(id) ? [...cadena] : [...cadena, id];
}

export function quitarDeCadena(cadena: readonly string[], id: string): string[] {
  return cadena.filter((x) => x !== id);
}

export function sugeridasPorDefecto(catalogo: readonly OpcionCatalogo[], limite = 4): string[] {
  return [...catalogo].sort((a, b) => peldanoDeOpcion(a) - peldanoDeOpcion(b) || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limite)).map((o) => o.id);
}

export function cadenaDeFila(
  clave: ClaveAsignacion,
  sugerencias: readonly GrupoSugerencias[] | undefined,
  catalogo: readonly OpcionCatalogo[],
): string[] {
  if (sugerencias && PAPELES.includes(clave as Papel)) {
    const ids: string[] = [];
    for (const grupo of sugerencias) {
      if (grupo.clave === "sin-opcion") continue;
      for (const opcion of grupo.opciones) {
        if (opcion.papeles.includes(clave as Papel) && !ids.includes(opcion.id)) ids.push(opcion.id);
      }
    }
    if (ids.length) return ids.slice(0, 6);
  }
  return sugeridasPorDefecto(catalogo);
}

export function modoDeGuardado(democratico: boolean): ModoGuardado {
  return democratico ? "proponer" : "aplicar";
}

export function textoDeGuardado(modo: ModoGuardado): string {
  return modo === "proponer" ? "Propuesta enviada: PoliGenesis la vota antes de aplicarse." : "Asignaciones guardadas en el ámbito.";
}

export interface AsignacionesPanelProps {
  catalogo: OpcionCatalogo[];
  asignaciones?: Asignacion<Papel>[];
  sugerencias?: GrupoSugerencias[];
  democratico?: boolean;
  onGuardar: (clave: ClaveAsignacion, cadena: string[]) => Promise<{ ok: boolean; motivo?: string } | void> | { ok: boolean; motivo?: string } | void;
}

export function AsignacionesPanel({ catalogo, asignaciones = [], sugerencias, democratico = false, onGuardar }: AsignacionesPanelProps) {
  const [filas, setFilas] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(CLAVES.map((clave) => [clave, asignaciones.find((a) => a.clave === clave)?.cadena ?? cadenaDeFila(clave, sugerencias, catalogo)])),
  );
  const [arrastre, setArrastre] = useState<{ clave: ClaveAsignacion; indice: number } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const porId = useMemo(() => new Map(catalogo.map((o) => [o.id, o])), [catalogo]);
  const cambiar = (clave: ClaveAsignacion, fn: (cadena: string[]) => string[]) => setFilas((f) => ({ ...f, [clave]: fn(f[clave] ?? []) }));
  const soltar = (clave: ClaveAsignacion, hasta: number) => {
    if (arrastre?.clave === clave) { cambiar(clave, (c) => moverCadena(c, arrastre.indice, hasta)); setArrastre(null); }
  };
  const restaurar = () => {
    setFilas(Object.fromEntries(CLAVES.map((clave) => [clave, cadenaDeFila(clave, sugerencias, catalogo)])));
    setAviso("Cadenas restauradas a la sugerencia del ámbito.");
  };
  const guardar = async () => {
    if (ocupado) return;
    setOcupado(true);
    const modo = modoDeGuardado(democratico);
    try {
      for (const clave of CLAVES) {
        const r = await onGuardar(clave, filas[clave] ?? []);
        if (r && !r.ok) { setAviso(r.motivo ?? "No se pudo guardar la asignación."); return; }
      }
      setAviso(textoDeGuardado(modo));
    } finally { setOcupado(false); }
  };
  return (
    <section className="relative space-y-4 overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-4" aria-label="Asignaciones por papel y director">
      <GeometriaAsignaciones />
      <header className="relative flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white/90">Asignaciones del ámbito</h3>
          <p className="mt-1 max-w-prose text-xs text-white/55">Local más potente primero. Arrastra o usa las flechas para ordenar la cadena; guarda cuando esté lista.{democratico ? " En PoliGenesis democrático se crea una propuesta, no se aplica." : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={restaurar} className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-white/15 px-3 text-xs text-white/75 transition-colors hover:border-cyan-300/50 hover:text-white"><RotateCcw className="h-4 w-4" aria-hidden /> Restaurar sugeridas</button>
          <button type="button" onClick={() => void guardar()} disabled={ocupado} className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-cyan-300/40 bg-cyan-400/10 px-3 text-xs text-cyan-100 transition-colors hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-60"><Save className="h-4 w-4" aria-hidden /> {democratico ? "Proponer" : "Guardar"}</button>
        </div>
      </header>
      {aviso ? <p role="status" className="relative rounded-xl border border-emerald-300/25 bg-emerald-500/10 p-2 text-xs text-emerald-100">{aviso}</p> : null}
      <ul className="relative grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label="Cadenas de candidatos">
        {CLAVES.map((clave) => {
          const cadena = filas[clave] ?? [];
          return (
            <li key={clave} className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
              <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium text-white/90">{NOMBRES[clave]}</span><span className="text-[10px] text-white/40">{cadena.length} en la cadena</span></div>
              <ul className="flex flex-wrap gap-1.5" aria-label={`Cadena de ${NOMBRES[clave]}`}>
                {cadena.map((id, indice) => {
                  const opcion = porId.get(id);
                  const peldano = opcion ? peldanoDeOpcion(opcion) : 3;
                  const nombre = opcion?.nombre ?? id;
                  return (
                    <li key={id} draggable onDragStart={() => setArrastre({ clave, indice })} onDragOver={(e) => e.preventDefault()} onDrop={() => soltar(clave, indice)} className={cn("flex cursor-grab items-center gap-1 rounded-full border px-2 py-1 text-[11px]", COLORES[peldano])} title={opcion ? `${etiquetaPeldano(peldano)}: ${motivoDeOpcion(opcion, peldano)}` : "Opción desconocida en el catálogo."}>
                      <GripVertical className="h-3 w-3 shrink-0" aria-hidden />
                      <span className="max-w-[9rem] truncate">{nombre}</span>
                      <span className="rounded-full bg-black/25 px-1.5 py-0.5 text-[9px] uppercase tracking-wide">{etiquetaPeldano(peldano)}</span>
                      <button type="button" aria-label={`Mover ${nombre} antes`} disabled={indice === 0} onClick={() => cambiar(clave, (c) => moverCadena(c, indice, indice - 1))} className="cursor-pointer rounded-full p-0.5 hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-30"><ChevronLeft className="h-3 w-3" aria-hidden /></button>
                      <button type="button" aria-label={`Mover ${nombre} después`} disabled={indice === cadena.length - 1} onClick={() => cambiar(clave, (c) => moverCadena(c, indice, indice + 1))} className="cursor-pointer rounded-full p-0.5 hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-30"><ChevronRight className="h-3 w-3" aria-hidden /></button>
                      <button type="button" aria-label={`Quitar ${nombre} de ${NOMBRES[clave]}`} onClick={() => cambiar(clave, (c) => quitarDeCadena(c, id))} className="cursor-pointer rounded-full p-0.5 hover:bg-black/30"><X className="h-3 w-3" aria-hidden /></button>
                    </li>
                  );
                })}
              </ul>
              <select aria-label={`Añadir opción a ${NOMBRES[clave]}`} defaultValue="" onChange={(e) => { const id = e.currentTarget.value; e.currentTarget.value = ""; if (id) cambiar(clave, (c) => anadirACadena(c, id)); }} className="min-h-11 w-full cursor-pointer rounded-lg border border-white/15 bg-black/30 px-2 text-xs text-white/80">
                <option value="">Añadir del catálogo…</option>
                {catalogo.filter((o) => !cadena.includes(o.id)).map((o) => <option key={o.id} value={o.id}>{o.nombre} · {etiquetaPeldano(peldanoDeOpcion(o))}</option>)}
              </select>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function GeometriaAsignaciones() {
  return (
    <svg aria-hidden viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="0.8" className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 text-cyan-300/[0.08]">
      {[0, 1, 2, 3, 4, 5].map((i) => <circle key={i} cx={100 + 40 * Math.cos((Math.PI / 3) * i)} cy={100 + 40 * Math.sin((Math.PI / 3) * i)} r="40" />)}
      <circle cx="100" cy="100" r="40" />
    </svg>
  );
}
