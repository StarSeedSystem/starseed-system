"use client";

// src/components/protomolecula/selector-molecula.tsx (Ola 1010P · PM1010F2H)
// Elige una molécula guardada y la entrega como texto del bloque «protomolecula»
// del Lienzo Universal (`serializarBloque`). Contrato: architecture/protomolecula.md
// §5 y §13.8: viaja una INSTANTÁNEA; si hay avisos de ámbito, se exige confirmar.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Atom, TriangleAlert } from "lucide-react";
import { almacenNavegador, cargarMolecula, listarMoleculas, CLAVE_INDICE, type AlmacenLocal, type ResumenMolecula } from "@/lib/protomolecula/almacen-moleculas";
import { avisosDePublicacion, esMoleculaValidaNucleo, serializarBloque } from "@/lib/protomolecula/bloque-protomolecula";
import { ambitoDeReferencias, fuentesDeBiblioteca } from "@/lib/protomolecula/referencias-entidad";
import type { Ambito } from "@/lib/protomolecula/tipos";

export const TEXTO_CONFIRMACION = "Entiendo que se publicará una instantánea de esta molécula";
type AmbitoDe = (tipo: string, id: string) => Ambito;
type Lista = ResumenMolecula[] | "cargando" | "sin-acceso";
type PreparadaOk = { ok: true; titulo: string; texto: string; avisos: string[] };
export type Preparada = PreparadaOk | { ok: false; motivo: string };

// Incluye los ámbitos de la forma antigua del almacén (`molecula-estado-tipos.ts`).
const ETIQUETA: Record<string, string> = { personal: "personal", privado: "privada", perfil: "perfil", grupo: "grupo", publico: "pública", publica: "pública" };
const BOTON = "cursor-pointer rounded-md border px-2.5 py-1 text-[11px] transition-colors duration-200";
const AVISOS_SIN_AMBITO = ["No se pudo comprobar el ámbito de las capas citadas: trátalas como privadas.", "El bloque es una instantánea: quien lo vea tendrá una copia, no la original."];
const aClaro = (aviso: string) => aviso.replace(/\((personal|perfil|grupo|publica)\)/g, (_, x: string) => `(${ETIQUETA[x]})`);

function ambitoPorDefecto(): AmbitoDe {
  try { return ambitoDeReferencias(fuentesDeBiblioteca()); } catch { return () => "personal"; }
}

function leerLista(almacen: AlmacenLocal | null): Lista {
  if (!almacen) return "sin-acceso";
  try { almacen.getItem(CLAVE_INDICE); } catch { return "sin-acceso"; }
  return listarMoleculas(almacen);
}

/** Lee la molécula, la serializa y calcula sus avisos en lenguaje claro. Nunca lanza. */
export function prepararMolecula(almacen: AlmacenLocal, id: string, ambitoPost: Ambito, ambitoDe: AmbitoDe): Preparada {
  const bruta: unknown = cargarMolecula(almacen, id);
  if (bruta === null) return { ok: false, motivo: "No se pudo leer esa molécula: puede que se haya borrado o que el almacén no responda." };
  if (!esMoleculaValidaNucleo(bruta)) {
    return { ok: false, motivo: "Esta molécula está guardada en el formato antiguo y aún no se puede publicar (próximamente: pasar el almacén al núcleo de la Protomolécula)." };
  }
  const s = serializarBloque(bruta);
  if (!s.ok) return { ok: false, motivo: `No se pudo preparar el bloque: ${s.motivo}.` };
  let avisos: string[];
  try { avisos = avisosDePublicacion(bruta, ambitoPost, ambitoDe).map(aClaro); } catch { avisos = [...AVISOS_SIN_AMBITO]; }
  return { ok: true, titulo: bruta.titulo || "Sin título", texto: s.valor, avisos };
}

/** `ambitoPost`: el de la publicación. `almacen`: inyectable; por defecto, el del navegador (`null`: este
 * aparato no tiene). `ambitoDe`: ámbito de cada entidad citada; por defecto, el de la Biblioteca. */
export interface SelectorMoleculaProps { ambitoPost: Ambito; alElegir: (texto: string) => void; almacen?: AlmacenLocal | null; ambitoDe?: AmbitoDe }

export function SelectorMolecula({ ambitoPost, alElegir, almacen, ambitoDe }: SelectorMoleculaProps) {
  const fuente = useMemo(() => (almacen === undefined ? almacenNavegador() : almacen), [almacen]);
  const ambitoDeReal = useMemo(() => ambitoDe ?? ambitoPorDefecto(), [ambitoDe]);
  const [lista, setLista] = useState<Lista>("cargando");
  const [pendiente, setPendiente] = useState<PreparadaOk | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  useEffect(() => { setLista(leerLista(fuente)); }, [fuente]);

  const insertar = (p: PreparadaOk) => { setPendiente(null); setMensaje(`Insertada la instantánea de «${p.titulo}».`); alElegir(p.texto); };
  const elegir = (r: ResumenMolecula) => {
    if (!fuente) return;
    const p = prepararMolecula(fuente, r.id, ambitoPost, ambitoDeReal);
    setConfirmado(false);
    if (!p.ok) { setPendiente(null); setMensaje(p.motivo); return; }
    if (p.avisos.length === 0) { insertar(p); return; }
    setMensaje(null);
    setPendiente(p);
  };

  if (lista === "cargando") return <p className="text-[11px] text-white/50">Cargando tus moléculas…</p>;
  if (lista === "sin-acceso") return <p className="text-[11px] text-amber-200/80">No se pudo leer el almacén de moléculas de este aparato: el navegador no deja usar su almacenamiento local.</p>;
  if (lista.length === 0) {
    return (
      <p className="text-[11px] text-white/60">
        Aún no tienes moléculas: crea una en{" "}
        <Link href="/protomolecula" className="cursor-pointer text-violet-300 hover:underline">Protomolécula</Link>.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <ul className="space-y-1" aria-label="Tus moléculas">
        {lista.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => elegir(r)} className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-left text-xs text-white/80 transition-colors duration-200 hover:bg-black/30">
              <Atom className="h-3.5 w-3.5 shrink-0 text-violet-300" aria-hidden />
              <span className="flex-1 truncate">{r.titulo || "Sin título"}</span>
              <span className="text-[10px] text-white/45">{ETIQUETA[r.ambito] ?? r.ambito}</span>
            </button>
          </li>
        ))}
      </ul>
      {pendiente && (
        <div role="alert" className="space-y-2 rounded-lg border border-amber-400/30 bg-amber-500/10 p-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-amber-100">
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden /> Antes de insertar «{pendiente.titulo}»:
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-[11px] text-amber-100/80">{pendiente.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
          <label className="flex cursor-pointer items-start gap-2 text-[11px] text-white/70">
            <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} className="mt-0.5 cursor-pointer accent-violet-500" />
            {TEXTO_CONFIRMACION}
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={!confirmado} onClick={() => confirmado && insertar(pendiente)} className={`${BOTON} border-violet-400/40 bg-violet-500/20 text-violet-50 hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-50`}>Insertar instantánea</button>
            <button type="button" onClick={() => setPendiente(null)} className={`${BOTON} border-white/10 text-white/70 hover:bg-white/10`}>Cancelar</button>
          </div>
        </div>
      )}
      {mensaje && <p role="status" className="text-[11px] text-white/60">{mensaje}</p>}
    </div>
  );
}
